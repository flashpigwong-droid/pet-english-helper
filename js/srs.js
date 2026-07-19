/**
 * Spaced Repetition System (SRS) - Simplified SM-2 Algorithm
 * For PET English Helper
 *
 * Levels:
 *   0 - New / never reviewed
 *   1 - Reviewed once, next review in 1 day
 *   2 - Reviewed twice, next review in 3 days
 *   3 - Reviewed 3 times, next review in 7 days
 *   4 - Reviewed 4 times, next review in 14 days
 *   5 - Mastered, next review in 30 days
 *
 * A word reaching level 5 is considered "mastered".
 */

const SRS = {
  // Intervals in milliseconds for each level
  INTERVALS: {
    0: 0,              // same day
    1: 86400000,       // 1 day
    2: 259200000,      // 3 days
    3: 604800000,      // 7 days
    4: 1209600000,     // 14 days
    5: 2592000000      // 30 days
  },

  // Quality ratings from user feedback
  RATING: {
    AGAIN: 0,   // Forgot, need to relearn
    HARD: 1,    // Remembered with difficulty
    GOOD: 2,    // Remembered well
    EASY: 3     // Very easy
  },

  /**
   * Get the current SRS state for a word
   */
  getState(wordId) {
    const state = Storage.getSRSState();
    return state[wordId] || { level: 0, nextReview: 0, lastReview: 0 };
  },

  /**
   * Update SRS state based on user rating
   * @param {string} wordId
   * @param {number} rating - 0 (again), 1 (hard), 2 (good), 3 (easy)
   */
  update(wordId, rating) {
    const current = this.getState(wordId);

    let newLevel;
    if (rating === this.RATING.AGAIN) {
      // Reset to level 1
      newLevel = 1;
    } else if (rating === this.RATING.HARD) {
      // Stay same or decrease by 1
      newLevel = Math.max(1, current.level - 1);
    } else if (rating === this.RATING.GOOD) {
      // Increase by 1
      newLevel = Math.min(5, current.level + 1);
    } else {
      // EASY - increase by 2
      newLevel = Math.min(5, current.level + 2);
    }

    const now = Date.now();
    const nextReview = now + this.INTERVALS[newLevel];

    Storage.updateSRSState(wordId, {
      level: newLevel,
      nextReview: nextReview,
      lastReview: now
    });

    return { level: newLevel, nextReview };
  },

  /**
   * Mark word as practiced in spelling mode (不经过评级，简单记录)
   * This is used when a word is practiced in spelling mode
   */
  markPracticed(wordId, correct) {
    const current = this.getState(wordId);

    if (correct) {
      // Correct answer raises level
      const newLevel = Math.min(5, current.level + 1);
      const nextReview = Date.now() + this.INTERVALS[newLevel];
      Storage.updateSRSState(wordId, { level: newLevel, nextReview });
      return { level: newLevel, nextReview };
    } else {
      // Wrong answer resets
      const nextReview = Date.now() + this.INTERVALS[1];
      Storage.updateSRSState(wordId, { level: 1, nextReview });
      return { level: 1, nextReview };
    }
  },

  /**
   * Get words that are due for review today
   * @param {Array} wordList - Full vocabulary array
   * @returns {Array} Words due for review, sorted by priority
   */
  getDueWords(wordList) {
    const now = Date.now();
    const srsState = Storage.getSRSState();
    const due = [];

    wordList.forEach(word => {
      const state = srsState[word.id];
      if (!state && Math.random() < 0.3) {
        // Pick ~30% of never-reviewed words each time
        due.push({ ...word, srsLevel: 0, overdue: Infinity });
      } else if (state && state.nextReview <= now) {
        const overdue = now - state.nextReview;
        due.push({ ...word, srsLevel: state.level, overdue });
      }
    });

    // Sort by: lower level first, then more overdue first
    due.sort((a, b) => {
      if (a.srsLevel !== b.srsLevel) return a.srsLevel - b.srsLevel;
      return b.overdue - a.overdue;
    });

    return due;
  },

  /**
   * Get the number of words due for review
   */
  getDueCount(wordList) {
    const now = Date.now();
    const srsState = Storage.getSRSState();
    let count = 0;

    wordList.forEach(word => {
      const state = srsState[word.id];
      if (!state || state.nextReview <= now) count++;
    });

    return count;
  },

  /**
   * Get vocabulary statistics
   */
  getStats(wordList) {
    const srsState = Storage.getSRSState();
    const stats = {
      total: wordList.length,
      practiced: 0,
      mastered: 0,    // level 5
      learning: 0,    // levels 1-4
      new: 0,         // level 0
      byTopic: {}     // { topic: { mastered, total } }
    };

    // Initialize topic stats
    wordList.forEach(word => {
      if (!stats.byTopic[word.topic]) {
        stats.byTopic[word.topic] = { mastered: 0, total: 0 };
      }
      stats.byTopic[word.topic].total++;

      const state = srsState[word.id];
      if (!state || state.level === 0) {
        stats.new++;
      } else if (state.level === 5) {
        stats.mastered++;
        stats.byTopic[word.topic].mastered++;
        stats.practiced++;
      } else {
        stats.learning++;
        stats.practiced++;
      }
    });

    return stats;
  },

  /**
   * Get the level label in Chinese
   */
  getLevelLabel(level) {
    const labels = ['未学', '初学', '学习中', '较熟练', '很熟练', '已掌握'];
    return labels[level] || '未知';
  },

  /**
   * Get the level color class
   */
  getLevelClass(level) {
    const classes = ['level-new', 'level-new', 'level-learning', 'level-learning', 'level-good', 'level-mastered'];
    return classes[level] || 'level-new';
  }
};
