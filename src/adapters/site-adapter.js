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

    /** Return stats descriptors: [{ id, label, value }] */
    getHubStats() { return []; }

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
