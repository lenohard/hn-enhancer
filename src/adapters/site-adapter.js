/**
 * SiteAdapter — abstract base class for multi-site support.
 *
 * Each supported site (HN, Substack, etc.) extends this class and
 * implements the DOM extraction methods.  The rest of the extension
 * (summarization, chat, hub-panel, navigation) only talks to the
 * adapter — never directly to site-specific selectors.
 *
 * When adding a new site, create a subclass in src/adapters/ and
 * register it in adapter-registry.js.
 */
window.SiteAdapter = class SiteAdapter {
    /** Human-readable site name shown in UI (e.g. "Hacker News", "Substack"). */
    name = 'Unknown Site';

    // ── URL matching ──────────────────────────────────────────────

    /**
     * Return true when this adapter should handle the given URL.
     * @param {string} url — the full document URL (usually location.href)
     * @returns {boolean}
     */
    matches(_url) { return false; }

    // ── Site identity ─────────────────────────────────────────────

    /** Short key used in storage keys, e.g. "hn", "substack". */
    getSiteKey() { return location.hostname.replace(/^www\./, ''); }

    // ── Post identity ─────────────────────────────────────────────

    /** Return a stable, unique post identifier for the current page, or null. */
    getPostId() { return null; }

    /** Return the logged-in username (if the site supports it), or null. */
    getLoggedInUsername() { return null; }

    /** Return the post title text. */
    getPostTitle() { return document.title; }

    /** Return the post body element (the article text), or null. */
    getPostBodyElement() { return null; }

    /**
     * Plain-text post body for summarization. Override on sites where the
     * primary content is the article, not the comment thread.
     * @returns {string|null}
     */
    getPostText() { return null; }

    /**
     * When true, opening the summary panel with no cache auto-starts generation.
     * @returns {boolean}
     */
    shouldAutoGeneratePostSummary() { return false; }

    /**
     * When true, prepend post body text to thread summaries (alongside comments).
     * @returns {boolean}
     */
    shouldIncludePostInSummary() { return true; }

    /**
     * Whether the hncompanion.com server cache tab is available for this site.
     * @returns {boolean}
     */
    supportsServerSummary() { return false; }

    /**
     * Cache key segment for full-page summaries (not a single comment thread).
     * null → `summary_*_*_post_*`; non-null string → `summary_*_*_{id}_*`.
     * Override when one post slug has multiple summary scopes (e.g. article vs comments page).
     * @returns {string|null}
     */
    getPostSummaryCacheId() { return null; }

    // ── Comment / block extraction ────────────────────────────────

    /**
     * Return all top-level comment blocks (NOT the post body).
     * @returns {Element[]}
     */
    getCommentBlocks() { return []; }

    /**
     * Return the direct child comment blocks nested inside `block`.
     * @param {Element} block
     * @returns {Element[]}
     */
    getChildBlocks(_block) { return []; }

    /**
     * Return a unique integer/string id for `block`, or null if none exists.
     * @param {Element} block
     * @returns {number|string|null}
     */
    getBlockId(_block) { return null; }

    /**
     * Return the author username for `block`.
     * @param {Element} block
     * @returns {string}
     */
    getBlockAuthor(_block) { return ''; }

    /**
     * Return the plain-text body of `block`.
     * @param {Element} block
     * @returns {string}
     */
    getBlockText(_block) { return ''; }

    /**
     * Return a timestamp (ms epoch) for `block`, or null.
     * @param {Element} block
     * @returns {number|null}
     */
    getBlockTime(_block) { return null; }

    /**
     * Return a permalink URL for `block`, or null.
     * @param {Element} block
     * @returns {string|null}
     */
    getBlockPermalink(_block) { return null; }

    /**
     * Return the nesting indent level (0 = root, 1 = first reply, …).
     * @param {Element} block
     * @returns {number}
     */
    getBlockIndentLevel(_block) { return 0; }

    /**
     * Return the downvote count for `block`, or 0.
     * @param {Element} block
     * @returns {number}
     */
    getBlockDownvoteCount(_block) { return 0; }

    // ── Rich text (optional) ──────────────────────────────────────

    /**
     * Return the raw HTML content of `block` (for LLM formatting).
     * Default falls back to getBlockText.
     * @param {Element} block
     * @returns {string}
     */
    getBlockHTML(_block) { return this.getBlockText(_block); }

    // ── Comment injection ─────────────────────────────────────────

    /**
     * Return the element inside `block` where we should insert the
     * "Summarize thread" / "Chat" action links.  Usually the header
     * row or the navlinks area.
     * @param {Element} block
     * @returns {Element|null}
     */
    getInjectTarget(_block) { return null; }

    // ── Page-level injection ───────────────────────────────────────

    /**
     * Return the DOM element where page-level action links
     * ("summarize all comments", "chat about post") should be
     * appended.  Returns null if the page doesn't have a suitable
     * anchor point.
     * @returns {Element|null}
     */
    getPageActionAnchor() { return null; }

    // ── Anchor resolution ─────────────────────────────────────────

    /**
     * Given an anchor ref (e.g. a block index or id string), return
     * the corresponding DOM element so we can scroll to it.
     * @param {string} ref — typically the index in the flat block list
     * @returns {Element|null}
     */
    resolveBlockByRef(_ref) { return null; }

    // ── Prompt context ─────────────────────────────────────────────

    /**
     * Return a short string describing the site for AI prompts,
     * e.g. "Hacker News" or "a Substack post".
     * @returns {string}
     */
    getPromptContext() { return `a discussion on ${this.getSiteKey()}`; }

    /**
     * Return the system message template for LLM summarization.
     * Default provides a generic instruction; sites may override.
     * @returns {string}
     */
    getSystemMessage() {
        return `You are an AI assistant specialized in analyzing and summarizing ${this.getPromptContext()}. ` +
            `Your goal is to help users quickly understand the key insights and discussions. ` +
            `Focus on extracting the most relevant and insightful comments. ` +
            `Don't repeat what others say — highlight key strengths and weaknesses. ` +
            `Be concise and clear. When referencing specific comments, use the [#N] notation ` +
            `where N is the comment number shown in the input.`;
    }

    /**
     * Return the user message template for LLM summarization.
     * @returns {string}
     */
    getUserMessageTemplate() {
        return `Provide a concise and insightful summary of the following ${this.getPromptContext()}. ` +
            `Include the most relevant comments and key takeaways. ` +
            `Use [#N] notation to reference specific comments.`;
    }

    /**
     * System message for article body summaries (no comments).
     * Override in site adapters that support article-page summaries.
     * @returns {string}
     */
    getPostSummarySystemMessage() {
        return `You are an AI assistant specialized in analyzing and summarizing articles. ` +
            `Your goal is to help users quickly understand the article's main thesis, key arguments, and structure. ` +
            `Be concise and clear. When referencing specific parts of the article, use [P#] notation ` +
            `where # is the paragraph number shown in the input (e.g. [P11], [P12]). ` +
            `Do NOT use (P11), （P11）, or parenthetical ranges — only [P#] form is linkable. ` +
            `Do NOT reference comments or use comment notation [1.2.3].`;
    }

    /**
     * User message template for article body summaries.
     * @returns {string}
     */
    getPostSummaryUserMessageTemplate() {
        return `Provide a concise summary of the following article. ` +
            `Capture the main thesis, key arguments, and notable evidence. ` +
            `Use [P#] notation to reference specific paragraphs.`;
    }

    // ── Hub panel ─────────────────────────────────────────────────

    /**
     * Return the title shown in the hub panel header.
     * @returns {string}
     */
    getHubTitle() { return `${this.name} Companion`; }

    /**
     * Return an array of action descriptors for the hub panel.
     * Each: { id, label, icon?, onClick?: (hubPanel) => void, href?: string }
     * @returns {Array<{id: string, label: string, icon?: string, onClick?: Function, href?: string}>}
     */
    getHubActions() { return []; }

    /**
     * Return site-specific buttons for the hub panel.
     * Universal buttons (Summary, Options) are added by HubPanel itself.
     * @param {object} enhancer — the HNEnhancer instance
     * @returns {Array<{label: string, title?: string, onClick: Function, hubView?: string}>}
     */
    getHubButtons(_enhancer) { return []; }

    /**
     * Return hub panel stat descriptors for the current site.
     * @param {object} _enhancer
     * @returns {Array<{id: string, label: string, value: string}>}
     */
    getHubStats(_enhancer) { return []; }

    /**
     * Whether the current URL is the full comments/discussion page.
     * Defaults to true for single-page post layouts.
     * @returns {boolean}
     */
    isCommentsPage() {
        return true;
    }

    /**
     * Lightweight init for post/article pages that are not the comments page.
     * @param {object} _enhancer
     */
    initArticlePage(_enhancer) {}

    // ── Chat context options ─────────────────────────────────────

    /**
     * Return the chat-modal context options available for the current page.
     * Each option: { id, label, group, requiresSummary? }
     *   - id:    stable value used in the chat-history storage key
     *   - label: short label rendered next to the radio input
     *   - group: 'comment' for per-comment contexts, 'post' for whole-post contexts
     *   - requiresSummary: when true, the option is only shown if a cached
     *     post summary exists (resolved by ChatModal via getCachedPostSummary)
     * May be async (e.g. Substack checks the summary cache).
     * @returns {Promise<Array<object>|Array<object>}
     */
    async getChatContextOptions(_enhancer) { return []; }

    /**
     * Return the most recent cached post summary, or null. Used by ChatModal
     * to decide whether summary-aware context options should be shown.
     * @returns {Promise<object|null>}
     */
    async getCachedPostSummary(_enhancer) { return null; }

    /**
     * System message for post-body chat (Q&A against the article and/or
     * cached summary). Override per site to inject site-specific guidance.
     * @returns {string|null}
     */
    getChatSystemMessage() { return null; }

    // ── Favorites / bookmarks (site-specific URLs) ────────────────

    /**
     * Return a URL to the site's favorites/bookmarks page for the
     * currently logged-in user, or null if not applicable.
     * @returns {string|null}
     */
    getFavoritesUrl() { return null; }

    /**
     * Return a URL to the favorites page for a given username.
     * @param {string} username
     * @returns {string|null}
     */
    getUserFavoritesUrl(_username) { return null; }
};
