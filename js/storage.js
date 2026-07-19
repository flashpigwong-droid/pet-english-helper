/**
 * Local Storage Manager for PET English Helper
 * Manages practice data, mistakes, SRS state, and progress tracking
 * All data is stored in browser localStorage
 */

const Storage = {
  _PREFIX: 'pet_helper_',

  _key(name) {
    return this._PREFIX + name;
  },

  // ---- Generic get/set ----
  get(name, defaultValue = null) {
    try {
      const raw = localStorage.getItem(this._key(name));
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch (e) {
      return defaultValue;
    }
  },

  set(name, value) {
    try {
      localStorage.setItem(this._key(name), JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Storage full or unavailable:', e);
      return false;
    }
  },

  remove(name) {
    localStorage.removeItem(this._key(name));
  },

  // ---- Mistakes (错词本) ----
  // Structure: { "wordId": { count: N, lastWrong: timestamp, attempts: ["wrong_spelling1", ...] } }
  getMistakes() {
    return this.get('mistakes', {});
  },

  addMistake(wordId, wrongSpelling) {
    const mistakes = this.getMistakes();
    if (!mistakes[wordId]) {
      mistakes[wordId] = { count: 0, lastWrong: Date.now(), attempts: [] };
    }
    mistakes[wordId].count++;
    mistakes[wordId].lastWrong = Date.now();
    if (wrongSpelling && !mistakes[wordId].attempts.includes(wrongSpelling)) {
      mistakes[wordId].attempts.unshift(wrongSpelling);
      if (mistakes[wordId].attempts.length > 5) mistakes[wordId].attempts.pop();
    }
    this.set('mistakes', mistakes);
  },

  removeMistake(wordId) {
    const mistakes = this.getMistakes();
    delete mistakes[wordId];
    this.set('mistakes', mistakes);
  },

  getMistakeCount() {
    return Object.keys(this.getMistakes()).length;
  },

  // ---- Practice History (练习历史) ----
  // Structure: [{ date: "YYYY-MM-DD", correct: N, total: N, words: [...] }]
  getPracticeHistory() {
    return this.get('practiceHistory', []);
  },

  addPracticeRecord(record) {
    const history = this.getPracticeHistory();
    history.push({
      date: new Date().toISOString().split('T')[0],
      timestamp: Date.now(),
      ...record
    });
    // Keep last 90 days
    while (history.length > 90) history.shift();
    this.set('practiceHistory', history);
  },

  // ---- Current Practice State (练习中的状态) ----
  getActivePractice() {
    return this.get('activePractice', null);
  },

  saveActivePractice(state) {
    this.set('activePractice', state);
  },

  clearActivePractice() {
    this.remove('activePractice');
  },

  // ---- SRS State (间隔重复状态) ----
  // Structure: { "wordId": { level: 0-5, nextReview: timestamp, lastReview: timestamp } }
  getSRSState() {
    return this.get('srsState', {});
  },

  updateSRSState(wordId, data) {
    const state = this.getSRSState();
    state[wordId] = { ...state[wordId], ...data, lastReview: Date.now() };
    this.set('srsState', state);
  },

  // ---- Streak (连续打卡) ----
  getStreak() {
    return this.get('streak', { count: 0, lastDate: null });
  },

  updateStreak() {
    const streak = this.getStreak();
    const today = new Date().toISOString().split('T')[0];
    if (streak.lastDate === today) return streak;

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (streak.lastDate === yesterday) {
      streak.count++;
    } else if (streak.lastDate !== today) {
      streak.count = 1;
    }
    streak.lastDate = today;
    this.set('streak', streak);
    return streak;
  },

  // ---- Settings ----
  getSettings() {
    return this.get('settings', {
      speed: 1.0,
      accent: 'uk',  // 'uk' or 'us'
      wordsPerRound: 15,
      difficulty: 'all'
    });
  },

  saveSettings(settings) {
    this.set('settings', { ...this.getSettings(), ...settings });
  },

  // ---- Export / Import ----
  exportAll() {
    const data = {};
    const keys = ['mistakes', 'practiceHistory', 'srsState', 'streak', 'settings'];
    keys.forEach(k => { data[k] = this.get(k); });
    return data;
  },

  importAll(data) {
    if (!data || typeof data !== 'object') return false;
    const keys = ['mistakes', 'practiceHistory', 'srsState', 'streak', 'settings'];
    keys.forEach(k => {
      if (data[k] !== undefined) this.set(k, data[k]);
    });
    return true;
  },

  // ---- Reset ----
  resetAll() {
    const keys = ['mistakes', 'practiceHistory', 'activePractice', 'srsState', 'streak'];
    keys.forEach(k => this.remove(k));
  }
};
