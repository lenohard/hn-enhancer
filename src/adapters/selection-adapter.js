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

    /** @type {Range|null} */
    _selectionRange = null;

    /** @type {Element[]} live DOM blocks intersecting the current selection */
    _selectionBlocks = [];

    static _PARA_SELECTOR =
        'p, li, h1, h2, h3, h4, h5, h6, blockquote, pre';

    /**
     * @param {string|null} text
     */
    setSelectionOverride(text) {
        this._selectionOverride = text && text.length >= 20 ? text : null;
        this._selectionRange = null;
        this._selectionBlocks = [];

        const sel = window.getSelection();
        if (this._selectionOverride && sel?.rangeCount > 0 && !sel.isCollapsed) {
            this._selectionRange = sel.getRangeAt(0).cloneRange();
            this._selectionBlocks = this._findBlocksInRange(this._selectionRange);
        }
    }

    /** Drop FAB selection scope so hub Summary/Chat use the full page. */
    clearSelectionScope() {
        this._selectionOverride = null;
        this._selectionRange = null;
        this._selectionBlocks = [];
        window.getSelection()?.removeAllRanges();
    }

    _getContentRoot() {
        return (
            document.querySelector('article, [role="main"], main, .post-content, .article-content, .entry-content')
            || document.body
        );
    }

    /**
     * @param {Range} range
     * @returns {Element[]}
     */
    _findBlocksInRange(range) {
        const root = this._getContentRoot();
        return [...root.querySelectorAll(SelectionAdapter._PARA_SELECTOR)].filter((el) => {
            try {
                return range.intersectsNode(el);
            } catch {
                return false;
            }
        }).filter((el) => el.textContent.trim().length > 0);
    }

    /**
     * Run Readability on a clone of the current document.
     * @returns {{title: string, text: string}|null}
     */
    _parseReadability() {
        try {
            const docClone = document.cloneNode(true);
            const reader = new window.Readability(docClone);
            const article = reader.parse();
            if (article?.textContent?.length > 0) {
                return {
                    title: (article.title || document.title || '').trim(),
                    text: article.textContent.trim(),
                };
            }
        } catch (e) {
            // Readability failed
        }
        return null;
    }

    /**
     * Preview payload for hub panel — Readability output only (not fallbacks).
     * @returns {{selectionActive: boolean, selectionChars: number, title: string, text: string, chars: number}}
     */
    getReadabilityPreview() {
        const selection = window.getSelection()?.toString().trim() || '';
        const parsed = this._parseReadability();
        const text = parsed?.text || '';

        return {
            selectionActive: selection.length > 20,
            selectionChars: selection.length,
            title: parsed?.title || document.title || '',
            text,
            chars: text.length,
            images: this.getArticleImages(),
        };
    }

    /**
     * When a selection scope exists, return only images intersecting it. An
     * image-free text selection intentionally returns [] instead of leaking
     * unrelated images from the rest of the article into the model context.
     * Without a selection scope, return images from the article body.
     * @param {number} [_maxCount=8]
     * @returns {Array<{ref: string, url: string, element: HTMLImageElement}>}
     */
    getArticleImageEntries(_maxCount = 8) {
        const selection = window.getSelection();
        const range =
            selection && !selection.isCollapsed && selection.rangeCount > 0
                ? selection.getRangeAt(0)
                : this._selectionRange;
        if (range) {
            const selectedImages = [...this._getContentRoot().querySelectorAll('img')].filter(
                (img) => {
                    try {
                        return range.intersectsNode(img);
                    } catch {
                        return false;
                    }
                }
            );
            const entries = this._collectImageEntries(
                { querySelectorAll: () => selectedImages },
                _maxCount
            );
            return entries;
        }

        const articleEl = document.querySelector('article, [role="main"], main, .post-content, .article-content, .entry-content');
        return this._collectImageEntries(articleEl || document.body, _maxCount);
    }

    /**
     * Return the currently selected text as the "post text" for summarization.
     * Falls back to the page's main content area text.
     * @returns {string}
     */
    getPostText() {
        if (this._selectionBlocks.length > 0) {
            return this._selectionBlocks
                .map((el) => el.textContent.trim())
                .filter(Boolean)
                .join('\n\n')
                .slice(0, 50000);
        }

        if (this._selectionOverride && this._selectionOverride.length >= 20) {
            const text = this._selectionOverride;
            this._selectionOverride = null;
            return text;
        }

        const selection = window.getSelection();
        const selected = selection ? selection.toString().trim() : '';
        if (selected.length > 20) return selected;

        const parsed = this._parseReadability();
        if (parsed?.text.length > 50) {
            return parsed.text.slice(0, 50000);
        }

        // Fallback: try common article containers
        const el = document.querySelector('article, [role="main"], main, .post-content, .article-content, .entry-content');
        if (el) return el.innerText.trim().slice(0, 50000);

        return document.body.innerText.trim().slice(0, 50000);
    }

    /** For universal pages, "comment blocks" don't exist. */
    getCommentBlocks() { return []; }

    getSystemMessage() {
        return HNPrompts.universal.system;
    }

    getUserMessageTemplate() {
        return HNPrompts.universal.user;
    }

    /** @override */
    getPostSummarySystemMessage() {
        return HNPrompts.universal.system;
    }

    /** @override */
    getPostSummaryUserMessageTemplate() {
        return HNPrompts.universal.user;
    }

    // ---- Summary flow hooks ----

    isDedicatedCommentsPage() { return false; }

    shouldAutoGeneratePostSummary() { return true; }

    /** @override */
    supportsParagraphJump() { return true; }

    /** @override */
    getPostBodyElement() {
        if (this._selectionBlocks.length > 0) {
            return (
                this._selectionBlocks[0].closest(
                    'article, [role="main"], main, .post-content, .article-content, .entry-content'
                )
                || this._selectionBlocks[0].parentElement
                || this._getContentRoot()
            );
        }
        return this._getContentRoot();
    }

    /** @override */
    getParagraphElements(bodyEl) {
        if (this._selectionBlocks.length > 0) {
            return this._selectionBlocks;
        }
        if (!bodyEl) return [];
        return [...bodyEl.querySelectorAll(SelectionAdapter._PARA_SELECTOR)].filter(
            (el) => el.textContent.trim().length > 0
        );
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
        return HNPrompts.universal.chat.system;
    }

    /** @override */
    supportsSelectionFab() { return true; }

    /** @override */
    getHubButtons(enhancer) {
        const buttons = [
            {
                label: 'Chat',
                title: 'Open a chat about this page',
                onClick: () => enhancer.openPostChatModal(),
            },
            ...this.getSaveHubButtons(enhancer),
        ];

        this._maybeAddSubstackButton(buttons, enhancer);
        return buttons;
    }

    /**
     * Add Substack custom-domain detection / enable / disable buttons.
     * @param {Array} buttons — mutated in-place
     * @param {object} enhancer
     */
    _maybeAddSubstackButton(buttons, enhancer) {
        if (typeof SubstackDomains === 'undefined') return;

        const hostname = SubstackDomains.normalizeHostname(location.hostname);
        if (SubstackDomains.isNativeSubstackHost(hostname)) return;

        const detection = SubstackDomains.detectPageSignals();
        const customDomains = window.__HN_SUBSTACK_CUSTOM_DOMAINS || [];
        const enabled = SubstackDomains.isCustomDomainEnabled(hostname, customDomains);

        // Case 1: already enabled — always show management
        if (enabled) {
            if (detection.pathnameOk) {
                buttons.push({
                    label: 'Inject / Reload',
                    title: 'Reload page to activate Substack features',
                    onClick: () => window.location.reload(),
                });
            }
            buttons.push({
                label: 'Disable Substack',
                title: `Remove ${hostname} from Substack custom domains`,
                onClick: async () => {
                    try {
                        const resp = await chrome.runtime.sendMessage({
                            type: 'REMOVE_SUBSTACK_DOMAIN',
                            data: { hostname },
                        });
                        if (resp?.success) window.location.reload();
                    } catch (error) {
                        console.error(
                            '[SelectionAdapter] Failed to disable Substack:',
                            error
                        );
                    }
                },
            });
            return;
        }

        // Case 2: not enabled but Substack detected on a post page
        if (!detection.likelySubstack) return;

        const feedHint = detection.substackFeed
            ? `Linked: ${detection.substackFeed}`
            : `Signals: ${detection.signals.join(', ')}`;
        buttons.push({
            label: 'Enable Substack',
            title: `Substack detected (${feedHint}). Enable summaries, comments & navigation?`,
            onClick: async () => {
                try {
                    const resp = await chrome.runtime.sendMessage({
                        type: 'ENABLE_SUBSTACK_DOMAIN',
                        data: { hostname },
                    });
                    if (!resp?.success) {
                        throw new Error(resp?.error || 'Enable failed');
                    }
                    window.location.reload();
                } catch (error) {
                    console.error(
                        '[SelectionAdapter] Failed to enable Substack domain:',
                        error
                    );
                }
            },
        });
    }

};
