/**
 * Manages state persistence for the Hacker News Companion extension
 */
class HNState {
  static BOOKMARKED_AUTHORS_KEY = "bookmarkedAuthors";
  static KARMA_STATS_KEY = "karmaStats";
  static USER_INFO_KEY = "userInfoCache";
  static USER_INFO_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

  /**
   * Saves user info to persistent storage.
   * @param {string} username - The HN username.
   * @param {object} userInfo - The user info object from API.
   */
  static async saveUserInfo(username, userInfo) {
    if (!username || !userInfo) return;
    try {
      const data = await chrome.storage.local.get(this.USER_INFO_KEY);
      const cache = data[this.USER_INFO_KEY] || {};
      cache[username] = { userInfo, timestamp: Date.now() };
      await chrome.storage.local.set({ [this.USER_INFO_KEY]: cache });
    } catch (error) {
      console.error("Error saving user info:", error);
    }
  }

  /**
   * Retrieves user info from persistent storage.
   * @param {string} username - The HN username.
   * @returns {Promise<object|null>} The user info or null if not found/expired.
   */
  static async getUserInfo(username) {
    if (!username) return null;
    try {
      const data = await chrome.storage.local.get(this.USER_INFO_KEY);
      const entry = data[this.USER_INFO_KEY]?.[username];
      if (!entry || !entry.userInfo) return null;
      if (Date.now() - entry.timestamp > this.USER_INFO_TTL_MS) return null;
      return entry.userInfo;
    } catch (error) {
      console.error("Error retrieving user info:", error);
      return null;
    }
  }

  /**
   * Saves the last seen post ID to local storage
   * @param {string} postId - The ID of the post to save
   */
  static saveLastSeenPostId(postId) {
    chrome.storage.local
      .set({
        lastSeenPost: {
          id: postId,
          timestamp: Date.now(),
        },
      })
      .catch((_) => {
        // console.error('Error saving current post state:', _);
      });
  }

  /**
   * Retrieves the last seen post ID from local storage
   * @returns {Promise<string|null>} The last seen post ID or null if not found or expired
   */
  static async getLastSeenPostId() {
    try {
      const data = await chrome.storage.local.get("lastSeenPost");
      // Return null if no state or if state is older than 15 minutes
      if (
        !data.lastSeenPost ||
        Date.now() - data.lastSeenPost.timestamp > 15 * 60 * 1000
      ) {
        await this.clearLastSeenPost();
        return null;
      }
      return data.lastSeenPost.id;
    } catch (error) {
      // console.error('Error retrieving saved post state:', error);
      return null;
    }
  }

  /**
   * Clears the last seen post from local storage
   */
  static async clearLastSeenPost() {
    chrome.storage.local.remove("lastSeenPost").catch((_) => {
      // console.error('Error clearing lastSeenPost post state:', _);
    });
  }

  /**
   * Retrieves the current list of bookmarked authors.
   * @returns {Promise<Map<string, object>>} Map keyed by username with bookmark metadata.
   */
  static async getBookmarkedAuthors() {
    try {
      const data = await chrome.storage.local.get(this.BOOKMARKED_AUTHORS_KEY);
      const rawBookmarks = data[this.BOOKMARKED_AUTHORS_KEY] || {};
      return this.deserializeBookmarks(rawBookmarks);
    } catch (error) {
      console.error("Error retrieving bookmarked authors:", error);
      return new Map();
    }
  }

  static deserializeBookmarks(rawBookmarks) {
    const normalized = new Map();
    if (!rawBookmarks || typeof rawBookmarks !== "object") {
      return normalized;
    }
    Object.entries(rawBookmarks).forEach(([username, bookmark]) => {
      if (!username) return;
      const safeBookmark = {
        username,
        commentId: bookmark?.commentId || null,
        permalink: bookmark?.permalink || null,
        postId: bookmark?.postId || null,
        bookmarkedAt: bookmark?.bookmarkedAt || Date.now(),
      };
      normalized.set(username, safeBookmark);
    });
    return normalized;
  }

  /**
   * Saves the provided bookmarks map back to storage.
   * @param {Map<string, object>} bookmarksMap - Map of username to bookmark data.
   */
  static async saveBookmarkedAuthors(bookmarksMap) {
    if (!(bookmarksMap instanceof Map)) {
      console.error(
        "saveBookmarkedAuthors: Expected a Map of bookmarks, received:",
        bookmarksMap
      );
      return;
    }
    const serialized = {};
    bookmarksMap.forEach((value, key) => {
      if (!key) return;
      serialized[key] = {
        username: value?.username || key,
        commentId: value?.commentId || null,
        permalink: value?.permalink || null,
        postId: value?.postId || null,
        bookmarkedAt: value?.bookmarkedAt || Date.now(),
      };
    });

    try {
      await chrome.storage.local.set({
        [this.BOOKMARKED_AUTHORS_KEY]: serialized,
      });
    } catch (error) {
      console.error("Error saving bookmarked authors:", error);
    }
  }

  /**
   * Toggles bookmark state for a given author.
   * @param {object} bookmarkData - Bookmark metadata containing username, commentId, permalink, postId.
   * @returns {Promise<Map<string, object>>} Updated bookmarks map.
   */
  static async toggleBookmarkedAuthor(bookmarkData) {
    const { username } = bookmarkData || {};
    if (!username) {
      console.error("toggleBookmarkedAuthor: Missing username.", bookmarkData);
      return new Map();
    }
    const bookmarks = await this.getBookmarkedAuthors();
    if (bookmarks.has(username)) {
      bookmarks.delete(username);
    } else {
      bookmarks.set(username, {
        username,
        commentId: bookmarkData?.commentId || null,
        permalink: bookmarkData?.permalink || null,
        postId: bookmarkData?.postId || null,
        bookmarkedAt: Date.now(),
      });
    }
    await this.saveBookmarkedAuthors(bookmarks);
    return bookmarks;
  }

  /**
   * Removes a bookmarked author explicitly.
   * @param {string} username - Username to remove.
   * @returns {Promise<Map<string, object>>} Updated bookmarks map.
   */
  static async removeBookmarkedAuthor(username) {
    if (!username) {
      console.error("removeBookmarkedAuthor: Missing username.");
      return new Map();
    }
    const bookmarks = await this.getBookmarkedAuthors();
    if (bookmarks.has(username)) {
      bookmarks.delete(username);
      await this.saveBookmarkedAuthors(bookmarks);
    }
    return bookmarks;
  }

  static serializeKarmaStats(statsMap) {
    if (!(statsMap instanceof Map)) {
      return {};
    }
    const serialized = {};
    statsMap.forEach((value, key) => {
      serialized[key] = value;
    });
    return serialized;
  }

  static deserializeKarmaStats(rawStats) {
    if (!rawStats || typeof rawStats !== "object") {
      return new Map();
    }
    const map = new Map();
    Object.entries(rawStats).forEach(([key, value]) => {
      map.set(key, value);
    });
    return map;
  }

  static async saveKarmaStats(postId, stats = []) {
    if (!postId) {
      console.warn("saveKarmaStats: Missing postId.");
      return;
    }
    try {
      const data = await chrome.storage.local.get(this.KARMA_STATS_KEY);
      const existing = data[this.KARMA_STATS_KEY] || {};
      existing[postId] = {
        stats,
        savedAt: Date.now(),
      };
      await chrome.storage.local.set({
        [this.KARMA_STATS_KEY]: existing,
      });
    } catch (error) {
      console.error("Error saving karma stats:", error);
    }
  }

  static async getSavedKarmaStats(postId) {
    if (!postId) {
      return null;
    }
    try {
      const data = await chrome.storage.local.get(this.KARMA_STATS_KEY);
      const stored = data[this.KARMA_STATS_KEY];
      if (!stored || !stored[postId]) {
        return null;
      }
      const entry = stored[postId];
      if (
        !entry ||
        !entry.stats ||
        !Array.isArray(entry.stats) ||
        entry.stats.length === 0
      ) {
        return null;
      }
      const age = Date.now() - (entry.savedAt || 0);
      if (age > HNEnhancer.KARMA_STORAGE_TTL_MS) {
        return null;
      }
      return entry.stats;
    } catch (error) {
      console.error("Error retrieving saved karma stats:", error);
      return null;
    }
  }

  /**
   * Subscribes to changes on bookmarked authors.
   * @param {function(Map<string, object>):void} callback - Invoked when bookmarks change.
   * @returns {function} Cleanup function to remove the listener.
   */
  static subscribeToBookmarkedAuthors(callback) {
    if (typeof callback !== "function") {
      console.error(
        "subscribeToBookmarkedAuthors: Expected a callback function."
      );
      return () => {};
    }

    const listener = (changes, areaName) => {
      if (areaName !== "local") return;
      if (!changes[this.BOOKMARKED_AUTHORS_KEY]) return;

      if (changes[this.BOOKMARKED_AUTHORS_KEY].newValue) {
        const raw = changes[this.BOOKMARKED_AUTHORS_KEY].newValue;
        callback(this.deserializeBookmarks(raw));
      } else {
        callback(new Map());
      }
    };

    chrome.storage.onChanged.addListener(listener);
    // Return cleanup function
    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }

  /**
   * Generates the storage key for chat history.
   * @param {string} postId - The ID of the post.
   * @param {string} commentId - The ID of the comment.
   * @param {string} contextType - The context type ('parents', 'descendants', 'children').
   * @returns {string} The storage key.
   * @private
   */
  static _getChatHistoryKey(postId, commentId, contextType) {
    return `chatHistory_${postId}_${commentId}_${contextType}`;
  }

  /**
   * Saves the chat history for a specific comment and context type.
   * @param {string} postId - The ID of the post.
   * @param {string} commentId - The ID of the comment.
   * @param {string} contextType - The context type ('parents', 'descendants', 'children').
   * @param {Array<object>} history - The conversation history array to save.
   */
  static saveChatHistory(
    postId,
    commentId,
    contextType,
    history,
    commentPathToIdMap = null,
    metadata = {}
  ) {
    if (!postId || !commentId || !contextType || !history) {
      console.error("saveChatHistory: Missing required arguments.", {
        postId,
        commentId,
        contextType,
        history,
      });
      return;
    }
    const key = this._getChatHistoryKey(postId, commentId, contextType);
    const normalizedHistory = Array.isArray(history) ? history : [];

    const storageEntry = {
      history: normalizedHistory,
      savedAt: Date.now(),
    };

    if (commentPathToIdMap instanceof Map && commentPathToIdMap.size > 0) {
      storageEntry.commentPathToIdMap = Array.from(
        commentPathToIdMap.entries()
      );
    } else if (
      Array.isArray(commentPathToIdMap) &&
      commentPathToIdMap.length > 0
    ) {
      storageEntry.commentPathToIdMap = commentPathToIdMap;
    }

    if (metadata && typeof metadata === "object") {
      if (metadata.provider) {
        storageEntry.provider = metadata.provider;
      }
      if (metadata.model) {
        storageEntry.model = metadata.model;
      }
    }

    chrome.storage.local.set({ [key]: storageEntry }).catch((error) => {
      console.error(`Error saving chat history for ${key}:`, error);
    });
    // console.log(`[HNState] Saved history for ${key}`, history); // Optional debug log
  }

  /**
   * Retrieves the chat history for a specific comment and context type.
   * @param {string} postId - The ID of the post.
   * @param {string} commentId - The ID of the comment.
   * @param {string} contextType - The context type ('parents', 'descendants', 'children').
   * @returns {Promise<Array<object>|null>} The conversation history array or null if not found.
   */
  static async getChatHistory(postId, commentId, contextType) {
    if (!postId || !commentId || !contextType) {
      console.error("getChatHistory: Missing required arguments.", {
        postId,
        commentId,
        contextType,
      });
      return null;
    }
    const key = this._getChatHistoryKey(postId, commentId, contextType);
    try {
      const data = await chrome.storage.local.get(key);
      // console.log(`[HNState] Retrieved history for ${key}`, data[key]); // Optional debug log
      if (!data[key]) {
        return null;
      }

      // Backward compatibility: older entries stored the array directly
      if (Array.isArray(data[key])) {
        return {
          history: data[key],
          commentPathToIdMap: [],
        };
      }

      const entry = data[key];
      const historyArray = Array.isArray(entry.history) ? entry.history : [];
      const pathPairs = Array.isArray(entry.commentPathToIdMap)
        ? entry.commentPathToIdMap
        : [];

      return {
        history: historyArray,
        commentPathToIdMap: pathPairs,
        savedAt: entry.savedAt,
        provider: entry.provider,
        model: entry.model,
      };
    } catch (error) {
      console.error(`Error retrieving chat history for ${key}:`, error);
      return null;
    }
  }

  /**
   * Clears the chat history for a specific comment and context type.
   * @param {string} postId - The ID of the post.
   * @param {string} commentId - The ID of the comment.
   * @param {string} contextType - The context type ('parents', 'descendants', 'children').
   */
  static async clearChatHistory(postId, commentId, contextType) {
    if (!postId || !commentId || !contextType) {
      console.error("clearChatHistory: Missing required arguments.", {
        postId,
        commentId,
        contextType,
      });
      return;
    }
    const key = this._getChatHistoryKey(postId, commentId, contextType);
    chrome.storage.local.remove(key).catch((error) => {
      console.error(`Error clearing chat history for ${key}:`, error);
    });
    // console.log(`[HNState] Cleared history for ${key}`); // Optional debug log
  }

  /**
   * Generates the storage key for summarization cache.
   * @param {string} postId - The ID of the post.
   * @param {string} commentId - The ID of the comment (null for post summaries).
   * @param {string} provider - The AI provider used.
   * @param {string} model - The model used.
   * @param {string} language - The language setting.
   * @returns {string} The storage key.
   * @private
   */
  static _getSummaryKey(postId, commentId, provider, model, language) {
    const baseKey = commentId
      ? `summary_${postId}_${commentId}`
      : `summary_${postId}_post`;
    return `${baseKey}_${provider}_${model}_${language}`;
  }

  /**
   * Saves a summarization result to cache.
   * @param {string} postId - The ID of the post.
   * @param {string} commentId - The ID of the comment (null for post summaries).
   * @param {string} provider - The AI provider used.
   * @param {string} model - The model used.
   * @param {string} language - The language setting.
   * @param {string} summary - The generated summary.
   * @param {object} metadata - Additional metadata (duration, token count, etc.).
   */
  static saveSummary(
    postId,
    commentId,
    provider,
    model,
    language,
    summary,
    metadata = {}
  ) {
    if (!postId || !provider || !model || !language || !summary) {
      console.error("saveSummary: Missing required arguments.", {
        postId,
        commentId,
        provider,
        model,
        language,
        summary,
      });
      return;
    }
    const key = this._getSummaryKey(
      postId,
      commentId,
      provider,
      model,
      language
    );
    const cacheEntry = {
      summary,
      metadata,
      timestamp: Date.now(),
      provider,
      model,
      language,
    };
    chrome.storage.local.set({ [key]: cacheEntry }).catch((error) => {
      console.error(`Error saving summary cache for ${key}:`, error);
    });
    // console.log(`[HNState] Saved summary for ${key}`, cacheEntry); // Optional debug log
  }

  /**
   * Retrieves a cached summarization result.
   * @param {string} postId - The ID of the post.
   * @param {string} commentId - The ID of the comment (null for post summaries).
   * @param {string} provider - The AI provider used.
   * @param {string} model - The model used.
   * @param {string} language - The language setting.
   * @param {number} maxAge - Maximum age in milliseconds (default: 24 hours).
   * @returns {Promise<object|null>} The cached summary entry or null if not found/expired.
   */
  static async getSummary(
    postId,
    commentId,
    provider,
    model,
    language,
    maxAge = 24 * 60 * 60 * 1000
  ) {
    if (!postId || !provider || !model || !language) {
      console.error("getSummary: Missing required arguments.", {
        postId,
        commentId,
        provider,
        model,
        language,
      });
      return null;
    }
    const key = this._getSummaryKey(
      postId,
      commentId,
      provider,
      model,
      language
    );
    console.log(`[DEBUG] HNState.getSummary: Looking for cache key: ${key}`);

    try {
      const data = await chrome.storage.local.get(key);
      const cacheEntry = data[key];

      console.log(
        `[DEBUG] HNState.getSummary: Cache entry found: ${!!cacheEntry}`
      );

      if (!cacheEntry) {
        console.log(
          `[DEBUG] HNState.getSummary: No cache entry found for key: ${key}`
        );
        return null;
      }

      // Check if cache entry is expired
      const age = Date.now() - cacheEntry.timestamp;
      const isExpired = age > maxAge;
      console.log(
        `[DEBUG] HNState.getSummary: Cache age: ${age}ms, maxAge: ${maxAge}ms, expired: ${isExpired}`
      );

      if (isExpired) {
        console.log(
          `[DEBUG] HNState.getSummary: Cache expired, clearing entry for key: ${key}`
        );
        await this.clearSummary(postId, commentId, provider, model, language);
        return null;
      }

      console.log(
        `[DEBUG] HNState.getSummary: Returning valid cache entry for key: ${key}`
      );
      return cacheEntry;
    } catch (error) {
      console.error(`Error retrieving summary cache for ${key}:`, error);
      return null;
    }
  }

  /**
   * Clears a cached summarization result.
   * @param {string} postId - The ID of the post.
   * @param {string} commentId - The ID of the comment (null for post summaries).
   * @param {string} provider - The AI provider used.
   * @param {string} model - The model used.
   * @param {string} language - The language setting.
   */
  static async clearSummary(postId, commentId, provider, model, language) {
    if (!postId || !provider || !model || !language) {
      console.error("clearSummary: Missing required arguments.", {
        postId,
        commentId,
        provider,
        model,
        language,
      });
      return;
    }
    const key = this._getSummaryKey(
      postId,
      commentId,
      provider,
      model,
      language
    );
    chrome.storage.local.remove(key).catch((error) => {
      console.error(`Error clearing summary cache for ${key}:`, error);
    });
    // console.log(`[HNState] Cleared summary for ${key}`); // Optional debug log
  }

  /**
   * Clears all cached summaries for a specific post.
   * @param {string} postId - The ID of the post.
   */
  static async clearAllSummariesForPost(postId) {
    if (!postId) {
      console.error("clearAllSummariesForPost: Missing postId argument.");
      return;
    }
    try {
      const allData = await chrome.storage.local.get(null);
      const keysToRemove = Object.keys(allData).filter((key) =>
        key.startsWith(`summary_${postId}_`)
      );
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        // console.log(`[HNState] Cleared ${keysToRemove.length} summaries for post ${postId}`);
      }
    } catch (error) {
      console.error(`Error clearing summaries for post ${postId}:`, error);
    }
  }

  /**
   * Gets cache statistics for summaries.
   * @returns {Promise<object>} Object with cache statistics.
   */
  static async getSummaryCacheStats() {
    try {
      const allData = await chrome.storage.local.get(null);
      const summaryKeys = Object.keys(allData).filter((key) =>
        key.startsWith("summary_")
      );

      let totalSize = 0;
      let expiredCount = 0;
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      summaryKeys.forEach((key) => {
        const entry = allData[key];
        if (entry && entry.summary) {
          totalSize += entry.summary.length;
          if (now - entry.timestamp > maxAge) {
            expiredCount++;
          }
        }
      });

      return {
        totalEntries: summaryKeys.length,
        expiredEntries: expiredCount,
        totalSizeBytes: totalSize,
        totalSizeKB: Math.round(totalSize / 1024),
      };
    } catch (error) {
      console.error("Error getting summary cache stats:", error);
      return {
        totalEntries: 0,
        expiredEntries: 0,
        totalSizeBytes: 0,
        totalSizeKB: 0,
      };
    }
  }

  /**
   * Checks if a summary exists in cache for the given parameters.
   * @param {string} postId - The ID of the post.
   * @param {string} commentId - The ID of the comment (null for post summaries).
   * @param {string} provider - The AI provider used.
   * @param {string} model - The model used.
   * @param {string} language - The language setting.
   * @returns {Promise<boolean>} True if a valid (non-expired) summary exists.
   */
  static async hasSummary(postId, commentId, provider, model, language) {
    if (!postId || !provider || !model || !language) {
      return false;
    }
    const key = this._getSummaryKey(
      postId,
      commentId,
      provider,
      model,
      language
    );
    try {
      const data = await chrome.storage.local.get(key);
      const cacheEntry = data[key];

      if (!cacheEntry) {
        return false;
      }

      // Check if cache entry is expired (24 hours)
      const maxAge = 24 * 60 * 60 * 1000;
      if (Date.now() - cacheEntry.timestamp > maxAge) {
        return false;
      }

      return true;
    } catch (error) {
      console.error(`Error checking summary cache for ${key}:`, error);
      return false;
    }
  }

  /**
   * Checks if chat history exists for the given comment or post.
   * @param {string} postId - The ID of the post.
   * @param {string} commentId - The ID of the comment (or "post" for post-level chat).
   * @returns {Promise<boolean>} True if chat history exists for any context type.
   */
  static async hasChatHistory(postId, commentId) {
    if (!postId || !commentId) {
      return false;
    }

    // For post-level chat, check for all context types
    if (commentId === "post") {
      const contextTypes = ["descendants", "children"];
      try {
        for (const contextType of contextTypes) {
          const key = this._getChatHistoryKey(postId, "post", contextType);
          const data = await chrome.storage.local.get(key);
          const entry = data[key];
          const historyArray = Array.isArray(entry)
            ? entry
            : Array.isArray(entry?.history)
            ? entry.history
            : [];
          if (historyArray.length > 0) {
            return true;
          }
        }
        return false;
      } catch (error) {
        console.error(`Error checking post chat history for ${postId}:`, error);
        return false;
      }
    }

    // For comment-level chat, check all context types
    const contextTypes = ["parents", "descendants", "children"];

    try {
      for (const contextType of contextTypes) {
        const key = this._getChatHistoryKey(postId, commentId, contextType);
        const data = await chrome.storage.local.get(key);
        const entry = data[key];
        const historyArray = Array.isArray(entry)
          ? entry
          : Array.isArray(entry?.history)
          ? entry.history
          : [];
        if (historyArray.length > 0) {
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error(
        `Error checking chat history for ${postId}_${commentId}:`,
        error
      );
      return false;
    }
  }
}

// Make the class available globally
window.HNState = HNState;
