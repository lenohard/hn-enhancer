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
     * Paragraph-like blocks inside `bodyEl` used for [P#] numbering and jump targets.
     * @param {Element} bodyEl
     * @returns {Element[]}
     */
    getParagraphElements(bodyEl) {
        if (!bodyEl) return [];
        return [...bodyEl.querySelectorAll('p')].filter(
            (el) => el.textContent.trim().length > 0
        );
    }

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

    /** Whether paragraph [P#] anchors are clickable for jump-to-source. */
    supportsParagraphJump() { return true; }

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
     * Save page link + open saved list (shared by Universal, Substack, etc.).
     * @param {object} enhancer
     * @returns {Array<{label: string, title?: string, onClick: Function, hubView?: string}>}
     */
    getSaveHubButtons(enhancer) {
        return [
            {
                label: 'Save',
                title: 'Save this page link',
                onClick: () => enhancer.savePageLink(),
            },
        ];
    }

    /**
     * Whether to show the selection FAB (Summarize / Chat / Save on text select).
     * @returns {boolean}
     */
    supportsSelectionFab() { return false; }

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

    /**
     * Collect article image URLs (absolute) for vision-enabled summaries.
     * Default: none. Substack/Selection adapters override.
     * @param {number} [_maxCount=8]
     * @returns {string[]}
     */
    getArticleImages(_maxCount = 8) {
        return this.getArticleImageEntries(_maxCount).map((entry) => entry.url);
    }

    /**
     * Collect numbered article images and retain their source DOM elements so
     * [I#] citations can jump back to the page.
     * @param {number} [_maxCount=8]
     * @returns {Array<{ref: string, url: string, element: HTMLImageElement}>}
     */
    getArticleImageEntries(_maxCount = 8) { return []; }

    /**
     * Collect usable, remote image URLs from a DOM subtree. Tiny UI images,
     * hidden images, data URLs, and duplicate URLs are excluded.
     * @param {ParentNode|null} root
     * @param {number} [_maxCount=8]
     * @returns {string[]}
     */
    _collectImageEntries(root, _maxCount = 8) {
        if (!root?.querySelectorAll) return [];

        const parsedLimit = Number.parseInt(_maxCount, 10);
        const maxCount = Number.isFinite(parsedLimit)
            ? Math.max(0, parsedLimit)
            : 8;
        if (maxCount === 0) return [];

        const entries = [];
        const seenUrls = new Set();
        for (const img of root.querySelectorAll('img')) {
            if (img.hidden || img.getAttribute('aria-hidden') === 'true') continue;
            if (this._isLikelyNonContentImage(img)) continue;

            const lazySrc =
                img.getAttribute('data-src') ||
                img.getAttribute('data-original') ||
                '';
            const declaredWidth = Number.parseFloat(img.getAttribute('width')) || 0;
            const declaredHeight = Number.parseFloat(img.getAttribute('height')) || 0;
            // A loaded 1x1 placeholder should not disqualify its real lazy URL.
            const width = lazySrc ? declaredWidth : img.naturalWidth || declaredWidth;
            const height = lazySrc ? declaredHeight : img.naturalHeight || declaredHeight;
            if ((width > 0 && width < 48) || (height > 0 && height < 48)) continue;

            const candidates = [img.currentSrc, lazySrc, img.src].filter(Boolean);
            let src = null;
            for (const candidate of candidates) {
                const absolute = this._absoluteUrl(candidate);
                try {
                    const protocol = new URL(absolute).protocol;
                    if (protocol === 'http:' || protocol === 'https:') {
                        src = absolute;
                        break;
                    }
                } catch {
                    // Try the next source candidate.
                }
            }
            if (!src || seenUrls.has(src)) continue;

            const ref = `I${entries.length + 1}`;
            img.dataset.hnImageRef = ref;
            entries.push({ ref, url: src, element: img });
            seenUrls.add(src);
            if (entries.length >= maxCount) break;
        }
        this._articleImageRefMap = new Map(
            entries.map((entry) => [entry.ref, entry])
        );
        return entries;
    }

    /**
     * Exclude avatars, profile chrome, controls, logos, and other images that
     * are technically inside an article container but are not article content.
     * @param {HTMLImageElement} img
     * @returns {boolean}
     */
    _isLikelyNonContentImage(img) {
        const excludedContainerSelector = [
            '[class*="avatar" i]',
            '[data-testid*="avatar" i]',
            '[class*="userpic" i]',
            '[class*="profile-image" i]',
            '[class*="profile-photo" i]',
            '[class*="author-photo" i]',
            '[class*="author-image" i]',
            '[class*="byline" i]',
            '[rel~="author"]',
            'button',
            '[role="button"]',
            'nav',
            'footer',
            'aside',
        ].join(',');
        if (img.closest(excludedContainerSelector)) return true;

        const identityText = [
            img.className,
            img.id,
            img.alt,
            img.title,
            img.getAttribute('aria-label'),
        ].filter(Boolean).join(' ');
        if (/(?:avatar|userpic|profile[- ]?(?:image|photo|picture)|author[- ]?(?:image|photo|portrait)|头像|用户头像)/i.test(identityText)) {
            return true;
        }

        const sourceHint = [
            img.currentSrc,
            img.getAttribute('data-src'),
            img.src,
        ].filter(Boolean).join(' ');
        if (/(?:^|[\/_-])(?:avatar|userpic|gravatar|profile[-_]?(?:image|photo))(?:[\/_\-.]|$)/i.test(sourceHint)) {
            return true;
        }

        if (/(?:^|\s)(?:logo|icon|emoji|spinner)(?:\s|$)/i.test(identityText)) {
            return true;
        }

        return false;
    }

    /**
     * Insert [I#] placeholders after the nearest preceding [P#] line, keeping
     * the original image/text order in prompts while image bytes remain as
     * OpenAI-compatible attachments.
     * @param {string} text
     * @returns {string}
     */
    addImagePlaceholders(text) {
        const entries = [...(this._articleImageRefMap?.values?.() || [])];
        const bodyEl = this.getPostBodyElement?.();
        const paragraphs = this.getParagraphElements?.(bodyEl) || [];
        if (!entries.length || !paragraphs.length || !/\[P\d+\]/m.test(text)) {
            return text;
        }

        const placements = new Map();
        entries.forEach((entry) => {
            let afterParagraph = 0;
            paragraphs.forEach((paragraph, index) => {
                if (
                    paragraph.contains(entry.element) ||
                    (paragraph.compareDocumentPosition(entry.element) & 4)
                ) {
                    afterParagraph = index + 1;
                }
            });
            const refs = placements.get(afterParagraph) || [];
            refs.push(`[${entry.ref}]`);
            placements.set(afterParagraph, refs);
        });

        const lines = String(text).split('\n');
        const output = [];
        let insertedBeforeFirstParagraph = false;
        lines.forEach((line) => {
            const paragraphMatch = line.match(/^\[P(\d+)\]\s/);
            if (paragraphMatch && !insertedBeforeFirstParagraph) {
                output.push(...(placements.get(0) || []));
                insertedBeforeFirstParagraph = true;
            }
            output.push(line);
            if (paragraphMatch) {
                output.push(...(placements.get(Number(paragraphMatch[1])) || []));
            }
        });

        return output.join('\n');
    }

    /**
     * Resolve an [I#] citation to its current source image.
     * @param {string} ref
     * @returns {HTMLImageElement|null}
     */
    resolveImageByRef(ref) {
        let entry = this._articleImageRefMap?.get(ref);
        if (!entry?.element?.isConnected) {
            entry = this.getArticleImageEntries(8).find(
                (candidate) => candidate.ref === ref
            );
        }
        return entry?.element || null;
    }

    /**
     * Rebuild an image-ref map saved with a cached summary/chat by matching
     * its URLs against images currently present in the article.
     * @param {Array<{ref: string, url: string}>} savedEntries
     */
    restoreImageRefs(savedEntries) {
        if (!Array.isArray(savedEntries) || savedEntries.length === 0) return;

        // Search beyond the attachment limit so inserted images do not break
        // citations from a cached result.
        const currentEntries = this.getArticleImageEntries(
            Math.max(64, savedEntries.length)
        );
        const elementsByUrl = new Map(
            currentEntries.map((entry) => [entry.url, entry.element])
        );
        const restored = savedEntries
            .map(({ ref, url }) => ({
                ref,
                url,
                element: elementsByUrl.get(url),
            }))
            .filter((entry) => entry.ref && entry.url && entry.element);

        if (restored.length > 0) {
            currentEntries.forEach((entry) => {
                delete entry.element.dataset.hnImageRef;
            });
            restored.forEach((entry) => {
                entry.element.dataset.hnImageRef = entry.ref;
            });
            this._articleImageRefMap = new Map(
                restored.map((entry) => [entry.ref, entry])
            );
        }
    }

    /**
     * Build OpenAI-compatible multimodal content with stable [I#] labels.
     * Keeping this in the adapter layer gives summary and chat one contract.
     * @param {string} text
     * @param {Array<string|{ref?: string, url: string}>} imageUrls
     * @param {Array<{ref?: string, dataUrl: string}>} screenshots
     * @param {{includeInstructions?: boolean}} [options]
     * @returns {string|Array<object>}
     */
    buildVisionMessageContent(
        text,
        imageUrls = [],
        screenshots = [],
        options = {}
    ) {
        imageUrls = Array.isArray(imageUrls) ? imageUrls : [];
        screenshots = Array.isArray(screenshots)
            ? screenshots.filter((shot) => typeof shot?.dataUrl === 'string')
            : [];
        if (imageUrls.length === 0 && screenshots.length === 0) return text;

        let renderedText = String(text || '');
        if (options.includeInstructions !== false) {
            const imageRefs = imageUrls
                .map((entry, index) =>
                    typeof entry === 'object' && entry?.ref
                        ? entry.ref
                        : `I${index + 1}`
                )
                .filter(Boolean);
            const screenshotRefs = screenshots.map(
                (screenshot, index) => screenshot.ref || `S${index + 1}`
            );
            const instructions = [];
            if (imageRefs.length > 0) {
                const imageLabels = imageRefs
                    .map((ref) => `[${ref}]`)
                    .join(', ');
                const hasImagePlaceholders = imageRefs.some((ref) =>
                    renderedText.includes(`[${ref}]`)
                );
                instructions.push(hasImagePlaceholders
                    ? `The article text contains image placeholders at their original positions. ` +
                      `Attached article images are labeled ${imageLabels}.`
                    : `Attached article images are labeled ${imageLabels}.`
                );
            }
            if (screenshotRefs.length > 0) {
                instructions.push(
                    `The full-page webpage screenshot is labeled ${screenshotRefs.map((ref) => `[${ref}]`).join(', ')}. ` +
                    `Use it when extracted text is missing, incomplete, or visual layout matters.`
                );
            }
            instructions.push(
                `When visual evidence is relevant, cite its exact [I#] or [S#] label. ` +
                `Do not cite visual attachments you did not use.`
            );
            renderedText +=
                `\n\n---\n\n# Visual citation instructions\n` +
                instructions.join(' ');
        }
        const content = [{ type: 'text', text: renderedText }];

        imageUrls.forEach((imageEntry, index) => {
            const url = typeof imageEntry === 'string'
                ? imageEntry
                : imageEntry?.url;
            if (!url) return;
            const ref = typeof imageEntry === 'object' && imageEntry?.ref
                ? imageEntry.ref
                : `I${index + 1}`;
            content.push({ type: 'text', text: `Image [${ref}]` });
            content.push({
                type: 'image_url',
                image_url: { url },
            });
        });
        screenshots.forEach((screenshot, index) => {
            const ref = screenshot.ref || `S${index + 1}`;
            content.push({
                type: 'text',
                text: `Screenshot [${ref}] — full webpage`,
            });
            content.push({
                type: 'image_url',
                image_url: { url: screenshot.dataUrl },
            });
        });
        return content;
    }

    /**
     * Make a relative URL absolute against the current document.
     * @param {string} src
     * @returns {string|null}
     */
    _absoluteUrl(src) {
        if (!src) return null;
        try {
            return new URL(src, document.baseURI).href;
        } catch {
            return null;
        }
    }
};
