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
      const adapter = this.enhancer?.adapter;
      if (adapter) {
        const titleEl = this.panel.querySelector(".hn-hub-title");
        if (titleEl) titleEl.textContent = adapter.getHubTitle();
      }
      this.updateStats();
      return this.panel;
    }

    // SPA navigation may remove the panel from the DOM while this.panel still
    // references the detached node — re-attach instead of returning early.
    if (this.panel?.isConnected) {
      return this.panel;
    }

    if (this.panel && !this.panel.isConnected) {
      document.body.appendChild(this.panel);
      this.updateStats();
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
        <div class="hn-hub-stats" data-hub-stats hidden></div>
        <div class="hn-hub-actions" data-hub-actions></div>
        <div class="hn-hub-toggles" data-hub-toggles hidden></div>
        <div class="hn-hub-list-wrap" hidden>
          <div class="hn-hub-list-header">
            <span class="hn-hub-list-title"></span>
            <button type="button" class="hn-hub-list-close" title="Close list" aria-label="Close list">×</button>
          </div>
          <div class="hn-hub-list"></div>
        </div>
      </div>
    `;

    // Use adapter for site-specific strings
    const adapter = this.enhancer?.adapter;
    if (adapter) {
      const titleEl = this.panel.querySelector('.hn-hub-title');
      if (titleEl) titleEl.textContent = adapter.getHubTitle();
    }

    this.setupHubButtons();
    document.body.appendChild(this.panel);
    this.setupInteractions();
    this.restorePosition();
    this.updateStats();
    return this.panel;
  }

  setupHubButtons() {
    const actions = this.panel.querySelector('[data-hub-actions]');
    if (!actions) return;

    // Universal buttons (all sites)
    const summaryBtn = document.createElement('button');
    summaryBtn.type = 'button';
    summaryBtn.className = 'hn-hub-action';
    summaryBtn.textContent = 'Summary';
    summaryBtn.title = 'Summarize post (s)';
    summaryBtn.addEventListener('click', async () => {
      this.enhancer.clearSelectionScope?.();
      await this.enhancer.summarization?.summarizeAllComments();
    });
    actions.appendChild(summaryBtn);

    const optionsBtn = document.createElement('button');
    optionsBtn.type = 'button';
    optionsBtn.className = 'hn-hub-action';
    optionsBtn.textContent = 'Options';
    optionsBtn.addEventListener('click', () => this.openOptionsPage());
    actions.appendChild(optionsBtn);

    if (
      typeof this.enhancer.adapter?.getReadabilityPreview === 'function' &&
      this.enhancer.adapter?.isDedicatedCommentsPage?.() === false
    ) {
      const extractBtn = document.createElement('button');
      extractBtn.type = 'button';
      extractBtn.className = 'hn-hub-action';
      extractBtn.textContent = 'Preview';
      extractBtn.title = 'Preview the exact text, images, and screenshot sent to the model';
      extractBtn.addEventListener('click', () => {
        this.enhancer.extractPanel?.toggle();
      });
      this.extractBtn = extractBtn;
      actions.appendChild(extractBtn);
    }

    this.setupHubToggles();

    // Site-specific buttons via adapter
    const siteButtons = this.enhancer.adapter?.getHubButtons?.(this.enhancer);
    if (siteButtons) {
      siteButtons.forEach((btn) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'hn-hub-action';
        el.textContent = btn.label;
        if (btn.title) el.title = btn.title;
        if (btn.hubView) {
          el.dataset.hubView = btn.hubView;
          el.addEventListener('click', () => this.toggleView(btn.hubView));
        } else if (btn.onClick) {
          el.addEventListener('click', btn.onClick);
        }
        actions.appendChild(el);
      });
    }
  }

  setupHubToggles() {
    const toggles = this.panel.querySelector('[data-hub-toggles]');
    if (!toggles) return;

    const adapter = this.enhancer.adapter;
    const isHN = adapter?.getSiteKey?.() === 'news.ycombinator.com';
    toggles.hidden = false;

    const controls = [];
    const addToggle = ({
      key,
      labelText,
      description,
      skippedLabel,
      defaultOn = false,
      requiresImages = false,
    }) => {
      const row = document.createElement('div');
      row.className = 'hn-hub-toggle-row';

      const label = document.createElement('span');
      label.className = 'hn-hub-toggle-label';
      label.textContent = labelText;

      const warning = document.createElement('div');
      warning.id = `hn-hub-${key}-warning`;
      warning.className = 'hn-hub-toggle-warning';
      warning.setAttribute('role', 'status');
      warning.hidden = true;

      const switchBtn = document.createElement('button');
      switchBtn.type = 'button';
      switchBtn.className = 'hn-hub-toggle-switch';
      switchBtn.setAttribute('role', 'switch');
      switchBtn.setAttribute('aria-checked', 'false');
      switchBtn.setAttribute('aria-label', description);
      switchBtn.setAttribute('aria-describedby', warning.id);
      switchBtn.title = description;
      switchBtn.innerHTML =
        '<span class="hn-hub-toggle-track" aria-hidden="true"><span class="hn-hub-toggle-thumb"></span></span>';

      switchBtn.addEventListener('click', async () => {
        switchBtn.disabled = true;
        try {
          const data = await chrome.storage.sync.get('settings');
          const currentValue = defaultOn
            ? data.settings?.[key] !== false
            : data.settings?.[key] === true;
          const settings = {
            ...(data.settings || {}),
            [key]: !currentValue,
          };
          await chrome.storage.sync.set({ settings });
          applyState(settings);
        } catch (error) {
          console.error(`Failed to update ${key}:`, error);
          switchBtn.title = `Could not update ${labelText.toLowerCase()}`;
        } finally {
          switchBtn.disabled = false;
        }
      });

      row.appendChild(label);
      row.appendChild(switchBtn);
      toggles.appendChild(row);
      toggles.appendChild(warning);
      controls.push({
        key,
        labelText,
        skippedLabel,
        defaultOn,
        requiresImages,
        row,
        switchBtn,
        warning,
      });
    };

    if (!isHN) {
      addToggle({
        key: 'bodyEnabled',
        labelText: 'Body',
        description: 'Include extracted article body text in summaries and chat',
        skippedLabel: 'Article body',
        defaultOn: true,
      });
    }
    if (!isHN && typeof adapter?.getArticleImages === 'function') {
      addToggle({
        key: 'imagesEnabled',
        labelText: 'Images',
        description: 'Attach article images to summaries and chat',
        skippedLabel: 'Article images',
        requiresImages: true,
      });
    }
    addToggle({
      key: 'screenshotEnabled',
      labelText: 'Screenshot',
      description: 'Attach a full-page screenshot; it may contain private information',
      skippedLabel: 'Screenshot',
      requiresImages: true,
    });

    const applyState = (settings = {}) => {
      const provider = settings.providerSelection || 'openai-router';
      const supportsImages = settings[provider]?.supportsImages === true;
      const model = settings[provider]?.model || 'Current model';

      controls.forEach((control) => {
        const on = control.defaultOn
          ? settings[control.key] !== false
          : settings[control.key] === true;
        const unavailable = control.requiresImages && on && !supportsImages;
        control.switchBtn.classList.toggle('is-on', on);
        control.row.classList.toggle('has-warning', unavailable);
        control.switchBtn.setAttribute('aria-checked', on ? 'true' : 'false');
        control.switchBtn.title = unavailable
          ? `${control.labelText} is on, but the current model does not support image input`
          : `${control.labelText}: ${on ? 'on' : 'off'}`;
        control.warning.hidden = !unavailable;
        control.warning.textContent = unavailable
          ? `${model} does not support image input. ${control.skippedLabel} will be skipped.`
          : '';
      });
    };

    chrome.storage.sync
      .get('settings')
      .then((data) => {
        applyState(data.settings || {});
      })
      .catch((error) => {
        console.error('Failed to read visual attachment settings:', error);
      });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' && changes.settings?.newValue) {
        applyState(changes.settings.newValue);
      }
    });
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
    this._applyExpandDirection();
    this.savePosition();
  }

  _isNearBottom() {
    const rect = this.panel.getBoundingClientRect();
    const padding = 12;
    return rect.bottom >= window.innerHeight - padding;
  }

  /**
   * Near the viewport bottom, anchor with `bottom` and grow upward so expand
   * does not shift the docked position.
   */
  _applyExpandDirection() {
    if (!this.panel) return;

    const nearBottom = this._isNearBottom();
    this.panel.classList.toggle("expand-upward", nearBottom);

    const rect = this.panel.getBoundingClientRect();
    if (nearBottom) {
      const bottom = Math.max(0, window.innerHeight - rect.bottom);
      this.panel.style.bottom = `${Math.round(bottom)}px`;
      this.panel.style.top = "auto";
    } else {
      this.panel.style.top = `${Math.round(rect.top)}px`;
      this.panel.style.bottom = "auto";
    }
  }

  async restorePosition() {
    const position = await HNState.getHubPanelPosition();
    if (position?.left != null) {
      this.panel.style.left = `${position.left}px`;
      this.panel.style.right = "auto";

      if (position.anchorBottom && position.bottom != null) {
        this.panel.style.bottom = `${position.bottom}px`;
        this.panel.style.top = "auto";
        this.panel.classList.add("expand-upward");
      } else if (position.top != null) {
        this.panel.style.top = `${position.top}px`;
        this.panel.style.bottom = "auto";
      }
    } else {
      this.panel.style.left = "12px";
      this.panel.style.bottom = "72px";
    }

    if (position?.collapsed) {
      this.setCollapsed(true, false);
    } else if (!position?.anchorBottom) {
      this._applyExpandDirection();
    }
  }

  async savePosition() {
    const rect = this.panel.getBoundingClientRect();
    const anchorBottom = this.panel.classList.contains("expand-upward");
    const position = {
      left: Math.round(rect.left),
      collapsed: this.isCollapsed,
      anchorBottom,
    };

    if (anchorBottom) {
      position.bottom = Math.round(window.innerHeight - rect.bottom);
    } else {
      position.top = Math.round(rect.top);
    }

    await HNState.saveHubPanelPosition(position);
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

    this._renderStats();

    if (this.activeView === "authors") {
      this.renderAuthorsList();
    } else if (this.activeView === "saved") {
      this.renderSavedCommentsList();
    }
  }

  _renderStats() {
    const container = this.panel?.querySelector("[data-hub-stats]");
    if (!container) return;

    const stats =
      this.enhancer?.adapter?.getHubStats?.(this.enhancer) || [];

    if (stats.length === 0) {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }

    container.hidden = false;
    container.innerHTML = stats
      .map(
        (stat) =>
          `<span class="hn-hub-stat" data-hub-stat="${this.escapeHtml(stat.id)}">${this.escapeHtml(stat.label)}: <strong>${this.escapeHtml(stat.value)}</strong></span>`
      )
      .join("");
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
      title.textContent = "Saved items";
      this.renderSavedCommentsList();
    }

    this.savePosition();
  }

  setExtractActive(active) {
    if (this.extractBtn) {
      this.extractBtn.classList.toggle("is-active", active);
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
        '<div class="hn-hub-empty">Nothing saved yet. Use <strong>Save</strong> on the hub, <strong>save</strong> on HN comments, or the selection FAB (Summarize / Chat / Save).</div>';
      return;
    }

    entries.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));

    list.innerHTML = entries
      .map((entry) => {
        const commentId = this.escapeHtml(entry.commentId);
        const type = entry.type || "comment";
        const typeLabel = this.escapeHtml(HNState.getSavedItemTypeLabel(type));
        const title = this.escapeHtml(HNState.getSavedItemDisplayTitle(entry));
        const author =
          type === "comment"
            ? this.escapeHtml(entry.author || "unknown")
            : this.escapeHtml(entry.siteKey || "");
        const snippet = this.escapeHtml(this.truncateText(entry.text, 100));
        const pageHint =
          type !== "comment" && entry.pageUrl
            ? `<div class="hn-hub-list-meta hn-hub-list-page">${this.escapeHtml(this.truncateText(entry.pageUrl, 80))}</div>`
            : "";
        const metaLine =
          type === "comment"
            ? `<div class="hn-hub-list-meta">by ${author}</div>`
            : `<div class="hn-hub-list-meta">${author}</div>`;
        return `<div class="hn-hub-list-item" data-comment-id="${commentId}">
          <div class="hn-hub-list-row">
            <span class="hn-saved-type-badge">${typeLabel}</span>
            <button type="button" class="hn-hub-list-link hn-hub-open-saved" data-comment-id="${commentId}">${title}</button>
            <button type="button" class="hn-hub-list-unsave" data-comment-id="${commentId}" title="Unsave">×</button>
          </div>
          ${metaLine}
          ${pageHint}
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
        const isCommentEntry = !entry.type || entry.type === "comment";
        const onSamePost =
          isCommentEntry &&
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
    const username = this.enhancer?.domUtils?.getLoggedInUsername?.();
    const baseUrl = this.enhancer?.adapter?.getFavoritesUrl();
    if (!baseUrl) return;

    if (!username) {
      window.open(baseUrl, "_blank", "noopener,noreferrer");
      return;
    }

    window.open(
      this.enhancer.adapter.getUserFavoritesUrl(username),
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
