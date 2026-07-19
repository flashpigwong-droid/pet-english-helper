/**
 * PET English Helper - Main Application Logic
 * Handles UI rendering, navigation, practice flow, and all interactive features
 */

// ================================================================
// UTILITY FUNCTIONS
// ================================================================

function showToast(message, duration = 2500) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('show'), duration);
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}

function openModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').style.display = 'flex';
}

document.getElementById('modalOverlay').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// Shuffle array (Fisher-Yates)
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ================================================================
// NAVIGATION
// ================================================================

let currentPage = 'practice';

function navigateTo(page) {
  currentPage = page;
  // Update active states
  document.querySelectorAll('.nav-btn, .bottom-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.id === `page-${page}`);
  });

  // Render page content
  switch (page) {
    case 'practice': renderPractice(); break;
    case 'mistakes': renderMistakes(); break;
    case 'review': renderReview(); break;
    case 'progress': renderProgress(); break;
    case 'browse': renderBrowse(); break;
  }
}

document.querySelectorAll('.nav-btn, .bottom-nav-btn').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

// ================================================================
// SPEECH / TTS
// ================================================================

function speakWord(word, speed = 1.0) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve();
      return;
    }
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = speed;

    // Try to find a good English voice
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google'))
      || voices.find(v => v.lang.startsWith('en-US'))
      || voices.find(v => v.lang.startsWith('en'));
    if (enVoice) utterance.voice = enVoice;

    utterance.onend = resolve;
    utterance.onerror = resolve;

    window.speechSynthesis.speak(utterance);
  });
}

// Preload voices
if (window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
}

// ================================================================
// PRACTICE MODULE
// ================================================================

let practiceState = null;

function renderPractice() {
  const activePractice = Storage.getActivePractice();
  const setup = document.getElementById('practiceSetup');
  const active = document.getElementById('practiceActive');
  const result = document.getElementById('practiceResult');
  const continueCard = document.getElementById('continueCard');

  if (activePractice && activePractice.currentIndex < activePractice.words.length) {
    setup.style.display = 'none';
    active.style.display = 'block';
    result.style.display = 'none';
    practiceState = activePractice;
    renderPracticeWord();
  } else {
    Storage.clearActivePractice();
    setup.style.display = 'block';
    active.style.display = 'none';
    result.style.display = 'none';

    // Check for incomplete practice
    if (activePractice && activePractice.currentIndex >= activePractice.words.length) {
      continueCard.style.display = 'none';
    } else {
      continueCard.style.display = 'none';
    }

    // Load saved settings
    const settings = Storage.getSettings();
    document.getElementById('wordCount').value = settings.wordsPerRound || 15;
    document.getElementById('difficultyFilter').value = settings.difficulty || 'all';
    document.getElementById('speedSelect').value = settings.speed || 1.0;

    // Mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === 'spelling');
    });
  }
}

// Mode selector clicks
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
  });
});

// Start / Continue practice
document.getElementById('startPractice').addEventListener('click', startNewPractice);
document.getElementById('continuePractice')?.addEventListener('click', () => {
  practiceState = Storage.getActivePractice();
  if (practiceState) {
    document.getElementById('practiceSetup').style.display = 'none';
    document.getElementById('practiceActive').style.display = 'block';
    document.getElementById('practiceResult').style.display = 'none';
    renderPracticeWord();
  }
});
document.getElementById('discardPractice')?.addEventListener('click', () => {
  Storage.clearActivePractice();
  renderPractice();
});

function startNewPractice() {
  const mode = document.querySelector('.mode-btn.active')?.dataset.mode || 'spelling';
  const wordCount = parseInt(document.getElementById('wordCount').value);
  const difficulty = document.getElementById('difficultyFilter').value;
  const speed = parseFloat(document.getElementById('speedSelect').value);

  // Save settings
  Storage.saveSettings({ wordsPerRound: wordCount, difficulty, speed });

  // Get words based on difficulty filter + mistakes priority
  let pool = [...PET_VOCABULARY];
  if (difficulty !== 'all') {
    pool = pool.filter(w => w.level === difficulty);
  }

  // Mix in some mistake words (up to 40% of the round)
  const mistakes = Storage.getMistakes();
  const mistakeIds = Object.keys(mistakes);
  const mistakeWords = pool.filter(w => mistakeIds.includes(w.id));
  const otherWords = pool.filter(w => !mistakeIds.includes(w.id));

  let selectedWords = [];
  const mistakeCount = Math.min(
    Math.ceil(wordCount * 0.4),
    mistakeWords.length
  );

  // Pick mistake words (higher error count first)
  const sortedMistakes = shuffle(mistakeWords).sort((a, b) =>
    (mistakes[b.id]?.count || 0) - (mistakes[a.id]?.count || 0)
  );
  selectedWords = sortedMistakes.slice(0, mistakeCount);

  // Fill rest with random other words
  const remaining = wordCount - selectedWords.length;
  selectedWords = selectedWords.concat(shuffle(otherWords).slice(0, remaining));

  // If still not enough, add more from pool
  if (selectedWords.length < wordCount) {
    const used = new Set(selectedWords.map(w => w.id));
    const extras = shuffle(pool).filter(w => !used.has(w.id));
    selectedWords = selectedWords.concat(extras.slice(0, wordCount - selectedWords.length));
  }

  if (selectedWords.length === 0) {
    showToast('没有可用的单词，请调整筛选条件');
    return;
  }

  practiceState = {
    mode,
    words: shuffle(selectedWords),
    currentIndex: 0,
    results: [],
    speed,
    wordCount: selectedWords.length
  };

  Storage.saveActivePractice(practiceState);

  document.getElementById('practiceSetup').style.display = 'none';
  document.getElementById('practiceActive').style.display = 'block';
  document.getElementById('practiceResult').style.display = 'none';
  renderPracticeWord();
}

function renderPracticeWord() {
  if (!practiceState || practiceState.currentIndex >= practiceState.words.length) {
    finishPractice();
    return;
  }

  const word = practiceState.words[practiceState.currentIndex];
  const active = document.getElementById('practiceActive');

  if (practiceState.mode === 'spelling') {
    active.innerHTML = `
      <div class="practice-progress-bar">
        <div class="practice-progress-fill" style="width:${(practiceState.currentIndex / practiceState.wordCount) * 100}%"></div>
      </div>
      <p style="color:var(--color-text-muted);font-size:var(--font-size-sm);margin-bottom:1rem;">
        第 ${practiceState.currentIndex + 1} / ${practiceState.wordCount} 个单词
      </p>
      <div class="practice-word-section">
        <button class="practice-sound-btn" id="playSoundBtn" title="点击听发音">🔊</button>
        <p class="practice-hint">${word.meaning}</p>
        <p style="color:var(--color-text-muted);font-size:var(--font-size-sm);">${word.pos}</p>
      </div>
      <div class="practice-input-group">
        <input type="text" class="practice-input" id="spellingInput"
               placeholder="输入英文拼写..." autocomplete="off" autocorrect="off"
               autocapitalize="off" spellcheck="false">
        <button class="practice-submit-btn" id="submitSpelling">确认</button>
      </div>
      <div class="practice-feedback" id="spellingFeedback"></div>
      <div class="practice-correct-answer" id="spellingAnswer"></div>
      <button class="practice-next-btn" id="nextWordBtn" style="display:none;">
        下一个单词 →
      </button>
      <p class="practice-repeat-hint">不确定可以再点🔊听一遍（最多3次）</p>
    `;

    let listenCount = 0;
    const maxListens = 3;
    const playBtn = document.getElementById('playSoundBtn');
    const input = document.getElementById('spellingInput');
    const submitBtn = document.getElementById('submitSpelling');
    const feedback = document.getElementById('spellingFeedback');
    const answer = document.getElementById('spellingAnswer');
    const nextBtn = document.getElementById('nextWordBtn');

    // Auto-play once on load
    setTimeout(() => {
      playBtn.classList.add('playing');
      speakWord(word.word, practiceState.speed).then(() => {
        playBtn.classList.remove('playing');
      });
    }, 300);

    playBtn.addEventListener('click', async () => {
      if (listenCount >= maxListens) {
        showToast(`最多听 ${maxListens} 次哦`);
        return;
      }
      listenCount++;
      playBtn.classList.add('playing');
      await speakWord(word.word, practiceState.speed);
      playBtn.classList.remove('playing');
      if (listenCount >= maxListens) {
        playBtn.style.opacity = '0.4';
        playBtn.title = '已达到最大播放次数';
      }
    });

    input.focus();

    function submitAnswer() {
      const userAnswer = input.value.trim();
      if (!userAnswer) {
        showToast('请输入单词拼写');
        return;
      }

      const isCorrect = userAnswer.toLowerCase() === word.word.toLowerCase();

      // Disable input and submit
      input.disabled = true;
      submitBtn.style.display = 'none';

      if (isCorrect) {
        input.classList.add('correct');
        feedback.textContent = '✅ 正确！';
        feedback.className = 'practice-feedback correct';
        answer.textContent = '';
      } else {
        input.classList.add('incorrect');
        feedback.textContent = '❌ 拼写错误';
        feedback.className = 'practice-feedback incorrect';
        answer.innerHTML = `正确答案：<strong style="font-family:monospace;font-size:1.2em;">${word.word}</strong>`;
        // Show example
        setTimeout(() => {
          answer.innerHTML += `<br><span style="color:var(--color-text-muted);">${word.example_en}</span><br><span style="color:var(--color-text-muted);">${word.example_zh}</span>`;
        }, 500);
      }

      nextBtn.style.display = 'inline-flex';
      input.blur();

      practiceState.results.push({
        wordId: word.id,
        word: word.word,
        userAnswer,
        correct: isCorrect
      });

      // Update SRS and mistakes
      SRS.markPracticed(word.id, isCorrect);
      if (!isCorrect) {
        Storage.addMistake(word.id, userAnswer);
      }
      Storage.saveActivePractice(practiceState);
    }

    submitBtn.addEventListener('click', submitAnswer);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitAnswer();
    });

    nextBtn.addEventListener('click', () => {
      practiceState.currentIndex++;
      Storage.saveActivePractice(practiceState);
      renderPracticeWord();
    });
  }
}

function finishPractice() {
  const results = practiceState?.results || [];
  const correct = results.filter(r => r.correct).length;
  const total = results.length;

  Storage.clearActivePractice();

  // Record in history
  Storage.addPracticeRecord({
    correct,
    total,
    mode: practiceState?.mode || 'spelling',
    words: results.map(r => ({ id: r.wordId, correct: r.correct }))
  });

  // Update streak
  Storage.updateStreak();

  // Show result
  const rate = total > 0 ? Math.round((correct / total) * 100) : 0;
  let icon, title;
  if (rate >= 90) { icon = '🎉'; title = '太棒了！'; }
  else if (rate >= 70) { icon = '👍'; title = '做得不错！'; }
  else if (rate >= 50) { icon = '💪'; title = '继续加油！'; }
  else { icon = '📚'; title = '多加练习！'; }

  document.getElementById('practiceActive').style.display = 'none';
  const resultDiv = document.getElementById('practiceResult');
  resultDiv.style.display = 'block';

  const mistakes = results.filter(r => !r.correct);
  let mistakeListHTML = '';
  if (mistakes.length > 0) {
    mistakeListHTML = `
      <div style="text-align:left;margin-top:1.5rem;">
        <h4 style="margin-bottom:0.75rem;color:var(--color-text-secondary);">需要复习的单词：</h4>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
          ${mistakes.map(m => `
            <span style="background:var(--color-danger-light);color:var(--color-danger);padding:0.3rem 0.75rem;border-radius:99px;font-family:monospace;font-size:0.9rem;">
              ${m.word}
            </span>
          `).join('')}
        </div>
      </div>
    `;
  }

  resultDiv.innerHTML = `
    <div class="result-icon">${icon}</div>
    <h2 class="result-title">${title}</h2>
    <div class="result-score">${rate}%</div>
    <div class="result-stats">
      <div class="result-stat">
        <div class="result-stat-value correct">${correct}</div>
        <div class="result-stat-label">正确</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-value incorrect">${total - correct}</div>
        <div class="result-stat-label">错误</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-value">${total}</div>
        <div class="result-stat-label">总计</div>
      </div>
    </div>
    ${mistakeListHTML}
    <div class="result-actions">
      <button class="btn-primary" onclick="startNewPractice()">
        🔄 再来一轮
      </button>
      <button class="btn-secondary" onclick="navigateTo('mistakes')">
        📋 查看错词本
      </button>
    </div>
  `;

  practiceState = null;
}

// ================================================================
// MISTAKES MODULE
// ================================================================

function renderMistakes() {
  const container = document.getElementById('mistakesContent');
  const mistakes = Storage.getMistakes();
  const mistakeIds = Object.keys(mistakes);

  if (mistakeIds.length === 0) {
    container.innerHTML = `
      <div class="mistakes-empty">
        <div class="mistakes-empty-icon">🎉</div>
        <h3>错词本是空的</h3>
        <p>太棒了！你还没有错词，继续保持！</p>
        <button class="btn-primary" style="margin-top:1rem;" onclick="navigateTo('practice')">
          去练习
        </button>
      </div>
    `;
    return;
  }

  // Build word list sorted by mistake count
  const mistakeWords = mistakeIds
    .map(id => {
      const word = PET_VOCABULARY.find(w => w.id === id);
      return word ? { ...word, mistakeCount: mistakes[id].count, attempts: mistakes[id].attempts } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.mistakeCount - a.mistakeCount);

  let listHTML = mistakeWords.map((mw, idx) => `
    <li class="mistake-item">
      <div style="flex:1;min-width:150px;">
        <div>
          <span class="mistake-word">${mw.word}</span>
          <span class="mistake-count" style="margin-left:0.5rem;">错${mw.mistakeCount}次</span>
        </div>
        <div class="mistake-meaning">${mw.meaning} · ${mw.pos}</div>
        ${mw.attempts && mw.attempts.length > 0 ? `<div style="font-size:var(--font-size-xs);color:var(--color-danger);margin-top:0.15rem;">曾拼成：${mw.attempts.slice(0,2).join('、')}</div>` : ''}
      </div>
      <div class="mistake-actions-inline">
        <button class="btn-secondary btn-sm" onclick="playWordFromMistakes('${mw.word}')">🔊</button>
        <button class="btn-secondary btn-sm" onclick="removeMistakeWord('${mw.id}')">移除</button>
      </div>
    </li>
  `).join('');

  container.innerHTML = `
    <div class="mistakes-header">
      <span><strong>${mistakeWords.length}</strong> 个错词</span>
      <div class="mistakes-actions">
        <button class="btn-primary btn-sm" onclick="practiceMistakes()">
          📝 专项练习
        </button>
        <button class="btn-secondary btn-sm" onclick="clearAllMistakes()">
          清空全部
        </button>
      </div>
    </div>
    <ul class="mistake-list">${listHTML}</ul>
  `;
}

function playWordFromMistakes(word) {
  speakWord(word, Storage.getSettings().speed || 1.0);
}

function removeMistakeWord(wordId) {
  // Check: has the user gotten it right 3+ times consecutively?
  const mistakes = Storage.getMistakes();
  if (mistakes[wordId] && mistakes[wordId].count <= 1) {
    Storage.removeMistake(wordId);
  } else {
    // Just reduce count
    Storage.addMistake(wordId, '');
    const m = Storage.getMistakes();
    if (m[wordId]) m[wordId].count = Math.max(0, m[wordId].count - 1);
    Storage.set('mistakes', m);
  }
  showToast('已移除');
  renderMistakes();
}

function clearAllMistakes() {
  if (confirm('确定要清空所有错词吗？此操作不可撤销。')) {
    Storage.set('mistakes', {});
    showToast('错词本已清空');
    renderMistakes();
  }
}

function practiceMistakes() {
  const mistakes = Storage.getMistakes();
  const mistakeIds = Object.keys(mistakes);
  if (mistakeIds.length === 0) {
    showToast('没有错词可以练习');
    return;
  }

  const mistakeWords = mistakeIds
    .map(id => PET_VOCABULARY.find(w => w.id === id))
    .filter(Boolean);

  const wordCount = Math.min(15, mistakeWords.length);
  const speed = Storage.getSettings().speed || 1.0;

  practiceState = {
    mode: 'spelling',
    words: shuffle(mistakeWords).slice(0, wordCount),
    currentIndex: 0,
    results: [],
    speed,
    wordCount
  };

  Storage.saveActivePractice(practiceState);
  navigateTo('practice');
  document.getElementById('practiceSetup').style.display = 'none';
  document.getElementById('practiceActive').style.display = 'block';
  document.getElementById('practiceResult').style.display = 'none';
  setTimeout(() => renderPracticeWord(), 100);
}

// ================================================================
// REVIEW MODULE
// ================================================================

let reviewState = null;

function renderReview() {
  const container = document.getElementById('reviewContent');
  const dueWords = SRS.getDueWords(PET_VOCABULARY);

  if (dueWords.length === 0) {
    container.innerHTML = `
      <div class="review-empty">
        <div class="review-empty-icon">✅</div>
        <h3>没有需要复习的单词</h3>
        <p>你可以去练习一些新单词，或者等明天再来看看。</p>
        <button class="btn-primary" style="margin-top:1rem;" onclick="navigateTo('practice')">
          去练习新单词
        </button>
      </div>
    `;
    return;
  }

  // Limit to 30 words per review session
  const reviewWords = dueWords.slice(0, 30);

  container.innerHTML = `
    <div class="review-header">
      <span>共 <strong>${reviewWords.length}</strong> 个单词待复习</span>
      <button class="btn-primary btn-sm" id="startReviewBtn">开始复习</button>
    </div>
    <div id="reviewCardArea">
      <p style="text-align:center;color:var(--color-text-muted);padding:2rem 0;">点击"开始复习"来巩固记忆</p>
    </div>
  `;

  document.getElementById('startReviewBtn').addEventListener('click', () => {
    reviewState = {
      words: shuffle(reviewWords),
      currentIndex: 0,
      total: Math.min(30, reviewWords.length)
    };
    renderReviewCard();
  });
}

function renderReviewCard() {
  if (!reviewState || reviewState.currentIndex >= reviewState.total) {
    finishReview();
    return;
  }

  const word = reviewState.words[reviewState.currentIndex];
  const area = document.getElementById('reviewCardArea');

  area.innerHTML = `
    <div class="review-card">
      <p style="color:var(--color-text-muted);font-size:var(--font-size-sm);margin-bottom:0.5rem;">
        第 ${reviewState.currentIndex + 1} / ${reviewState.total} 个
      </p>
      <div class="review-word-hint">${word.meaning}</div>
      <p style="color:var(--color-text-muted);font-size:var(--font-size-sm);margin-bottom:1rem;">${word.pos}</p>
      <button class="review-reveal-btn" id="revealBtn">👀 查看答案</button>
      <div class="review-answer" id="reviewAnswer">
        <div class="review-answer-word">${word.word}</div>
        <div class="review-answer-meaning">${word.phonetic_uk}</div>
        <div style="margin-bottom:0.5rem;font-size:var(--font-size-sm);color:var(--color-text-secondary);">
          ${word.example_en}<br>${word.example_zh}
        </div>
        <div class="review-rating">
          <button class="review-rating-btn again" data-rating="0">😰 忘了</button>
          <button class="review-rating-btn" data-rating="2">😊 记得</button>
          <button class="review-rating-btn easy" data-rating="3">😎 简单</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('revealBtn').addEventListener('click', function() {
    document.getElementById('reviewAnswer').classList.add('show');
    this.style.display = 'none';
    // Play pronunciation
    speakWord(word.word, Storage.getSettings().speed || 1.0);
  });

  document.querySelectorAll('.review-rating-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const rating = parseInt(this.dataset.rating);
      SRS.update(word.id, rating);
      reviewState.currentIndex++;
      renderReviewCard();
    });
  });
}

function finishReview() {
  document.getElementById('reviewCardArea').innerHTML = `
    <div style="text-align:center;padding:2rem;">
      <div style="font-size:3rem;margin-bottom:1rem;">🎉</div>
      <h3>复习完成！</h3>
      <p>你已完成本次复习，继续保持！</p>
      <button class="btn-primary" style="margin-top:1rem;" onclick="navigateTo('practice')">
        去练习
      </button>
    </div>
  `;
  reviewState = null;
  // Update streak
  Storage.updateStreak();
}

// ================================================================
// PROGRESS MODULE
// ================================================================

function renderProgress() {
  const container = document.getElementById('progressContent');
  const stats = SRS.getStats(PET_VOCABULARY);
  const streak = Storage.getStreak();
  const history = Storage.getPracticeHistory();

  // Last 7 days chart
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().split('T')[0];
    const dayRecords = history.filter(r => r.date === dateStr);
    const totalCorrect = dayRecords.reduce((sum, r) => sum + (r.correct || 0), 0);
    const totalWords = dayRecords.reduce((sum, r) => sum + (r.total || 0), 0);
    const rate = totalWords > 0 ? Math.round((totalCorrect / totalWords) * 100) : 0;
    last7Days.push({
      date: dateStr,
      label: ['日','一','二','三','四','五','六'][d.getDay()],
      rate,
      count: totalWords
    });
  }

  const maxRate = Math.max(...last7Days.map(d => d.rate), 1);

  let chartHTML = last7Days.map(d => {
    const h = d.count > 0 ? Math.round((d.rate / (maxRate || 100)) * 140) + 4 : 0;
    return `
      <div class="progress-chart-bar-group">
        <span style="font-size:var(--font-size-xs);color:${d.rate >= 70 ? 'var(--color-success)' : d.rate > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)'};">${d.count > 0 ? d.rate + '%' : '-'}</span>
        <div class="progress-chart-bar" style="height:${h}px;background:${d.count > 0 ? (d.rate >= 70 ? 'var(--color-success)' : 'var(--color-warning)') : 'var(--color-border)'};"></div>
        <span class="progress-chart-label">${d.label}</span>
      </div>
    `;
  }).join('');

  // Topic mastery
  const topicEntries = Object.entries(stats.byTopic)
    .sort((a, b) => {
      const rateA = a[1].total > 0 ? a[1].mastered / a[1].total : 0;
      const rateB = b[1].total > 0 ? b[1].mastered / b[1].total : 0;
      return rateA - rateB;
    });

  let topicHTML = topicEntries.map(([topic, data]) => {
    const pct = data.total > 0 ? Math.round((data.mastered / data.total) * 100) : 0;
    return `
      <li class="topic-mastery-item">
        <span class="topic-name">${topic}</span>
        <div class="topic-bar">
          <div class="topic-bar-fill" style="width:${pct}%;background:${pct >= 60 ? 'var(--color-success)' : pct >= 30 ? 'var(--color-warning)' : 'var(--color-primary)'};"></div>
        </div>
        <span class="topic-pct">${pct}%</span>
      </li>
    `;
  }).join('');

  // Total practice count
  const totalPracticed = history.reduce((sum, r) => sum + (r.total || 0), 0);
  const totalCorrect = history.reduce((sum, r) => sum + (r.correct || 0), 0);
  const overallRate = totalPracticed > 0 ? Math.round((totalCorrect / totalPracticed) * 100) : 0;

  container.innerHTML = `
    <div class="progress-card">
      <h3 style="margin-bottom:1rem;">概览</h3>
      <div class="progress-stats-grid">
        <div class="progress-stat-card">
          <div class="progress-stat-value">${stats.practiced}</div>
          <div class="progress-stat-label">已学单词</div>
        </div>
        <div class="progress-stat-card">
          <div class="progress-stat-value" style="color:var(--color-success);">${stats.mastered}</div>
          <div class="progress-stat-label">已掌握</div>
        </div>
        <div class="progress-stat-card">
          <div class="progress-stat-value" style="color:var(--color-warning);">${stats.learning}</div>
          <div class="progress-stat-label">学习中</div>
        </div>
        <div class="progress-stat-card">
          <div class="progress-stat-value">🔥 ${streak.count || 0}</div>
          <div class="progress-stat-label">连续打卡</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-around;text-align:center;padding:0.5rem 0;">
        <div><span style="font-size:var(--font-size-2xl);font-weight:700;">${totalPracticed}</span><br><span style="font-size:var(--font-size-xs);color:var(--color-text-secondary);">累计练习词数</span></div>
        <div><span style="font-size:var(--font-size-2xl);font-weight:700;color:var(--color-primary);">${overallRate}%</span><br><span style="font-size:var(--font-size-xs);color:var(--color-text-secondary);">总正确率</span></div>
        <div><span style="font-size:var(--font-size-2xl);font-weight:700;color:var(--color-danger);">${Storage.getMistakeCount()}</span><br><span style="font-size:var(--font-size-xs);color:var(--color-text-secondary);">错词数</span></div>
      </div>
    </div>

    <div class="progress-card">
      <h3 style="margin-bottom:1rem;">近7天正确率</h3>
      <div class="progress-chart-container">
        <div class="progress-chart-placeholder">
          ${chartHTML}
        </div>
      </div>
    </div>

    <div class="progress-card">
      <h3 style="margin-bottom:1rem;">话题掌握率</h3>
      <ul class="topic-mastery-list">
        ${topicHTML}
      </ul>
    </div>

    <div class="progress-card" style="text-align:center;">
      <h3 style="margin-bottom:0.75rem;">数据管理</h3>
      <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;">
        <button class="btn-secondary btn-sm" onclick="exportData()">📤 导出数据</button>
        <button class="btn-secondary btn-sm" onclick="document.getElementById('importFile').click()">📥 导入数据</button>
        <button class="btn-secondary btn-sm" onclick="resetAllData()" style="color:var(--color-danger);border-color:var(--color-danger);">🗑️ 重置数据</button>
      </div>
      <input type="file" id="importFile" style="display:none;" accept=".json" onchange="importData(event)">
    </div>
  `;
}

function exportData() {
  const data = Storage.exportAll();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pet-helper-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('数据已导出');
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (Storage.importAll(data)) {
        showToast('数据导入成功！');
        renderProgress();
      } else {
        showToast('数据格式错误');
      }
    } catch (err) {
      showToast('文件格式错误，请检查');
    }
  };
  reader.readAsText(file);
}

function resetAllData() {
  if (confirm('确定要删除所有学习数据吗？包括错词本、练习记录和复习进度。\n\n建议先导出数据备份。此操作不可撤销！')) {
    if (confirm('再次确认：真的要删除所有数据吗？')) {
      Storage.resetAll();
      showToast('数据已重置');
      renderProgress();
    }
  }
}

// ================================================================
// BROWSE MODULE
// ================================================================

let browseFilter = { topic: '全部话题', level: 'all', search: '' };

function renderBrowse() {
  const container = document.getElementById('browseContent');
  browseFilter = browseFilter || { topic: '全部话题', level: 'all', search: '' };

  let topicTabsHTML = PET_TOPICS.map(t =>
    `<button class="browse-topic-tab${t === browseFilter.topic ? ' active' : ''}" data-topic="${t}">${t}</button>`
  ).join('');

  container.innerHTML = `
    <div class="browse-topic-tabs" id="browseTopicTabs">
      ${topicTabsHTML}
    </div>
    <div class="browse-controls">
      <input type="text" class="browse-search" id="browseSearch" placeholder="搜索单词或释义..." value="${browseFilter.search}">
      <select class="browse-filter" id="browseLevelFilter">
        <option value="all" ${browseFilter.level === 'all' ? 'selected' : ''}>全部难度</option>
        <option value="L1" ${browseFilter.level === 'L1' ? 'selected' : ''}>L1 基础必备</option>
        <option value="L2" ${browseFilter.level === 'L2' ? 'selected' : ''}>L2 进阶提升</option>
        <option value="L3" ${browseFilter.level === 'L3' ? 'selected' : ''}>L3 拓展挑战</option>
      </select>
    </div>
    <ul class="browse-word-list" id="browseWordList"></ul>
    <p id="browseCount" style="text-align:center;color:var(--color-text-muted);margin-top:1rem;"></p>
  `;

  // Event listeners
  document.querySelectorAll('.browse-topic-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      browseFilter.topic = this.dataset.topic;
      renderBrowse();
    });
  });

  document.getElementById('browseSearch').addEventListener('input', function(e) {
    browseFilter.search = e.target.value;
    renderBrowseWordList();
  });

  document.getElementById('browseLevelFilter').addEventListener('change', function(e) {
    browseFilter.level = e.target.value;
    renderBrowseWordList();
  });

  renderBrowseWordList();
}

function renderBrowseWordList() {
  let words = [...PET_VOCABULARY];

  // Topic filter
  if (browseFilter.topic !== '全部话题') {
    words = words.filter(w => w.topic === browseFilter.topic);
  }

  // Level filter
  if (browseFilter.level !== 'all') {
    words = words.filter(w => w.level === browseFilter.level);
  }

  // Search filter
  const search = browseFilter.search.toLowerCase().trim();
  if (search) {
    words = words.filter(w =>
      w.word.toLowerCase().includes(search) ||
      w.meaning.includes(search)
    );
  }

  // Sort alphabetically
  words.sort((a, b) => a.word.localeCompare(b.word));

  const list = document.getElementById('browseWordList');
  const count = document.getElementById('browseCount');

  if (words.length === 0) {
    list.innerHTML = '<li style="text-align:center;padding:2rem;color:var(--color-text-muted);">没有找到匹配的单词</li>';
    count.textContent = '';
    return;
  }

  list.innerHTML = words.map(w => `
    <li class="browse-word-item" onclick="showWordDetail('${w.id}')">
      <div style="flex:1;">
        <span class="browse-word-main">${w.word}</span>
        <span style="color:var(--color-text-muted);font-size:var(--font-size-sm);margin-left:0.5rem;">${w.meaning}</span>
      </div>
      <div class="browse-word-info">
        <span class="browse-word-pos">${w.pos}</span>
        <span class="browse-word-level level-${w.level}">${w.level}</span>
        <button class="btn-text" style="font-size:1rem;padding:0.15rem;" onclick="event.stopPropagation();speakWord('${w.word}', ${Storage.getSettings().speed || 1.0})">🔊</button>
      </div>
    </li>
  `).join('');

  count.textContent = `共 ${words.length} 个单词`;
}

function showWordDetail(wordId) {
  const word = PET_VOCABULARY.find(w => w.id === wordId);
  if (!word) return;

  const srsState = SRS.getState(wordId);
  const mistakes = Storage.getMistakes();
  const mistakeInfo = mistakes[wordId];

  openModal(`
    <div class="word-detail">
      <div style="display:flex;justify-content:space-between;align-items:start;">
        <h2>${word.word}</h2>
        <button class="modal-close" onclick="closeModal()" style="position:static;">✕</button>
      </div>
      <div class="word-detail-row">
        <span class="word-detail-label">发音(英)</span>
        <span class="word-detail-value">${word.phonetic_uk}</span>
      </div>
      <div class="word-detail-row">
        <span class="word-detail-label">发音(美)</span>
        <span class="word-detail-value">${word.phonetic_us}</span>
      </div>
      <div class="word-detail-row">
        <span class="word-detail-label">释义</span>
        <span class="word-detail-value" style="font-size:var(--font-size-lg);">${word.meaning}</span>
      </div>
      <div class="word-detail-row">
        <span class="word-detail-label">词性</span>
        <span class="word-detail-value">${word.pos}</span>
      </div>
      <div class="word-detail-row">
        <span class="word-detail-label">话题</span>
        <span class="word-detail-value">${word.topic}</span>
      </div>
      <div class="word-detail-row">
        <span class="word-detail-label">难度</span>
        <span class="browse-word-level level-${word.level}">${word.level}</span>
      </div>
      <div class="word-detail-row">
        <span class="word-detail-label">掌握</span>
        <span class="word-detail-value">${SRS.getLevelLabel(srsState.level)}</span>
      </div>
      ${mistakeInfo ? `<div class="word-detail-row">
        <span class="word-detail-label">错词</span>
        <span class="word-detail-value" style="color:var(--color-danger);">错过 ${mistakeInfo.count} 次</span>
      </div>` : ''}
      <div class="word-detail-example">
        <div class="word-detail-example-en">${word.example_en}</div>
        <div class="word-detail-example-zh">${word.example_zh}</div>
      </div>
      <div style="margin-top:1rem;display:flex;gap:0.5rem;">
        <button class="btn-primary btn-sm" onclick="speakWord('${word.word}', ${Storage.getSettings().speed || 1.0});">🔊 播放发音</button>
      </div>
    </div>
  `);
}

// ================================================================
// INITIALIZATION
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Load settings page
  navigateTo('practice');

  // Check for active practice
  const activePractice = Storage.getActivePractice();
  if (activePractice && activePractice.currentIndex < activePractice.words.length) {
    document.getElementById('continueCard').style.display = 'block';
    document.getElementById('continueProgress').textContent = `${activePractice.currentIndex}/${activePractice.words.length}`;
    document.getElementById('continuePractice').addEventListener('click', () => {
      practiceState = activePractice;
      document.getElementById('practiceSetup').style.display = 'none';
      document.getElementById('practiceActive').style.display = 'block';
      document.getElementById('practiceResult').style.display = 'none';
      renderPracticeWord();
    });
    document.getElementById('discardPractice').addEventListener('click', () => {
      Storage.clearActivePractice();
      document.getElementById('continueCard').style.display = 'none';
    });
  }
});
