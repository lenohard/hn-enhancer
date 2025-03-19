/**
 * Main class for the Hacker News Companion extension
 * Coordinates all functionality and initializes components
 */
import HNState from './hn-state.js';
import ApiClient from './api-client.js';
import MarkdownUtils from './markdown-utils.js';
import DomUtils from './dom-utils.js';
import SummaryPanel from './summary-panel.js';

export default class HNEnhancer {
    static DEBUG = false;  // Set to true when debugging
    
    static CHROME_AI_AVAILABLE = {
        YES: 'readily',
        NO: 'no',
        AFTER_DOWNLOAD: 'after-download'
    }

    /**
     * Creates a new HNEnhancer instance
     */
    constructor() {
        this.apiClient = new ApiClient(HNEnhancer.DEBUG);
        this.isChomeAiAvailable = HNEnhancer.CHROME_AI_AVAILABLE.NO;
        
        // Initialize page state
        this.authorComments = this.createAuthorCommentsMap();
        this.popup = this.createAuthorPopup();
        this.postAuthor = this.getPostAuthor();
        this.currentComment = null;
        this.helpModal = this.createHelpModal();
        
        this.createHelpIcon();

        // Initialize based on page type
        if (this.isHomePage) {
            this.currentPostIndex = -1;
            this.allPosts = null;
            this.initHomePageNavigation();
        } else if (this.isCommentsPage) {
            this.initCommentsPageNavigation();
            this.navigateToFirstComment(false);
            this.initChromeBuiltinAI();
            this.summaryPanel = new SummaryPanel();
        }

        // Set up keyboard shortcuts
        this.setupKeyBoardShortcuts();
    }

    /**
     * Logs debug messages if debug mode is enabled
     * @param {...any} args - Arguments to log
     */
    logDebug(...args) {
        if (HNEnhancer.DEBUG) {
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
     * Checks if the current page is a home page
     * @returns {boolean} True if the current page is a home page
     */
    get isHomePage() {
        const pathname = window.location.pathname;
        return pathname === '/' || pathname === '/news' || pathname === '/newest' || 
               pathname === '/ask' || pathname === '/show' || pathname === '/front' || 
               pathname === '/shownew';
    }

    /**
     * Checks if the current page is a comments page
     * @returns {boolean} True if the current page is a comments page
     */
    get isCommentsPage() {
        return window.location.pathname === '/item';
    }

    // Placeholder methods to be implemented or moved to separate modules
    createAuthorCommentsMap() {
        // Implementation will be moved to author-tracking.js
        const authorCommentsMap = new Map();
        const comments = document.querySelectorAll('.athing.comtr');
        comments.forEach(comment => {
            const authorElement = comment.querySelector('.hnuser');
            if (authorElement) {
                const author = authorElement.textContent;
                if (!authorCommentsMap.has(author)) {
                    authorCommentsMap.set(author, []);
                }
                authorCommentsMap.get(author).push(comment);
            }
        });
        return authorCommentsMap;
    }

    createAuthorPopup() {
        const popup = document.createElement('div');
        popup.className = 'author-popup';
        document.body.appendChild(popup);
        return popup;
    }

    getPostAuthor() {
        const postAuthorElement = document.querySelector('.fatitem .hnuser');
        return postAuthorElement ? postAuthorElement.textContent : null;
    }

    createHelpModal() {
        // Implementation will be moved to ui-components.js
        const modal = document.createElement('div');
        modal.className = 'keyboard-help-modal';
        modal.style.display = 'none';
        // Simplified implementation
        document.body.appendChild(modal);
        return modal;
    }

    createHelpIcon() {
        // Implementation will be moved to ui-components.js
        const icon = document.createElement('div');
        icon.className = 'help-icon';
        icon.innerHTML = '?';
        icon.title = 'Keyboard Shortcuts (Press ? or / to toggle)';
        icon.onclick = () => this.toggleHelpModal(true);
        document.body.appendChild(icon);
        return icon;
    }

    toggleHelpModal(show) {
        this.helpModal.style.display = show ? 'flex' : 'none';
    }

    initHomePageNavigation() {
        // Implementation will be moved to navigation.js
        this.allPosts = document.querySelectorAll('.athing');
        HNState.getLastSeenPostId().then(lastSeenPostId => {
            let lastSeenPostIndex = -1;
            if (lastSeenPostId) {
                this.logDebug(`Got last seen post id from storage: ${lastSeenPostId}`);
                const posts = Array.from(this.allPosts);
                lastSeenPostIndex = posts.findIndex(post => DomUtils.getPostId(post) === lastSeenPostId);
            }
            if (lastSeenPostIndex !== -1) {
                this.setCurrentPostIndex(lastSeenPostIndex);
            } else {
                this.navigateToPost('first');
            }
        });
    }

    initCommentsPageNavigation() {
        // Implementation will be moved to navigation.js
        // Simplified implementation
    }

    navigateToFirstComment(scrollToComment = true) {
        // Implementation will be moved to navigation.js
        const firstComment = document.querySelector('.athing.comtr');
        if (firstComment) {
            this.setCurrentComment(firstComment, scrollToComment);
        }
    }

    setCurrentComment(comment, scrollIntoView = true) {
        // Implementation will be moved to navigation.js
        // Simplified implementation
    }

    setupKeyBoardShortcuts() {
        // Implementation will be moved to navigation.js
        // Simplified implementation
    }

    initChromeBuiltinAI() {
        // Implementation will be moved to summarization.js
        // Simplified implementation
    }

    navigateToPost(direction) {
        // Implementation will be moved to navigation.js
        // Simplified implementation
    }

    setCurrentPostIndex(postIndex) {
        // Implementation will be moved to navigation.js
        // Simplified implementation
    }
}
