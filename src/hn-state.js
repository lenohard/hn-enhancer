/**
 * Manages state persistence for the Hacker News Companion extension
 */
class HNState {
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
  static saveChatHistory(postId, commentId, contextType, history) {
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
    chrome.storage.local.set({ [key]: history }).catch((error) => {
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
      return data[key] || null; // Return the history array or null
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
          if (data[key] && data[key].length > 0) {
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
        if (data[key] && data[key].length > 0) {
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
