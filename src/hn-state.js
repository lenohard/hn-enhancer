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
}

// Make the class available globally
window.HNState = HNState;
