/**
 * Main class for the Hacker News Companion extension
 * Coordinates all functionality and initializes components
 */
import HNState from './hn-state.js';
import ApiClient from './api-client.js';
import MarkdownUtils from './markdown-utils.js';
import DomUtils from './dom-utils.js';
import SummaryPanel from './summary-panel.js';
import Navigation from './navigation.js';

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
        this.markdownUtils = new MarkdownUtils();
        this.domUtils = new DomUtils();
        this.hnState = HNState;
        this.isChomeAiAvailable = HNEnhancer.CHROME_AI_AVAILABLE.NO;
        
        // Initialize page state
        this.authorComments = this.createAuthorCommentsMap();
        this.popup = this.createAuthorPopup();
        this.postAuthor = this.getPostAuthor();
        this.currentComment = null;
        this.helpModal = this.createHelpModal();
        
        // Initialize navigation
        this.navigation = new Navigation(this);
        
        this.createHelpIcon();

        // Initialize based on page type
        if (this.isHomePage) {
            this.currentPostIndex = -1;
            this.allPosts = null;
            this.initHomePageNavigation();
        } else if (this.isCommentsPage) {
            this.initCommentsPageNavigation();
            this.navigation.navigateToFirstComment(false);
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
        this.allPosts = document.querySelectorAll('.athing');
        HNState.getLastSeenPostId().then(lastSeenPostId => {
            let lastSeenPostIndex = -1;
            if (lastSeenPostId) {
                this.logDebug(`Got last seen post id from storage: ${lastSeenPostId}`);
                const posts = Array.from(this.allPosts);
                lastSeenPostIndex = posts.findIndex(post => this.domUtils.getPostId(post) === lastSeenPostId);
            }
            if (lastSeenPostIndex !== -1) {
                this.navigation.setCurrentPostIndex(lastSeenPostIndex);
            } else {
                this.navigation.navigateToPost('first');
            }
        });
    }

    initCommentsPageNavigation() {
        // Implementation will be moved to navigation.js
        // Simplified implementation
    }

    setupKeyBoardShortcuts() {
        // Shortcut keys specific to the Comments page
        const doubleKeyShortcuts = {
            'comments': {
                // Double key combinations
                'g+g': () => {
                    // Go to first comment
                    const currentTime = Date.now();
                    if (lastKey === 'g' && currentTime - lastKeyPressTime < 500) {
                        this.navigation.navigateToFirstComment();
                    }

                    // Update the last key and time so that we can handle the repeated press in the next iteration
                    lastKey = 'g';
                    lastKeyPressTime = currentTime;
                }
            },
            'home': {
                'g+g': () => {
                    // Go to first post
                    const currentTime = Date.now();
                    if (lastKey === 'g' && currentTime - lastKeyPressTime < 500) {
                        this.navigation.navigateToPost('first');
                    }

                    // Update tracking for next potential combination
                    lastKey = 'g';
                    lastKeyPressTime = currentTime;
                }
            }
        };

        // Shortcut keys specific to Home Page
        const homePageKeyboardShortcuts = this.getHomePageKeyboardShortcuts();

        // Shortcut keys specific to Comments page
        const commentsPageKeyboardShortcuts = this.getCommentsPageKeyboardShortcuts();

        // Shortcut keys common to all pages (Comments, Home)
        const globalKeyboardShortcuts = this.getGlobalKeyboardShortcuts();

        // Track last key press
        let lastKey = null;
        let lastKeyPressTime = 0;
        const KEY_COMBO_TIMEOUT = 1000; // 1 second timeout for combinations

        document.addEventListener('keydown', (e) => {
            // Handle key press only when it is not in an input field and not Ctrl / Cmd keys.
            //  This will allow the default behavior when these keys are pressed
            const isInputField = e.target.matches('input, textarea, select, [contenteditable="true"]');
            if(isInputField || e.ctrlKey || e.metaKey) {
                return;
            }

            this.logDebug(`Pressed key: ${e.key}. Shift key: ${e.shiftKey}`);

            const currentTime = Date.now();
            let shortcutKey = e.key;

            // check if this is a shifted key (eg: '?'), if so, treat it as a single key
            const shiftedKeys = ['?'];
            const isShiftedKey = e.shiftKey && shiftedKeys.includes(e.key);

            if (!isShiftedKey) {
                // Check for key combination for non-shifted keys
                if (lastKey && (currentTime - lastKeyPressTime) < KEY_COMBO_TIMEOUT) {
                    shortcutKey = `${lastKey}+${shortcutKey}`;
                }
            }

            // Look for a handler for the given shortcut key in the key->handler mapping
            //  - first in the page-specific keys, then in the global shortcuts.
            const pageShortcuts = this.isHomePage ? {
                ...homePageKeyboardShortcuts,
                ...(doubleKeyShortcuts['home'] || {})
            } : this.isCommentsPage ? {
                ...commentsPageKeyboardShortcuts,
                ...(doubleKeyShortcuts['comments'] || {})
            } : {};

            this.logDebug('Selected page shortcuts:', Object.keys(pageShortcuts));

            const shortcutHandler = pageShortcuts[shortcutKey] || globalKeyboardShortcuts[shortcutKey];

            this.logDebug(`Shortcut key: ${shortcutKey}. Handler found? ${!!shortcutHandler}`);

            // If we have a handler for this key or combination, invoke it
            if (shortcutHandler) {
                e.preventDefault();
                shortcutHandler();

                // Reset after successful combination
                lastKey = null;
                lastKeyPressTime = 0;
            } else {
                // Update tracking for potential combination
                lastKey = shortcutKey;
                lastKeyPressTime = currentTime;
            }
        });
    }

    initChromeBuiltinAI() {
        // Implementation will be moved to summarization.js
        // Simplified implementation
    }

    getHomePageKeyboardShortcuts() {
        return {
            'j': () => {
                // Next post
                this.navigation.navigateToPost('next');
            },
            'k': () => {
                // Previous post
                this.navigation.navigateToPost('prev');
            },
            'o': () => {
                // Open post in new tab
                const currentPost = this.navigation.getCurrentPost();
                if(!currentPost) return;

                const postLink = currentPost.querySelector('.titleline a');
                if (postLink) {
                    window.open(postLink.href, '_blank');
                }
            },
            'c': () => {
                // Open comments page
                const currentPost = this.navigation.getCurrentPost();
                if(!currentPost) return;

                if (currentPost.nextElementSibling) {
                    const subtext = currentPost.nextElementSibling;
                    const commentsLink = subtext.querySelector('a[href^="item?id="]');
                    if (commentsLink) {
                        window.location.href = commentsLink.href;
                    }
                }
            }
        };
    }

    getCommentsPageKeyboardShortcuts() {
        return {
            'j': () => {
                // Next comment at same depth
                // Find the 'next' hyperlink in the HN nav panel and set that as the current comment.
                const nextComment = this.navigation.getNavElementByName(this.currentComment, 'next');
                if (nextComment) {
                    this.navigation.setCurrentComment(nextComment);
                }
            },
            'k': () => {
                // Previous comment at same depth (same as 'prev' hyperlink)
                // Find the 'prev' hyperlink in the HN nav panel and set that as the current comment.
                const prevComment = this.navigation.getNavElementByName(this.currentComment, 'prev');
                if (prevComment) {
                    this.navigation.setCurrentComment(prevComment);
                }
            },
            'l': () => {
                // Next child. If you are at the last child, it will go to the next sibling comment
                this.navigation.navigateToChildComment();
            },
            'h': () => {
                // Parent comment (same as 'parent' hyperlink)
                // Find the 'parent' hyperlink in the HN nav panel and set that as the current comment.
                const parentComment = this.navigation.getNavElementByName(this.currentComment, 'parent');
                if (parentComment) {
                    this.navigation.setCurrentComment(parentComment);
                }
            },
            'r': () => {
                // Find the 'root' hyperlink in the HN nav panel and set that as the current comment.
                const rootComment = this.navigation.getNavElementByName(this.currentComment, 'root');
                if (rootComment) {
                    this.navigation.setCurrentComment(rootComment);
                }
            },
            '[': () => {
                //  Previous comment by the same author
                const authorElement = this.currentComment.querySelector('.hnuser');
                if (authorElement) {
                    const author = authorElement.textContent;
                    this.navigation.navigateAuthorComments(author, this.currentComment, 'prev');
                }
            },
            ']': () => {
                // Next comment by the same author
                const authorElement = this.currentComment.querySelector('.hnuser');
                if (authorElement) {
                    const author = authorElement.textContent;
                    this.navigation.navigateAuthorComments(author, this.currentComment, 'next');
                }
            },
            'z': () => {
                // Scroll to current comment
                if (this.currentComment) {
                    this.currentComment.scrollIntoView({behavior: 'smooth', block: 'center'});
                }
            },
            'c': () => {
                // Collapse/expand current comment
                if (this.currentComment) {
                    const toggleLink = this.currentComment.querySelector('.togg');
                    if (toggleLink) {
                        toggleLink.click();
                    }
                }
            },
            'o': () => {
                // Open the original post in new tab
                const postLink = document.querySelector('.titleline a');
                if (postLink) {
                    window.open(postLink.href, '_blank');
                }
            },
            's': () => {
                // Open/close the summary panel on the right
                this.summaryPanel.toggle();
            },
        };
    }

    getGlobalKeyboardShortcuts() {
        return {
            '?': () => {
                // Open/close the help modal
                this.toggleHelpModal(this.helpModal.style.display === 'none');
            },
            '/': () => {
                // Open/close the help modal
                this.toggleHelpModal(this.helpModal.style.display === 'none');
            },
            'Escape': () => {
                // Close the help modal if it is open
                if (this.helpModal.style.display !== 'none') {
                    this.toggleHelpModal(false);
                }
            },
        };
    }
}
