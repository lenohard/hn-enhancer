/**
 * YouTubeAdapter — comment extraction for YouTube watch pages.
 *
 * YouTube lazy-loads comments and never places the full thread in the DOM,
 * so this adapter fetches the comment tree on demand via YouTube's internal
 * innertube API (`youtubei/v1/next`) and exposes it as plain block objects:
 *
 *   { id, author, text, publishedTime, permalink, children: [] }
 *
 * Flow:
 *   1. Parse INNERTUBE_API_KEY / INNERTUBE_CONTEXT from the inline
 *      `ytcfg.set({...})` scripts (content scripts cannot read window.ytcfg).
 *   2. POST { context, videoId } → locate the comments section continuation
 *      token inside twoColumnWatchNextResults.
 *   3. POST { context, continuation } pages until exhausted, collecting
 *      commentThreadRenderer items. Text/author live in
 *      frameworkUpdates.entityBatchUpdate mutations (new viewModel format),
 *      keyed by commentViewModel.commentKey; a legacy commentRenderer
 *      fallback is included for older response shapes.
 *   4. Fetch reply pages per thread (capped).
 */
window.YouTubeAdapter = class YouTubeAdapter extends SiteAdapter {
    name = 'YouTube';

    /** Max pages of top-level comments (~20 per page). */
    static MAX_TOP_PAGES = 30;
    /** Max reply pages fetched per thread. */
    static MAX_REPLY_PAGES = 2;

    constructor() {
        super();
        this._blocks = [];
        this._blockMap = new Map();
        this._fetchedVideoId = null;
        this._fetchPromise = null;
        this._cfg = null;
    }

    // ── URL matching ──────────────────────────────────────────────

    matches(url) {
        try {
            const u = new URL(url);
            return /(^|\.)youtube\.com$/.test(u.hostname)
                && u.pathname === '/watch'
                && !!u.searchParams.get('v');
        } catch {
            return false;
        }
    }

    getSiteKey() { return 'youtube.com'; }

    getPostId() {
        return new URLSearchParams(location.search).get('v');
    }

    getBaseUrl() {
        return `https://www.youtube.com/watch?v=${this.getPostId()}`;
    }

    getPostTitle() {
        return document.querySelector('meta[name="title"]')?.content?.trim()
            || document.title.replace(/\s*-\s*YouTube\s*$/, '');
    }

    isCommentsPage() { return this.matches(location.href); }

    /** No page-injected action links; use the Hub panel instead. */
    supportsPageActionLinks() { return false; }

    supportsSummarizePostLink() { return false; }

    getPromptContext() {
        return `the comment section of YouTube video "${this.getPostTitle()}"`;
    }

    // ── Post body (video description) ─────────────────────────────

    getPostBodyElement() {
        return document.querySelector('ytd-watch-metadata ytd-text-inline-expander');
    }

    /** The description is one block, not a set of <p> elements. */
    getParagraphElements(bodyEl) {
        return bodyEl ? [bodyEl] : [];
    }

    // ── Block interface (blocks are plain objects, not DOM nodes) ─

    getCommentBlocks() { return this._blocks; }

    getChildBlocks(block) { return block?.children || []; }

    getBlockId(block) { return block?.id ?? null; }

    getBlockAuthor(block) { return block?.author || ''; }

    getBlockText(block) { return block?.text || ''; }

    getBlockPermalink(block) { return block?.permalink || null; }

    getBlockHTML(block) { return this.getBlockText(block); }

    resolveBlockByRef(ref) {
        return ref ? this._findThreadElement(ref) : null;
    }

    /**
     * Scroll the page until YouTube renders the thread for the given comment
     * id, then return it. YouTube renders comment threads on demand while
     * scrolling; reply ids resolve to their parent thread.
     * @param {string} id comment id (top-level or reply)
     * @returns {Promise<HTMLElement|null>}
     */
    async scrollToBlockById(id) {
        let el = this._findThreadElement(id);
        if (el) return el;
        // Bring the comments section on screen so YouTube starts loading.
        document.querySelector('ytd-comments')?.scrollIntoView({
            behavior: 'instant',
            block: 'start',
        });
        const deadline = Date.now() + 20000;
        let lastHeight = -1;
        let stuck = 0;
        while (!el && Date.now() < deadline) {
            window.scrollBy(0, Math.round(window.innerHeight * 0.9));
            await new Promise((r) => setTimeout(r, 400));
            el = this._findThreadElement(id);
            if (el) return el;
            const h = document.documentElement.scrollHeight;
            // Give up after several checks without new content loading.
            stuck = h === lastHeight ? stuck + 1 : 0;
            lastHeight = h;
            if (stuck >= 10) break;
        }
        return el;
    }

    /**
     * The DOM thread element for a comment id. Threads carry their id in the
     * permalink (`...&lc=<id>`) rather than an attribute; reply ids
     * ("<parent>.A_<id>") map to their parent top-level thread.
     * @param {string} id
     * @returns {HTMLElement|null}
     */
    _findThreadElement(id) {
        const topId = String(id).includes('.A_')
            ? String(id).split('.A_')[0]
            : id;
        for (const t of document.querySelectorAll('ytd-comment-thread-renderer')) {
            const a = t.querySelector('a[href*="lc="]');
            const m = a?.href.match(/[?&]lc=([^&]+)/);
            if (m && decodeURIComponent(m[1]) === topId) return t;
        }
        return null;
    }

    /** No per-comment link injection — comments are not all present in the DOM. */
    getInjectTarget(_block) { return null; }

    // ── SPA navigation ────────────────────────────────────────────

    /**
     * Called by HNEnhancer.handleSpaNavigation() when YouTube navigates
     * watch → watch. Invalidates the comment cache when the video changed.
     */
    onSpaNavigate() {
        if (this._fetchedVideoId !== this.getPostId()) {
            this._blocks = [];
            this._blockMap = new Map();
            this._fetchedVideoId = null;
            this._cfg = null;
        }
    }

    // ── Comment fetching ──────────────────────────────────────────

    /**
     * Fetch the full comment tree for the current video (async, cached,
     * concurrent-call safe). Called by Summarization before walking blocks.
     * @returns {Promise<object[]>} top-level comment blocks
     */
    async prepareCommentBlocks() {
        const videoId = this.getPostId();
        if (!videoId) return [];
        if (this._fetchedVideoId === videoId) return this._blocks;
        if (this._fetchPromise) return this._fetchPromise;

        this._fetchPromise = this._fetchAllComments(videoId)
            .then((blocks) => {
                this._blocks = blocks;
                this._fetchedVideoId = videoId;
                return blocks;
            })
            .catch((err) => {
                console.warn('[HN Companion] YouTube comment fetch failed:', err);
                return [];
            })
            .finally(() => { this._fetchPromise = null; });

        return this._fetchPromise;
    }

    /**
     * Parse the innertube config from inline ytcfg.set() scripts.
     * (window.ytcfg lives in the page's main world and is invisible to
     * content scripts.)
     */
    _getInnertubeConfig() {
        if (this._cfg) return this._cfg;
        for (const script of document.querySelectorAll('script:not([src])')) {
            const text = script.textContent;
            if (!text || !text.includes('INNERTUBE_CONTEXT')) continue;
            for (const m of text.matchAll(/ytcfg\.set\((\{[\s\S]*?\})\);/g)) {
                try {
                    const obj = JSON.parse(m[1]);
                    if (obj.INNERTUBE_API_KEY && obj.INNERTUBE_CONTEXT) {
                        this._cfg = obj;
                        return obj;
                    }
                } catch { /* not a bare JSON object — try next match */ }
            }
        }
        return null;
    }

    async _postNext(cfg, payload) {
        const resp = await fetch(
            `https://www.youtube.com/youtubei/v1/next?key=${cfg.INNERTUBE_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }
        );
        if (!resp.ok) throw new Error(`YouTube API HTTP ${resp.status}`);
        return resp.json();
    }

    /** Collect continuation items from every endpoint in a response. */
    _getContinuationItems(data) {
        const items = [];
        for (const ep of data.onResponseReceivedEndpoints || []) {
            const cmd = ep.reloadContinuationItemsCommand || ep.appendContinuationItemsAction;
            if (cmd?.continuationItems) items.push(...cmd.continuationItems);
        }
        return items;
    }

    /** Map commentEntityPayload.key → payload (new viewModel format). */
    _getPayloadMap(data) {
        const map = new Map();
        for (const m of data.frameworkUpdates?.entityBatchUpdate?.mutations || []) {
            const p = m.payload?.commentEntityPayload;
            if (p?.key) map.set(p.key, p);
        }
        return map;
    }

    /**
     * Extract id/author/text from a commentThreadRenderer item.
     * Supports both the new viewModel format (entity payloads) and the
     * legacy inline commentRenderer format.
     */
    _extractCommentInfo(thread, payloads) {
        const ctr = thread.commentThreadRenderer;
        const key = ctr.commentViewModel?.commentViewModel?.commentKey;
        const payload = key ? payloads.get(key) : null;
        if (payload) {
            const props = payload.properties || {};
            return {
                id: props.commentId || key,
                author: payload.author?.displayName || '',
                text: props.content?.content || '',
                publishedTime: props.publishedTime || '',
            };
        }
        const cr = ctr.comment?.commentRenderer;
        if (cr) {
            return {
                id: cr.commentId,
                author: cr.authorText?.simpleText || '',
                text: (cr.contentText?.runs || []).map((r) => r.text).join(''),
                publishedTime: (cr.publishedTimeText?.runs || []).map((r) => r.text).join(''),
            };
        }
        return null;
    }

    _makeBlock(videoId, info) {
        return {
            id: info.id,
            author: info.author,
            text: info.text,
            publishedTime: info.publishedTime,
            permalink: `https://www.youtube.com/watch?v=${videoId}&lc=${info.id}`,
            children: [],
        };
    }

    async _fetchAllComments(videoId) {
        const cfg = this._getInnertubeConfig();
        if (!cfg) throw new Error('innertube config not found in page scripts');
        const context = cfg.INNERTUBE_CONTEXT;

        // 1. Watch response → comments-section continuation token
        const watch = await this._postNext(cfg, { context, videoId });
        const sections = watch.contents?.twoColumnWatchNextResults?.results?.results?.contents || [];
        const section = sections.find(
            (s) => s.itemSectionRenderer?.contents?.[0]?.continuationItemRenderer
        );
        let token = section?.itemSectionRenderer.contents[0].continuationItemRenderer
            .continuationEndpoint?.continuationCommand?.token;
        if (!token) return []; // comments disabled

        // 2. Paginate top-level comments
        const blocks = [];
        this._blockMap = new Map();
        let pages = 0;
        while (token && pages < YouTubeAdapter.MAX_TOP_PAGES) {
            pages++;
            const data = await this._postNext(cfg, { context, continuation: token });
            const payloads = this._getPayloadMap(data);
            token = null;
            for (const item of this._getContinuationItems(data)) {
                if (item.continuationItemRenderer) {
                    token = item.continuationItemRenderer.continuationEndpoint
                        ?.continuationCommand?.token || null;
                    continue;
                }
                if (!item.commentThreadRenderer) continue;
                const info = this._extractCommentInfo(item, payloads);
                if (!info) continue;
                const block = this._makeBlock(videoId, info);
                block._replyToken = item.commentThreadRenderer.replies?.commentRepliesRenderer
                    ?.subThreads?.[0]?.continuationItemRenderer?.continuationEndpoint
                    ?.continuationCommand?.token || null;
                blocks.push(block);
                this._blockMap.set(block.id, block);
            }
        }

        // 3. Replies (capped per thread)
        for (const block of blocks) {
            let replyToken = block._replyToken;
            delete block._replyToken;
            let pages2 = 0;
            while (replyToken && pages2 < YouTubeAdapter.MAX_REPLY_PAGES) {
                pages2++;
                try {
                    const data = await this._postNext(cfg, { context, continuation: replyToken });
                    const payloads = this._getPayloadMap(data);
                    replyToken = null;
                    for (const item of this._getContinuationItems(data)) {
                        if (item.continuationItemRenderer) {
                            replyToken = item.continuationItemRenderer.continuationEndpoint
                                ?.continuationCommand?.token || null;
                            continue;
                        }
                        if (!item.commentThreadRenderer) continue;
                        const info = this._extractCommentInfo(item, payloads);
                        if (!info) continue;
                        const reply = this._makeBlock(videoId, info);
                        block.children.push(reply);
                        this._blockMap.set(reply.id, reply);
                    }
                } catch (err) {
                    console.warn('[HN Companion] YouTube reply fetch failed:', err);
                    break;
                }
            }
        }

        return blocks;
    }
};
