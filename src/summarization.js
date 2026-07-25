/**
 * Handles AI summarization functionality for the Hacker News Companion extension
 */

// Constants and configurations
const SUMMARIZATION_CONFIG = {
  STATUS: {
    OK: "ok",
    TEXT_TOO_SHORT: "too_short",
    THREAD_TOO_SHALLOW: "too_shallow",
    THREAD_TOO_DEEP: "chrome_depth_limit",
  },
  LIMITS: {
    MIN_SENTENCE_LENGTH: 8,
    MIN_COMMENT_DEPTH: 3,
    TOKENS_PER_CHAR: 0.25,
    UPDATE_INTERVAL: 100, // ms
    MAX_SCORE: 1000,
    MAX_DOWNVOTES: 10,
  },
  LANGUAGE_NAMES: {
    en: "English",
    zh: "中文 (Chinese)",
    es: "Español (Spanish)",
    fr: "Français (French)",
    de: "Deutsch (German)",
    ja: "日本語 (Japanese)",
    ko: "한국어 (Korean)",
    ru: "Русский (Russian)",
    pt: "Português (Portuguese)",
    it: "Italiano (Italian)",
  },
  LANGUAGE_INSTRUCTIONS: {
    zh: "Please respond in Chinese (中文).",
    es: "Please respond in Spanish (Español).",
    fr: "Please respond in French (Français).",
    de: "Please respond in German (Deutsch).",
    ja: "Please respond in Japanese (日本語).",
    ko: "Please respond in Korean (한국어).",
    ru: "Please respond in Russian (Русский).",
    pt: "Please respond in Portuguese (Português).",
    it: "Please respond in Italian (Italiano).",
  },
};

class Summarization {
  constructor(enhancer) {
    this.enhancer = enhancer;
    this.SummarizeCheckStatus = SUMMARIZATION_CONFIG.STATUS;
    this._summaryPathMap = new Map();
    this._summaryViewState = null;
  }

  /**
   * Ensures per-post summary view state for Local / Server tabs.
   * Streaming/generation lives under Local (no separate Generating tab).
   * @param {string} itemId
   * @returns {object}
   */
  _clearViewState() {
    this._summaryViewState = null;
  }

  _ensureSummaryViewState(itemId) {
    if (!itemId) {
      itemId = this.enhancer.domUtils.getCurrentHNItemId();
    }
    const cacheScope = this._effectiveSummaryCacheId(null);
    const stateKey = `${itemId}:${cacheScope ?? "post"}`;
    if (
      !this._summaryViewState ||
      this._summaryViewState.stateKey !== stateKey
    ) {
      this._summaryViewState = {
        stateKey,
        itemId,
        cacheScope,
        localCache: null,
        localCaches: [],
        selectedLocalCacheKey: null,
        serverCache: null,
        generating: null,
        activeView: "local",
        pathMap: new Map(),
        lastMeta: null,
      };
    }
    // Migrate leftover "generating" view from older sessions in-memory
    if (this._summaryViewState.activeView === "generating") {
      this._summaryViewState.activeView = "local";
    }
    return this._summaryViewState;
  }

  /**
   * Resolves the storage key segment for a full-page (non-thread) summary.
   * @param {string|null} targetCommentId - null for post-level summaries
   * @returns {string|null}
   */
  _effectiveSummaryCacheId(targetCommentId) {
    if (targetCommentId != null && targetCommentId !== "") {
      return targetCommentId;
    }
    return this.enhancer.adapter?.getPostSummaryCacheId?.() ?? null;
  }

  /**
   * Panel title reflecting page mode (post vs comments thread).
   * @returns {string}
   */
  _getSummaryPanelTitle(suffix = "") {
    const adapter = this.enhancer.adapter;
    let base = "Summary";
    if (adapter?.isDedicatedCommentsPage?.()) {
      base = "Comments Summary";
    } else if (adapter?.getPostText?.()) {
      base = "Post Summary";
    }
    return suffix ? `${base} (${suffix})` : base;
  }

  /**
   * Build display meta from a cached local summary entry.
   * @param {object|null} local
   * @returns {object|null}
   */
  _metaFromLocalCache(local) {
    if (!local) return null;
    const ts = local.metadata?.timestamp || local.timestamp;
    const provider = local.provider || local.metadata?.provider;
    const model = local.model || local.metadata?.model;
    if (!provider && !model && ts == null) return null;

    const cacheAge =
      ts != null ? Math.round((Date.now() - ts) / (1000 * 60)) : null;
    return {
      aiProvider: provider || "AI",
      model: model || "",
      language: local.language || local.metadata?.language,
      duration: local.metadata?.duration,
      generatedAt: ts,
      cacheIndicator:
        cacheAge != null
          ? `<span class="cache-indicator">📋 Cached (${cacheAge}m ago)</span>`
          : null,
    };
  }

  /**
   * Unique key for a local cache entry (provider + model + language).
   * @param {object} entry
   * @returns {string}
   */
  _localCacheKey(entry) {
    if (!entry) return "";
    const provider = entry.provider || entry.metadata?.provider || "";
    const model = entry.model || entry.metadata?.model || "";
    const language = entry.language || entry.metadata?.language || "";
    return `${provider}:${model}:${language}`;
  }

  /**
   * Load all local caches for the current post scope; default to newest entry.
   * @param {string} itemId
   * @param {{ selectKey?: string|null, selectLatest?: boolean }} options
   * @returns {Promise<{ caches: object[], selected: object|null }>}
   */
  async loadLocalCaches(itemId, options = {}) {
    const { selectKey = null, selectLatest = true } = options;
    const siteKey =
      this.enhancer.adapter?.getSiteKey?.() ?? "news.ycombinator.com";
    const cacheCommentId = this._effectiveSummaryCacheId(null);

    let caches = await HNState.listSummaries(siteKey, itemId, cacheCommentId);

    // Substack article summaries saved before scope split used `_post` key
    if (caches.length === 0 && cacheCommentId === "article") {
      caches = await HNState.listSummaries(siteKey, itemId, null);
    }

    const state = this._ensureSummaryViewState(itemId);
    state.localCaches = caches;

    let selected = null;
    if (selectKey) {
      selected =
        caches.find((entry) => this._localCacheKey(entry) === selectKey) ||
        null;
    } else if (selectLatest && caches.length > 0) {
      selected = caches[0];
    }

    state.localCache = selected;
    state.selectedLocalCacheKey = selected
      ? this._localCacheKey(selected)
      : null;

    if (selected) {
      state.lastMeta = this._metaFromLocalCache(selected) || state.lastMeta;
    }

    return { caches, selected };
  }

  /**
   * Pick a visible element to highlight (Substack anchors are empty divs).
   * @param {Element} target
   * @returns {Element}
   */
  _getSummaryHighlightTarget(target) {
    if (!target) return target;
    const comment = target.closest?.(".comment");
    if (comment) {
      return (
        comment.querySelector(".comment-content") ||
        comment.querySelector(".comment-body") ||
        comment
      );
    }
    return target;
  }

  /**
   * Format post body for LLM: number <p> elements and tag DOM for jump resolution.
   * @param {Element} bodyEl - The post body element from adapter.getPostBodyElement()
   * @param {string} postTitle
   * @returns {{ formattedText: string, paraMap: Map<string, Element> }}
   */
  _formatPostBodyForLLM(bodyEl, postTitle) {
    const paraMap = new Map();
    if (!bodyEl) {
      return { formattedText: `[post] ${postTitle || 'Article'}`, paraMap };
    }

    const paragraphs = bodyEl.querySelectorAll('p');
    const lines = [`[post] ${postTitle || 'Article'}:`];
    let idx = 1;

    paragraphs.forEach((p) => {
      p.dataset.paraIndex = String(idx);
      const text = p.textContent.trim();
      if (text) {
        lines.push(`[P${idx}] ${text}`);
        paraMap.set(`P${idx}`, p);
      }
      idx++;
    });

    return { formattedText: lines.join('\n'), paraMap };
  }

  /**
   * Get post body only (no comments) for article-page summaries.
   * @returns {Promise<{ formattedComment: string, commentPathToIdMap: Map }>}
   */
  async _getPostBodyOnly() {
    const adapter = this.enhancer.adapter;
    const bodyEl = adapter.getPostBodyElement?.();
    const title = adapter.getPostTitle?.() || 'Post';
    const { formattedText } = this._formatPostBodyForLLM(bodyEl, title);
    return { formattedComment: formattedText, commentPathToIdMap: new Map([['post', 'post']]) };
  }

  /**
   * Scroll to a summary jump target and flash-highlight it.
   * @param {Element} target
   */
  _scrollAndFlashSummaryTarget(target) {
    const el = this._getSummaryHighlightTarget(target);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("hn-flash-highlight");
    setTimeout(() => {
      el.classList.remove("hn-flash-highlight");
    }, 2500);
  }

  /**
   * Builds Local / Server tab bar. Local also reflects generating state.
   * @param {object} state
   * @returns {string}
   */
  _buildSourceTabsHtml(state) {
    const supportsServer = this.enhancer.adapter?.supportsServerSummary?.() ?? false;
    const hasServer = supportsServer && !!state.serverCache;
    const isStreaming = !!(state.generating && state.generating.isStreaming);
    const active = state.activeView === "server" ? "server" : "local";

    const tab = (id, view, label, enabled, extraClass = "") => {
      const activeClass = active === view ? "active" : "";
      const disabledAttr = enabled ? "" : "disabled";
      const disabledClass = enabled ? "" : "disabled";
      return `<button type="button" id="${id}" class="cache-toggle-btn source-tab-btn ${activeClass} ${disabledClass} ${extraClass}" data-source-view="${view}" ${disabledAttr}>${label}</button>`;
    };

    const localLabel = isStreaming ? "Local…" : "Local";
    const localClass = isStreaming ? "is-generating" : "";

    if (!supportsServer) {
      return "";
    }

    return `<div class="summary-source-tabs">
      ${tab("source-tab-local", "local", localLabel, true, localClass)}
      ${tab("source-tab-server", "server", "Server", hasServer)}
    </div>`;
  }

  /**
   * Model switcher when multiple local caches exist for the same post scope.
   * @param {object} state
   * @returns {string}
   */
  _buildModelTabsHtml(state) {
    const caches = state.localCaches || [];
    const isStreaming = !!(state.generating && state.generating.isStreaming);

    if (caches.length <= 1 || isStreaming || state.activeView === "server") {
      return "";
    }

    const selectedKey = state.selectedLocalCacheKey;
    const latestKey = caches[0] ? this._localCacheKey(caches[0]) : null;

    const pills = caches
      .map((entry) => {
        const cacheKey = this._localCacheKey(entry);
        const model = entry.model || entry.metadata?.model || "unknown";
        const provider = entry.provider || entry.metadata?.provider || "";
        const label = provider ? `${model}` : model;
        const isActive = cacheKey === selectedKey ? "active" : "";
        const isLatest = cacheKey === latestKey ? "is-latest" : "";
        const ts = entry.timestamp || entry.metadata?.timestamp;
        const title = ts
          ? `${provider} / ${model} · ${new Date(ts).toLocaleString()}`
          : `${provider} / ${model}`;
        return `<button type="button" class="cache-toggle-btn model-tab-btn ${isActive} ${isLatest}" data-cache-key="${cacheKey}" title="${title}">${label}</button>`;
      })
      .join("");

    return `<div class="summary-model-tabs">
      <span class="summary-model-label">Models</span>
      ${pills}
    </div>`;
  }

  /**
   * Source tabs (Local/Server) plus model comparison tabs.
   * @param {object} state
   * @returns {string}
   */
  _buildSummaryMetadataHtml(state) {
    const sourceTabs = this._buildSourceTabsHtml(state);
    const modelTabs = this._buildModelTabsHtml(state);
    if (!sourceTabs && !modelTabs) {
      return "";
    }
    return `${sourceTabs}${modelTabs}`;
  }

  /**
   * Renders the active Local / Server view into the summary panel.
   */
  async _renderSummaryView() {
    const state = this._summaryViewState;
    if (!state) return;

    const hasLocal = !!state.localCache;
    const hasServer = !!state.serverCache;
    const hasGenerating = !!state.generating;
    const isStreaming = !!(hasGenerating && state.generating.isStreaming);

    if (state.activeView !== "local" && state.activeView !== "server") {
      state.activeView = "local";
    }

    // Server tab only valid when cache exists; Local may be empty / streaming / cached
    if (state.activeView === "server" && !hasServer) {
      state.activeView = "local";
    }

    const tabsHtml = this._buildSummaryMetadataHtml(state);
    let title = this._getSummaryPanelTitle();
    let headerHtml = "";
    let bodyHtml = "";
    let pathMap = state.pathMap || new Map();

    if (state.activeView === "server" && hasServer) {
      const server = state.serverCache;
      const cacheSource = server.source || "HN Companion";
      const cachedTime = server.created_at
        ? new Date(server.created_at).toLocaleString()
        : "Unknown";
      title = "Summary (Server)";
      headerHtml = `<div class="cached-summary-header"><span class="cached-badge server-cache">SERVER</span><span class="cached-info">From ${cacheSource} on ${cachedTime}</span></div>`;
      pathMap = await this._getCommentPathToIdMap(state.itemId, null);
      bodyHtml = this._formatSummaryHtml(
        server.summary || "No summary available",
        pathMap
      );
    } else if (state.activeView === "local") {
      // Streaming (or error/loading with no finished local yet) shows under Local
      if (isStreaming || (hasGenerating && !hasLocal)) {
        const gen = state.generating;
        title = gen.title || "Summary";
        headerHtml = `<div class="cached-summary-header"><span class="cached-badge local-cache">LOCAL</span><span class="cached-info">${isStreaming ? "Generating…" : ""}</span></div>`;
        if (gen.rawText) {
          pathMap = gen.pathMap || pathMap;
          bodyHtml =
            this._formatSummaryHtml(gen.rawText, pathMap) +
            (gen.isStreaming ? "..." : "");
        } else {
          bodyHtml =
            gen.loadingHtml ||
            `<div>Generating summary...<span class="loading-spinner"></span></div>`;
        }
      } else if (hasLocal) {
        const local = state.localCache;
        title = this._getSummaryPanelTitle("Local");
        const meta = this._metaFromLocalCache(local) || state.lastMeta;
        const metaLine = this._buildGenerateMetaLine(meta);
        headerHtml = `<div class="cached-summary-header"><span class="cached-badge local-cache">LOCAL</span>${metaLine}</div>`;
        pathMap = await this._getCommentPathToIdMap(
          state.itemId,
          local.metadata
        );
        bodyHtml = this._formatSummaryHtml(local.summary || "", pathMap);
      } else {
        title = this._getSummaryPanelTitle();
        bodyHtml = `<div class="summary-empty-prompt">No local summary yet.</div>
          <div class="summary-actions"><button type="button" class="cache-toggle-btn summary-generate-btn" id="summary-generate-post">Generate</button></div>`;
      }

      if (hasLocal && !isStreaming) {
        bodyHtml += `<div class="summary-actions"><button type="button" class="cache-toggle-btn summary-generate-btn" id="summary-generate-post">Regenerate</button></div>`;
      }
    } else {
      bodyHtml = "<div>No summary available for this source.</div>";
    }

    this.enhancer.summaryPanel.updateContent({
      title,
      metadata: tabsHtml,
      text: `${headerHtml}${bodyHtml}`,
    });

    this._bindSourceTabHandlers();
    this._bindModelTabHandlers();
    this._bindPostSummaryActions();
    this._bindSummaryCommentLinks();
  }

  _bindPostSummaryActions() {
    const btn = this.enhancer.summaryPanel.panel?.querySelector(
      "#summary-generate-post"
    );
    if (!btn) return;

    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this._generatePostSummary();
    });
  }

  /**
   * @param {object} meta
   * @returns {string} inner HTML (span.cached-info), no wrapper div
   */
  _buildGenerateMetaLine(meta) {
    if (!meta) return "";
    const { aiProvider, model, language, duration, cacheIndicator, generatedAt } =
      meta;
    if (!aiProvider) return "";
    const providerText = model
      ? `${aiProvider} / ${model}`
      : `${aiProvider}`;
    let html = `<span class="cached-info">Summarized using <strong>${providerText}</strong>`;
    if (duration != null && duration !== "") {
      html += ` in <strong>${duration}</strong> secs`;
    }
    if (generatedAt) {
      html += ` · <strong>${new Date(generatedAt).toLocaleString()}</strong>`;
    }
    if (language && language !== "en") {
      html += ` in <strong>${this.getLanguageName(language)}</strong>`;
    }
    if (cacheIndicator) {
      html += ` ${cacheIndicator}`;
    }
    html += `</span>`;
    return html;
  }

  /**
   * @param {object} meta
   * @returns {string}
   */
  _buildGenerateMetaHtml(meta) {
    const line = this._buildGenerateMetaLine(meta);
    if (!line) return "";
    return `<div class="cached-summary-header">${line}</div>`;
  }

  _bindSourceTabHandlers() {
    const state = this._summaryViewState;
    if (!state) return;

    document.querySelectorAll(".source-tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const view = btn.dataset.sourceView;
        if (!view || btn.disabled) return;
        this._switchSummaryView(view);
      });
    });
  }

  _bindModelTabHandlers() {
    const state = this._summaryViewState;
    if (!state) return;

    document.querySelectorAll(".model-tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const cacheKey = btn.dataset.cacheKey;
        if (!cacheKey || btn.disabled) return;
        this._switchLocalCache(cacheKey);
      });
    });
  }

  /**
   * Switch displayed local summary to a different cached model.
   * @param {string} cacheKey - provider:model:language
   */
  _switchLocalCache(cacheKey) {
    const state = this._summaryViewState;
    if (!state || state.selectedLocalCacheKey === cacheKey) return;

    const entry = (state.localCaches || []).find(
      (item) => this._localCacheKey(item) === cacheKey
    );
    if (!entry) return;

    state.selectedLocalCacheKey = cacheKey;
    state.localCache = entry;
    state.lastMeta = this._metaFromLocalCache(entry) || state.lastMeta;
    state.activeView = "local";
    this._renderSummaryView();
  }

  /**
   * Switch visible source without interrupting generation.
   * @param {"local"|"server"} view
   */
  _switchSummaryView(view) {
    const state = this._summaryViewState;
    if (!state) return;
    // Local always switchable (empty / cache / stream). Server needs cache.
    if (view === "server" && !state.serverCache) return;
    if (state.activeView === view) return;
    state.activeView = view;
    this._renderSummaryView();
  }

  /**
   * Refresh only the source tab bar (e.g. while user views Server during stream).
   */
  _refreshSourceTabsOnly() {
    const state = this._summaryViewState;
    if (!state) return;
    const metadataElement = this.enhancer.summaryPanel.panel?.querySelector(
      ".summary-metadata"
    );
    if (!metadataElement) return;
    metadataElement.innerHTML = this._buildSummaryMetadataHtml(state);
    this._bindSourceTabHandlers();
    this._bindModelTabHandlers();
  }

  /**
   * Summarizes a thread starting from a specific comment
   */
  async summarizeThread(comment) {
    try {
      const { hnItemId, targetCommentId } = this.extractCommentInfo(comment);
      if (!hnItemId || !targetCommentId) return;

      const { formattedComment, commentPathToIdMap } =
        this.prepareCommentData(comment);
      if (!formattedComment) return;

      const { aiProvider, model } = await this.getAIProviderModel();
      if (!aiProvider) {
        this.showConfigureAIMessage();
        return;
      }

      const author = comment.querySelector(".hnuser")?.textContent || "";
      const highlightedAuthor = `<span class="highlight-author">${author}</span>`;

      const checkResult = this.shouldSummarizeText(
        formattedComment,
        commentPathToIdMap.size,
        aiProvider
      );
      if (checkResult.status !== this.SummarizeCheckStatus.OK) {
        this.showSummarizationNotRecommended(
          checkResult.status,
          highlightedAuthor
        );
        return;
      }

      this.showLoadingMessage(
        "Thread Summary",
        `Analyzing discussion in ${highlightedAuthor} thread`,
        aiProvider,
        model
      );
      await this.summarizeTextWithAI(
        formattedComment,
        commentPathToIdMap,
        hnItemId,
        targetCommentId
      );
    } catch (error) {
      this.handleError("Error in thread summarization", error);
    }
  }

  /**
   * Opens the summary panel and shows cached Local / Server content.
   * Does not start generation — use Generate in the panel or _generatePostSummary().
   */
  async summarizeAllComments() {
    const itemId = this.enhancer.domUtils.getCurrentHNItemId();
    if (!itemId) {
      console.error(
        "Could not get item id of the current post to summarize all comments"
      );
      return;
    }

    try {
      if (!this.enhancer.summaryPanel.isVisible) {
        this.enhancer.summaryPanel.toggle();
      }

      const [{ selected: localCache }, serverCache] = await Promise.all([
        this.loadLocalCaches(itemId),
        this.enhancer.adapter?.supportsServerSummary?.()
          ? this.enhancer.getCachedSummary(itemId)
          : Promise.resolve(null),
      ]);

      const state = this._ensureSummaryViewState(itemId);
      state.serverCache = serverCache;

      if (state.generating?.isStreaming) {
        state.activeView = "local";
        await this._renderSummaryView();
        return;
      }

      if (localCache || serverCache) {
        await this._showCachedSummary(
          itemId,
          localCache,
          serverCache,
          localCache ? "local" : "server"
        );
      } else {
        state.activeView = "local";
        state.generating = null;
        await this._renderSummaryView();
        if (this.enhancer.adapter?.shouldAutoGeneratePostSummary?.()) {
          await this._generatePostSummary();
        }
      }
    } catch (error) {
      this.handleError("Error opening summary panel", error);
    }
  }

  /**
   * Generates (or regenerates) a local summary for the full post.
   */
  async _generatePostSummary() {
    const itemId = this.enhancer.domUtils.getCurrentHNItemId();
    if (!itemId) {
      console.error(
        "Could not get item id of the current post to generate summary"
      );
      return;
    }

    try {
      if (!this.enhancer.summaryPanel.isVisible) {
        this.enhancer.summaryPanel.toggle();
      }

      const state = this._ensureSummaryViewState(itemId);

      if (state.generating?.isStreaming) {
        state.activeView = "local";
        await this._renderSummaryView();
        return;
      }

      const { aiProvider, model } = await this.getAIProviderModel();
      if (!aiProvider) {
        this.showConfigureAIMessage();
        return;
      }

      const [{ selected: localCache }, serverCache] = await Promise.all([
        this.loadLocalCaches(itemId),
        this.enhancer.adapter?.supportsServerSummary?.()
          ? this.enhancer.getCachedSummary(itemId)
          : Promise.resolve(null),
      ]);
      state.serverCache = serverCache;

      // Detect article page (non-dedicated comments) → post-body-only summary
      const isPostOnly = this.enhancer.adapter?.isDedicatedCommentsPage?.() === false;

      const summaryLabel = isPostOnly ? "Article Summary" : "Post Summary";
      this.showLoadingMessage(
        summaryLabel,
        localCache || serverCache
          ? "Regenerating summary..."
          : isPostOnly
            ? "Analyzing the article..."
            : "Analyzing all threads in this post...",
        aiProvider,
        model
      );

      const { formattedComment, commentPathToIdMap } = isPostOnly
        ? await this._getPostBodyOnly()
        : await this.getHNThread(itemId);
      await this.summarizeTextWithAI(
        formattedComment,
        commentPathToIdMap,
        null,
        null,
        isPostOnly,
        true
      );
    } catch (error) {
      this.handleError("Error preparing for summarization", error);
    }
  }

  /**
   * Auto-open summary panel on comments page load when Local or Server cache exists.
   * Prefer Local when both exist; otherwise show whichever is available.
   * @param {string} itemId
   */
  async autoOpenSummaryPanel(itemId) {
    if (!itemId || !this.enhancer.summaryPanel) return;
    try {
      const [{ selected: localCache }, serverCache] = await Promise.all([
        this.loadLocalCaches(itemId),
        this.enhancer.adapter?.supportsServerSummary?.()
          ? this.enhancer.getCachedSummary(itemId)
          : Promise.resolve(null),
      ]);

      if (!localCache && !serverCache) return;

      if (!this.enhancer.summaryPanel.isVisible) {
        this.enhancer.summaryPanel.toggle();
      }

      await this._showCachedSummary(
        itemId,
        localCache,
        serverCache,
        localCache ? "local" : "server"
      );
    } catch (error) {
      console.warn("Could not auto-open summary panel:", error);
    }
  }

  /**
   * Show a cached summary with persistent Local / Server tabs.
   * @param {string} itemId - The HN post ID
   * @param {object|null} localCache - Local cache data
   * @param {object|null} serverCache - Server cache data
   * @param {string} which - Which cache to show: "local" or "server"
   */
  async _showCachedSummary(itemId, localCache, serverCache, which) {
    const state = this._ensureSummaryViewState(itemId);
    await this.loadLocalCaches(itemId, {
      selectKey: localCache ? this._localCacheKey(localCache) : null,
      selectLatest: !localCache,
    });
    state.serverCache = serverCache;
    if (which === "local" || which === "server") {
      state.activeView = which;
    } else {
      state.activeView = localCache ? "local" : "server";
    }
    await this._renderSummaryView();
  }

  /**
   * Builds a comment path to ID map for the current post.
   * @param {string} itemId - The HN post ID
   * @param {object|null} cacheMetadata - Optional cached metadata with saved path map
   * @returns {Promise<Map<string, string>>}
   */
  async _getCommentPathToIdMap(itemId, cacheMetadata = null) {
    const cachedPairs = cacheMetadata?.commentPathToIdMap;
    if (Array.isArray(cachedPairs) && cachedPairs.length > 0) {
      // Use the snapshot captured at summary generation time. Tree paths drift
      // when comments are added or removed, but HN comment IDs stay stable.
      return new Map(
        cachedPairs.map(([path, id]) => [path, String(id)])
      );
    }

    try {
      const { commentPathToIdMap } = await this.getHNThread(itemId);
      return commentPathToIdMap;
    } catch (error) {
      console.warn("Could not build comment path map from API:", error);
      return new Map();
    }
  }

  /**
   * Replace comment refs with private-use tokens (survives markdown escape).
   * Handles [#1], [#2.1], [#post], [来自 #3], and similar attribution forms.
   * @param {string} text
   * @returns {{ text: string, tokens: Array<{display: string, path: string}> }}
   */
  _tokenizeCommentRefs(text) {
    const tokens = [];
    const emit = (display, path) => {
      const token = `\uE002${tokens.length}\uE003`;
      tokens.push({ display, path });
      return token;
    };

    text = text.replace(
      /\[([^\[\]#]*?)#(\d+(?:\.\d+)*|post)\]/gi,
      (match, prefix, path) => {
        const normalizedPath = path.toLowerCase() === 'post' ? 'post' : path;
        const trimmedPrefix = prefix.trim();
        const display = trimmedPrefix
          ? `[${trimmedPrefix} #${normalizedPath}]`
          : `[#${normalizedPath}]`;
        return emit(display, normalizedPath);
      }
    );

    return { text, tokens };
  }

  /**
   * Restore comment-ref tokens as clickable jump buttons.
   * @param {string} html
   * @param {Array<{display: string, path: string}>} tokens
   * @returns {string}
   */
  _restoreCommentRefTokens(html, tokens) {
    tokens.forEach(({ display, path }, index) => {
      const token = `\uE002${index}\uE003`;
      const dataRef = path === 'post' ? '#post' : `#${path}`;
      const btn =
        `<button type="button" class="hn-summary-ref" data-ref="${dataRef}">` +
        `${display}</button>`;
      html = html.split(token).join(btn);
    });

    return html;
  }

  /**
   * @deprecated Use MarkdownUtils.tokenizeParagraphRefs instead.
   */
  _tokenizeParagraphRefs(text) {
    return MarkdownUtils.tokenizeParagraphRefs(text);
  }

  /**
   * @deprecated Use MarkdownUtils.restoreParagraphRefTokens instead.
   */
  _restoreParagraphRefTokens(html, tokens) {
    return MarkdownUtils.restoreParagraphRefTokens(html, tokens);
  }

  /**
   * Converts summary markdown to HTML and replaces comment path references with links.
   * @param {string} summary - Raw summary text
   * @param {Map<string, string>} commentPathToIdMap - Map of comment paths to IDs
   * @returns {string}
   */
  _formatSummaryHtml(summary, commentPathToIdMap) {
    this._summaryPathMap =
      commentPathToIdMap instanceof Map
        ? commentPathToIdMap
        : new Map(commentPathToIdMap || []);

    const { text: textAfterCommentTokens, tokens: commentRefTokens } =
      this._tokenizeCommentRefs(summary);
    const { text: summaryWithTokens, tokens: paragraphRefTokens } =
      this._tokenizeParagraphRefs(textAfterCommentTokens);

    const summaryHtml =
      this.enhancer.markdownUtils.convertMarkdownToHTML(summaryWithTokens);
    let formattedSummary =
      this.enhancer.markdownUtils.replacePathsWithCommentLinks(
        summaryHtml,
        this._summaryPathMap
      );

    formattedSummary = this._normalizeCommentAnchors(formattedSummary);
    formattedSummary = this._restoreParagraphRefTokens(
      formattedSummary,
      paragraphRefTokens
    );
    formattedSummary = this._restoreCommentRefTokens(
      formattedSummary,
      commentRefTokens
    );

    // Fallback for any [#N] / [#N.M] refs that slipped through tokenization
    formattedSummary = formattedSummary.replace(
      /\[(#(?:post|\d+(?:\.\d+)*))\]/gi,
      (match, ref) => {
        const path = ref.toLowerCase() === '#post' ? 'post' : ref.slice(1);
        const dataRef = path === 'post' ? '#post' : `#${path}`;
        return `<button type="button" class="hn-summary-ref" data-ref="${dataRef}">${match}</button>`;
      }
    );

    return formattedSummary;
  }

  /**
   * Converts markdown/server comment anchors into summary panel jump links.
   * @param {string} html
   * @returns {string}
   */
  _normalizeCommentAnchors(html) {
    return html.replace(
      /<a\b([^>]*?)href=['"]([^'"]+)['"]([^>]*?)>([\s\S]*?)<\/a>/gi,
      (match, beforeHref, href, afterHref, linkText) => {
        if (/data-comment-link\s*=/.test(match)) {
          return match;
        }

        const commentId = this._extractCommentIdFromHref(href);
        if (!commentId) {
          return match;
        }

        const path = linkText.trim();
        const pathAttr = /^\d+(?:\.\d+)*$/.test(path)
          ? ` data-comment-path="${path}"`
          : "";
        const displayText = /^\d+(?:\.\d+)*$/.test(path) ? `[${path}]` : linkText;

        return `<a href="#" class="summary-comment-link" data-comment-link="true" data-comment-id="${commentId}"${pathAttr}>${displayText}</a>`;
      }
    );
  }

  /**
   * @param {string} href
   * @returns {string|null}
   */
  _extractCommentIdFromHref(href) {
    if (!href) {
      return null;
    }

    const hashMatch = href.match(/#(\d+)$/);
    if (hashMatch) {
      return hashMatch[1];
    }

    const commentMatch = href.match(/\/comment\/(\d+)/);
    if (commentMatch) {
      return `comment-${commentMatch[1]}`;
    }

    if (/^comment-\d+$/.test(href)) {
      return href;
    }

    if (/^\d+$/.test(href)) {
      return href;
    }

    return null;
  }

  /**
   * Resolves a comment element from a summary panel link.
   * @param {HTMLAnchorElement} link
   * @returns {HTMLElement|null}
   */
  _resolveCommentFromLink(link) {
    const adapter = this.enhancer.adapter;
    const domUtils = this.enhancer.domUtils;

    const directId = link.dataset.commentId;
    if (directId) {
      const viaAdapter = domUtils.findCommentElementById(directId);
      if (viaAdapter) {
        return viaAdapter;
      }
      const byId = document.getElementById(directId);
      if (byId) {
        return byId.closest(".comment") || byId;
      }
    }

    const path = link.dataset.commentPath || "";
    if (path) {
      const viaPath = adapter?.resolveBlockByRef?.(path);
      if (viaPath) {
        return viaPath;
      }
      if (this._summaryPathMap instanceof Map) {
        const mappedId = this._summaryPathMap.get(path);
        if (mappedId) {
          const viaMap = domUtils.findCommentElementById(String(mappedId));
          if (viaMap) {
            return viaMap;
          }
        }
      }
    }

    const href = link.getAttribute("href");
    if (href) {
      const commentId = this._extractCommentIdFromHref(href);
      if (commentId) {
        return domUtils.findCommentElementById(commentId);
      }
    }

    return null;
  }

  /**
   * Binds delegated click handlers on .summary-text so links stay clickable
   * while streaming replaces innerHTML.
   */
  _bindSummaryCommentLinks() {
    const textElement =
      this.enhancer.summaryPanel.panel?.querySelector(".summary-text");
    if (!textElement || textElement.dataset.hnSummaryLinksBound === "true") {
      return;
    }

    textElement.dataset.hnSummaryLinksBound = "true";
    textElement.addEventListener("click", (event) => {
      const refBtn = event.target.closest(".hn-summary-ref");
      if (refBtn) {
        event.preventDefault();
        const ref = refBtn.dataset.ref;
        if (ref) {
          this._resolveAndScrollToRef(ref);
        }
        return;
      }

      let link = event.target.closest('[data-comment-link="true"]');
      if (!link) {
        link = event.target.closest("a[href]");
        if (!link) {
          return;
        }
        if (link.id === "options-page-link" || link.target === "_blank") {
          return;
        }
        const href = link.getAttribute("href") || "";
        const hashMatch = href.match(/^#(\d+)$/);
        if (!hashMatch) {
          return;
        }
        link.dataset.commentLink = "true";
        link.dataset.commentId = hashMatch[1];
      }

      event.preventDefault();
      const comment = this._resolveCommentFromLink(link);
      if (comment) {
        this._scrollAndFlashSummaryTarget(comment);
        const isHN =
          this.enhancer.adapter?.getSiteKey?.() === "news.ycombinator.com";
        if (isHN && comment.querySelector(".hnuser")) {
          this.enhancer.navigation?.setCurrentComment(comment, false);
        }
      } else {
        console.error(
          "Failed to resolve comment for link:",
          link.dataset.commentPath,
          link.dataset.commentId
        );
      }
    });
  }

  /**
   * Resolve a summary ref (e.g. "#1", "post", "P3") to a DOM element and scroll.
   * @param {string} ref
   */
  _resolveAndScrollToRef(ref) {
    // Paragraph ref: [P1], [P2], etc. → query data-para-index on body element
    const paraMatch = ref.match(/^P(\d+)$/);
    if (paraMatch) {
      const bodyEl = this.enhancer.adapter.getPostBodyElement?.();
      if (bodyEl) {
        // Try pre-set data-para-index first (from _formatPostBodyForLLM)
        let paraEl = bodyEl.querySelector(`[data-para-index="${paraMatch[1]}"]`);
        // Fallback: collect <p> elements by 1-based index
        if (!paraEl) {
          const idx = parseInt(paraMatch[1], 10) - 1;
          const paras = bodyEl.querySelectorAll('p');
          if (idx >= 0 && idx < paras.length) {
            paraEl = paras[idx];
          }
        }
        if (paraEl) {
          this._scrollAndFlashSummaryTarget(paraEl);
          return;
        }
      }
      console.warn("Could not find paragraph:", ref);
      return;
    }

    // Strip leading '#' for comment/post refs
    const cleanRef = ref.startsWith('#') ? ref.slice(1) : ref;
    const target = this.enhancer.adapter.resolveBlockByRef(cleanRef);
    if (target) {
      this._scrollAndFlashSummaryTarget(target);
    } else {
      if (cleanRef !== "post" && this._summaryPathMap) {
        const mappedId = this._summaryPathMap.get(cleanRef);
        const el = mappedId
          ? this.enhancer.domUtils.findCommentElementById(String(mappedId))
          : null;
        if (el) {
          this._scrollAndFlashSummaryTarget(el);
          return;
        }
      }
      console.warn("Could not resolve ref:", ref);
    }
  }

  /**
   * Extract comment information
   */
  extractCommentInfo(comment) {
    const itemLinkElement = comment
      .querySelector(".age")
      ?.getElementsByTagName("a")[0];
    if (!itemLinkElement) {
      console.error(
        "Could not find the item link element to get the item id for summarization"
      );
      return {};
    }

    const hnItemId = itemLinkElement.href.split("=")[1];
    const targetCommentId = this.enhancer.domUtils.getCommentId(comment);

    if (!targetCommentId) {
      console.error("Could not get targetCommentId for summarization");
      return {};
    }

    return { hnItemId, targetCommentId };
  }

  /**
   * Prepare comment data for summarization
   */
  prepareCommentData(comment) {
    const commentContext = this.enhancer.domUtils.getCommentContext(comment);
    const descendants = this.enhancer.domUtils.getDescendantComments(comment);
    const allComments = [...commentContext, ...descendants];

    if (!allComments.length) {
      console.error("Could not get the thread for summarization");
      return {};
    }

    const formattedComment = allComments
      .map((comment) =>
        this.enhancer.domUtils.formatCommentForLLM(
          comment,
          comment.path,
          comment.replies,
          comment.score,
          comment.downvotes,
          comment.isTarget
        )
      )
      .join("\n");

    const commentPathToIdMap = new Map();
    allComments.forEach((comment) => {
      commentPathToIdMap.set(comment.path, comment.id);
    });

    return { formattedComment, commentPathToIdMap };
  }

  /**
   * Show loading under Local tab; Server tab stays clickable if cache exists.
   */
  showLoadingMessage(title, metadata, aiProvider, model) {
    const itemId = this.enhancer.domUtils.getCurrentHNItemId();
    const state = this._ensureSummaryViewState(itemId);
    const modelInfo = aiProvider
      ? ` using <strong>${aiProvider} ${model || ""}</strong>`
      : "";
    const statusLine = metadata
      ? `<div class="cached-info" style="margin-bottom:8px;">${metadata}</div>`
      : "";
    state.generating = {
      rawText: "",
      isStreaming: true,
      title: title || "Summary",
      loadingHtml: `${statusLine}<div>Generating summary${modelInfo}... This may take a few moments.<span class="loading-spinner"></span></div>`,
      pathMap: state.pathMap || new Map(),
    };
    // Generation always surfaces under Local (no separate Generating tab)
    state.activeView = "local";
    state.lastMeta = null;
    this._renderSummaryView();

    // Best-effort: fill Local/Server so tabs become clickable mid-generation
    this._seedCachesForTabs(itemId);
  }

  /**
   * Lazily load local/server caches into view state without blocking generation.
   * @param {string} itemId
   */
  async _seedCachesForTabs(itemId) {
    const state = this._ensureSummaryViewState(itemId);
    try {
      const tasks = [];
      if (!state.localCaches?.length) {
        tasks.push(
          this.loadLocalCaches(itemId, {
            selectKey: state.selectedLocalCacheKey,
            selectLatest: !state.selectedLocalCacheKey,
          })
        );
      }
      if (!state.serverCache && this.enhancer.adapter?.supportsServerSummary?.()) {
        tasks.push(
          this.enhancer.getCachedSummary(itemId).then((cache) => {
            if (cache) state.serverCache = cache;
          })
        );
      }
      if (tasks.length === 0) return;
      await Promise.all(tasks);
      this._refreshSourceTabsOnly();
    } catch (error) {
      console.warn("Could not seed summary caches for tabs:", error);
    }
  }

  /**
   * Show summarization not recommended message
   */
  showSummarizationNotRecommended(status, highlightedAuthor) {
    const messageTemplates = {
      title: "Summarization not recommended",
      metadata: {
        [this.SummarizeCheckStatus
          .TEXT_TOO_SHORT]: `Thread too brief to use the selected cloud AI`,
        [this.SummarizeCheckStatus
          .THREAD_TOO_SHALLOW]: `Thread not deep enough to use the selected cloud AI`,
        [this.SummarizeCheckStatus
          .THREAD_TOO_DEEP]: `Thread too deep for the selected AI`,
      },
      text: (status, highlightedAuthor) => {
        const baseMessage =
          status === this.SummarizeCheckStatus.THREAD_TOO_DEEP
            ? `This ${highlightedAuthor} thread is too long or deeply nested to be handled by certain AI providers.`
            : `This ${highlightedAuthor} thread is concise enough to read directly.`;

        return `${baseMessage}<br/><br/>However, if you still want to summarize this thread, you can <a href="#" id="options-page-link">configure another AI provider</a>.`;
      },
    };

    this.enhancer.summaryPanel.updateContent({
      title: messageTemplates.title,
      metadata: messageTemplates.metadata[status],
      text: messageTemplates.text(status, highlightedAuthor),
    });

    this.addOptionsLinkHandler();
  }

  /**
   * Add options link handler
   */
  addOptionsLinkHandler() {
    const optionsLink =
      this.enhancer.summaryPanel.panel.querySelector("#options-page-link");
    if (optionsLink) {
      optionsLink.addEventListener("click", (e) => {
        e.preventDefault();
        this.openOptionsPage();
      });
    }
  }

  /**
   * Checks if text should be summarized based on various criteria
   */
  shouldSummarizeText(formattedText, commentDepth, aiProvider) {
    const sentences = formattedText
      .split(/[.!?]+(?:\s+|$)/)
      .filter((sentence) => sentence.trim().length > 0);

    if (sentences.length <= SUMMARIZATION_CONFIG.LIMITS.MIN_SENTENCE_LENGTH) {
      return { status: this.SummarizeCheckStatus.TEXT_TOO_SHORT };
    }
    if (commentDepth <= SUMMARIZATION_CONFIG.LIMITS.MIN_COMMENT_DEPTH) {
      return { status: this.SummarizeCheckStatus.THREAD_TOO_SHALLOW };
    }

    return { status: this.SummarizeCheckStatus.OK };
  }

  /**
   * Gets AI provider and model from storage
   */
  async getAIProviderModel() {
    return await this.enhancer.apiClient.sendBackgroundMessage(
      "FETCH_AI_SETTINGS"
    );
  }

  /**
   * Saves a summary to cache with current context
   */
  async saveSummaryToCache(
    summary,
    commentPathToIdMap,
    duration,
    targetCommentId = null,
    providerInfo = {}
  ) {
    try {
      const postId = this.enhancer.domUtils.getCurrentHNItemId();
      let { aiProvider, model, language } = providerInfo || {};

      if (!aiProvider || !model || !language) {
        const settings = await this.getAIProviderModel();
        aiProvider = aiProvider || settings.aiProvider;
        model = model || settings.model;
        language = language || settings.language;
      }

      const siteKey = this.enhancer.adapter ? this.enhancer.adapter.getSiteKey() : "news.ycombinator.com";
      const cacheCommentId = this._effectiveSummaryCacheId(targetCommentId);

      if (postId && aiProvider && model && language && summary) {
        const metadata = {
          duration,
          commentCount: commentPathToIdMap?.size || 0,
          timestamp: Date.now(),
          provider: aiProvider,
          model,
          language,
          commentPathToIdMap:
            commentPathToIdMap instanceof Map
              ? Array.from(commentPathToIdMap.entries())
              : [],
        };

        await HNState.saveSummary(
          siteKey,
          postId,
          cacheCommentId,
          aiProvider,
          model,
          language,
          summary,
          metadata
        );

        this.enhancer.logInfo(
          `Saved summary to cache: ${postId}${
            cacheCommentId ? `_${cacheCommentId}` : "_post"
          } (provider=${aiProvider}, model=${model}, language=${language})`
        );

        if (targetCommentId) {
          this.updateCacheIndicatorsForComment(targetCommentId);
        } else {
          // Update post-level indicators when saving post summary
          this.updateCacheIndicatorsForPost();
        }
      }
    } catch (error) {
      console.error("Error saving summary to cache:", error);
    }
  }

  /**
   * Check local cache for summary
   * @param {string} postId - The HN post ID
   * @param {string|null} commentId - Optional comment ID for thread cache
   * @returns {Promise<object|null>} - Cached summary or null
   */
  async checkLocalCache(postId, commentId = null) {
    try {
      const { aiProvider, model, language } = await this.getAIProviderModel();
      if (!aiProvider || !model || !language) return null;
      const siteKey = this.enhancer.adapter ? this.enhancer.adapter.getSiteKey() : "news.ycombinator.com";
      const cacheCommentId = this._effectiveSummaryCacheId(commentId);

      let cached = await HNState.getSummary(
        siteKey,
        postId,
        cacheCommentId,
        aiProvider,
        model,
        language
      );

      // Substack article summaries saved before scope split used `_post` key
      if (!cached && cacheCommentId === "article") {
        cached = await HNState.getSummary(
          siteKey,
          postId,
          null,
          aiProvider,
          model,
          language
        );
      }

      if (cached) {
        this.enhancer.logDebug(`Found local cache for post ${postId}`);
        return cached;
      }
    } catch (error) {
      this.enhancer.logDebug(`No local cache for post ${postId}`);
    }
    return null;
  }

  /**
   * Shows a message to configure AI provider
   */
  showConfigureAIMessage(targetElement = null) {
    const message = `To use the summarization feature, you need to configure an AI provider. <br/><br/>
      Please <a href="#" id="options-page-link">open the settings page</a> to select and configure your preferred AI provider (OpenAI, Anthropic, and others).`;

    const container = targetElement || this.enhancer.summaryPanel.panel;

    if (!container) {
      console.error(
        "Cannot show configure AI message: No target container found."
      );
      return;
    }

    if (targetElement) {
      targetElement.innerHTML = `<div class="chat-message chat-message-system"><strong>System:</strong> ${message}</div>`;
    } else {
      if (!this.enhancer.summaryPanel.isVisible) {
        this.enhancer.summaryPanel.toggle();
      }
      this.enhancer.summaryPanel.updateContent({
        title: "AI Provider Setup Required",
        metadata: "",
        text: message,
      });
    }

    const optionsLink = container.querySelector("#options-page-link");
    if (optionsLink) {
      optionsLink.removeEventListener("click", this._handleOptionsLinkClick);
      optionsLink.addEventListener(
        "click",
        this._handleOptionsLinkClick.bind(this)
      );
    }
  }

  /**
   * Handles the click event for the options page link
   */
  _handleOptionsLinkClick(e) {
    e.preventDefault();
    this.openOptionsPage();
  }

  /**
   * Opens the options page
   */
  openOptionsPage() {
    chrome.runtime
      .sendMessage({ type: "HN_SHOW_OPTIONS", data: {} })
      .catch((error) =>
        console.error("Error sending message to show options:", error)
      );
  }

  /**
   * Gets HN thread data for summarization
   */
  async getHNThread(itemId) {
    try {
      // HN uses the Algolia API to fetch comments; other sites build from DOM
      if (this.enhancer.adapter.constructor.name === 'HnAdapter') {
        return await this._getHNThreadFromAPI(itemId);
      }
      return await this._getThreadFromDOM();
    } catch (error) {
      console.error(`Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gets thread data from HN API (Hacker News only)
   */
  async _getHNThreadFromAPI(itemId) {
    try {
      const commentsJson = await this.enhancer.apiClient.fetchHNCommentsFromAPI(
        itemId
      );
      const commentsInDOM = this.getCommentsFromDOM();
      const enhancedComments = this.enrichPostComments(
        commentsJson,
        commentsInDOM
      );

      const commentPathToIdMap = new Map();
      enhancedComments.forEach((comment, id) => {
        commentPathToIdMap.set(comment.path, id);
      });

      const formattedComment = [...enhancedComments.values()]
        .map(
          (comment) =>
            [
              `[${comment.path}]`,
              `(score: ${comment.score})`,
              `<replies: ${comment.replies}>`,
              `{downvotes: ${comment.downvotes}}`,
              `${comment.author}:`,
              comment.text,
            ].join(" ") + "\n"
        )
        .join("");

      return { formattedComment, commentPathToIdMap };
    } catch (error) {
      console.error(`Error fetching HN thread from API: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gets thread data from DOM using the site adapter (non-HN sites)
   */
  async _getThreadFromDOM() {
    const adapter = this.enhancer.adapter;
    const commentPathToIdMap = new Map();
    const flatComments = [];
    const sections = [];

    // Include post body when adapter says so, with numbered paragraphs for LLM
    if (adapter.shouldIncludePostInSummary?.() !== false) {
      const bodyEl = adapter.getPostBodyElement?.();
      if (bodyEl) {
        const title = adapter.getPostTitle?.() || 'Post';
        const { formattedText, paraMap } = this._formatPostBodyForLLM(bodyEl, title);
        sections.push(formattedText + '\n');
        commentPathToIdMap.set('post', 'post');
        // Also map paragraph refs for jump resolution
        paraMap.forEach((_el, key) => commentPathToIdMap.set(key, key));
      }
    }

    const walkBlocks = (blocks, parentPath = '') => {
      let siblingIndex = 1;
      blocks.forEach((block) => {
        const id = adapter.getBlockId(block);
        if (id == null) return;
        const path = parentPath ? `${parentPath}.${siblingIndex}` : String(siblingIndex);
        const author = adapter.getBlockAuthor(block);
        const text = adapter.getBlockText(block);

        flatComments.push({
          id,
          path,
          author,
          text,
        });
        commentPathToIdMap.set(path, String(id));

        const children = adapter.getChildBlocks(block);
        if (children && children.length > 0) {
          walkBlocks(children, path);
        }
        siblingIndex++;
      });
    };

    const topBlocks = adapter.getCommentBlocks();
    walkBlocks(topBlocks);

    if (flatComments.length > 0) {
      sections.push(
        flatComments
          .map(
            (comment) =>
              `[${comment.path}] ${comment.author}: ${comment.text}\n`
          )
          .join("")
      );
    }

    return { formattedComment: sections.join("\n"), commentPathToIdMap };
  }

  /**
   * Gets comments from the DOM
   */
  getCommentsFromDOM() {
    const commentsInDOM = new Map();
    const commentRows = document.querySelectorAll(".comtr");

    let skippedComments = 0;
    commentRows.forEach((commentRow, index) => {
      const commentFlagged =
        commentRow.classList.contains("coll") ||
        commentRow.classList.contains("noshow");
      const commentTextDiv = commentRow.querySelector(".commtext");

      if (commentFlagged || !commentTextDiv) {
        skippedComments++;
        return;
      }

      const commentText = this.sanitizeCommentText(commentTextDiv);
      const downvotes = this.enhancer.domUtils.getDownvoteCount(commentTextDiv);
      const commentId = commentRow.getAttribute("id");

      commentsInDOM.set(Number(commentId), {
        position: index,
        text: commentText,
        downvotes: downvotes,
      });
    });

    this.enhancer.logDebug(
      `Comments from DOM:: Total: ${commentRows.length}. Skipped (flagged): ${skippedComments}. Remaining: ${commentsInDOM.size}`
    );

    return commentsInDOM;
  }

  /**
   * Sanitize comment text
   */
  sanitizeCommentText(commentTextDiv) {
    const tempDiv = commentTextDiv.cloneNode(true);

    // Remove unwanted HTML elements
    [...tempDiv.querySelectorAll("a, code, pre")].forEach((element) =>
      element.remove()
    );

    // Replace <p> tags with their text content
    tempDiv.querySelectorAll("p").forEach((p) => {
      p.replaceWith(p.textContent);
    });

    // Decode HTML entities
    const txt = document.createElement("textarea");
    txt.innerHTML = tempDiv.innerHTML;
    return txt.value.replace(/\n+/g, " ");
  }

  /**
   * Enriches post comments with additional metadata
   */
  enrichPostComments(commentsTree, commentsInDOM) {
    let flatComments = new Map();

    let apiComments = 0;
    let skippedComments = 0;

    const flattenCommentTree = (comment, parentId) => {
      apiComments++;

      if (comment.type === "story") {
        if (comment.children && comment.children.length > 0) {
          comment.children.forEach((child) => flattenCommentTree(child, null));
        }
        return;
      }

      const commentInDOM = commentsInDOM.get(comment.id);
      if (!commentInDOM) {
        skippedComments++;
        return;
      }

      flatComments.set(comment.id, {
        id: comment.id,
        author: comment.author,
        replies: comment.children?.length || 0,
        position: commentInDOM.position,
        text: commentInDOM.text,
        downvotes: commentInDOM.downvotes,
        parentId: parentId,
      });

      if (comment.children && comment.children.length > 0) {
        comment.children.forEach((child) =>
          flattenCommentTree(child, comment.id)
        );
      }
    };

    flattenCommentTree(commentsTree, null);

    this.enhancer.logDebug(
      `Comments from API:: Total: ${
        apiComments - 1
      }. Skipped: ${skippedComments}. Remaining: ${flatComments.size}`
    );

    // Sort by position and calculate paths and scores
    const enrichedComments = new Map(
      [...flatComments.entries()].sort((a, b) => a[1].position - b[1].position)
    );

    this.calculatePathsAndScores(enrichedComments);
    return enrichedComments;
  }

  /**
   * Calculate paths and scores for comments
   */
  calculatePathsAndScores(enrichedComments) {
    let topLevelCounter = 1;

    const calculatePath = (comment) => {
      if (!comment.parentId) {
        return String(topLevelCounter++);
      } else {
        const parentPath = enrichedComments.get(comment.parentId).path;
        const siblings = [...enrichedComments.values()].filter(
          (c) => c.parentId === comment.parentId
        );
        const positionInParent =
          siblings.findIndex((c) => c.id === comment.id) + 1;
        return `${parentPath}.${positionInParent}`;
      }
    };

    const calculateScore = (comment, totalCommentCount) => {
      const downvotes = comment.downvotes || 0;
      const defaultScore = Math.floor(
        SUMMARIZATION_CONFIG.LIMITS.MAX_SCORE -
          (comment.position * SUMMARIZATION_CONFIG.LIMITS.MAX_SCORE) /
            totalCommentCount
      );
      const penaltyPerDownvote =
        defaultScore / SUMMARIZATION_CONFIG.LIMITS.MAX_DOWNVOTES;
      const penalty = penaltyPerDownvote * downvotes;
      return Math.floor(Math.max(defaultScore - penalty, 0));
    };

    enrichedComments.forEach((comment) => {
      comment.path = calculatePath(comment);
      comment.score = calculateScore(comment, enrichedComments.size);
    });
  }

  /**
   * Summarizes text using the selected AI provider
   */
  async summarizeTextWithAI(
    formattedComment,
    commentPathToIdMap,
    hnItemId = null,
    targetCommentId = null,
    isPostSummary = false,
    skipCache = false
  ) {
    try {
      const data = await chrome.storage.sync.get("settings");
      const providerSelection = data.settings?.providerSelection;
      const streamingEnabled = data.settings?.streamingEnabled || false;

      if (!providerSelection) {
        this.showConfigureAIMessage();
        return;
      }

      const postId = this.enhancer.domUtils.getCurrentHNItemId();

      if (!skipCache) {
        const cachedSummary = await this.checkCachedSummary(
          postId,
          targetCommentId,
          providerSelection
        );

        if (cachedSummary) {
          await this.displayCachedSummary(cachedSummary, commentPathToIdMap);
          return;
        }
      }

      // Remove unnecessary anchor tags
      formattedComment =
        this.enhancer.markdownUtils.stripAnchors(formattedComment);

      // Set summary mode so prompts can adapt (post-only vs comments)
      this._summaryMode = isPostSummary ? 'post' : null;

      // Call appropriate AI provider
      await this.callAIProvider(
        providerSelection,
        formattedComment,
        commentPathToIdMap,
        streamingEnabled,
        targetCommentId,
        data.settings
      );
    } catch (error) {
      this.handleError("Error fetching settings", error);
    } finally {
      this._summaryMode = null;
    }
  }

  /**
   * Check for cached summary
   */
  async checkCachedSummary(postId, targetCommentId, providerSelection) {
    const { model, language } = await this.getAIProviderModel();

    this.enhancer.logDebug(
      `Looking for cached summary: postId=${postId}, commentId=${targetCommentId}, provider=${providerSelection}, model=${model}, language=${language}`
    );

    const siteKey = this.enhancer.adapter ? this.enhancer.adapter.getSiteKey() : "news.ycombinator.com";
    const cacheCommentId = this._effectiveSummaryCacheId(targetCommentId);

    const cachedSummary = await HNState.getSummary(
      siteKey,
      postId,
      cacheCommentId,
      providerSelection,
      model,
      language
    );

    this.enhancer.logDebug(
      `Cache lookup result: ${cachedSummary ? "FOUND" : "NOT FOUND"}`
    );

    return cachedSummary;
  }

  /**
   * Display cached summary
   */
  async displayCachedSummary(cachedSummary, commentPathToIdMap) {
    this.enhancer.logInfo(`Using cached summary`);

    const cacheAge = Math.round(
      (Date.now() - cachedSummary.timestamp) / (1000 * 60)
    );
    const cacheIndicator = `<span class="cache-indicator">📋 Cached (${cacheAge}m ago)</span>`;

    const postId = this.enhancer.domUtils.getCurrentHNItemId();
    const pathMap = await this._getCommentPathToIdMap(
      postId,
      cachedSummary.metadata
    );

    await this.showSummaryInPanel(
      cachedSummary.summary,
      pathMap,
      cachedSummary.metadata?.duration,
      {
        cacheIndicator,
        aiProvider: cachedSummary.provider,
        model: cachedSummary.model,
        language: cachedSummary.language,
      }
    );
  }

  /**
   * Call appropriate AI provider
   */
  async callAIProvider(
    providerSelection,
    formattedComment,
    commentPathToIdMap,
    streamingEnabled,
    targetCommentId,
    settings
  ) {
    const model = settings?.[providerSelection]?.model;
    const apiKey = settings?.[providerSelection]?.apiKey;
    const language = settings?.language || "en";

    this.enhancer.logInfo(
      `Summarization - AI Provider: ${providerSelection}, Model: ${
        model || "none"
      }, Streaming: ${streamingEnabled}`
    );

    const providers = {
      openai: () =>
        this.summarizeUsingProvider(
          providerSelection,
          "OPENAI_API_REQUEST",
          formattedComment,
          model,
          apiKey,
          commentPathToIdMap,
          streamingEnabled,
          targetCommentId,
          false,
          language
        ),
      anthropic: () =>
        this.summarizeUsingProvider(
          providerSelection,
          "ANTHROPIC_API_REQUEST",
          formattedComment,
          model,
          apiKey,
          commentPathToIdMap,
          streamingEnabled,
          targetCommentId,
          true,
          language
        ),
      deepseek: () =>
        this.summarizeUsingProvider(
          providerSelection,
          "DEEPSEEK_API_REQUEST",
          formattedComment,
          model,
          apiKey,
          commentPathToIdMap,
          false,
          targetCommentId,
          false,
          language
        ),
      gemini: () =>
        this.summarizeUsingGemini(
          formattedComment,
          model,
          commentPathToIdMap,
          targetCommentId,
          language
        ),
      "openai-router": () =>
        this.summarizeUsingProvider(
          providerSelection,
          "OPENAI_ROUTER_API_REQUEST",
          formattedComment,
          model,
          apiKey,
          commentPathToIdMap,
          streamingEnabled,
          targetCommentId,
          false,
          language,
          true
        ),
      none: () =>
        this.showSummaryInPanel(formattedComment, commentPathToIdMap, 0, {
          aiProvider: providerSelection,
          model,
          language,
        }),
    };

    const providerFunction = providers[providerSelection];
    if (providerFunction) {
      await providerFunction();
    } else {
      throw new Error(`Unknown provider: ${providerSelection}`);
    }
  }

  /**
   * Generic method for most AI providers
   */
  async summarizeUsingProvider(
    providerName,
    messageType,
    text,
    model,
    apiKey,
    commentPathToIdMap,
    streamingEnabled = false,
    targetCommentId = null,
    isAnthropic = false,
    language = "en",
    isRouter = false
  ) {
    // Validate required parameters
    const requiredParams =
      isAnthropic || isRouter
        ? [text, model]
        : [text, model, apiKey];
    if (requiredParams.some((param) => !param)) {
      this.showError("Missing API configuration");
      return;
    }

    try {
      const { maxTokens, routerUrl } = await this.getAIProviderModel();
      const tokenLimitText = this.splitInputTextAtTokenLimit(text, maxTokens);
      const { systemPrompt, userPrompt } = await this.preparePrompts(
        tokenLimitText
      );

      const requestData = this.buildRequestData(
        messageType,
        systemPrompt,
        userPrompt,
        model,
        apiKey,
        maxTokens,
        streamingEnabled,
        isAnthropic,
        isRouter,
        routerUrl
      );

      if (streamingEnabled && messageType !== "DEEPSEEK_API_REQUEST") {
        await this.handleStreamingResponse(
          messageType,
          requestData,
          commentPathToIdMap,
          targetCommentId,
          { aiProvider: providerName, model, language }
        );
      } else {
        const response = await this.enhancer.apiClient.sendBackgroundMessage(
          messageType,
          requestData
        );
        const summary = this.extractSummaryFromResponse(response, isAnthropic);

        await this.saveSummaryToCache(
          summary,
          commentPathToIdMap,
          response.duration,
          targetCommentId,
          { aiProvider: providerName, model, language }
        );
        await this.showSummaryInPanel(
          summary,
          commentPathToIdMap,
          response.duration,
          { aiProvider: providerName, model, language }
        );
      }
    } catch (error) {
      this.handleProviderError(error, messageType, model);
    }
  }

  /**
   * Prepare prompts for AI
   */
  async preparePrompts(text) {
    const isPostOnly = this._summaryMode === 'post';
    const systemPrompt = isPostOnly
      ? (this.enhancer.adapter.getPostSummarySystemMessage?.() ?? this.getSystemMessage())
      : this.getSystemMessage();
    const postTitle = this.enhancer.domUtils.getHNPostTitle();
    const userPrompt = isPostOnly
      ? await this._getPostSummaryUserMessage(postTitle, text)
      : await this.getUserMessage(postTitle, text);
    return { systemPrompt, userPrompt };
  }

  /**
   * User message template for post-body-only summaries.
   */
  async _getPostSummaryUserMessage(title, text) {
    const { language } = await this.getAIProviderModel();
    let languageInstruction = '';
    if (language !== 'en') {
      languageInstruction =
        SUMMARIZATION_CONFIG.LANGUAGE_INSTRUCTIONS[language] || '';
    }
    const template = this.enhancer.adapter.getPostSummaryUserMessageTemplate?.()
      ?? `Provide a concise summary of the following article. Capture the main thesis, key arguments, and structure. `
       + `Use [P#] notation to reference specific paragraphs.`;
    return `${template}

Article (numbered paragraphs):
---
${title}
---
${text}
---
${languageInstruction}`;
  }

  /**
   * Build request data for AI provider
   */
  buildRequestData(
    messageType,
    systemPrompt,
    userPrompt,
    model,
    apiKey,
    maxTokens,
    streamingEnabled,
    isAnthropic,
    isRouter = false,
    routerUrl = "http://127.0.0.1:4000"
  ) {
    const baseData = {
      apiKey,
      model,
      streaming: streamingEnabled,
      ...(messageType !== "OPENAI_ROUTER_API_REQUEST" && { max_tokens: maxTokens }),
      ...(isRouter && { url: routerUrl }),
      include_usage: true,
    };

    if (isAnthropic) {
      return {
        ...baseData,
        messages: [{ role: "user", content: userPrompt }],
        system: systemPrompt,
      };
    } else {
      return {
        ...baseData,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      };
    }
  }

  /**
   * Extract summary from API response
   */
  extractSummaryFromResponse(response, isAnthropic = false) {
    if (isAnthropic) {
      if (!response?.content?.[0]?.text) {
        throw new Error("No summary generated from API response");
      }
      return response.content[0].text;
    } else {
      if (!response?.choices?.[0]?.message?.content) {
        throw new Error("No summary generated from API response");
      }
      return response.choices[0].message.content;
    }
  }

  /**
   * Handle provider-specific errors
   */
  handleProviderError(error, messageType, model) {
    console.error(`Error in ${messageType} summarization:`, error);

    let errorMessage = `Error generating summary using ${
      messageType.split("_")[0]
    } model ${model}. `;

    if (error.message.includes("API key")) {
      errorMessage += "Please check your API key configuration.";
    } else if (error.message.includes("429")) {
      errorMessage += "Rate limit exceeded. Please try again later.";
    } else if (error.message.includes("current quota")) {
      errorMessage += "API quota exceeded. Please try again later.";
    } else if (
      error.message.includes("Connection refused") ||
      error.message.includes("ECONNREFUSED")
    ) {
      errorMessage += "Server is not running. Please check the connection.";
    } else if (error.message.includes("404")) {
      errorMessage +=
        "Model not found. Please check if the model is available.";
    } else {
      errorMessage += error.message + " Please try again later.";
    }

    this.showError(errorMessage);
  }

  /**
   * Summarizes text using Gemini (special handling)
   */
  async summarizeUsingGemini(
    text,
    model,
    commentPathToIdMap,
    targetCommentId = null,
    language = "en"
  ) {
    const data = await chrome.storage.sync.get("settings");
    const apiKey = data.settings?.gemini?.apiKey;

    if (!text || !model || !apiKey) {
      this.showError("Missing API configuration for Gemini");
      return;
    }

    try {
      const { maxTokens } = await this.getAIProviderModel();
      const tokenLimitText = this.splitInputTextAtTokenLimit(text, maxTokens);
      const { systemPrompt, userPrompt } = await this.preparePrompts(
        tokenLimitText
      );

      const response = await this.enhancer.apiClient.sendBackgroundMessage(
        "GEMINI_API_REQUEST",
        {
          apiKey,
          model,
          systemPrompt,
          userPrompt,
          max_tokens: maxTokens,
        }
      );

      if (!response) {
        throw new Error("No response from Gemini API");
      }

      let summary;
      if (response.choices?.[0]?.message?.content) {
        summary = response.choices[0].message.content;
      } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
        summary = response.candidates[0].content.parts[0].text;
      } else {
        throw new Error("Invalid response format from Gemini API");
      }

      await this.saveSummaryToCache(
        summary,
        commentPathToIdMap,
        response.duration,
        targetCommentId,
        { aiProvider: "gemini", model, language }
      );
      await this.showSummaryInPanel(
        summary,
        commentPathToIdMap,
        response.duration,
        { aiProvider: "gemini", model, language }
      );
    } catch (error) {
      this.handleProviderError(error, "GEMINI_API_REQUEST", model);
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    this.enhancer.summaryPanel.updateContent({
      title: "Error",
      text: message,
    });
  }

  /**
   * Handle general errors
   */
  handleError(context, error) {
    console.error(context, error);
    this.enhancer.summaryPanel.updateContent({
      title: "Error",
      metadata: "",
      text: `${context}: ${error.message}`,
    });
  }

  /**
   * Gets the system message for AI summarization
   */
  getSystemMessage() {
    return this.enhancer.adapter.getSystemMessage();
  }

  /**
   * Splits input text at token limit
   */
  splitInputTextAtTokenLimit(text, tokenLimit) {
    if (
      text.length * SUMMARIZATION_CONFIG.LIMITS.TOKENS_PER_CHAR <
      tokenLimit
    ) {
      return text;
    }

    const lines = text.split("\n");
    let outputText = "";
    let currentTokenCount = 0;

    for (const line of lines) {
      const lineTokenCount =
        line.length * SUMMARIZATION_CONFIG.LIMITS.TOKENS_PER_CHAR;
      if (currentTokenCount + lineTokenCount >= tokenLimit) {
        break;
      }
      outputText += line + "\n";
      currentTokenCount += lineTokenCount;
    }

    return outputText;
  }

  /**
   * Gets the user message for AI summarization
   */
  async getUserMessage(title, text) {
    const { language } = await this.getAIProviderModel();

    let languageInstruction = "";
    if (language !== "en") {
      languageInstruction =
        SUMMARIZATION_CONFIG.LANGUAGE_INSTRUCTIONS[language] || "";
    }

    const template = this.enhancer.adapter.getUserMessageTemplate();
    return `${template}
The post title and comments are separated by three dashed lines:
---
Post Title:
${title}
---
Comments:
${text}
---
${languageInstruction}`;
  }

  /**
   * Handles streaming responses from AI providers
   */
  async handleStreamingResponse(
    messageType,
    requestData,
    commentPathToIdMap,
    targetCommentId = null,
    metadata = {}
  ) {
    let accumulatedText = "";
    let lastUpdateTime = 0;

    // Stream into Local; keep Server tab available if cache exists
    const itemId = this.enhancer.domUtils.getCurrentHNItemId();
    const state = this._ensureSummaryViewState(itemId);
    state.generating = {
      rawText: "",
      isStreaming: true,
      title: state.generating?.title || "Thread Summary",
      loadingHtml: `<div>Generating summary... <span class="loading-spinner"></span></div>`,
      pathMap: commentPathToIdMap,
    };
    // Stay on Server if user is viewing it; otherwise show Local stream
    if (state.activeView === "server" && state.serverCache) {
      this._refreshSourceTabsOnly();
    } else {
      state.activeView = "local";
      this._renderSummaryView();
    }

    const streamingPromise = new Promise((resolve, reject) => {
      const messageListener = (message) => {
        if (message.type === `${messageType}_STREAM_CHUNK`) {
          const chunk = message.data;
          let content = "";

          if (
            messageType === "OPENAI_API_REQUEST" ||
            messageType === "OPENAI_ROUTER_API_REQUEST"
          ) {
            content = chunk.choices?.[0]?.delta?.content || "";
          } else if (messageType === "ANTHROPIC_API_REQUEST") {
            if (chunk.type === "content_block_delta") {
              content = chunk.delta?.text || "";
            }
          }

          if (content) {
            accumulatedText += content;
            const now = Date.now();
            if (
              now - lastUpdateTime >
              SUMMARIZATION_CONFIG.LIMITS.UPDATE_INTERVAL
            ) {
              this.updateStreamingUI(accumulatedText, commentPathToIdMap);
              lastUpdateTime = now;
            }
          }

          if (chunk.choices?.[0]?.finish_reason === "stop") {
            resolve();
          }
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);

      this.enhancer.apiClient
        .sendBackgroundMessage(messageType, requestData)
        .then((response) => {
          if (response && response.done) {
            resolve();
          } else if (response && !response.success) {
            reject(
              new Error(
                response.error || "Unknown error from background script"
              )
            );
          } else {
            resolve();
          }
        })
        .catch(reject)
        .finally(() => {
          chrome.runtime.onMessage.removeListener(messageListener);
        });
    });

    try {
      await streamingPromise;
    } catch (error) {
      console.error("Error during streaming:", error);
      const errState = this._ensureSummaryViewState(itemId);
      errState.generating = {
        rawText: "",
        isStreaming: false,
        title: "Error",
        loadingHtml: `<div>Error generating streaming summary: ${error.message}</div>`,
        pathMap: commentPathToIdMap,
      };
      errState.activeView = "local";
      await this._renderSummaryView();
      return;
    }

    this.updateStreamingUI(accumulatedText, commentPathToIdMap, true);
    await this.saveSummaryToCache(
      accumulatedText,
      commentPathToIdMap,
      0,
      targetCommentId,
      metadata
    );
    await this.showSummaryInPanel(accumulatedText, commentPathToIdMap, 0, metadata);
  }

  /**
   * Updates the UI with streaming content under Local.
   * If user is on Server, keep streaming in state only and refresh tab labels.
   */
  updateStreamingUI(text, commentPathToIdMap, isFinal = false) {
    const itemId = this.enhancer.domUtils.getCurrentHNItemId();
    const state = this._ensureSummaryViewState(itemId);
    state.generating = {
      rawText: text,
      isStreaming: !isFinal,
      title: state.generating?.title || "Thread Summary",
      loadingHtml: null,
      pathMap: commentPathToIdMap,
    };
    state.pathMap = commentPathToIdMap;

    if (state.activeView !== "local") {
      this._refreshSourceTabsOnly();
      return;
    }

    const formattedSummary = this._formatSummaryHtml(text, commentPathToIdMap);
    const textElement =
      this.enhancer.summaryPanel.panel?.querySelector(".summary-text");
    if (textElement) {
      textElement.innerHTML = formattedSummary + (isFinal ? "" : "...");
    } else {
      this._renderSummaryView();
    }

    this._bindSummaryCommentLinks();
    if (!isFinal) {
      this._refreshSourceTabsOnly();
    }
  }

  /**
   * Shows the summary in the summary panel (keeps source tabs).
   */
  async showSummaryInPanel(
    summary,
    commentPathToIdMap,
    duration,
    options = {}
  ) {
    const {
      cacheIndicator = null,
      aiProvider: providedProvider,
      model: providedModel,
      language: providedLanguage,
    } = options || {};

    let aiProvider = providedProvider;
    let model = providedModel;
    let language = providedLanguage;

    if (!aiProvider || !model || !language) {
      const settings = await this.getAIProviderModel();
      aiProvider = aiProvider || settings.aiProvider;
      model = model || settings.model;
      language = language || settings.language;
    }

    const itemId = this.enhancer.domUtils.getCurrentHNItemId();
    const state = this._ensureSummaryViewState(itemId);

    state.generating = {
      rawText: summary,
      isStreaming: false,
      title: state.generating?.title || "Thread Summary",
      loadingHtml: null,
      pathMap: commentPathToIdMap,
    };
    state.pathMap = commentPathToIdMap;
    state.lastMeta = {
      aiProvider,
      model,
      language,
      duration: duration ?? "0",
      generatedAt: Date.now(),
      cacheIndicator,
    };

    // Finished stream: clear generating flag so Local shows saved cache
    state.generating = null;

    // Stay on Local for new result; refresh model list and select this generation
    if (state.activeView !== "server") {
      state.activeView = "local";
    }
    await this.loadLocalCaches(itemId, {
      selectKey: `${aiProvider}:${model}:${language}`,
      selectLatest: false,
    });

    await this._renderSummaryView();
  }

  /**
   * Gets the language name from language code
   */
  getLanguageName(language) {
    return SUMMARIZATION_CONFIG.LANGUAGE_NAMES[language] || language;
  }

  /**
   * Updates cache indicators for a specific comment
   */
  async updateCacheIndicatorsForComment(commentId) {
    try {
      const commentElement =
        this.enhancer.domUtils.findCommentElementById(commentId);
      if (commentElement) {
        const existingIndicators =
          commentElement.querySelector(".cache-indicators");
        if (existingIndicators) {
          existingIndicators.remove();
        }
        await this.enhancer.addCacheIndicators(commentElement);
      }
    } catch (error) {
      console.error("Error updating cache indicators:", error);
    }
  }

  /**
   * Updates cache indicators for the post
   */
  async updateCacheIndicatorsForPost() {
    try {
      const sublineElement = document.querySelector(".subtext .subline");
      if (sublineElement) {
        const existingIndicators =
          sublineElement.querySelector(".cache-indicators");
        if (existingIndicators) {
          existingIndicators.remove();
        }
        await this.enhancer.addCacheIndicators(); // Call without comment parameter for post-level
      }
    } catch (error) {
      console.error("Error updating post cache indicators:", error);
    }
  }
}

// Make the class available globally
window.Summarization = Summarization;
