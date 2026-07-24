/**
 * SubstackAdapter — DOM extraction for Substack posts.
 *
 * Comment IDs come from Substack's `.comment-anchor` elements (e.g.
 * `comment-298895672`). Summary scope differs by page:
 *   - Article page (`/p/slug`): post body + inline comments
 *   - Comments page (`/p/slug/comments`): comment thread only
 */

window.SubstackAdapter = class SubstackAdapter extends SiteAdapter {
    /** Human-readable site name shown in UI. */
    name = 'Substack';

    // ── URL matching ──────────────────────────────────────────────

    /**
     * Return true for Substack post/permalink URLs.
     * Matches:
     *   https://*.substack.com/p/*
     *   https://*.substack.com/post/*
     * Does NOT match /notes/, /about/, or the homepage listing.
     */
    matches(url) {
        const customDomains = window.__HN_SUBSTACK_CUSTOM_DOMAINS || [];
        if (typeof SubstackDomains !== 'undefined') {
            return SubstackDomains.matchesSubstackUrl(url, customDomains);
        }
        return /^https:\/\/[\w-]+\.substack\.com\/(p|post)\/[\w-]+(\/comments)?\/?$/.test(url);
    }

    // ── Site identity ─────────────────────────────────────────────

    getSiteKey() {
        if (typeof SubstackDomains !== 'undefined') {
            return SubstackDomains.normalizeHostname(location.hostname);
        }
        return location.hostname.replace(/^www\./i, '');
    }

    // ── Post identity ─────────────────────────────────────────────

    getPostId() {
        const match = location.pathname.match(/\/(p|post)\/([\w-]+)/);
        return match ? match[2] : null;
    }

    /** @override */
    isCommentsPage() {
        // Article pages include inline comments; dedicated /comments pages too.
        return /\/(p|post)\/[\w-]+(\/comments)?\/?$/.test(location.pathname);
    }

    /** True only for the dedicated full comments page (not inline discussion on article). */
    isDedicatedCommentsPage() {
        return /\/comments\/?$/.test(location.pathname);
    }

    /**
     * URL of the dedicated comments page for the current post.
     * @returns {string|null}
     */
    getCommentsPageUrl() {
        const postId = this.getPostId();
        if (!postId) return null;

        const match = location.pathname.match(/\/(p|post)\//);
        const segment = match ? match[1] : 'p';
        return `${location.origin}/${segment}/${postId}/comments`;
    }

    getLoggedInUsername() {
        // Try user-indicator testid (Substack's current UI)
        const userIndicator = document.querySelector('[data-testid="user-indicator"]');
        if (userIndicator) {
            const text = userIndicator.textContent?.trim();
            if (text) return text;
        }

        // Try profile links
        const profileLink = document.querySelector('a[href*="/profile/"]');
        if (profileLink) {
            const match = profileLink.href.match(/\/profile\/([^/?]+)/);
            if (match) return match[1];
        }

        // Try subscriber badge / any element with subscriber info
        const subscriberBadge = document.querySelector('[class*="subscriber"], [class*="Subscriber"]');
        if (subscriberBadge) {
            const text = subscriberBadge.textContent?.trim();
            if (text) return text;
        }

        return null;
    }

    getPostTitle() {
        return document.querySelector('h1')?.textContent?.trim() || document.title;
    }

    getPostBodyElement() {
        return (
            document.querySelector('article .body.markup') ||
            document.querySelector('article') ||
            document.querySelector('.body.markup')
        );
    }

    getPostText() {
        const el =
            document.querySelector('article .body.markup') ||
            document.querySelector('.available-content .body.markup');
        return el?.innerText?.trim() || '';
    }

    shouldAutoGeneratePostSummary() {
        if (!this.getPostId()) return false;
        if (this.isDedicatedCommentsPage()) {
            return this.getCommentBlocks().length > 0;
        }
        return !!this.getPostText();
    }

    shouldIncludePostInSummary() {
        return !this.isDedicatedCommentsPage();
    }

    supportsServerSummary() {
        return false;
    }

    /** Separate cache for article summary vs dedicated comments-page summary. */
    getPostSummaryCacheId() {
        return this.isDedicatedCommentsPage() ? 'comments' : 'article';
    }

    // ── Comment / block extraction ────────────────────────────────

    getCommentBlocks() {
        // Real Substack DOM: `.comment` is the top-level comment wrapper.
        // (`[data-hn-block-hash]` is only set by us via getBlockId(), so it can't be
        //  used here — the selector would match zero elements on initial page load.)
        const all = [...document.querySelectorAll('.comment')];

        // Filter to top-level only: exclude comments nested inside other comments
        return all.filter((el) => !el.parentElement?.closest('.comment'));
    }

    getChildBlocks(block) {
        const descendants = block.querySelectorAll('.comment');

        // Direct children = whose closest `.comment` ancestor is this block
        return [...descendants].filter((child) => {
            const parent = child.parentElement?.closest('.comment');
            return parent === block;
        });
    }

    getBlockId(block) {
        const anchor =
            block.querySelector('.comment-anchor[id^="comment-"]') ||
            block.querySelector('[id^="comment-"]');
        if (anchor?.id) {
            return anchor.id;
        }

        const permalink = this.getBlockPermalink(block);
        if (permalink) {
            const match = permalink.match(/\/comment\/(\d+)/);
            if (match) {
                return `comment-${match[1]}`;
            }
        }

        return null;
    }

    getBlockAuthor(block) {
        // Real DOM: `.comment-author-name a` inside `.comment-content`
        const el = block.querySelector('.comment-author-name a');
        if (el) return el.textContent?.trim() || '';

        // Fallback: any profile link inside comment-content
        const fallback = block.querySelector('.comment-content a[href*="/profile/"]');
        return fallback?.textContent?.trim() || '';
    }

    getBlockText(block) {
        // Real DOM: `.comment-body` div contains the comment text
        const el = block.querySelector('.comment-body');
        return el?.innerText?.trim() || '';
    }

    getBlockTime(block) {
        const timeEl = block.querySelector('time');
        if (timeEl) {
            const dt = timeEl.getAttribute('datetime');
            if (dt) {
                const ms = Date.parse(dt);
                if (!isNaN(ms)) return ms;
            }
        }
        return null;
    }

    getBlockPermalink(block) {
        // Real DOM: timestamp link has href like /p/slug/comment/298895672
        const link = block.querySelector('a[href*="/comment/"]');
        return link?.href || null;
    }

    getBlockIndentLevel(block) {
        let level = 0;
        let current = block;
        while (current.parentElement) {
            const ancestor = current.parentElement.closest('.comment');
            if (ancestor) {
                level++;
                current = ancestor;
            } else {
                break;
            }
        }
        return level;
    }

    getBlockDownvoteCount(_block) {
        // Substack doesn't show downvotes
        return 0;
    }

    // ── Rich text ─────────────────────────────────────────────────

    getBlockHTML(block) {
        const el = block.querySelector('.comment-body');
        return el?.innerHTML?.trim() || '';
    }

    // ── Comment injection ─────────────────────────────────────────

    getInjectTarget(block) {
        // Real DOM: `.comment-anchor` div is the first child of `.comment`,
        // above the `.comment-content` div. It's the natural place to add links.
        // It already contains the comment ID anchor.
        return block.querySelector('.comment-anchor') || block.firstElementChild;
    }

    // ── Page-level injection ───────────────────────────────────────

    getPageActionAnchor() {
        // Real DOM: author/date meta line inside `.post-header`
        // Structure: .single-post > .pencraft > .main-content-wrapper > .hn-content-container
        //            > article > div[role="region"].post-header
        // The header contains .byline-wrapper > .meta-<hash> (hash suffix is unstable).
        // Use semantic .byline-wrapper (or fall back to .post-header itself).
        return (
            document.querySelector('.post-header .byline-wrapper') ||
            document.querySelector('.post-header')
        );
    }

    // ── Anchor resolution ─────────────────────────────────────────

    resolveBlockByRef(ref) {
        if (!ref) return null;

        if (ref === 'post') {
            return this.getPostBodyElement();
        }

        // Tree path from summary (e.g. "1", "1.2", "1.2.3")
        if (/^\d+(?:\.\d+)*$/.test(ref)) {
            return this._resolveBlockByPath(ref);
        }

        // Substack anchor id or numeric comment id
        const anchorId = ref.startsWith('comment-') ? ref : `comment-${ref}`;
        const byId = document.getElementById(anchorId);
        if (byId) {
            return byId.closest('.comment') || byId;
        }

        return null;
    }

    /**
     * Walk the comment tree to find the block at a dotted path.
     * @param {string} path — e.g. "1.2.3" (1-indexed siblings at each level)
     * @returns {Element|null}
     */
    _resolveBlockByPath(path) {
        const indices = path.split('.').map((part) => parseInt(part, 10));
        if (indices.some((n) => !n || Number.isNaN(n))) {
            return null;
        }

        let blocks = this.getCommentBlocks();
        let block = null;

        for (let depth = 0; depth < indices.length; depth++) {
            const idx = indices[depth] - 1;
            if (idx < 0 || idx >= blocks.length) {
                return null;
            }
            block = blocks[idx];
            if (depth < indices.length - 1) {
                blocks = this.getChildBlocks(block);
            }
        }

        return block;
    }

    // ── Helpers ───────────────────────────────────────────────────

    /**
     * Return a flat array of [postBody, ...all comments recursively].
     * Used for anchor resolution by numeric index.
     * @returns {Element[]}
     */
    getAllBlocksFlat() {
        const postBody = this.getPostBodyElement();
        const all = postBody ? [postBody] : [];

        // Recursively collect all comment blocks
        const collect = (blocks) => {
            for (const block of blocks) {
                all.push(block);
                const children = this.getChildBlocks(block);
                if (children.length > 0) {
                    collect(children);
                }
            }
        };

        collect(this.getCommentBlocks());
        return all;
    }

    // ── Prompt context ─────────────────────────────────────────────

    getPromptContext() {
        return 'a Substack post';
    }

    getSystemMessage() {
        const prompts = HNPrompts.substack;
        return this.isDedicatedCommentsPage() ? prompts.comments.system : prompts.article.system;
    }

    getUserMessageTemplate() {
        const prompts = HNPrompts.substack;
        return this.isDedicatedCommentsPage() ? prompts.comments.user : prompts.article.user;
    }

    /** @override */
    getPostSummarySystemMessage() {
        return HNPrompts.substack.article.system;
    }

    /** @override */
    getPostSummaryUserMessageTemplate() {
        return HNPrompts.substack.article.user;
    }

    // ── Hub panel ─────────────────────────────────────────────────

    getHubTitle() {
        return 'Substack Companion';
    }

    getHubActions() {
        return [
            { id: 'summarize-post', label: 'Summarize Post' },
            { id: 'options', label: 'Options', href: 'options' },
        ];
    }

    /** @override */
    getHubButtons(enhancer) {
        const buttons = [];

        if (!this.isDedicatedCommentsPage()) {
            buttons.push({
                label: 'Comments',
                title: 'Open full comments page',
                onClick: () => {
                    const url = this.getCommentsPageUrl();
                    if (url) window.location.href = url;
                },
            });
        }

        buttons.push({
            label: 'Chat',
            title: 'Open a chat about this post',
            onClick: () => enhancer.openPostChatModal(),
        });

        buttons.push({
            label: 'Save',
            title: 'Bookmark this post for later',
            onClick: () => {
                // TODO: implement Substack post bookmarking via HNState
                console.log('[HN Enhancer] Save post:', enhancer.adapter?.getPostId());
            },
        });

        return buttons;
    }

    /** @override */
    getHubStats(_enhancer) {
        if (!this.getPostId()) return [];

        const inlineCount = this.getCommentBlocks().length;
        // Parse "N more comments..." link to get the off-page count
        let moreCount = 0;
        const moreLink = document.querySelector('a.more-comments');
        if (moreLink) {
            const match = moreLink.textContent.match(/(\d+)/);
            if (match) moreCount = parseInt(match[1], 10);
        }
        const totalCount = inlineCount + moreCount;
        return [
            { id: 'comments', label: 'Comments', value: String(totalCount) },
        ];
    }

    /**
     * Replace Substack's "N more comments..." teaser with a plain Comments link.
     */
    enhanceCommentsLink() {
        if (this.isDedicatedCommentsPage()) return;

        const commentsUrl = this.getCommentsPageUrl();
        if (!commentsUrl) return;

        const enhance = () => {
            document.querySelectorAll('a.more-comments').forEach((link) => {
                if (link.dataset.hnEnhancedComments) return;
                link.dataset.hnEnhancedComments = 'true';
                link.href = commentsUrl;
                // Keep original "N more comments..." text, just enhance the link
                link.title = 'Open full comments page';
            });
        };

        enhance();

        if (this._commentsLinkObserver) return;

        this._commentsLinkObserver = new MutationObserver(() => enhance());
        this._commentsLinkObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });
        setTimeout(() => {
            this._commentsLinkObserver?.disconnect();
            this._commentsLinkObserver = null;
        }, 30000);
    }

    /** @override */
    initArticlePage(_enhancer) {
        this.enhanceCommentsLink();
    }

    // ── Favorites / bookmarks ─────────────────────────────────────

    getFavoritesUrl() {
        return null;
    }

    getUserFavoritesUrl(_username) {
        return null;
    }

    // ── Chat context options ─────────────────────────────────────

    /**
     * Return the most recent cached post summary, or null. Looks up the cache
     * for the current scope (article or dedicated comments page).
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
     * Substack post chats work against the article body, an optional cached
     * summary, or both. Summary-dependent options are filtered out when no
     * cached summary is available.
     * @param {object} enhancer
     * @returns {Promise<Array<{id: string, label: string, group: string, requiresSummary?: boolean}>>}
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

    /** @override */
    getChatSystemMessage() {
        return HNPrompts?.substack?.chat?.system || null;
    }
};
