/**
 * Compact draggable hub panel: stats + quick entry buttons.
 */
class HubPanel {
  constructor(enhancer) {
    this.enhancer = enhancer;
    this.panel = null;
    this.activeView = null;
    this.isCollapsed = false;
    this.isDragging = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.didDrag = false;

    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
  }

  mount() {
    const existingPanel = document.querySelector(".hn-hub-panel");
    if (existingPanel) {
      this.panel = existingPanel;
      return this.panel;
    }

    if (this.panel) {
      return this.panel;
    }

    this.panel = document.createElement("div");
    this.panel.className = "hn-hub-panel";
    this.panel.innerHTML = `
      <div class="hn-hub-header" title="Drag to move">
        <span class="hn-hub-title">HN Companion</span>
        <button type="button" class="hn-hub-collapse-btn" title="Collapse panel" aria-label="Collapse panel">−</button>
      </div>
      <div class="hn-hub-body">
        <div class="hn-hub-stats">
          <span class="hn-hub-stat" data-hub-stat="authors">Authors: <strong>0</strong></span>
          <span class="hn-hub-stat" data-hub-stat="saved">Saved: <strong>0</strong></span>
        </div>
        <div class="hn-hub-actions">
          <button type="button" class="hn-hub-action" data-hub-view="authors">Authors</button>
          <button type="button" class="hn-hub-action" data-hub-view="saved">Saved comments</button>
          <button type="button" class="hn-hub-action" data-hub-link="favorites">Favorite HN</button>
          <button type="button" class="hn-hub-action" data-hub-link="options">Options</button>
        </div>
        <div class="hn-hub-list-wrap" hidden>
          <div class="hn-hub-list-header">
            <span class="hn-hub-list-title"></span>
            <button type="button" class="hn-hub-list-close" title="Close list" aria-label="Close list">×</button>
          </div>
          <div class="hn-hub-list"></div>
        </div>
      </div>
    `;

    document.body.appendChild(this.panel);
    this.setupInteractions();
    this.restorePosition();
    this.updateStats();
    return this.panel;
  }

  setupInteractions() {
    const header = this.panel.querySelector(".hn-hub-header");
    const collapseBtn = this.panel.querySelector(".hn-hub-collapse-btn");
    const listCloseBtn = this.panel.querySelector(".hn-hub-list-close");

    header.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      if (event.target.closest("button")) return;

      this.isDragging = true;
      this.didDrag = false;
      const rect = this.panel.getBoundingClientRect();
      this.dragOffsetX = event.clientX - rect.left;
      this.dragOffsetY = event.clientY - rect.top;
      this.panel.classList.add("is-dragging");
      document.addEventListener("mousemove", this.onMouseMove);
      document.addEventListener("mouseup", this.onMouseUp);
      event.preventDefault();
    });

    collapseBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.setCollapsed(!this.isCollapsed);
    });

    this.panel.querySelectorAll("[data-hub-view]").forEach((button) => {
      button.addEventListener("click", () => {
        const view = button.dataset.hubView;
        this.toggleView(view);
      });
    });

    this.panel.querySelector('[data-hub-link="favorites"]').addEventListener(
      "click",
      () => {
        this.openFavoritesPage();
      }
    );

    this.panel.querySelector('[data-hub-link="options"]').addEventListener(
      "click",
      () => {
        this.openOptionsPage();
      }
    );

    listCloseBtn.addEventListener("click", () => {
      this.closeList();
    });

    this.panel.addEventListener("click", () => {
      if (this.isCollapsed && !this.didDrag) {
        this.setCollapsed(false);
      }
    });
  }

  onMouseMove(event) {
    if (!this.isDragging) return;

    this.didDrag = true;
    const width = this.panel.offsetWidth;
    const height = this.panel.offsetHeight;
    const maxLeft = Math.max(0, window.innerWidth - width);
    const maxTop = Math.max(0, window.innerHeight - height);

    const left = Math.min(
      maxLeft,
      Math.max(0, event.clientX - this.dragOffsetX)
    );
    const top = Math.min(
      maxTop,
      Math.max(0, event.clientY - this.dragOffsetY)
    );

    this.panel.style.left = `${left}px`;
    this.panel.style.top = `${top}px`;
    this.panel.style.right = "auto";
    this.panel.style.bottom = "auto";
  }

  onMouseUp() {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.panel.classList.remove("is-dragging");
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
    this.savePosition();
  }

  async restorePosition() {
    const position = await HNState.getHubPanelPosition();
    if (position?.left != null && position?.top != null) {
      this.panel.style.left = `${position.left}px`;
      this.panel.style.top = `${position.top}px`;
      this.panel.style.right = "auto";
      this.panel.style.bottom = "auto";
    } else {
      this.panel.style.left = "12px";
      this.panel.style.bottom = "72px";
    }

    if (position?.collapsed) {
      this.setCollapsed(true, false);
    }
  }

  async savePosition() {
    const rect = this.panel.getBoundingClientRect();
    await HNState.saveHubPanelPosition({
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      collapsed: this.isCollapsed,
    });
  }

  setCollapsed(collapsed, persist = true) {
    this.isCollapsed = collapsed;
    this.panel.classList.toggle("is-collapsed", collapsed);
    const collapseBtn = this.panel.querySelector(".hn-hub-collapse-btn");
    if (collapseBtn) {
      collapseBtn.textContent = collapsed ? "+" : "−";
      collapseBtn.title = collapsed ? "Expand panel" : "Collapse panel";
    }
    if (collapsed) {
      this.closeList();
    }
    if (persist) {
      this.savePosition();
    }
  }

  updateStats() {
    if (!this.panel) return;

    const authorsCount =
      this.enhancer.bookmarkedAuthors instanceof Map
        ? this.enhancer.bookmarkedAuthors.size
        : 0;
    const savedCount =
      this.enhancer.savedComments instanceof Map
        ? this.enhancer.savedComments.size
        : 0;

    this.setStatValue("authors", authorsCount);
    this.setStatValue("saved", savedCount);

    if (this.activeView === "authors") {
      this.renderAuthorsList();
    } else if (this.activeView === "saved") {
      this.renderSavedCommentsList();
    }
  }

  setStatValue(name, value) {
    const stat = this.panel.querySelector(`[data-hub-stat="${name}"] strong`);
    if (stat) {
      stat.textContent = String(value);
    }
  }

  toggleView(view) {
    if (this.isCollapsed) {
      this.setCollapsed(false);
    }
    if (this.activeView === view) {
      this.closeList();
      return;
    }
    this.activeView = view;
    this.panel.querySelectorAll("[data-hub-view]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.hubView === view);
    });

    const wrap = this.panel.querySelector(".hn-hub-list-wrap");
    const title = this.panel.querySelector(".hn-hub-list-title");
    wrap.hidden = false;

    if (view === "authors") {
      title.textContent = "Bookmarked authors";
      this.renderAuthorsList();
    } else if (view === "saved") {
      title.textContent = "Saved comments";
      this.renderSavedCommentsList();
    }
  }

  closeList() {
    this.activeView = null;
    const wrap = this.panel.querySelector(".hn-hub-list-wrap");
    if (wrap) {
      wrap.hidden = true;
    }
    this.panel.querySelectorAll("[data-hub-view]").forEach((button) => {
      button.classList.remove("is-active");
    });
  }

  renderAuthorsList() {
    const list = this.panel.querySelector(".hn-hub-list");
    if (!list) return;

    const bookmarks =
      this.enhancer.bookmarkedAuthors instanceof Map
        ? Array.from(this.enhancer.bookmarkedAuthors.values())
        : [];

    if (bookmarks.length === 0) {
      list.innerHTML =
        '<div class="hn-hub-empty">No bookmarked authors yet. Click <strong>bookmark</strong> on a comment.</div>';
      return;
    }

    bookmarks.sort((a, b) =>
      (a.username || "").localeCompare(b.username || "")
    );

    list.innerHTML = bookmarks
      .map((bookmark) => {
        const username = this.escapeHtml(bookmark.username || "unknown");
        const title = bookmark.postTitle
          ? this.escapeHtml(this.truncateText(bookmark.postTitle, 48))
          : "";
        return `<div class="hn-hub-list-item">
          <button type="button" class="hn-hub-list-link" data-username="${username}">${username}</button>
          ${title ? `<div class="hn-hub-list-meta">${title}</div>` : ""}
        </div>`;
      })
      .join("");

    list.querySelectorAll("[data-username]").forEach((button) => {
      button.addEventListener("click", () => {
        const username = button.dataset.username;
        const bookmark = this.enhancer.bookmarkedAuthors.get(username);
        this.enhancer.navigateToAuthorComment(username, bookmark);
      });
    });
  }

  renderSavedCommentsList() {
    const list = this.panel.querySelector(".hn-hub-list");
    if (!list) return;

    const entries =
      this.enhancer.savedComments instanceof Map
        ? Array.from(this.enhancer.savedComments.values())
        : [];

    if (entries.length === 0) {
      list.innerHTML =
        '<div class="hn-hub-empty">No saved comments yet. Click <strong>save</strong> on a comment.</div>';
      return;
    }

    entries.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));

    list.innerHTML = entries
      .map((entry) => {
        const commentId = this.escapeHtml(entry.commentId);
        const title = this.escapeHtml(
          entry.postTitle || `Post ${entry.postId || "?"}`
        );
        const author = this.escapeHtml(entry.author || "unknown");
        const snippet = this.escapeHtml(this.truncateText(entry.text, 100));
        return `<div class="hn-hub-list-item" data-comment-id="${commentId}">
          <div class="hn-hub-list-row">
            <button type="button" class="hn-hub-list-link hn-hub-open-saved" data-comment-id="${commentId}">${title}</button>
            <button type="button" class="hn-hub-list-unsave" data-comment-id="${commentId}" title="Unsave">×</button>
          </div>
          <div class="hn-hub-list-meta">by ${author}</div>
          <div class="hn-hub-list-snippet">${snippet || "(no text stored)"}</div>
        </div>`;
      })
      .join("");

    list.querySelectorAll(".hn-hub-open-saved").forEach((button) => {
      button.addEventListener("click", async () => {
        const commentId = button.dataset.commentId;
        const entry = this.enhancer.savedComments.get(commentId);
        const openUrl = HNState.getSavedCommentOpenUrl(entry);
        if (!openUrl) return;

        const currentPostId = this.enhancer.domUtils.getCurrentHNItemId?.();
        const targetPostId = entry?.postId ? String(entry.postId) : null;
        const onSamePost =
          this.enhancer.isCommentsPage &&
          currentPostId &&
          targetPostId &&
          String(currentPostId) === targetPostId;

        if (onSamePost && commentId) {
          const comment =
            document.getElementById(commentId) ||
            document.querySelector(`tr.athing.comtr[id="${commentId}"]`);
          if (comment && this.enhancer.navigation) {
            this.enhancer.navigation.setCurrentComment(comment, true);
            return;
          }
        }

        window.open(openUrl, "_blank", "noopener,noreferrer");
      });
    });

    list.querySelectorAll(".hn-hub-list-unsave").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        const commentId = button.dataset.commentId;
        if (!commentId) return;
        await HNState.removeSavedComment(commentId);
      });
    });
  }

  truncateText(value, max = 160) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max)}…`;
  }

  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  openFavoritesPage() {
    const username = DomUtils.getLoggedInUsername?.();
    if (!username) {
      window.open(
        "https://news.ycombinator.com/login?goto=favorites",
        "_blank",
        "noopener,noreferrer"
      );
      return;
    }

    window.open(
      `https://news.ycombinator.com/favorites?id=${encodeURIComponent(username)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  openOptionsPage() {
    chrome.runtime
      .sendMessage({ type: "HN_SHOW_OPTIONS", data: {} })
      .catch((error) =>
        console.error("Error sending message to show options:", error)
      );
  }
}

window.HubPanel = HubPanel;
