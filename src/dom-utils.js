/**
 * Utility functions for DOM manipulation
 */
class DomUtils {
    /**
     * Gets the post ID from a post element
     * @param {Element} post - The post element
     * @returns {string|null} The post ID or null if not found
     */
    static getPostId(post) {
        // Extract post ID from the comments link
        const subtext = post.nextElementSibling;
        if (subtext) {
            const commentsLink = subtext.querySelector('a[href^="item?id="]');
            if (commentsLink) {
                const match = commentsLink.href.match(/id=(\d+)/);
                return match ? match[1] : null;
            }
        }
        return null;
    }

    /**
     * Gets the current HN item ID from the URL
     * @returns {string|null} The item ID or null if not found
     */
    static getCurrentHNItemId() {
        const itemIdMatch = window.location.search.match(/id=(\d+)/);
        return itemIdMatch ? itemIdMatch[1] : null;
    }

    /**
     * Gets the HN post title from the document title
     * @returns {string} The post title
     */
    static getHNPostTitle() {
        return document.title;
    }

    /**
     * Gets the downvote count from a comment text div
     * @param {Element} commentTextDiv - The comment text div element
     * @returns {number} The downvote count
     */
    static getDownvoteCount(commentTextDiv) {
        // Downvotes are represented by the color of the text. The color is a class name like 'c5a', 'c73', etc.
        const downvotePattern = /c[0-9a-f]{2}/;

        // Find the first class that matches the downvote pattern
        const downvoteClass = [...commentTextDiv.classList.values()]
            .find(className => downvotePattern.test(className.toLowerCase()))
            ?.toLowerCase();

        if (!downvoteClass) {
            return 0;
        }

        const downvoteMap = {
            'c00': 0,
            'c5a': 1,
            'c73': 2,
            'c82': 3,
            'c88': 4,
            'c9c': 5,
            'cae': 6,
            'cbe': 7,
            'cce': 8,
            'cdd': 9
        };
        return downvoteMap[downvoteClass] || 0;
    }
}

// Make the class available globally
window.DomUtils = DomUtils;
