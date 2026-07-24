/**
 * SubstackAdapter — DOM extraction for Substack posts.
 *
 * Substack comments do NOT have stable IDs, so the comment ID strategy
 * uses a hash of author + first 100 chars of text as a fallback.
 *
 * The main use case is summarizing the post content, not deep comment
 * analysis, but full comment extraction is supported.
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
        return /^https:\/\/[\w-]+\.substack\.com\/(p|post)\/[\w-]+/.test(url);
    }

    // ── Site identity ─────────────────────────────────────────────

    getSiteKey() {
        return 'substack.com';
    }

    // ── Post identity ─────────────────────────────────────────────

    getPostId() {
        const match = location.pathname.match(/\/(p|post)\/([\w-]+)/);
        return match ? match[2] : null;
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
            document.querySelector('article') ||
            document.querySelector('.body') ||
            document.querySelector('[class*="post-body"]')
        );
    }

    // ── Comment / block extraction ────────────────────────────────

    getCommentBlocks() {
        // Try selectors in order, return the first that yields results
        const selectors = [
            '[data-testid="comment"]',
            '.post-comment',
            '.comment',
            '[class*="Comment"]',
        ];

        for (const selector of selectors) {
            // Query all matching elements
            const all = [...document.querySelectorAll(selector)];

            // Filter to top-level only: exclude elements nested inside another comment
            const topLevel = all.filter((el) => {
                // Check if this element has an ancestor that is also a comment element
                return !el.parentElement?.closest(selector);
            });

            if (topLevel.length > 0) {
                return topLevel;
            }
        }

        return [];
    }

    getChildBlocks(block) {
        // Find all descendant comment elements
        const descendants = block.querySelectorAll(
            '[data-testid="comment"], .post-comment, .comment, [class*="Comment"]'
        );

        // Filter to only direct children (not grandchildren).
        // A direct child is one whose parent's closest ancestor comment is *this* block.
        return [...descendants].filter((child) => {
            // Walk up parent chain until we hit a block-level ancestor
            let parent = child.parentElement;
            while (parent && parent !== block) {
                const closestComment = parent.closest(
                    '[data-testid="comment"], .post-comment, .comment, [class*="Comment"]'
                );
                if (closestComment) {
                    // If that ancestor comment is not the block itself, this is a grandchild
                    return closestComment === block;
                }
                parent = parent.parentElement;
            }
            // If we never found another comment ancestor, it's a direct child of block
            return true;
        });
    }

    getBlockId(block) {
        // Substack has no stable comment IDs.
        // Generate a hash from author + first 100 chars of text as fallback.
        if (!block.dataset.hnBlockHash) {
            const author = this.getBlockAuthor(block);
            const text = this.getBlockText(block).slice(0, 100);
            const raw = `${author}:${text}`;
            let hash = 0;
            for (let i = 0; i < raw.length; i++) {
                const chr = raw.charCodeAt(i);
                hash = ((hash << 5) - hash) + chr;
                hash |= 0; // Convert to 32bit integer
            }
            block.dataset.hnBlockHash = String(hash);
        }
        return block.dataset.hnBlockHash;
    }

    getBlockAuthor(block) {
        const selectors = [
            '[class*="username"]',
            '.commenterUsername',
            'a[href*="/profile/"]',
        ];

        for (const sel of selectors) {
            const el = block.querySelector(sel);
            if (el) {
                const text = el.textContent?.trim();
                if (text) return text;
            }
        }

        return '';
    }

    getBlockText(block) {
        const selectors = [
            '.post-comment-content',
            '[class*="CommentBody"]',
            '[class*="comment-body"]',
        ];

        for (const sel of selectors) {
            const el = block.querySelector(sel);
            if (el) {
                const text = el.innerText?.trim();
                if (text) return text;
            }
        }

        return '';
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
        const link = block.querySelector('a[href*="#comment-"]') ||
                     block.querySelector('a[href*="/comment/"]');
        return link?.href || null;
    }

    getBlockIndentLevel(block) {
        let level = 0;
        let current = block;
        while (current.parentElement) {
            const ancestor = current.parentElement.closest(
                '[data-testid="comment"], .post-comment, .comment, [class*="Comment"]'
            );
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
        const selectors = [
            '.post-comment-content',
            '[class*="CommentBody"]',
            '[class*="comment-body"]',
        ];

        for (const sel of selectors) {
            const el = block.querySelector(sel);
            if (el) {
                const html = el.innerHTML?.trim();
                if (html) return html;
            }
        }

        return '';
    }

    // ── Comment injection ─────────────────────────────────────────

    getInjectTarget(block) {
        return (
            block.querySelector('[class*="comment-header"]') ||
            block.querySelector('[class*="CommentHeader"]') ||
            block.querySelector('div:first-child')
        );
    }

    // ── Page-level injection ───────────────────────────────────────

    getPageActionAnchor() {
        // Substack post subtitle area — look for the subtitle/date line
        // under the post title, or the post header meta area.
        return (
            document.querySelector('.subtitle') ||
            document.querySelector('[class*="post-header"] [class*="meta"]') ||
            document.querySelector('[class*="PostHeader"]') ||
            document.querySelector('article .post-header') ||
            document.querySelector('article header')
        );
    }

    // ── Anchor resolution ─────────────────────────────────────────

    resolveBlockByRef(ref) {
        // If ref is "post", return the post body element
        if (ref === 'post') {
            return this.getPostBodyElement();
        }

        // Otherwise interpret ref as a numeric index into the flat block list
        const index = Number(ref);
        if (!isNaN(index)) {
            const flat = this.getAllBlocksFlat();
            return flat[index] || null;
        }

        return null;
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
        return 'You are an AI assistant specialized in analyzing and summarizing Substack posts and their comment discussions. ' +
            'Focus on extracting the key arguments, insights, and perspectives from both the article and the comments.';
    }

    getUserMessageTemplate() {
        return 'Provide a concise and insightful summary of the following Substack post and its discussion. ' +
            'Highlight the main thesis, supporting arguments, and the most interesting perspectives from the comments. ' +
            'Use [#N] notation to reference specific comments where relevant.';
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

    getHubStats() {
        const commentCount = this.getCommentBlocks().length;
        return [
            { id: 'comments', label: 'Comments', value: String(commentCount) },
        ];
    }

    // ── Favorites / bookmarks ─────────────────────────────────────

    getFavoritesUrl() {
        return null;
    }

    getUserFavoritesUrl(_username) {
        return null;
    }
};
