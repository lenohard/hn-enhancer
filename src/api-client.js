/**
 * Handles API communication for the Hacker News Companion extension
 */
class ApiClient {
    constructor(debug = false) {
        this.debug = debug;
    }

    /**
     * Logs debug messages if debug mode is enabled
     * @param {...any} args - Arguments to log
     */
    logDebug(...args) {
        if (this.debug) {
            console.log('[DEBUG] ', ...args);
        }
    }

    /**
     * Logs info messages
     * @param {...any} args - Arguments to log
     */
    logInfo(...args) {
        console.log('[INFO] ', ...args);
    }

    /**
     * Sends a message to the background script and handles the response
     * @param {string} type - The type of message to send
     * @param {Object} data - The data to send with the message
     * @returns {Promise<any>} The response data
     */
    async sendBackgroundMessage(type, data) {
        this.logDebug(`Sending browser runtime message ${type}:`, data);

        let response;
        const startTime = performance.now();
        let duration = 0;

        try {
            response = await chrome.runtime.sendMessage({type, data});

            const endTime = performance.now();
            duration = Math.round((endTime - startTime) / 1000);

            this.logDebug(`Got response from background message '${type}' in ${duration}s. URL: ${data.url || 'N/A'}`);

        } catch (error) {
            const endTime = performance.now();
            duration = Math.round((endTime - startTime) / 1000);

            const errorMessage = `Error sending background message '${type}' URL: ${data?.url || 'N/A'}. Duration: ${duration}s. Error: ${error.message}`;
            console.error(errorMessage);
            throw new Error(errorMessage);
        }

        if (!response) {
            console.error(`No response from background message ${type}`);
            throw new Error(`No response from background message ${type}`);
        }
        if (!response.success) {
            console.error(`Error response from background message ${type}:`, response.error);
            throw new Error(response.error);
        }

        // Add the duration to the response for displaying in the summary panel
        response.data.duration = duration;
        return response.data;
    }

    /**
     * Fetches user information from the Hacker News Algolia API
     * @param {string} username - The username to fetch information for
     * @returns {Promise<Object>} The user information
     */
    async fetchUserInfo(username) {
        try {
            const data = await this.sendBackgroundMessage(
                'FETCH_API_REQUEST',
                {
                    url: `https://hn.algolia.com/api/v1/users/${username}`,
                    method: 'GET'
                }
            );

            return {
                karma: data.karma || 'Not found',
                about: data.about || 'No about information'
            };
        } catch (error) {
            return {
                karma: 'User info error',
                about: 'No about information'
            };
        }
    }

    /**
     * Fetches comments for a post from the Hacker News Algolia API
     * @param {string} itemId - The ID of the post to fetch comments for
     * @returns {Promise<Object>} The comments data
     */
    async fetchHNCommentsFromAPI(itemId) {
        return await this.sendBackgroundMessage(
            'FETCH_API_REQUEST',
            {
                url: `https://hn.algolia.com/api/v1/items/${itemId}`,
                method: 'GET'
            }
        );
    }
}

export default ApiClient;
