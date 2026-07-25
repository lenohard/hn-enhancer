/**
 * SelectionAdapter — fallback adapter for arbitrary pages.
 *
 * Provides text-selection → summarize/chat on any webpage.
 * Registered LAST in AdapterRegistry so HN/Substack take priority.
 */
window.SelectionAdapter = class SelectionAdapter extends SiteAdapter {
    name = 'Universal';
    /** @type {boolean} flag for HNEnhancer to init lightweight universal mode */
    isUniversal = true;

    matches(_url) { return true; }

    getSiteKey() { return location.hostname.replace(/^www\./, ''); }

    getPostId() {
        // Use a hash of the URL as a stable page ID
        let hash = 0;
        const str = location.href;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return 'u' + Math.abs(hash).toString(36);
    }

    isCommentsPage() { return false; }

    /**
     * Text captured when the user opens chat/summary from the selection FAB.
     * Selection can be cleared before the modal reads the page body.
     * @type {string|null}
     */
    _selectionOverride = null;

    /**
     * @param {string|null} text
     */
    setSelectionOverride(text) {
        this._selectionOverride = text && text.length >= 20 ? text : null;
    }

    /**
     * Return the currently selected text as the "post text" for summarization.
     * Falls back to the page's main content area text.
     * @returns {string}
     */
    getPostText() {
        if (this._selectionOverride && this._selectionOverride.length >= 20) {
            const text = this._selectionOverride;
            this._selectionOverride = null;
            return text;
        }

        const selection = window.getSelection();
        const selected = selection ? selection.toString().trim() : '';
        if (selected.length > 20) return selected;

        // Try Readability.js for clean article extraction
        try {
            const docClone = document.cloneNode(true);
            const reader = new window.Readability(docClone);
            const article = reader.parse();
            if (article?.textContent?.length > 50) {
                return article.textContent.trim().slice(0, 50000);
            }
        } catch (e) {
            // Readability failed, continue to fallbacks
        }

        // Fallback: try common article containers
        const el = document.querySelector('article, [role="main"], main, .post-content, .article-content, .entry-content');
        if (el) return el.innerText.trim().slice(0, 50000);

        return document.body.innerText.trim().slice(0, 50000);
    }

    /** For universal pages, "comment blocks" don't exist. */
    getCommentBlocks() { return []; }

    getSystemMessage() {
        return HNPrompts.substack.article.system;
    }

    getUserMessageTemplate() {
        return HNPrompts.substack.article.user;
    }

    /** @override */
    getPostSummarySystemMessage() {
        return HNPrompts.substack.article.system;
    }

    /** @override */
    getPostSummaryUserMessageTemplate() {
        return HNPrompts.substack.article.user;
    }

    // ---- Summary flow hooks ----

    isDedicatedCommentsPage() { return false; }

    shouldAutoGeneratePostSummary() { return true; }

    /** Paragraphs can't be jumped to — original page DOM is untouched. */
    supportsParagraphJump() { return false; }

    getPostBodyElement() {
        const text = this.getPostText();
        if (!text) return null;
        const div = document.createElement('div');
        text.split(/\n+/).filter(Boolean).forEach((line) => {
            const p = document.createElement('p');
            p.textContent = line;
            div.appendChild(p);
        });
        return div;
    }

    // ---- Chat flow hooks ----

    /** Cache scope for page-level summaries (used by chat + summary cache). */
    getPostSummaryCacheId() {
        return 'page';
    }

    /**
     * Return the most recent cached page summary, or null.
     * @param {object} enhancer
     * @returns {Promise<object|null>}
     */
    async getCachedPostSummary(enhancer) {
        const postId = this.getPostId();
        if (!postId || !enhancer?.hnState?.listSummaries) return null;
        const scope = this.getPostSummaryCacheId();
        const entries = await enhancer.hnState.listSummaries(
            this.getSiteKey(),
            postId,
            scope
        );
        return entries && entries.length > 0 ? entries[0] : null;
    }

    /**
     * Post-body chat: page content, optional cached summary, or both.
     * @param {object} enhancer
     * @returns {Promise<Array<{id: string, label: string, group: string}>>}
     */
    async getChatContextOptions(enhancer) {
        const options = [
            { id: 'post', label: 'Post', group: 'post' },
        ];

        const cached = await this.getCachedPostSummary(enhancer);
        if (cached) {
            options.push({ id: 'summary', label: 'Summary', group: 'post' });
            options.push({
                id: 'post-summary',
                label: 'Post + Summary',
                group: 'post',
            });
        }

        return options;
    }

    getChatSystemMessage() {
        return HNPrompts.substack.chat.system;
    }

    /** @override */
    supportsSelectionFab() { return true; }

    /** @override */
    getHubButtons(enhancer) {
        return [
            {
                label: 'Chat',
                title: 'Open a chat about this page',
                onClick: () => enhancer.openPostChatModal(),
            },
            ...this.getSaveHubButtons(enhancer),
        ];
    }

};
