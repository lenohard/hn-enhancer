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
import Summarization from './summarization.js';
import AuthorTracking from './author-tracking.js';
import UIComponents from './ui-components.js';

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
        this.markdownUtils = MarkdownUtils;
        this.domUtils = DomUtils;
        this.hnState = HNState;
        this.isChomeAiAvailable = HNEnhancer.CHROME_AI_AVAILABLE.NO;
        
        // Initialize page state
        this.currentComment = null;
        
        // Initialize components
        this.uiComponents = new UIComponents(this);
        this.helpModal = this.uiComponents.createHelpModal();
        this.authorTracking = new AuthorTracking(this);
        this.navigation = new Navigation(this);
        
        this.uiComponents.createHelpIcon();

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
            this.summarization = new Summarization(this);
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
        // Inject 'Summarize all comments' link at the top of the main post
        this.uiComponents.injectSummarizePostLink();
        
        // Go through all the comments in this post and inject all our nav elements - author, summarize etc.
        const allComments = document.querySelectorAll('.athing.comtr');

        allComments.forEach(comment => {
            // inject the author nav links - # of comments, left/right links to see comments by the same author
            this.authorTracking.injectAuthorCommentsNavLinks(comment);

            // customize the default next/prev/root/parent links to do the Companion behavior
            this.navigation.customizeDefaultNavLinks(comment);

            // Insert summarize thread link at the end
            this.injectSummarizeThreadLinks(comment);
        });

        // Set up the hover events on all user elements - in the main post subline and each comment
        this.authorTracking.setupUserHover();
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
                    this.authorTracking.navigateAuthorComments(author, this.currentComment, 'prev');
                }
            },
            ']': () => {
                // Next comment by the same author
                const authorElement = this.currentComment.querySelector('.hnuser');
                if (authorElement) {
                    const author = authorElement.textContent;
                    this.authorTracking.navigateAuthorComments(author, this.currentComment, 'next');
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
                
                // If the panel is now visible and the current comment is set, summarize its thread
                if (this.summaryPanel.isVisible && this.currentComment) {
                    this.summarization.summarizeThread(this.currentComment);
                }
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
    /**
     * Injects summarize thread links into comments
     * @param {Element} comment - The comment element
     */
    injectSummarizeThreadLinks(comment) {
        const navsElement = comment.querySelector('.navs');
        if(!navsElement) {
            console.error('Could not find the navs element to inject the summarize thread link');
            return;
        }

        navsElement.appendChild(document.createTextNode(' | '));

        const summarizeThreadLink = document.createElement('a');
        summarizeThreadLink.href = '#';
        summarizeThreadLink.textContent = 'summarize thread';
        summarizeThreadLink.title = 'Summarize all child comments in this thread';

        summarizeThreadLink.addEventListener('click', async (e) => {
            e.preventDefault();

            // Set the current comment and summarize the thread starting from this comment
            this.navigation.setCurrentComment(comment);

            await this.summarization.summarizeThread(comment);
        });

        navsElement.appendChild(summarizeThreadLink);
    }
}
