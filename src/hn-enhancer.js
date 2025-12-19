/**
 * Main class for the Hacker News Companion extension
 * Coordinates all functionality and initializes components
 */
window.HNEnhancer = class HNEnhancer {
  static DEBUG = true; // Set to true when debugging

  static CHROME_AI_AVAILABLE = {
    YES: "readily",
    NO: "no",
    AFTER_DOWNLOAD: "after-download",
  };

  static BOOKMARK_HIGHLIGHT_CLASS = "hn-bookmarked-comment";
  static KARMA_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  static KARMA_ERROR_CACHE_TTL_MS = 30 * 1000; // retry sooner after failures
  static KARMA_FETCH_SCAN_LIMIT = 20; // maximum authors to inspect per run (root comments only)
  static KARMA_FETCH_DELAY_MS = 2000; // throttle between requests
  static KARMA_STORAGE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours for cached display

  /**
   * Creates a new HNEnhancer instance
   */
  constructor() {
    try {
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
      this.chatModal = new ChatModal(this); // Instantiate ChatModal

      this.bookmarkedAuthors = new Map();
      this.unsubscribeFromBookmarks = null;

      this.uiComponents.createHelpIcon();

      this.initializeBookmarks();

      // Initialize based on page type
      if (this.isHomePage) {
        this.currentPostIndex = -1;
        this.allPosts = null;
        this.initHomePageNavigation();
      } else if (this.isCommentsPage) {
        this.statisticsPanel = this.uiComponents.createStatisticsPanel(); // Create stats panel instance FIRST
        // SummaryPanel will be initialized within initCommentsPageNavigation after wrapper setup
        this.summaryPanel = null;
        this.summarization = new Summarization(this);

        this.initCommentsPageNavigation(); // Now call navigation init
        this.refreshBookmarksDisplay();
        this.navigation.navigateToFirstComment(false);
        this.initChromeBuiltinAI();
      } else {
        // Not a home or comments page
      }

      // Set up keyboard shortcuts
      this.setupKeyBoardShortcuts();
    } catch (error) {
      console.error("HNEnhancer 初始化失败:", error);
      console.error("错误详情:", error.stack);
    }
  }

  /**
   * Logs debug messages if debug mode is enabled
   * @param {...any} args - Arguments to log
   */
  logDebug(...args) {
    if (HNEnhancer.DEBUG) {
      console.log("[DEBUG] ", ...args);
    }
  }

  /**
   * Logs info messages
   * @param {...any} args - Arguments to log
   */
  logInfo(...args) {
    console.log("[INFO] ", ...args);
  }

  /**
   * Checks if the current page is a home page
   * @returns {boolean} True if the current page is a home page
   */
  get isHomePage() {
    const pathname = window.location.pathname;
    const isHome =
      pathname === "/" ||
      pathname === "/news" ||
      pathname === "/newest" ||
      pathname === "/ask" ||
      pathname === "/show" ||
      pathname === "/front" ||
      pathname === "/shownew";
    return isHome;
  }

  /**
   * Checks if the current page is a comments page
   * @returns {boolean} True if the current page is a comments page
   */
  get isCommentsPage() {
    const isComments = window.location.pathname === "/item";
    return isComments;
  }

  toggleHelpModal(show) {
    this.helpModal.style.display = show ? "flex" : "none";
  }

  initHomePageNavigation() {
    this.allPosts = document.querySelectorAll(".athing");
    HNState.getLastSeenPostId().then((lastSeenPostId) => {
      let lastSeenPostIndex = -1;
      if (lastSeenPostId) {
        this.logDebug(`Got last seen post id from storage: ${lastSeenPostId}`);
        const posts = Array.from(this.allPosts);
        lastSeenPostIndex = posts.findIndex(
          (post) => this.domUtils.getPostId(post) === lastSeenPostId
        );
      }
      if (lastSeenPostIndex !== -1) {
        this.navigation.setCurrentPostIndex(lastSeenPostIndex);
      } else {
        this.navigation.navigateToPost("first");
      }
    });
  }

  initCommentsPageNavigation() {
    // --- Step 1: Create main wrapper and move HN content ---
    // This structure is needed for the resizable summary panel
    const mainHnTable = document.querySelector("center > table");
    if (!mainHnTable) {
      console.error("Could not find main HN table (center > table) to wrap.");
      return; // Cannot proceed without the main table
    }

    // Check if wrapper already exists (e.g., due to HMR or previous script run)
    let mainWrapper = document.querySelector(".main-content-wrapper");
    if (!mainWrapper) {
      mainWrapper = document.createElement("div");
      mainWrapper.className = "main-content-wrapper";

      const hnContentContainer = document.createElement("div");
      hnContentContainer.className = "hn-content-container";

      // Insert the wrapper before the main table
      mainHnTable.parentNode.insertBefore(mainWrapper, mainHnTable);
      // Move the main table into the content container
      hnContentContainer.appendChild(mainHnTable);
      // Put the content container into the main wrapper
      mainWrapper.appendChild(hnContentContainer);
      this.logDebug("Created .main-content-wrapper and moved HN content.");
    } else {
      this.logDebug(".main-content-wrapper already exists.");
    }

    // --- Step 2: Initialize Summary Panel (now that wrapper exists) ---
    if (!this.summaryPanel) {
      this.summaryPanel = new SummaryPanel();
      this.logDebug("SummaryPanel initialized.");
    }

    // --- Step 3: Inject other UI elements ---
    // Inject 'Summarize all comments', 'Chat about post', and root-level toggle links
    this.uiComponents.injectSummarizePostLink();
    this.uiComponents.injectChatPostLink();
    this.uiComponents.injectToggleGrandchildrenRootLink();

    // Add cache indicators to the post title area
    this.addCacheIndicators(); // Call without comment parameter for post-level indicators

    // Go through all the comments in this post and inject all our nav elements - author, summarize etc.
    const allComments = document.querySelectorAll(".athing.comtr");

    allComments.forEach((comment) => {
      // inject the author nav links - # of comments, left/right links to see comments by the same author
      this.authorTracking.injectAuthorCommentsNavLinks(comment);

      // customize the default next/prev/root/parent links to do the Companion behavior
      this.navigation.customizeDefaultNavLinks(comment);

      // Insert summarize thread link
      this.injectSummarizeThreadLinks(comment);
      // Insert chat link
      this.injectChatLink(comment); // <-- Add chat link injection
      // Insert toggle grandchildren button
      this.injectToggleGrandchildrenButton(comment);
      // Insert focus button
      this.injectFocusButton(comment);
      // Insert bookmark toggle
      this.injectBookmarkToggle(comment);
      // Add cache indicators
      this.addCacheIndicators(comment);
    });

    this.refreshBookmarksDisplay();

    // Set up the hover events on all user elements - in the main post subline and each comment
    this.authorTracking.setupUserHover();

    // Append and populate the statistics panel
    const commentTreeTable = document.querySelector("table.comment-tree");
    if (commentTreeTable && this.statisticsPanel) {
      commentTreeTable.parentNode.insertBefore(
        this.statisticsPanel,
        commentTreeTable
      );
      try {
        const stats = this.domUtils.calculateCommentStatistics();
        this.updateStatisticsPanel(stats, this.bookmarkedAuthors);
        this.buildKarmaStatistics(stats.authorComments, stats.rootAuthorOrder)
          .then((topKarmaUsers) => {
            this.updateStatisticsPanel(
              { ...stats, topKarmaUsers },
              this.bookmarkedAuthors
            );
          })
          .catch((error) => {
            console.warn("Failed to build karma statistics:", error);
          });
      } catch (error) {
        console.error("Error calculating or displaying statistics:", error);
        if (this.statisticsPanel) {
          this.statisticsPanel.innerHTML =
            "<h3>Comment Statistics</h3><p>Error loading statistics.</p>";
          this.statisticsPanel.style.display = "block";
        }
      }
    } else {
      console.warn(
        "Could not find comment tree table or statistics panel instance for insertion."
      );
      if (!commentTreeTable)
        console.warn("Reason: commentTreeTable not found.");
      if (!this.statisticsPanel)
        console.warn("Reason: this.statisticsPanel not found.");
    }
  }

  async initializeBookmarks() {
    if (this.unsubscribeFromBookmarks) {
      try {
        this.unsubscribeFromBookmarks();
      } catch (error) {
        console.error("Error removing bookmark subscription:", error);
      }
      this.unsubscribeFromBookmarks = null;
    }

    try {
      this.bookmarkedAuthors = await this.hnState.getBookmarkedAuthors();
    } catch (error) {
      console.error("Error loading bookmarked authors:", error);
      this.bookmarkedAuthors = new Map();
    }

    if (!(this.bookmarkedAuthors instanceof Map)) {
      this.bookmarkedAuthors = new Map();
    }

    this.unsubscribeFromBookmarks = this.hnState.subscribeToBookmarkedAuthors(
      (bookmarks) => {
        this.bookmarkedAuthors =
          bookmarks instanceof Map ? bookmarks : new Map(bookmarks);
        this.refreshBookmarksDisplay();
      }
    );

    if (this.isCommentsPage) {
      this.refreshBookmarksDisplay();
    }
  }

  isAuthorBookmarked(author) {
    if (!author || !(this.bookmarkedAuthors instanceof Map)) {
      return false;
    }
    return this.bookmarkedAuthors.has(author);
  }

  refreshBookmarksDisplay() {
    if (this.isCommentsPage) {
      const comments = document.querySelectorAll(".athing.comtr");
      comments.forEach((comment) => {
        const author = this.domUtils.getCommentAuthor(comment);
        const isBookmarked = this.isAuthorBookmarked(author);
        comment.classList.toggle(
          HNEnhancer.BOOKMARK_HIGHLIGHT_CLASS,
          isBookmarked
        );

        const bookmarkLink = comment.querySelector(".hn-bookmark-toggle");
        if (bookmarkLink) {
          this.updateBookmarkLinkState(comment, bookmarkLink);
        }
      });
    }

    if (this.isCommentsPage && this.statisticsPanel) {
      try {
        const stats = this.domUtils.calculateCommentStatistics();
        this.updateStatisticsPanel(stats, this.bookmarkedAuthors);
        const postId = this.domUtils.getCurrentHNItemId?.();
        this.hnState
          .getSavedKarmaStats(postId)
          .then((cachedStats) => {
            if (cachedStats && cachedStats.length > 0) {
              this.updateStatisticsPanel(
                { ...stats, topKarmaUsers: cachedStats },
                this.bookmarkedAuthors
              );
            }
          })
          .catch((error) => {
            console.warn("Failed to read cached karma stats:", error);
          });

        this.buildKarmaStatistics(stats.authorComments, stats.rootAuthorOrder)
          .then((topKarmaUsers) => {
            if (topKarmaUsers && topKarmaUsers.length > 0) {
              this.hnState.saveKarmaStats(postId, topKarmaUsers);
            }
            this.updateStatisticsPanel(
              { ...stats, topKarmaUsers },
              this.bookmarkedAuthors
            );
          })
          .catch((error) => {
            console.warn("Failed to refresh karma statistics:", error);
          });
      } catch (error) {
        console.error("Error refreshing statistics panel:", error);
      }
    }
  }

  updateBookmarkLinkState(comment, bookmarkLink = null) {
    if (!comment) return;
    const link =
      bookmarkLink || comment.querySelector(".hn-bookmark-toggle");
    if (!link) return;

    const author = this.domUtils.getCommentAuthor(comment);
    const isBookmarked = this.isAuthorBookmarked(author);

    link.textContent = isBookmarked ? "unbookmark" : "bookmark";
    link.classList.toggle("is-bookmarked", isBookmarked);
    link.title = isBookmarked
      ? "Remove this author from bookmarks"
      : "Bookmark this author";
  }

  async toggleBookmarkForComment(comment, bookmarkLink) {
    if (!comment) return;

    const author = this.domUtils.getCommentAuthor(comment);
    if (!author) {
      console.warn("toggleBookmarkForComment: Could not determine author.");
      return;
    }

    const commentId = this.domUtils.getCommentId(comment);
    const permalink = this.domUtils.getCommentPermalink(comment);
    const postId = this.domUtils.getCurrentHNItemId();

    try {
      this.bookmarkedAuthors = await this.hnState.toggleBookmarkedAuthor({
        username: author,
        commentId,
        permalink,
        postId,
      });

      this.updateBookmarkLinkState(comment, bookmarkLink);
      comment.classList.toggle(
        HNEnhancer.BOOKMARK_HIGHLIGHT_CLASS,
        this.bookmarkedAuthors.has(author)
      );

      this.refreshBookmarksDisplay();
    } catch (error) {
      console.error("Error toggling bookmark:", error);
    }
  }

  navigateToAuthorComment(username, bookmark = {}) {
    if (!username) return;

    let targetComment = null;

    // First try to find the specific bookmarked comment if we have its ID
    if (bookmark?.commentId) {
      targetComment = document.getElementById(bookmark.commentId);
      if (targetComment) {
        targetComment = targetComment.closest(".athing.comtr") || targetComment;
      }
    }

    // If that fails, try to find any comment by this author on the current page
    if (!targetComment) {
      const authorNode = Array.from(
        document.querySelectorAll(".athing.comtr .hnuser")
      ).find((node) => node.textContent.trim() === username);
      if (authorNode) {
        targetComment = authorNode.closest(".athing.comtr");
      }
    }

    // If we found a comment on this page, navigate to it
    if (targetComment) {
      this.navigation.setCurrentComment(targetComment, true);
      return;
    }

    // If no comment found on this page, check if we have a bookmark from another post
    if (bookmark?.permalink) {
      // Show a message to the user
      const message = document.createElement("div");
      message.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: #ff6600;
        color: white;
        padding: 10px 20px;
        border-radius: 4px;
        z-index: 10000;
        font-family: Verdana, Geneva, sans-serif;
        font-size: 13px;
      `;
      message.textContent = `No comments by ${username} on this page. Opening bookmarked comment from another post...`;
      document.body.appendChild(message);

      // Open the bookmarked comment in a new tab
      window.open(bookmark.permalink, "_blank");

      // Remove the message after 3 seconds
      setTimeout(() => {
        if (message.parentNode) {
          message.parentNode.removeChild(message);
        }
      }, 3000);
      return;
    }

    console.warn(
      `No comment by ${username} found on this page for bookmark navigation.`
    );
  }

  setupKeyBoardShortcuts() {
    // 防止重复绑定 keydown 事件
    if (window.__HNEnhancerKeydownBound) return;
    window.__HNEnhancerKeydownBound = true;
    // Shortcut keys specific to the Comments page
    const doubleKeyShortcuts = {
      comments: {
        // Double key combinations
        "g+g": () => {
          // Go to first comment
          const currentTime = Date.now();
          if (lastKey === "g" && currentTime - lastKeyPressTime < 500) {
            this.navigation.navigateToFirstComment();
          }

          // Update the last key and time so that we can handle the repeated press in the next iteration
          lastKey = "g";
          lastKeyPressTime = currentTime;
        },
      },
      home: {
        "g+g": () => {
          // Go to first post
          const currentTime = Date.now();
          if (lastKey === "g" && currentTime - lastKeyPressTime < 500) {
            this.navigation.navigateToPost("first");
          }

          // Update tracking for next potential combination
          lastKey = "g";
          lastKeyPressTime = currentTime;
        },
      },
    };

    // Shortcut keys specific to Home Page
    const homePageKeyboardShortcuts = this.getHomePageKeyboardShortcuts();

    // Shortcut keys specific to Comments page
    const commentsPageKeyboardShortcuts =
      this.getCommentsPageKeyboardShortcuts();

    // Shortcut keys common to all pages (Comments, Home)
    const globalKeyboardShortcuts = this.getGlobalKeyboardShortcuts();

    // Track last key press
    let lastKey = null;
    let lastKeyPressTime = 0;
    const KEY_COMBO_TIMEOUT = 1000; // 1 second timeout for combinations

    document.addEventListener("keydown", (e) => {
      // Handle key press only when it is not in an input field and not Ctrl / Cmd keys.
      //  This will allow the default behavior when these keys are pressed
      const isInputField = e.target.matches(
        'input, textarea, select, [contenteditable="true"]'
      );
      if (isInputField || e.ctrlKey || e.metaKey) {
        return;
      }

      this.logDebug(`Pressed key: ${e.key}. Shift key: ${e.shiftKey}`);

      const currentTime = Date.now();
      let shortcutKey = e.key;

      // check if this is a shifted key (eg: '?'), if so, treat it as a single key
      const shiftedKeys = ["?"];
      const isShiftedKey = e.shiftKey && shiftedKeys.includes(e.key);

      if (!isShiftedKey) {
        // Check for key combination for non-shifted keys
        if (lastKey && currentTime - lastKeyPressTime < KEY_COMBO_TIMEOUT) {
          shortcutKey = `${lastKey}+${shortcutKey}`;
        }
      }

      // Look for a handler for the given shortcut key in the key->handler mapping
      //  - first in the page-specific keys, then in the global shortcuts.
      const pageShortcuts = this.isHomePage
        ? {
            ...homePageKeyboardShortcuts,
            ...(doubleKeyShortcuts["home"] || {}),
          }
        : this.isCommentsPage
        ? {
            ...commentsPageKeyboardShortcuts,
            ...(doubleKeyShortcuts["comments"] || {}),
          }
        : {};

      this.logDebug("Selected page shortcuts:", Object.keys(pageShortcuts));

      const shortcutHandler =
        pageShortcuts[shortcutKey] || globalKeyboardShortcuts[shortcutKey];

      this.logDebug(
        `Shortcut key: ${shortcutKey}. Handler found? ${!!shortcutHandler}`
      );

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
      j: () => {
        // Next post
        this.navigation.navigateToPost("next");
      },
      k: () => {
        // Previous post
        this.navigation.navigateToPost("prev");
      },
      o: () => {
        // Open post in new tab
        const currentPost = this.navigation.getCurrentPost();
        if (!currentPost) return;

        const postLink = currentPost.querySelector(".titleline a");
        if (postLink) {
          window.open(postLink.href, "_blank");
        }
      },
      c: () => {
        // Open comments page
        const currentPost = this.navigation.getCurrentPost();
        if (!currentPost) return;

        if (currentPost.nextElementSibling) {
          const subtext = currentPost.nextElementSibling;
          const commentsLink = subtext.querySelector('a[href^="item?id="]');
          if (commentsLink) {
            window.location.href = commentsLink.href;
          }
        }
      },
    };
  }

  async buildKarmaStatistics(authorCommentsMap = new Map(), rootAuthorOrder = []) {
    if (!authorCommentsMap || authorCommentsMap.size === 0) {
      return [];
    }

    const cacheKey = `${this.domUtils.getCurrentHNItemId?.() || "unknown"}`;
    const now = Date.now();
    this.karmaCache = this.karmaCache || new Map();

    const cached = this.karmaCache.get(cacheKey);
    if (cached && now - cached.timestamp < HNEnhancer.KARMA_CACHE_TTL_MS) {
      return cached.results;
    }
    if (cached && cached.error && now - cached.timestamp < HNEnhancer.KARMA_ERROR_CACHE_TTL_MS) {
      return cached.results || [];
    }

    // Create a global user karma cache that persists across posts
    if (!this.globalKarmaCache) {
      this.globalKarmaCache = new Map();
    }

    const orderedAuthors =
      rootAuthorOrder && rootAuthorOrder.length
        ? rootAuthorOrder
            .map((entry) => entry?.author)
            .filter((author) => author && authorCommentsMap.has(author))
        : Array.from(authorCommentsMap.keys());

    const entries = [];
    const seenAuthors = new Set();

    for (const author of orderedAuthors) {
      if (!author || seenAuthors.has(author)) {
        continue;
      }

      const comments = authorCommentsMap.get(author) || [];
      const hasRootComment = comments.some((entry) => entry?.isRoot);

      if (!hasRootComment) {
        continue;
      }

      entries.push(author);
      seenAuthors.add(author);
      if (entries.length >= HNEnhancer.KARMA_FETCH_SCAN_LIMIT) {
        break;
      }
    }

    const results = [];
    for (let index = 0; index < entries.length; index++) {
      const username = entries[index];
      const comments = (authorCommentsMap.get(username) || []).filter(
        (entry) => entry?.isRoot === true
      );
      if (!comments.length) {
        continue;
      }

      let info = null;
      let needFetch = false;

      // Check global cache first
      const globalCached = this.globalKarmaCache.get(username);
      if (globalCached && now - globalCached.timestamp < HNEnhancer.KARMA_CACHE_TTL_MS) {
        info = globalCached.userInfo;
      } else {
        needFetch = true;
      }

      // If not in global cache or expired, try the author tracking cache
      if (!info) {
        try {
          info = await this.authorTracking.getCachedUserInfo(
            username,
            () => this.apiClient.fetchUserInfo(username)
          );
        } catch (error) {
          console.warn(`Failed fetching karma for ${username}:`, error);
        }
      }

      // If we have valid info, update both caches and add to results
      if (info && typeof info.karma === "number") {
        // Update global cache
        this.globalKarmaCache.set(username, {
          userInfo: info,
          timestamp: now,
        });

        const commentElement =
          comments?.find((entry) => entry.isRoot)?.commentRow || null;
        this.authorTracking.cacheUserComment(username, commentElement);

        results.push({
          username,
          karma: info.karma,
          commentElement,
        });
      }

      // Only delay if we need to fetch from API
      const hasMoreAuthors = index < entries.length - 1;
      if (hasMoreAuthors && needFetch) {
        await new Promise((resolve) =>
          setTimeout(resolve, HNEnhancer.KARMA_FETCH_DELAY_MS)
        );
      }
    }

    const sortedResults = results.sort((a, b) => b.karma - a.karma).slice(0, 5);
    this.karmaCache.set(cacheKey, {
      results: sortedResults,
      timestamp: Date.now(),
      error: sortedResults.length === 0,
    });

    return sortedResults;
  }

  getCommentsPageKeyboardShortcuts() {
    return {
      j: () => {
        // Next comment at same depth
        // Find the 'next' hyperlink in the HN nav panel and set that as the current comment.
        const nextComment = this.navigation.getNavElementByName(
          this.currentComment,
          "next"
        );
        if (nextComment) {
          this.navigation.setCurrentComment(nextComment);
        }
      },
      k: () => {
        // Previous comment at same depth (same as 'prev' hyperlink)
        // Find the 'prev' hyperlink in the HN nav panel and set that as the current comment.
        const prevComment = this.navigation.getNavElementByName(
          this.currentComment,
          "prev"
        );
        if (prevComment) {
          this.navigation.setCurrentComment(prevComment);
        }
      },
      l: () => {
        // Next child. If you are at the last child, it will go to the next sibling comment
        this.navigation.navigateToChildComment();
      },
      h: () => {
        // Parent comment (same as 'parent' hyperlink)
        // Find the 'parent' hyperlink in the HN nav panel and set that as the current comment.
        const parentComment = this.navigation.getNavElementByName(
          this.currentComment,
          "parent"
        );
        if (parentComment) {
          this.navigation.setCurrentComment(parentComment);
        }
      },
      r: () => {
        // Find the 'root' hyperlink in the HN nav panel and set that as the current comment.
        const rootComment = this.navigation.getNavElementByName(
          this.currentComment,
          "root"
        );
        if (rootComment) {
          this.navigation.setCurrentComment(rootComment);
        }
      },
      "[": () => {
        //  Previous comment by the same author
        const authorElement = this.currentComment.querySelector(".hnuser");
        if (authorElement) {
          const author = authorElement.textContent;
          this.authorTracking.navigateAuthorComments(
            author,
            this.currentComment,
            "prev"
          );
        }
      },
      "]": () => {
        // Next comment by the same author
        const authorElement = this.currentComment.querySelector(".hnuser");
        if (authorElement) {
          const author = authorElement.textContent;
          this.authorTracking.navigateAuthorComments(
            author,
            this.currentComment,
            "next"
          );
        }
      },
      z: () => {
        // Scroll to current comment
        if (this.currentComment) {
          this.currentComment.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      },
      c: () => {
        // Collapse/expand current comment
        if (this.currentComment) {
          const toggleLink = this.currentComment.querySelector(".togg");
          if (toggleLink) {
            toggleLink.click();
          }
        }
      },
      o: () => {
        // Open the original post in new tab
        const postLink = document.querySelector(".titleline a");
        if (postLink) {
          window.open(postLink.href, "_blank");
        }
      },
      s: () => {
        // Open/close the summary panel on the right
        this.summaryPanel.toggle();

        // If the panel is now visible and the current comment is set, summarize its thread
        if (this.summaryPanel.isVisible && this.currentComment) {
          this.summarization.summarizeThread(this.currentComment);
        }
      },
      i: () => {
        // 切换显示/隐藏聊天窗口
        this.toggleChatModal();
      },
    };
  }

  getGlobalKeyboardShortcuts() {
    return {
      "?": () => {
        // Open/close the help modal
        this.toggleHelpModal(this.helpModal.style.display === "none");
      },
      Escape: () => {
        // Close the help modal if it is open
        if (this.helpModal.style.display !== "none") {
          this.toggleHelpModal(false);
        }
      },
    };
  }

  /**
   * Updates the statistics panel with calculated data (Top 5).
   * @param {object} stats - The statistics object from calculateCommentStatistics.
   *                         Expected structure: { topDeepest: [], topMostDirectReplies: [], topLongest: [] }
   *                         Each array item: { value: number, link: string }
   */
  updateStatisticsPanel(stats, bookmarkedAuthors = new Map()) {
    if (!this.statisticsPanel || !stats) {
      console.error(
        "Statistics panel or stats data missing in updateStatisticsPanel."
      );
      return;
    }

    // Helper function to populate a list (ul) for a given statistic
    const updateStatList = (listSelector, dataArray, renderItem) => {
      const listElement = this.statisticsPanel.querySelector(
        `[data-stat-list="${listSelector}"] ul`
      );
      if (!listElement) {
        console.warn(
          `Statistics list element not found for selector: ${listSelector}`
        );
        return;
      }

      listElement.innerHTML = ""; // Clear existing items (e.g., placeholder)

      if (!dataArray || dataArray.length === 0) {
        listElement.innerHTML = "<li>N/A</li>"; // Display N/A if no data
        return;
      }

      dataArray.forEach((item) => {
        const listItem = renderItem(item);
        if (!listItem) {
          return;
        }
        listElement.appendChild(listItem);
      });
    };

    // Helper to populate bookmarked authors list
    const updateBookmarkedUsers = () => {
      const listElement = this.statisticsPanel.querySelector(
        '[data-stat-list="bookmarked-users"] ul'
      );
      if (!listElement) {
        console.warn("Bookmarked users list element not found.");
        return;
      }

      listElement.innerHTML = "";

      if (!bookmarkedAuthors || bookmarkedAuthors.size === 0) {
        listElement.innerHTML = "<li>None</li>";
        return;
      }

      const authorsWithComments = new Set();
      const authorCommentsMap = stats?.authorComments;
      if (authorCommentsMap) {
        if (authorCommentsMap instanceof Map) {
          authorCommentsMap.forEach((_entries, author) => {
            if (author) {
              authorsWithComments.add(author);
            }
          });
        } else if (Array.isArray(authorCommentsMap)) {
          authorCommentsMap.forEach((entry) => {
            const author = entry?.author || entry?.username;
            if (author) {
              authorsWithComments.add(author);
            }
          });
        }
      }

      const bookmarksOnPage = Array.from(bookmarkedAuthors.values()).filter(
        (bookmark) => bookmark?.username && authorsWithComments.has(bookmark.username)
      );

      if (bookmarksOnPage.length === 0) {
        listElement.innerHTML = "<li>None on this page</li>";
        return;
      }

      bookmarksOnPage
        .sort((a, b) => a.username.localeCompare(b.username))
        .forEach((bookmark) => {
          const listItem = document.createElement("li");
          const link = document.createElement("a");
          link.href = bookmark.permalink || "#";
          link.textContent = bookmark.username;

          link.addEventListener("click", (e) => {
            e.preventDefault();
            this.navigateToAuthorComment(bookmark.username, bookmark);
          });

          listItem.appendChild(link);
          listElement.appendChild(listItem);
        });
    };

    // Update each statistic list in the panel
    const renderCommentStat = (item, unit = "") => {
      if (
        !item ||
        item.value === null ||
        item.value === undefined ||
        !item.link
      ) {
        console.warn("Skipping invalid stat item:", item);
        return null;
      }

      const listItem = document.createElement("li");
      const link = document.createElement("a");
      link.href = item.link;
      link.textContent = `${item.value}${unit}`; // Display value with unit

      link.addEventListener("click", (e) => {
        e.preventDefault();
        const targetId = item.link.substring(1); // Remove '#'
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
          targetElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          // Set the clicked comment as the current comment for navigation
          this.navigation.setCurrentComment(targetElement, true);
          // Optionally highlight the target comment briefly
          targetElement.classList.add("highlight-stat-target");
          setTimeout(
            () => targetElement.classList.remove("highlight-stat-target"),
            2000
          );
        }
      });

      listItem.appendChild(link);
      return listItem;
    };

    updateStatList("deepest-node", stats.topDeepest, (item) =>
      renderCommentStat(item)
    );
    updateStatList(
      "most-direct-replies",
      stats.topMostDirectReplies,
      (item) => renderCommentStat(item, " replies")
    );
    updateStatList("longest-comment", stats.topLongest, (item) =>
      renderCommentStat(item, " chars")
    );
    const karmaData = stats.topKarmaUsers;
    updateStatList(
      "highest-karma-users",
      karmaData,
      (item) => {
        if (!item?.username) {
          return null;
        }

        const listItem = document.createElement("li");
        const link = document.createElement("a");
        link.href = item.link || "#";
        link.textContent = `${item.username} (${item.karma ?? "?"})`;

        const navigateToComment = () => {
          if (item.commentElement && item.commentElement instanceof HTMLElement) {
            this.navigation.setCurrentComment(item.commentElement, true);
            return true;
          }
          if (item.link && item.link.startsWith("#")) {
            const targetId = item.link.substring(1);
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
              this.navigation.setCurrentComment(targetElement, true);
              return true;
            }
          }
          return false;
        };

        link.addEventListener("click", (e) => {
          e.preventDefault();
          navigateToComment();
        });

        listItem.appendChild(link);
        return listItem;
      }
    );

    const listElement = this.statisticsPanel.querySelector(
      '[data-stat-list="highest-karma-users"] ul'
    );
    if (listElement && (!karmaData || karmaData.length === 0)) {
      listElement.innerHTML = "<li>No karma data available</li>";
    }

    updateBookmarkedUsers();

    // Make the panel visible
    this.statisticsPanel.style.display = "block";
  }

  /**
   * Injects 'Summarize thread' links into comment elements.
   * @param {HTMLElement} comment - The comment element.
   */
  injectSummarizeThreadLinks(comment) {
    if (!comment) {
      return;
    }

    const navsSpan = comment.querySelector(".comhead .navs");
    if (!navsSpan) {
      this.logDebug(
        `Could not find .navs span for comment ${comment.id} (summarize)`
      );
      return; // Skip if navs span not found
    }

    const summarizeLink = document.createElement("a");
    summarizeLink.href = "#";
    summarizeLink.textContent = "summarize"; // Shorter text for header
    summarizeLink.classList.add("summarize-thread-link"); // Add class for styling/selection
    summarizeLink.style.marginLeft = "3px"; // Add a little space before the link

    summarizeLink.addEventListener("click", (e) => {
      e.preventDefault();
      if (!this.summaryPanel.isVisible) {
        this.summaryPanel.toggle(); // Ensure panel is visible before summarizing
      }
      this.summarization.summarizeThread(comment);
    });

    // Add a separator before the link
    const separator = document.createTextNode(" | ");
    navsSpan.appendChild(separator);

    // Append the link to the navs span
    navsSpan.appendChild(summarizeLink);
    this.logDebug(
      `Injected summarize link into header for comment ${comment.id}`
    );
  }

  /**
   * Injects a 'Chat' link into a comment element.
   * @param {HTMLElement} comment - The comment element (.athing.comtr)
   */
  injectChatLink(comment) {
    // Target the navigation links span in the comment header
    const navsSpan = comment.querySelector(".comhead .navs");
    if (!navsSpan) {
      this.logDebug(
        `Could not find .navs span for comment ${comment.id} (chat link)`
      );
      return; // Skip if navs span not found
    }

    // Check if chat link already exists within the navs span
    if (navsSpan.querySelector(".hn-chat-link")) {
      this.logDebug(`Chat link already exists for comment ${comment.id}`);
      return;
    }

    const chatLink = document.createElement("a");
    chatLink.href = "#"; // Prevent page jump, will add JS listener later
    chatLink.textContent = "Chat";
    chatLink.className = "hn-enhancer-link hn-chat-link"; // Add classes for styling and selection
    chatLink.dataset.commentId = this.domUtils.getCommentId(comment); // Store comment ID for later use

    // Add spacing before the link
    const space = document.createTextNode(" | ");

    // Append the separator and the chat link to the navs span
    navsSpan.appendChild(space);
    navsSpan.appendChild(chatLink);

    // Add event listener (placeholder for now, will be implemented later)
    chatLink.addEventListener("click", (e) => {
      e.preventDefault();
      this.logInfo(
        `Chat link clicked for comment ID: ${chatLink.dataset.commentId}`
      );
      // TODO: Implement opening the chat modal here - DONE
      const commentElement = this.domUtils.findCommentElementById(
        chatLink.dataset.commentId
      );
      if (commentElement) {
        this.openChatModal(commentElement);
      }
    });

    this.logDebug(
      `Injected chat link for comment ${chatLink.dataset.commentId}`
    );
  }

  toggleGrandchildrenForAllRoots() {
    const allComments = document.querySelectorAll(".athing.comtr");
    const rootComments = Array.from(allComments).filter((comment) => {
      const indentImg = comment?.querySelector?.(".ind img");
      if (!indentImg) {
        return true;
      }
      const width = parseInt(indentImg.getAttribute("width") || "0", 10);
      return !Number.isFinite(width) || width <= 0;
    });

    if (!rootComments.length) {
      console.warn(
        "toggleGrandchildrenForAllRoots: No root comments found on this page."
      );
      return;
    }

    const directChildren = rootComments
      .flatMap((rootComment) => {
        const children = this.domUtils.getDirectChildComments(rootComment);
        this.logDebug(
          `[HNE] Root ${rootComment.id} has ${children.length} direct children`
        );
        return children;
      })
      .filter((child) => child instanceof HTMLElement);

    if (!directChildren.length) {
      this.logDebug(
        "toggleGrandchildrenForAllRoots: No direct child comments found to toggle."
      );
      return;
    }

    const referenceChild = directChildren.find((child) =>
      child instanceof HTMLElement
    );
    const shouldCollapse = referenceChild
      ? !this._isCommentCollapsed(referenceChild)
      : true;

    this.logDebug(
      `toggleGrandchildrenForAllRoots: action=${shouldCollapse ? "collapse" : "expand"} for ${directChildren.length} direct children`
    );

    directChildren.forEach((child) => {
      const isCollapsed = this._isCommentCollapsed(child);
      if (shouldCollapse && !isCollapsed) {
        this.logDebug("Collapsing child comment:", child.id);
        this._toggleComment(child);
      } else if (!shouldCollapse && isCollapsed) {
        this.logDebug("Expanding child comment:", child.id);
        this._toggleComment(child);
      }
    });
  }

  /**
   * Toggles the collapse state of all grandchildren of a given comment.
   * It determines whether to collapse or expand based on the state of the first grandchild found.
   * @param {HTMLElement} commentElement - The parent comment element whose grandchildren should be toggled.
   */
  toggleGrandchildrenCollapse(commentElement) {
    if (!commentElement) {
      console.warn("[HNE] toggleGrandchildrenCollapse: commentElement is null");
      return;
    }
    this.logDebug("Toggling grandchildren for:", commentElement.id);
    if (!commentElement) {
      console.warn("[HNE] toggleGrandchildrenCollapse: commentElement is null");
      return;
    }
    this.logDebug("Toggling grandchildren for:", commentElement.id);

    // Use the static method from DomUtils
    const directChildren = this.domUtils.getDirectChildComments(commentElement);
    let firstGrandchildState = null; // null: none found, false: expanded, true: collapsed

    // Determine the state based on the first grandchild found
    for (const child of directChildren) {
      const grandchildren = this.domUtils.getDirectChildComments(child); // Use the static method
      if (grandchildren.length > 0) {
        firstGrandchildState = this._isCommentCollapsed(grandchildren[0]); // Use the correct helper method
        this.logDebug(
          `First grandchild (${grandchildren[0].id}) state: ${
            firstGrandchildState ? "collapsed" : "expanded"
          }`
        );
        break; // Found the state, no need to check further
      } else {
        console.log(`[HNE] No grandchildren found for child ${child.id}`);
      }
    }

    // Default action is to collapse if no grandchildren found or first is expanded
    const shouldCollapse =
      firstGrandchildState === null || firstGrandchildState === false;
    this.logDebug(
      `Action determined: ${shouldCollapse ? "Collapse" : "Expand"}`
    );

    // Temporarily override HN's collapse function to prevent network requests
    const originalCollapse = window.collapse;
    // Define a temporary function that mimics basic DOM toggle without network call
    // Note: This assumes HN's structure and might need adjustment if HN changes.
    // It also assumes 'collapse' is globally accessible.
    window.collapse = (event, id) => {
      try {
        // Try to find the row and toggle link based on event or id
        let target = event?.target;
        let row = target?.closest("tr.athing.comtr");
        let toggleLink = target?.closest(".togg"); // Might be the link itself

        if (!row && id) {
          // Fallback using ID if event target isn't helpful (e.g., from .click())
          const commentElement = document.getElementById(id);
          row = commentElement?.closest("tr.athing.comtr");
          toggleLink = commentElement?.querySelector(".togg");
        }

        if (row && toggleLink) {
          const isCurrentlyCollapsed =
            row.classList.contains("noshow") ||
            toggleLink.textContent.includes("[+]");
          row.classList.toggle("noshow", !isCurrentlyCollapsed);
          toggleLink.textContent = isCurrentlyCollapsed ? "[−]" : "[+]";

          // Also toggle comment body/reply visibility directly for robustness
          const commentBody = row.querySelector(".comment");
          const replyLink = row.querySelector(".reply");
          if (commentBody)
            commentBody.style.display = isCurrentlyCollapsed ? "" : "none";
          if (replyLink)
            replyLink.style.display = isCurrentlyCollapsed ? "" : "none";
        } else {
          console.warn(
            "[HNE Temp Collapse] Could not find row or toggle link for event/id:",
            event,
            id
          );
        }
        // Prevent HN's default event handling if event is available
        if (event) {
          event.preventDefault?.();
          event.stopPropagation?.();
        }
      } catch (err) {
        console.error("[HNE Temp Collapse] Error:", err);
      }
      // *** Intentionally skip the original network request part ***
    };

    try {
      // Apply the action to all descendants using the overridden collapse
      directChildren.forEach((child) => {
        const descendantIds = this.domUtils
          .getDescendantComments(child)
          .map((desc) => desc.id);

        const descendantElements = descendantIds
          .map((id) => this.domUtils.findCommentElementById(id))
          .filter((element) => element instanceof HTMLElement);

        this.logDebug(
          `[HNE] Child ${child.id} has ${descendantElements.length} descendant nodes`
        );

        descendantElements.forEach((descendant) => {
          const isCollapsed = this._isCommentCollapsed(descendant);
          if (shouldCollapse && !isCollapsed) {
            this.logDebug("Collapsing descendant:", descendant.id);
            this._toggleComment(descendant); // This will now call the temporary window.collapse via .click()
          } else if (!shouldCollapse && isCollapsed) {
            this.logDebug("Expanding descendant:", descendant.id);
            this._toggleComment(descendant); // This will now call the temporary window.collapse via .click()
          }
        });
      });
    } finally {
      // Restore the original collapse function
      if (originalCollapse) {
        window.collapse = originalCollapse;
        this.logDebug("Restored original window.collapse function.");
      } else {
        // If original didn't exist, remove our temporary one
        delete window.collapse;
        this.logDebug(
          "Removed temporary window.collapse function (original did not exist)."
        );
      }
    }
  }

  /**
   * Injects a 'Toggle GC' (Toggle Grandchildren) link into a comment's header.
   * @param {HTMLElement} comment - The comment element.
   */
  injectToggleGrandchildrenButton(comment) {
    const navsSpan = comment.querySelector(".comhead .navs");
    if (!navsSpan) {
      this.logDebug(
        `Could not find .navs span for comment ${comment.id} (toggle GC)`
      );
      return; // Skip if navs span not found
    }

    // Check if button already exists
    if (navsSpan.querySelector(".toggle-grandchildren-link")) {
      this.logDebug(`Toggle GC link already exists for comment ${comment.id}`);
      return;
    }

    const toggleGcLink = document.createElement("a");
    toggleGcLink.href = "#";
    toggleGcLink.textContent = "toggle GC"; // Button text
    toggleGcLink.classList.add("toggle-grandchildren-link"); // Add class for styling/selection
    toggleGcLink.style.marginLeft = "3px"; // Add a little space
    toggleGcLink.title = "Toggle collapse state of grandchildren comments"; // Tooltip

    toggleGcLink.addEventListener("click", (e) => {
      e.preventDefault();
      // Ensure 'this' context is correct when calling the method
      this.toggleGrandchildrenCollapse(comment);
    });

    // Add a separator before the link
    const separator = document.createTextNode(" | ");
    navsSpan.appendChild(separator);

    // Append the link to the navs span
    navsSpan.appendChild(toggleGcLink);
  }

  /**
   * Injects a 'focus' button into a comment's header.
   * @param {HTMLElement} comment - The comment element.
   */
  injectFocusButton(comment) {
    const navsSpan = comment.querySelector(".comhead .navs");
    if (!navsSpan) return;

    if (navsSpan.querySelector(".focus-node-link")) return;

    const focusLink = document.createElement("a");
    focusLink.href = "#";
    focusLink.textContent = "focus";
    focusLink.className = "hn-enhancer-link focus-node-link";
    focusLink.title = "Set as current focused comment for keyboard navigation";

    focusLink.addEventListener("click", (e) => {
      e.preventDefault();
      // Set current comment without scrolling since user is already interacting with it
      this.navigation.setCurrentComment(comment, false);
    });

    const separator = document.createTextNode(" | ");
    navsSpan.appendChild(separator);
    navsSpan.appendChild(focusLink);
  }

  /**
   * Injects a bookmark toggle into a comment header.
   * @param {HTMLElement} comment - The comment element.
   */
  injectBookmarkToggle(comment) {
    const navsSpan = comment.querySelector(".comhead .navs");
    if (!navsSpan) return;

    let bookmarkLink = navsSpan.querySelector("a.hn-bookmark-toggle[data-comment-id]");
    if (!bookmarkLink) {
      bookmarkLink = document.createElement("a");
      bookmarkLink.href = "#";
      bookmarkLink.className = "hn-enhancer-link hn-bookmark-toggle";
      bookmarkLink.dataset.commentId = this.domUtils.getCommentId(comment);
      bookmarkLink.title = "Bookmark this author";
      bookmarkLink.addEventListener("click", async (e) => {
        e.preventDefault();
        await this.toggleBookmarkForComment(comment, bookmarkLink);
      });
      const separator = document.createTextNode(" | ");
      navsSpan.appendChild(separator);
      navsSpan.appendChild(bookmarkLink);
    }

    this.updateBookmarkLinkState(comment, bookmarkLink);
  }

  // --- Helper Methods for Grandchildren Toggling ---

  /**
   * Checks if a comment element is currently collapsed.
   * @param {HTMLElement} commentElement - The comment element to check.
   * @returns {boolean} True if the comment is collapsed, false otherwise.
   * @private
   */
  _isCommentCollapsed(commentElement) {
    if (!commentElement) {
      console.warn("[HNE] _isCommentCollapsed: commentElement is null");
      return false; // Or handle as appropriate, maybe true? Defaulting to not collapsed.
    }
    const toggleLink = commentElement.querySelector(".togg");
    const parentRow = commentElement?.closest("tr");

    const hasNoshow = parentRow?.classList.contains("noshow");
    const isCollapsedViaClass = parentRow?.style.display === "none";
    const toggleText = toggleLink?.textContent || "";
    const isCollapsed =
      hasNoshow || isCollapsedViaClass || !toggleText.includes("[-]");

    return isCollapsed;
  }

  /**
   * Toggles the collapsed state of a comment by clicking its toggle link.
   * @param {HTMLElement} commentElement - The comment element to toggle.
   * @returns {boolean} True if the toggle was successful, false otherwise.
   * @private
   */
  _toggleComment(commentElement) {
    // Reverted: Simply find and click the native toggle link.
    // The actual collapse logic (potentially overridden) will be in window.collapse.
    const toggleLink = commentElement?.querySelector(".togg");
    if (toggleLink) {
      // We assume window.collapse exists and handles the event/id correctly when triggered by click()
      toggleLink.click();
      return true;
    }
    console.warn(
      "[HNE] Could not find .togg link to click for:",
      commentElement?.id
    );
    return false;
  } // <-- Added semicolon here

  /**
   * Opens the chat modal for a specific comment.
   * @param {HTMLElement} commentElement - The comment element to chat about.
   */
  openChatModal(commentElement) {
    if (this.chatModal) {
      const postId = this.domUtils.getCurrentHNItemId(); // Get the current post ID
      if (!postId) {
        console.error("Could not determine post ID to open chat modal.");
        // Optionally display an error to the user
        return;
      }
      this.chatModal.open(commentElement, postId); // Pass postId to open method
    } else {
      console.error("ChatModal instance not found.");
    }
  }

  /**
   * Opens the chat modal for the entire post.
   */
  openPostChatModal() {
    if (this.chatModal) {
      const postId = this.domUtils.getCurrentHNItemId();
      if (!postId) {
        console.error("Could not determine post ID to open chat modal.");
        return;
      }
      this.chatModal.openForPost(postId); // Use new method for post-level chat
    } else {
      console.error("ChatModal instance not found.");
    }
  }

  /**
   * 切换聊天窗口的显示/隐藏状态
   * 如果窗口未打开，则打开帖子级聊天
   * 如果窗口已打开，则隐藏它
   * 避免重复初始化以防止系统消息重复显示
   */
  toggleChatModal() {
    if (!this.chatModal) {
      console.error("ChatModal instance not found.");
      return;
    }

    // 检查聊天窗口是否已经可见
    if (this.chatModal.isVisible) {
      // 如果可见，则隐藏
      this.chatModal.hide();
      this.logDebug("Chat modal hidden via keyboard shortcut.");
    } else {
      // 如果不可见，优先恢复 comment 聊天（如果有）
      const postId = this.domUtils.getCurrentHNItemId();
      if (!postId) {
        console.error("Could not determine post ID to open chat modal.");
        return;
      }
      // 优先恢复 comment 聊天
      if (
        this.chatModal.targetCommentElement &&
        this.chatModal.currentPostId === postId
      ) {
        this.chatModal.show();
        this.logDebug(
          "Comment chat modal shown (already initialized) via keyboard shortcut."
        );
      } else if (
        this.chatModal.isPostChat &&
        this.chatModal.currentPostId === postId
      ) {
        this.chatModal.show();
        this.logDebug(
          "Post chat modal shown (already initialized) via keyboard shortcut."
        );
      } else {
        // 否则，打开新的帖子级聊天
        this.chatModal.openForPost(postId);
        this.logDebug("Post chat modal opened via keyboard shortcut.");
      }
    }
  }

  /**
   * Adds cache indicators to comment headers or post title to show if summary or chat history exists
   * @param {HTMLElement} comment - The comment element (optional, if null will add to post title)
   */
  async addCacheIndicators(comment = null) {
    const postId = this.domUtils.getCurrentHNItemId();
    if (!postId) {
      return;
    }

    let targetElement, commentId, isPostLevel;

    if (comment) {
      // Comment-level indicators
      commentId = this.domUtils.getCommentId(comment);
      if (!commentId) {
        return;
      }

      targetElement = comment.querySelector(".comhead");
      if (!targetElement) {
        return;
      }
      isPostLevel = false;
    } else {
      // Post-level indicators
      commentId = null;
      targetElement = document.querySelector(".subtext .subline");
      if (!targetElement) {
        return;
      }
      isPostLevel = true;
    }

    // Check if indicators already exist
    if (targetElement.querySelector(".cache-indicators")) {
      return;
    }

    // Create indicators container
    const indicatorsContainer = document.createElement("span");
    indicatorsContainer.className = "cache-indicators";
    indicatorsContainer.style.marginLeft = "5px";

    try {
      // Get current AI settings for summary check
      const { aiProvider, model, language } = await this.getAIProviderModel();

      // Check for summary cache
      let hasSummary = false;
      if (aiProvider && model && language) {
        hasSummary = await HNState.hasSummary(
          postId,
          commentId,
          aiProvider,
          model,
          language
        );
      }

      // Check for chat history (only for comments, not post-level)
      let hasChatHistory = false;
      if (!isPostLevel) {
        hasChatHistory = await HNState.hasChatHistory(postId, commentId);
      } else {
        // For post-level, check if there's any chat history for the post
        hasChatHistory = await HNState.hasChatHistory(postId, "post");
      }

      // Add summary indicator
      if (hasSummary) {
        const summaryIndicator = document.createElement("span");
        summaryIndicator.innerHTML = "📋";
        summaryIndicator.title = isPostLevel
          ? "This post has a cached summary"
          : "This comment has a cached summary";
        summaryIndicator.className = "summary-indicator";
        summaryIndicator.style.marginRight = "2px";
        summaryIndicator.style.cursor = "help";
        indicatorsContainer.appendChild(summaryIndicator);
      }

      // Add chat indicator
      if (hasChatHistory) {
        const chatIndicator = document.createElement("span");
        chatIndicator.innerHTML = "💬";
        chatIndicator.title = isPostLevel
          ? "This post has chat history"
          : "This comment has chat history";
        chatIndicator.className = "chat-indicator";
        chatIndicator.style.marginRight = "2px";
        chatIndicator.style.cursor = "help";
        indicatorsContainer.appendChild(chatIndicator);
      }

      // Only add the container if we have indicators
      if (indicatorsContainer.children.length > 0) {
        if (isPostLevel) {
          // For post-level, add at the end of the subline
          targetElement.appendChild(document.createTextNode(" | "));
          targetElement.appendChild(indicatorsContainer);
        } else {
          // For comment-level, insert after the comment author
          const hnuser = targetElement.querySelector(".hnuser");
          if (hnuser) {
            hnuser.parentNode.insertBefore(
              indicatorsContainer,
              hnuser.nextSibling
            );
          } else {
            // Fallback: add at the beginning of comhead
            targetElement.insertBefore(
              indicatorsContainer,
              targetElement.firstChild
            );
          }
        }
      }
    } catch (error) {
      console.error("Error adding cache indicators:", error);
    }
  }

  /**
   * Gets AI provider and model from storage (helper method for indicators)
   * @returns {Promise<Object>} The AI provider, model, and language
   */
  async getAIProviderModel() {
    return await this.apiClient.sendBackgroundMessage("FETCH_AI_SETTINGS");
  }
}; // <-- Moved openChatModal inside the class and kept the final brace
// Initialize the extension
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => new HNEnhancer());
} else {
  new HNEnhancer();
}
