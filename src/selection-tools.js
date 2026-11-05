/**
 * SelectionTools — independent selection toolbar + lookup popup.
 *
 * Replaces the Summarize/Chat/Save selection FAB with two compact actions
 * ("翻译 / 解读" and "保存") plus a fixed-size lookup popup. Entirely
 * self-contained: shadow-root isolated UI, own listeners/timers/RAF, and a
 * generation counter that invalidates stale async results.
 *
 * Interface (invoked by HNEnhancer):
 *   const tools = new SelectionTools(enhancer);
 *   tools.mount();   // install listeners (idempotent)
 *   tools.reset();   // dismiss UI + invalidate pending async (SPA URL change)
 *   tools.dispose(); // remove all DOM / listeners / timers / RAF
 *
 * Enhancer contract:
 *   async enhancer.lookupSelectedText(snapshot) -> string  // AI translate/interpret
 *   enhancer.saveSelectedText(text, snapshot) -> boolean   // already toasts
 *
 * Snapshot shape (immutable, captured BEFORE the selection is lost):
 *   { text, pageUrl, postTitle, siteKey, postId, context, rect }
 *
 * Scope guard: this module never invokes summarization/chat, never calls
 * adapter.setSelectionOverride, and never mutates summary/chat history/cache.
 * All dynamic data is rendered via textContent — page/model HTML is never
 * injected (the only element with dynamic href is the source anchor, gated to
 * http/https and set via the href property).
 */
class SelectionTools {
    static MAX_LOOKUP_CHARS = 12000;
    static LOOKUP_TIMEOUT_MS = 90 * 1000;
    static CONTEXT_CHARS = 1600;
    static CACHE_LIMIT = 8; // FIFO cap on the in-memory result cache
    static POPUP_WIDTH = 440;
    static POPUP_HEIGHT = 430;
    static EDGE = 8; // viewport margin for clamping
    // Nearest semantic block candidates for context extraction.
    static BLOCK_TAGS = /^(P|LI|DD|DT|BLOCKQUOTE|PRE|TD|TH|CAPTION|FIGCAPTION|H[1-6]|DIV|SECTION|ARTICLE)$/;
    // Extension-owned UI whose selections must be ignored.
    static EXT_UI_SELECTOR = [
        ".hn-hub-panel", "#hn-enhancer-chat-modal", ".summary-panel",
        ".keyboard-help-modal", ".hn-extract-panel", ".hn-save-toast",
        ".hn-selection-fab", ".hn-selection-lookup",
    ].join(", ");

    constructor(enhancer) {
        this.enhancer = enhancer;

        this._mounted = false;
        this._disposed = false;
        this._generation = 0; // bumped by reset(); guards all async UI updates

        // Toolbar / popup hosts + closed shadow roots
        this._toolbarHost = null;
        this._toolbarRoot = null;
        this._toolbarVisible = false;
        this._toolbarText = null;
        this._toolbarRectKey = null;
        this._popupHost = null;
        this._popupRoot = null;
        this._popupOpen = false;
        this._dialog = null;
        this._els = null; // popup element refs

        // Selection state
        this._snapshot = null; // frozen snapshot for the current toolbar/popup
        this._endRect = null; // viewport-space rect near the selection end
        this._isDragging = false; // mouse is down outside our UI (drag-select)
        this._pointerInComponent = false; // pointer interaction inside our UI

        // In-memory lookup cache: cacheKey -> {status, output, promise}
        this._lookupCache = new Map();

        // Cleanup registries
        this._listeners = []; // {target, type, fn, opts}
        this._timers = new Set();
        this._raf = 0;
        this._selChangeTimer = 0;
        this._prevFocus = null;

        // Bound handlers (stable refs so dispose() can remove them)
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onSelectionChange = this._onSelectionChange.bind(this);
        this._onScroll = this._onScroll.bind(this);
        this._onResize = this._onResize.bind(this);
        this._maybeShowToolbar = this._maybeShowToolbar.bind(this);
    }

    /** Install document/window listeners. Idempotent. */
    mount() {
        if (this._mounted || this._disposed) return;
        this._mounted = true;
        this._on(window, "keydown", this._onKeyDown, true);
        this._on(window, "keyup", this._onKeyUp, false);
        this._on(window, "mousedown", this._onPointerDown, true);
        this._on(window, "mouseup", this._onMouseUp, true);
        this._on(document, "selectionchange", this._onSelectionChange, false);
        this._on(document, "scroll", this._onScroll, { capture: true, passive: true });
        this._on(window, "resize", this._onResize, false);
    }

    /**
     * Dismiss all UI and invalidate pending async work (e.g. SPA URL change).
     * Listeners stay installed; call dispose() to fully tear down.
     */
    reset() {
        this._generation++;
        this._cancelScheduledWork();
        this.hideToolbar();
        this._closePopup(false);
        this._isDragging = false;
        this._pointerInComponent = false;
        this._snapshot = null;
        this._endRect = null;
        // In-flight lookups can no longer render into a new session; mark them
        // cancelled so a later reopen retries instead of reattaching a dead
        // request that would leave the entry stuck in "loading" forever.
        this._lookupCache.forEach((entry) => {
            if (entry.status === "loading") {
                entry.status = "error";
                entry.output = "已取消";
                entry.promise = null;
            }
        });
    }

    /** Full teardown: DOM, listeners, timers, RAF. */
    dispose() {
        if (this._disposed) return;
        this._disposed = true;
        this._generation++;
        this._cancelScheduledWork();
        this.hideToolbar();
        this._closePopup(false);
        this._snapshot = null;
        this._endRect = null;
        this._lookupCache.clear();
        this._listeners.forEach(({ target, type, fn, opts }) =>
            target.removeEventListener(type, fn, opts)
        );
        this._listeners = [];
        if (this._toolbarHost) { this._toolbarHost.remove(); this._toolbarHost = null; }
        if (this._popupHost) { this._popupHost.remove(); this._popupHost = null; }
        this._toolbarRoot = null;
        this._popupRoot = null;
        this._dialog = null;
        this._els = null;
    }

    // ------------------------------------------------------------------
    // Listener / timer helpers
    // ------------------------------------------------------------------

    _on(target, type, fn, opts) {
        target.addEventListener(type, fn, opts);
        this._listeners.push({ target, type, fn, opts });
    }

    _setTimeout(fn, ms) {
        const id = setTimeout(() => { this._timers.delete(id); fn(); }, ms);
        this._timers.add(id);
        return id;
    }

    _clearTimeout(id) {
        clearTimeout(id);
        this._timers.delete(id);
    }

    /** Sweep ALL scheduled work: selection timer, RAF, lookup + feedback timers. */
    _cancelScheduledWork() {
        this._clearTimeout(this._selChangeTimer);
        if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
        this._timers.forEach((id) => clearTimeout(id));
        this._timers.clear();
    }

    // ------------------------------------------------------------------
    // Event handlers
    // ------------------------------------------------------------------

    _onSelectionChange() {
        // Coalesce rapid selectionchange bursts (mouse drag / keyboard).
        this._clearTimeout(this._selChangeTimer);
        this._selChangeTimer = this._setTimeout(() => {
            this._selChangeTimer = 0;
            if (!this._isDragging && !this._pointerInComponent) this._maybeShowToolbar();
        }, 200);
    }

    _onKeyUp(e) {
        // Keyboard-driven selections (Shift+Arrow etc.)
        if (e.key === "Shift" || e.key.startsWith("Arrow")) this._scheduleShow();
    }

    _onPointerDown(e) {
        const path = typeof e.composedPath === "function" ? e.composedPath() : [];
        if (this._toolbarHost && path.includes(this._toolbarHost)) {
            this._pointerInComponent = true;
            return;
        }
        if (this._popupHost && path.includes(this._popupHost)) {
            this._pointerInComponent = true;
            return;
        }
        this._pointerInComponent = false;
        this._isDragging = true;
        // Outside interaction: dismiss toolbar; popup stays open until its own
        // dismiss rules, but outside mousedown closes it too (without blocking
        // the new selection, so the user can immediately drag-select again).
        if (this._toolbarVisible) this.hideToolbar();
        if (this._popupOpen) this._closePopup(true);
    }

    _onMouseUp(e) {
        const path = typeof e.composedPath === "function" ? e.composedPath() : [];
        const inComponent =
            (this._toolbarHost && path.includes(this._toolbarHost)) ||
            (this._popupHost && path.includes(this._popupHost));
        this._isDragging = false;
        if (this._pointerInComponent && inComponent) return;
        this._pointerInComponent = false;
        this._scheduleShow();
    }

    _onScroll() {
        // scroll events don't bubble but are caught in the capture phase
        if (this._toolbarVisible) this.hideToolbar();
    }

    _onResize() {
        if (this._toolbarVisible) this._positionToolbar();
        if (this._popupOpen) this._positionPopup();
    }

    _onKeyDown(e) {
        if (e.key !== "Escape") {
            // Suppress page shortcuts while focus is inside our popup (e.g. HN
            // j/k navigation must not run while the user types/scrolls here).
            if (
                this._popupOpen &&
                document.activeElement === this._popupHost &&
                !e.metaKey && !e.ctrlKey && !e.altKey
            ) {
                e.stopPropagation();
            }
            return;
        }
        const focusInsidePopup =
            this._popupOpen && document.activeElement === this._popupHost;
        if (this._popupOpen) {
            if (focusInsidePopup) { e.preventDefault(); e.stopPropagation(); }
            this._closePopup(true);
            return;
        }
        if (this._toolbarVisible) {
            const focusInsideToolbar = document.activeElement === this._toolbarHost;
            this.hideToolbar();
            if (focusInsideToolbar) { e.preventDefault(); e.stopPropagation(); }
        }
    }

    // ------------------------------------------------------------------
    // Selection capture / validation
    // ------------------------------------------------------------------

    _scheduleShow() {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = requestAnimationFrame(() => {
            this._raf = 0;
            this._maybeShowToolbar();
        });
    }

    _maybeShowToolbar() {
        if (this._disposed || this._popupOpen) return;
        if (this._isDragging || this._pointerInComponent) return;
        const found = this._getValidSelection();
        if (!found) { this.hideToolbar(); return; }

        // Avoid rebuilding for the same selection at the same spot
        const rectKey = `${Math.round(found.endRect.top)},${Math.round(found.endRect.left)}`;
        if (this._toolbarVisible && this._toolbarText === found.text && this._toolbarRectKey === rectKey) return;

        const snapshot = this._buildSnapshot(found.range, found.text, found.unionRect);
        if (!snapshot) return;
        this._snapshot = snapshot;
        this._endRect = found.endRect;
        this._showToolbar();
        this._toolbarRectKey = rectKey;
    }

    /**
     * Validate the current selection. Returns {text, range, endRect, unionRect}
     * in viewport coordinates, or null when the selection must be ignored.
     */
    _getValidSelection() {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
        const text = sel.toString().trim();
        if (!text) return null;

        const range = sel.getRangeAt(0);
        if (range.collapsed) return null;

        // Selections whose endpoints are inside shadow roots report null nodes
        // (e.g. selecting text inside our own popup) — ignore those.
        if (!range.startContainer || !range.endContainer) return null;

        const startEl = range.startContainer.nodeType === Node.ELEMENT_NODE
            ? range.startContainer : range.startContainer.parentElement;
        const endEl = range.endContainer.nodeType === Node.ELEMENT_NODE
            ? range.endContainer : range.endContainer.parentElement;
        if (!startEl || !endEl) return null;

        const forbidden =
            'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
        if (startEl.closest(forbidden) || endEl.closest(forbidden)) return null;
        if (startEl.closest(SelectionTools.EXT_UI_SELECTOR)
            || endEl.closest(SelectionTools.EXT_UI_SELECTOR)) return null;

        // Visible client rects (rejects hidden/offscreen content)
        const rects = Array.from(range.getClientRects()).filter(
            (r) => r.width > 0.5 && r.height > 0.5
        );
        if (!rects.length) {
            const br = range.getBoundingClientRect();
            if (!br || (!br.width && !br.height)) return null;
            rects.push(br);
        }
        const union = rects.reduce((acc, r) => {
            acc.left = Math.min(acc.left, r.left); acc.top = Math.min(acc.top, r.top);
            acc.right = Math.max(acc.right, r.right); acc.bottom = Math.max(acc.bottom, r.bottom);
            return acc;
        }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
        const vw = window.innerWidth, vh = window.innerHeight;
        if (union.bottom <= 0 || union.top >= vh || union.right <= 0 || union.left >= vw) return null;

        // Rect closest to the selection end (collapsed range at endOffset)
        let endRect = null;
        try {
            const endRange = document.createRange();
            endRange.setStart(range.endContainer, range.endOffset);
            endRange.setEnd(range.endContainer, range.endOffset);
            endRect = endRange.getBoundingClientRect();
        } catch (_err) { /* fall through to last rect */ }
        if (!endRect || (!endRect.width && !endRect.height)) endRect = rects[rects.length - 1];

        return { text, range, endRect, unionRect: union };
    }

    /** Frozen snapshot with page metadata + ~1600 chars of local context. */
    _buildSnapshot(range, text, unionRect) {
        let meta = null;
        try {
            meta = typeof this.enhancer?._getPageSaveContext === "function"
                ? this.enhancer._getPageSaveContext() : null;
        } catch (_err) { meta = null; }
        if (!meta) {
            meta = {
                siteKey: location.hostname.replace(/^www\./, ""),
                pageUrl: location.href,
                postTitle: document.title?.trim() || location.href,
                postId: null,
            };
        }
        const snapshot = {
            text,
            pageUrl: meta.pageUrl,
            postTitle: meta.postTitle,
            siteKey: meta.siteKey,
            postId: meta.postId,
            context: this._buildContext(range, text),
            rect: Object.freeze({
                top: unionRect.top, bottom: unionRect.bottom,
                left: unionRect.left, right: unionRect.right,
                width: unionRect.right - unionRect.left,
                height: unionRect.bottom - unionRect.top,
            }),
        };
        return Object.freeze(snapshot);
    }

    /**
     * Surrounding text from the nearest semantic block, capped at ~1600 chars.
     * The window is centered on the ACTUAL selected occurrence, computed from
     * the DOM range prefix (not a first-occurrence indexOf, which would hit an
     * earlier identical phrase in a long block).
     */
    _buildContext(range, text) {
        const cap = SelectionTools.CONTEXT_CHARS;
        try {
            const node = range.startContainer;
            let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
            let block = null;
            for (let cur = el; cur && cur !== document.body; cur = cur.parentElement) {
                if (SelectionTools.BLOCK_TAGS.test(cur.tagName)) { block = cur; break; }
            }
            if (!block) block = el;
            const raw = block?.textContent || "";
            const norm = raw.replace(/\s+/g, " ").trim();
            if (!norm) return text.slice(0, cap);
            if (norm.length <= cap) return norm;
            // Normalize the actual DOM prefix with the same rule as the block.
            // A proportional offset would drift when whitespace is uneven.
            const pre = document.createRange();
            pre.selectNodeContents(block);
            pre.setEnd(range.startContainer, range.startOffset);
            const center = pre.toString().replace(/\s+/g, " ").trimStart().length;
            const start = Math.max(0, Math.min(center - Math.floor(cap / 2), norm.length - cap));
            return norm.slice(start, start + cap);
        } catch (_err) {
            return text.slice(0, cap);
        }
    }

    // ------------------------------------------------------------------
    // Toolbar
    // ------------------------------------------------------------------

    _ensureToolbar() {
        if (this._toolbarHost) return;
        const host = document.createElement("div");
        host.className = "hn-selection-fab";
        // Inline styles neutralize any page-level .hn-selection-fab styling and
        // keep the host out of the page layout (also used for screenshot exclusion).
        Object.assign(host.style, {
            position: "fixed", left: "0", top: "0", display: "none",
            background: "transparent", padding: "0", margin: "0",
            border: "none", boxShadow: "none", borderRadius: "0", gap: "0",
            zIndex: "2147483647",
        });
        const root = host.attachShadow({ mode: "closed" });
        root.innerHTML = `
            <style>
                :host { all: initial; }
                .bar {
                    display: flex; align-items: center; gap: 2px;
                    background: #1a1a1b; border: 1px solid #3c3c3d;
                    border-radius: 8px; padding: 3px;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
                        Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
                }
                .bar button {
                    appearance: none; border: none; background: transparent;
                    color: #d7dadc; font-family: inherit; font-size: 12px;
                    font-weight: 500; line-height: 1; padding: 5px 10px;
                    border-radius: 5px; cursor: pointer; white-space: nowrap;
                    transition: background 0.15s, color 0.15s;
                }
                .bar button:hover:not(:disabled) { background: #ff6600; color: #fff; }
                .bar button:disabled { opacity: 0.55; cursor: default; }
            </style>
            <div class="bar">
                <button class="lookup" type="button">翻译 / 解读</button>
                <button class="save" type="button">保存</button>
            </div>`;
        const lookupBtn = root.querySelector(".lookup");
        const saveBtn = root.querySelector(".save");
        lookupBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const snapshot = this._snapshot;
            this.hideToolbar();
            if (snapshot) this._openLookup(snapshot);
        });
        saveBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const snapshot = this._snapshot;
            this.hideToolbar();
            if (snapshot) this._performSave(snapshot, null);
        });
        // Prevent mousedown from stealing focus / clearing the page selection.
        root.addEventListener("mousedown", (e) => e.preventDefault());
        document.body.appendChild(host);
        this._toolbarHost = host;
        this._toolbarRoot = root;
    }

    _showToolbar() {
        this._ensureToolbar();
        this._toolbarVisible = true;
        this._toolbarText = this._snapshot?.text || null;
        this._positionToolbar();
        this._toolbarHost.style.display = "block";
    }

    _positionToolbar() {
        const host = this._toolbarHost;
        const rect = this._endRect;
        if (!host || !rect) return;
        // Measure with the host temporarily invisible at a known position.
        host.style.visibility = "hidden";
        host.style.display = "block";
        host.style.left = "0px";
        host.style.top = "0px";
        const box = host.getBoundingClientRect();
        const w = box.width || 140, h = box.height || 30;
        const edge = SelectionTools.EDGE;
        const vw = window.innerWidth, vh = window.innerHeight;
        let top = rect.top - h - SelectionTools.EDGE;
        if (top < edge) top = rect.bottom + SelectionTools.EDGE;
        if (top + h > vh - edge) top = Math.max(edge, vh - edge - h);
        let left = rect.left + rect.width / 2 - w / 2;
        left = Math.min(Math.max(left, edge), Math.max(edge, vw - edge - w));
        host.style.top = `${Math.round(top)}px`;
        host.style.left = `${Math.round(left)}px`;
        host.style.visibility = "";
        host.style.display = this._toolbarVisible ? "block" : "none";
    }

    hideToolbar() {
        this._toolbarVisible = false;
        this._toolbarText = null;
        this._toolbarRectKey = null;
        if (this._toolbarHost) this._toolbarHost.style.display = "none";
    }

    // ------------------------------------------------------------------
    // Lookup popup
    // ------------------------------------------------------------------

    _ensurePopup() {
        if (this._popupHost) return;
        const host = document.createElement("div");
        host.className = "hn-selection-lookup";
        Object.assign(host.style, {
            position: "fixed", left: "0", top: "0", display: "none",
            background: "transparent", padding: "0", margin: "0",
            zIndex: "2147483647",
        });
        const root = host.attachShadow({ mode: "closed" });
        root.innerHTML = `
            <style>
                :host { all: initial; }
                .dialog {
                    display: flex; flex-direction: column;
                    box-sizing: border-box; width: 100%; height: 100%;
                    background: #1a1a1b; color: #d7dadc;
                    border: 1px solid #3c3c3d; border-radius: 10px;
                    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
                        Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
                    overflow: hidden;
                }
                .hd {
                    display: flex; align-items: center; gap: 8px;
                    padding: 8px 10px; border-bottom: 1px solid #343536;
                    flex-shrink: 0;
                }
                .title { font-size: 13px; font-weight: 600; color: #ff6600; }
                .status {
                    flex: 1; min-width: 0; font-size: 11px; color: #818384;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                    text-align: right;
                }
                .icon-btn {
                    appearance: none; border: none; background: transparent;
                    color: #818384; font-size: 14px; line-height: 1;
                    padding: 4px 6px; border-radius: 4px; cursor: pointer;
                }
                .icon-btn:hover { color: #d7dadc; background: #343536; }
                .actions {
                    display: flex; align-items: center; gap: 6px;
                    padding: 7px 10px; border-bottom: 1px solid #343536;
                    flex-shrink: 0;
                }
                .actions button {
                    appearance: none; border: 1px solid #3c3c3d; background: #272729;
                    color: #d7dadc; font-family: inherit; font-size: 12px;
                    padding: 5px 10px; border-radius: 5px; cursor: pointer;
                    white-space: nowrap;
                }
                .actions button:hover:not(:disabled) { border-color: #ff6600; color: #ff6600; }
                .actions button:disabled { opacity: 0.45; cursor: default; }
                .scroll {
                    flex: 1 1 auto; min-height: 0; overflow-y: auto;
                    padding: 10px 12px;
                }
                .source {
                    display: block; margin: 0 0 8px;
                    font-size: 11px; color: #818384; text-decoration: none;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .source:hover { color: #ff6600; }
                .quote {
                    margin: 0 0 10px; padding: 8px 10px;
                    border-left: 3px solid #ff6600; background: #272729;
                    border-radius: 0 6px 6px 0;
                    font-size: 13px; line-height: 1.55; color: #d7dadc;
                    white-space: pre-wrap; word-break: break-word;
                    user-select: text; cursor: text;
                }
                .output {
                    font-size: 13px; line-height: 1.6; color: #d7dadc;
                    white-space: pre-wrap; word-break: break-word;
                    user-select: text; cursor: text;
                }
                .output.is-error { color: #ff8a5c; }
                .output.is-empty { color: #818384; }
            </style>
            <div class="dialog" role="dialog" aria-modal="false" aria-label="翻译 / 解读" tabindex="-1">
                <header class="hd">
                    <span class="title">翻译 / 解读</span>
                    <span class="status" role="status" aria-live="polite"></span>
                    <button class="icon-btn close" type="button" aria-label="关闭" title="关闭 (Esc)">✕</button>
                </header>
                <div class="actions">
                    <button class="copy" type="button">复制结果</button>
                    <button class="regen" type="button">重新解读</button>
                    <button class="save" type="button">保存原文</button>
                </div>
                <div class="scroll">
                    <a class="source" target="_blank" rel="noopener noreferrer"></a>
                    <blockquote class="quote"></blockquote>
                    <div class="output is-empty"></div>
                </div>
            </div>`;
        this._dialog = root.querySelector(".dialog");
        this._els = {
            status: root.querySelector(".status"),
            close: root.querySelector(".close"),
            copy: root.querySelector(".copy"),
            regen: root.querySelector(".regen"),
            save: root.querySelector(".save"),
            source: root.querySelector(".source"),
            quote: root.querySelector(".quote"),
            output: root.querySelector(".output"),
        };
        this._els.close.addEventListener("click", (e) => {
            e.stopPropagation();
            this._closePopup(true);
        });
        this._els.copy.addEventListener("click", (e) => {
            e.stopPropagation();
            this._copyResult();
        });
        this._els.regen.addEventListener("click", (e) => {
            e.stopPropagation();
            this._startLookup(true);
        });
        this._els.save.addEventListener("click", (e) => {
            e.stopPropagation();
            if (this._snapshot) this._performSave(this._snapshot, this._els.save);
        });
        document.body.appendChild(host);
        this._popupHost = host;
        this._popupRoot = root;
    }

    _openLookup(snapshot) {
        this._ensurePopup();
        this._snapshot = snapshot;
        this._popupOpen = true;
        this._els.quote.textContent = snapshot.text;
        // Source anchor: page title as plain text; href only for http(s) URLs.
        const url = /^https?:\/\//i.test(snapshot.pageUrl || "") ? snapshot.pageUrl : null;
        if (url) {
            this._els.source.textContent = snapshot.postTitle || url;
            this._els.source.href = url;
            this._els.source.style.display = "";
        } else {
            this._els.source.textContent = "";
            this._els.source.href = "";
            this._els.source.style.display = "none";
        }
        // Fresh session: clear any stale pending/feedback state on buttons.
        this._els.save.textContent = "保存原文";
        this._els.save.disabled = false;
        this._els.copy.textContent = "复制结果";
        const prev = document.activeElement;
        this._prevFocus = prev instanceof Element ? prev : null;
        this._positionPopup();
        this._popupHost.style.display = "block";
        this._dialog.focus({ preventScroll: true });
        this._startLookup(false);
    }

    _closePopup(restoreFocus) {
        if (!this._popupOpen) return;
        const focusedInside = document.activeElement === this._popupHost;
        const focusedElement = this._popupRoot?.activeElement;
        this._popupOpen = false;
        this._pointerInComponent = false; // don't suppress later keyboard selections
        // Blur before hiding; the previous focus may be an unfocusable body.
        if (focusedInside) focusedElement?.blur();
        if (this._popupHost) this._popupHost.style.display = "none";
        const prev = this._prevFocus;
        if (restoreFocus && focusedInside && prev?.isConnected) {
            prev.focus({ preventScroll: true });
        }
        this._prevFocus = null;
    }

    _positionPopup() {
        const host = this._popupHost;
        const rect = this._endRect;
        if (!host) return;
        const edge = SelectionTools.EDGE;
        const vw = window.innerWidth, vh = window.innerHeight;
        const w = Math.min(SelectionTools.POPUP_WIDTH, vw - edge * 2);
        // Height clamps to the available viewport; on very small viewports it
        // simply shrinks (min-height 0) instead of overflowing.
        const h = Math.min(SelectionTools.POPUP_HEIGHT, Math.max(0, vh - edge * 2));
        host.style.width = `${Math.round(w)}px`;
        host.style.height = `${Math.round(h)}px`;
        const anchor = rect || { left: vw / 2, right: vw / 2, top: vh / 2, bottom: vh / 2, width: 0 };
        let left = anchor.left;
        if (left + w > vw - edge) left = vw - edge - w;
        if (left < edge) left = edge;
        let top = anchor.bottom + SelectionTools.EDGE;
        if (top + h > vh - edge) top = anchor.top - h - SelectionTools.EDGE;
        if (top < edge) top = Math.max(edge, Math.min(top, vh - edge - h));
        host.style.left = `${Math.round(left)}px`;
        host.style.top = `${Math.round(top)}px`;
    }

    // ------------------------------------------------------------------
    // Lookup state / rendering
    // ------------------------------------------------------------------

    /**
     * Cache key: page + context + text. The context disambiguates identical
     * selections ("bank") in different paragraphs or on different pages.
     */
    _cacheKey(snapshot) {
        return `${snapshot.pageUrl}\u0000${snapshot.context}\u0000${snapshot.text}`;
    }

    _getCacheEntry(key) {
        return this._lookupCache.get(key) || null;
    }

    _setCacheEntry(key, entry) {
        this._lookupCache.delete(key);
        this._lookupCache.set(key, entry);
        while (this._lookupCache.size > SelectionTools.CACHE_LIMIT) {
            const oldest = this._lookupCache.keys().next().value;
            this._lookupCache.delete(oldest);
        }
    }

    /**
     * Start (or reuse) a lookup for the current snapshot. `force` retries /
     * regenerates even when a cached result or in-flight request exists.
     */
    _startLookup(force) {
        const snapshot = this._snapshot;
        if (!snapshot || !this._popupOpen) return;
        const key = this._cacheKey(snapshot);
        const entry = this._getCacheEntry(key) || {
            status: "idle", output: null, promise: null,
        };

        if (snapshot.text.length > SelectionTools.MAX_LOOKUP_CHARS) {
            entry.status = "oversize";
            entry.output = null;
            entry.promise = null;
            this._setCacheEntry(key, entry);
            this._renderLookupState(snapshot, entry);
            return;
        }

        const hasProvider = typeof this.enhancer?.lookupSelectedText === "function";
        if (!hasProvider) {
            entry.status = "error";
            entry.output = "解读功能未就绪";
            entry.promise = null;
            this._setCacheEntry(key, entry);
            this._renderLookupState(snapshot, entry);
            return;
        }

        // Reuse in-memory pending/result for the same selection
        if (!force && entry.status === "done") {
            this._setCacheEntry(key, entry);
            this._renderLookupState(snapshot, entry);
            return;
        }
        if (!force && entry.status === "loading" && entry.promise) {
            this._setCacheEntry(key, entry);
            this._renderLookupState(snapshot, entry);
            entry.promise.then(
                () => this._onLookupSettled(snapshot, key),
                () => this._onLookupSettled(snapshot, key)
            );
            return;
        }

        entry.status = "loading";
        entry.output = null;
        const gen = this._generation;
        const promise = this._lookupWithTimeout(snapshot).then(
            (result) => {
                if (gen === this._generation) { entry.status = "done"; entry.output = result; }
                return result;
            },
            (err) => {
                if (gen === this._generation) {
                    entry.status = "error";
                    entry.output = err?.message || "解读失败";
                }
                throw err;
            }
        );
        entry.promise = promise;
        promise.catch(() => {}); // avoid unhandled rejection; state handled above
        this._setCacheEntry(key, entry);
        this._renderLookupState(snapshot, entry);
        promise.then(
            () => this._onLookupSettled(snapshot, key),
            () => this._onLookupSettled(snapshot, key)
        );
    }

    /** Race the enhancer request against a bounded timeout. */
    _lookupWithTimeout(snapshot) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const timer = this._setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error(`解读超时（${Math.round(SelectionTools.LOOKUP_TIMEOUT_MS / 1000)} 秒），请重试`));
            }, SelectionTools.LOOKUP_TIMEOUT_MS);
            Promise.resolve()
                .then(() => this.enhancer.lookupSelectedText(snapshot))
                .then(
                    (result) => {
                        if (settled) return;
                        settled = true;
                        this._clearTimeout(timer);
                        if (typeof result === "string" && result.trim()) resolve(result);
                        else reject(new Error("AI 未返回有效内容"));
                    },
                    (err) => {
                        if (settled) return;
                        settled = true;
                        this._clearTimeout(timer);
                        reject(err instanceof Error ? err : new Error(String(err?.message || err || "解读失败")));
                    }
                );
        });
    }

    /** Re-render the popup when a (possibly reused) request settles. */
    _onLookupSettled(snapshot, key) {
        if (this._disposed || !this._popupOpen) return;
        if (this._snapshot !== snapshot) return;
        const entry = this._getCacheEntry(key);
        if (!entry) return;
        this._renderLookupState(snapshot, entry);
    }

    _renderLookupState(snapshot, entry) {
        if (!this._popupOpen || this._snapshot !== snapshot || !this._els) return;
        const { status, copy, regen, output } = this._els;
        copy.disabled = entry.status !== "done";
        copy.textContent = "复制结果";
        regen.disabled = entry.status === "loading" || entry.status === "oversize";
        regen.textContent = entry.status === "error" ? "重试" : "重新解读";

        switch (entry.status) {
            case "loading":
                status.textContent = "解读中…";
                output.className = "output is-empty";
                output.textContent = "正在解读，请稍候…";
                break;
            case "done":
                status.textContent = "已完成"; // announced via aria-live
                output.className = "output";
                output.textContent = entry.output || "";
                break;
            case "error":
                status.textContent = "解读失败";
                output.className = "output is-error";
                output.textContent = `解读失败：${entry.output || "未知错误"}\n点击“重试”可再试一次。`;
                break;
            case "oversize": {
                status.textContent = "选区过长";
                output.className = "output is-error";
                const len = snapshot.text.length;
                output.textContent =
                    `选区内容超过 ${SelectionTools.MAX_LOOKUP_CHARS} 字符（当前 ${len} 字符），` +
                    `无法进行解读。\n可使用“保存原文”保存完整文本，或缩短选区后重试。`;
                break;
            }
            default:
                status.textContent = "";
                output.className = "output is-empty";
                output.textContent = "";
        }
    }

    _copyResult() {
        const snapshot = this._snapshot;
        if (!snapshot || !this._popupOpen) return;
        const entry = this._getCacheEntry(this._cacheKey(snapshot));
        if (!entry || entry.status !== "done" || !entry.output) return;
        const { copy, status } = this._els;
        if (copy.disabled) return;
        const gen = this._generation;
        this._copyToClipboard(entry.output).then((ok) => {
            // Session guard: ignore if reset, closed, or a newer selection took over.
            if (this._disposed || gen !== this._generation
                || this._snapshot !== snapshot || !this._popupOpen) return;
            if (ok) {
                copy.textContent = "已复制 ✓";
                copy.disabled = true;
                this._setTimeout(() => {
                    if (this._disposed || this._snapshot !== snapshot || !this._popupOpen) return;
                    copy.textContent = "复制结果";
                    copy.disabled = false;
                }, 1600);
            } else {
                status.textContent = "复制失败，请手动选择文本复制";
            }
        });
    }

    /** Clipboard API with a legacy execCommand fallback. Returns boolean. */
    async _copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_err) {
            if (!this._popupOpen || this._disposed) return false;
            const previousFocus = this._popupRoot?.activeElement || document.activeElement;
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            Object.assign(ta.style, {
                position: "fixed", left: "-9999px", top: "0", opacity: "0",
            });
            let ok = false;
            try {
                document.body.appendChild(ta);
                ta.select();
                ok = document.execCommand("copy");
            } catch (_err2) {
                ok = false;
            } finally {
                ta.remove();
                if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
            }
            return ok;
        }
    }

    // ------------------------------------------------------------------
    // Save
    // ------------------------------------------------------------------

    /**
     * Save via the enhancer (which shows the toast). With `btn` (popup's
     * 保存原文), shows disabled pending state + inline success/error feedback.
     * The disabled guard runs BEFORE the API call so rapid double-clicks can
     * never issue duplicate saves; toolbar path passes btn=null and relies on
     * the enhancer toast.
     */
    _performSave(snapshot, btn) {
        if (!snapshot) return;
        if (btn) {
            if (btn.disabled) return; // duplicate-click guard, before any request
            btn.disabled = true;
            btn.textContent = "保存中…";
        }
        const gen = this._generation;
        // Promise.resolve().then() also catches synchronous throws.
        Promise.resolve()
            .then(() => this.enhancer.saveSelectedText(snapshot.text, snapshot))
            .then(
                (ok) => ok !== false,
                (err) => {
                    console.error("SelectionTools: save failed:", err);
                    return false;
                }
            )
            .then((ok) => {
                if (!btn) return; // toolbar path: enhancer toast is the feedback
                // Session guard: a newer selection or reset owns the button now.
                if (this._disposed || gen !== this._generation
                    || this._snapshot !== snapshot || !this._popupOpen) return;
                btn.textContent = ok ? "已保存 ✓" : "保存失败";
                this._setTimeout(() => {
                    if (this._disposed || gen !== this._generation
                        || this._snapshot !== snapshot || !this._popupOpen) return;
                    btn.textContent = "保存原文";
                    btn.disabled = false;
                }, 1600);
            });
    }
}

window.SelectionTools = SelectionTools;
