/**
 * Main class for the Hacker News Companion extension
 * Coordinates all functionality and initializes components
 */
window.HNEnhancer = class HNEnhancer {
  static DEBUG = false; // Set to true when debugging

  static CHROME_AI_AVAILABLE = {
    YES: "readily",
    NO: "no",
    AFTER_DOWNLOAD: "after-download",
  };

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

      this.uiComponents.createHelpIcon();
      this.uiComponents.createHelpIcon();

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
    // Inject 'Summarize all comments' link at the top of the main post
    this.uiComponents.injectSummarizePostLink(); // This might need adjustment if its selector depends on the old structure

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
    });

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
        this.updateStatisticsPanel(stats);
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

  setupKeyBoardShortcuts() {
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
        // Toggle collapse/expand grandchildren using the extracted method
        if (this.currentComment) {
          // Ensure currentComment is passed correctly
          this.toggleGrandchildrenCollapse(this.currentComment);
        } else {
          console.warn(
            "[HNE] 'i' shortcut pressed but no current comment selected."
          );
        }
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
  updateStatisticsPanel(stats) {
    if (!this.statisticsPanel || !stats) {
      console.error(
        "Statistics panel or stats data missing in updateStatisticsPanel."
      );
      return;
    }

    // Helper function to populate a list (ul) for a given statistic
    const updateStatList = (listSelector, dataArray, unit = "") => {
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
        if (
          !item ||
          item.value === null ||
          item.value === undefined ||
          !item.link
        ) {
          console.warn("Skipping invalid stat item:", item);
          return;
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
            this.navigation.setCurrentComment(targetElement);
            // Optionally highlight the target comment briefly
            targetElement.classList.add("highlight-stat-target");
            setTimeout(
              () => targetElement.classList.remove("highlight-stat-target"),
              2000
            );
          }
        });

        listItem.appendChild(link);
        listElement.appendChild(listItem);
      });
    };

    // Update each statistic list in the panel
    updateStatList("deepest-node", stats.topDeepest); // Depth has no unit
    updateStatList(
      "most-direct-replies",
      stats.topMostDirectReplies,
      " replies"
    ); // Use updated selector and property
    updateStatList("longest-comment", stats.topLongest, " chars");

    // Make the panel visible
    this.statisticsPanel.style.display = "block";
  }

  /**
   * Injects 'Summarize thread' links into comment elements.
   * @param {HTMLElement} comment - The comment element.
   */
  injectSummarizeThreadLinks(comment) {
    const navsSpan = comment.querySelector(".comhead .navs");
    if (!navsSpan) {
      this.logDebug(`Could not find .navs span for comment ${comment.id}`);
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
      // Apply the action to all grandchildren using the overridden collapse
      directChildren.forEach((child) => {
        const grandchildren = this.domUtils.getDirectChildComments(child); // Use the static method
        console.log(
          `[HNE] Child ${child.id} has ${grandchildren.length} grandchildren`
        );
        grandchildren.forEach((grandchild) => {
          const isCollapsed = this._isCommentCollapsed(grandchild);
          if (shouldCollapse && !isCollapsed) {
            this.logDebug("Collapsing grandchild:", grandchild.id);
            this._toggleComment(grandchild); // This will now call the temporary window.collapse via .click()
          } else if (!shouldCollapse && isCollapsed) {
            this.logDebug("Expanding grandchild:", grandchild.id);
            this._toggleComment(grandchild); // This will now call the temporary window.collapse via .click()
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
      this.chatModal.open(commentElement);
    } else {
      console.error("ChatModal instance not found.");
    }
  }
}; // <-- Moved openChatModal inside the class and kept the final brace
// Initialize the extension
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => new HNEnhancer());
} else {
  new HNEnhancer();
}
