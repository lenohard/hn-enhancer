/**
 * Manages state persistence for the Hacker News Companion extension
 */
class HNState {
    /**
     * Saves the last seen post ID to local storage
     * @param {string} postId - The ID of the post to save
     */
    static saveLastSeenPostId(postId) {
        chrome.storage.local.set({
            lastSeenPost: {
                id: postId,
                timestamp: Date.now()
            }
        }).catch(_ => {
            // console.error('Error saving current post state:', _);
        });
    }

    /**
     * Retrieves the last seen post ID from local storage
     * @returns {Promise<string|null>} The last seen post ID or null if not found or expired
     */
    static async getLastSeenPostId() {
        try {
            const data = await chrome.storage.local.get('lastSeenPost');
            // Return null if no state or if state is older than 15 minutes
            if (!data.lastSeenPost || Date.now() - data.lastSeenPost.timestamp > (15 * 60 * 1000)) {
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
        chrome.storage.local.remove('lastSeenPost').catch(_ => {
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
            console.error("saveChatHistory: Missing required arguments.", { postId, commentId, contextType, history });
            return;
        }
        const key = this._getChatHistoryKey(postId, commentId, contextType);
        chrome.storage.local.set({ [key]: history }).catch(error => {
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
            console.error("getChatHistory: Missing required arguments.", { postId, commentId, contextType });
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
            console.error("clearChatHistory: Missing required arguments.", { postId, commentId, contextType });
            return;
        }
        const key = this._getChatHistoryKey(postId, commentId, contextType);
        chrome.storage.local.remove(key).catch(error => {
            console.error(`Error clearing chat history for ${key}:`, error);
        });
        // console.log(`[HNState] Cleared history for ${key}`); // Optional debug log
    }
}

// Make the class available globally
window.HNState = HNState;
