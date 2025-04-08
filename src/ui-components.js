/**
 * UI components for the Hacker News Companion extension
 */
class UIComponents {
  constructor(enhancer) {
    this.enhancer = enhancer;
  }

  /**
   * Creates the help icon
   * @returns {Element} The help icon element
   */
  createHelpIcon() {
    const icon = document.createElement("div");
    icon.className = "help-icon";
    icon.innerHTML = "?";
    icon.title = "Keyboard Shortcuts (Press ? or / to toggle)";
    icon.onclick = () => this.enhancer.toggleHelpModal(true);
    document.body.appendChild(icon);
    return icon;
  }

  /**
   * Creates the help modal
   * @returns {Element} The help modal element
   */
  createHelpModal() {
    const modal = document.createElement("div");
    modal.className = "keyboard-help-modal";
    modal.style.display = "none";

    const content = document.createElement("div");
    content.className = "keyboard-help-content";

    const title = document.createElement("h2");
    title.textContent = "HN Companion: Keyboard Shortcuts";

    const closeBtn = document.createElement("button");
    closeBtn.className = "help-close-btn";
    closeBtn.textContent = "×";
    closeBtn.onclick = () => this.enhancer.toggleHelpModal(false);

    const shortcutGroups = {
      global: {
        title: "Global",
        shortcuts: [
          { key: "o", description: "Open post in new window" },
          { key: "? /", description: "Toggle this help panel" },
        ],
      },
      home: {
        title: "Home Pages (Home, New, Past, Ask, Show)",
        shortcuts: [
          { key: "j k", description: "Next/previous post" },
          { key: "c", description: "Open comments page" },
        ],
      },
      comments: {
        title: "Post Details Page",
        shortcuts: [
          { key: "j k", description: "Next/previous comment" },
          { key: "l h", description: "Next child/parent comment" },
          { key: "[ ]", description: "Prev/next comment by author" },
          { key: "s", description: "Toggle summary panel" },
          { key: "r", description: "Go to root comment" },
          { key: "gg", description: "First comment" },
          { key: "z", description: "Scroll to current" },
          { key: "c", description: "Collapse/expand comment" },
          { key: "i", description: "Toggle collapse grandchildren" },
        ],
      },
    };

    const table = document.createElement("table");

    for (const groupKey in shortcutGroups) {
      const group = shortcutGroups[groupKey]; // Get the actual group object

      const headerRow = table.insertRow();
      const headerCell = headerRow.insertCell();
      headerCell.colSpan = 2; // Span both columns
      headerRow.className = "group-header";

      const subHeading = document.createElement("h3");
      subHeading.textContent = group.title;
      headerCell.appendChild(subHeading);

      group.shortcuts.forEach((shortcut) => {
        const shortcutRow = table.insertRow();

        const keyCell = shortcutRow.insertCell();

        // Keys could be 'l', 'h' for single keys, 'gg' for repeated keys or '?|/' for multiple keys
        const keys = shortcut.key.split(" ");
        keys.forEach((k, index) => {
          const keySpan = document.createElement("span");
          keySpan.className = "key";
          keySpan.textContent = k;
          keyCell.appendChild(keySpan);

          if (index < keys.length - 1) {
            const separator = document.createElement("span");
            separator.textContent = " or ";
            keyCell.appendChild(separator);
          }
        });

        const descCell = shortcutRow.insertCell();
        descCell.textContent = shortcut.description;
      });
    }

    content.appendChild(closeBtn);
    content.appendChild(title);
    content.appendChild(table);

    const footer = document.createElement("div");
    footer.className = "keyboard-help-footer";
    footer.innerHTML =
      'Learn more about features and updates on our <a href="https://github.com/levelup-apps/hn-enhancer/" target="_blank" rel="noopener">GitHub page</a> ↗️';
    content.appendChild(footer);

    modal.appendChild(content);
    document.body.appendChild(modal);

    // Close modal when clicking outside
    modal.addEventListener("click", (e) => {
      e.preventDefault();
      if (e.target === modal) {
        this.enhancer.toggleHelpModal(false);
      }
    });

    return modal;
  }

  /**
   * Injects a link to summarize all comments in the post
   */
  injectSummarizePostLink() {
    const navLinks = document.querySelector(".subtext .subline");
    if (!navLinks) return;

    const summarizeLink = document.createElement("a");
    summarizeLink.href = "#";
    summarizeLink.textContent = "summarize all comments";

    summarizeLink.addEventListener("click", async (e) => {
      e.preventDefault();
      await this.enhancer.summarization.summarizeAllComments();
    });

    navLinks.appendChild(document.createTextNode(" | "));
    navLinks.appendChild(summarizeLink);
  }

  /**
   * Creates the statistics panel element.
   * @returns {Element} The statistics panel element.
   */
  createStatisticsPanel() {
    const panel = document.createElement("div");
    panel.className = "hn-statistics-panel"; // Use a specific class
    panel.style.display = "none"; // Initially hidden until data is ready

    // Use a definition list (dl) for better semantics and styling flexibility
    panel.innerHTML = `
            <h3>Comment Statistics (Top 5)</h3>
            <dl class="hn-stats-list">
                <dt>Deepest Comments (Depth):</dt>
                <dd data-stat-list="deepest-node"><ul><li>[...]</li></ul></dd>

                <dt>Most Direct Replies:</dt>
                <dd data-stat-list="most-direct-replies"><ul><li>[...]</li></ul></dd>

                <dt>Longest Comments (Characters):</dt>
                <dd data-stat-list="longest-comment"><ul><li>[...]</li></ul></dd>
            </dl>
        `;
    // We'll append this panel to the DOM elsewhere (e.g., in hn-enhancer.js)
    return panel;
  }
}

// Make the class available globally
window.UIComponents = UIComponents;
