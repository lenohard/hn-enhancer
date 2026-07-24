/**
 * HnAdapter — SiteAdapter for Hacker News (news.ycombinator.com).
 *
 * Implements all abstract methods from SiteAdapter using the exact
 * selectors and logic previously in dom-utils.js.
 *
 * Ported methods from DomUtils:
 *   getPostId / getCurrentHNItemId    → getPostId
 *   getLoggedInUsername                → getLoggedInUsername
 *   getCommentId                       → getBlockId
 *   getCommentAuthor                   → getBlockAuthor
 *   getCommentText                     → getBlockText
 *   getCommentPermalink                → getBlockPermalink
 *   getCommentIndentLevel              → getBlockIndentLevel
 *   getDownvoteCount                   → getBlockDownvoteCount
 *   getHNPostTitle                     → getPostTitle
 *   findCommentElementById            → resolveBlockByRef
 *   getDirectChildComments             → getChildBlocks
 *   getCommentContext                   → getCommentContext
 *   getDescendantComments              → getDescendantComments
 *   getDirectChildCommentsWithMetadata → getDirectChildCommentsWithMetadata
 *   resolveCommentElementByPath        → resolveCommentElementByPath
 *   calculateCommentScore              → calculateCommentScore
 *   formatCommentForLLM                → formatCommentForLLM
 *   getUpvoteCount                     → getUpvoteCount
 *   calculateCommentStatistics         → calculateCommentStatistics
 */

window.HnAdapter = class HnAdapter extends SiteAdapter {
    // ── Site identity ─────────────────────────────────────────────

    /** @type {string} */
    name = 'Hacker News';

    /**
     * Return true when url points to Hacker News.
     * @param {string} url
     * @returns {boolean}
     */
    matches(url) {
        return url.startsWith('https://news.ycombinator.com/');
    }

    /**
     * Short key used in storage keys.
     * @returns {string}
     */
    getSiteKey() {
        return 'news.ycombinator.com';
    }

    /**
     * Return a short description of the site for AI prompts.
     * @returns {string}
     */
    getPromptContext() {
        return 'Hacker News';
    }

    // ── Post identity ─────────────────────────────────────────────

    /**
     * Returns the HN item ID from the current URL's query string.
     * @returns {string|null}
     */
    getPostId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id');
    }

    /**
     * Returns the logged-in HN username from the top navigation, if present.
     * @returns {string|null}
     */
    getLoggedInUsername() {
        const favoritesLink = document.querySelector('a[href*="favorites?id="]');
        if (favoritesLink) {
            const href = favoritesLink.getAttribute('href') || '';
            const match = href.match(/favorites\?id=([^&]+)/);
            if (match?.[1]) {
                return decodeURIComponent(match[1]);
            }
        }

        const userLink = document.querySelector('a[href^="user?id="]');
        if (userLink) {
            const href = userLink.getAttribute('href') || '';
            const match = href.match(/user\?id=([^&]+)/);
            if (match?.[1]) {
                return decodeURIComponent(match[1]);
            }
        }

        return null;
    }

    /**
     * Returns the post title.
     * Tries the DOM selector first; falls back to document.title
     * with the " | Hacker News" suffix stripped.
     * @returns {string|null}
     */
    getPostTitle() {
        // Try the titleline link first
        const titleElement = document.querySelector(
            'td.title > span.titleline > a'
        );
        if (titleElement) {
            return titleElement.textContent.trim();
        }

        // Fall back to document.title
        const title = document.title;
        if (title) {
            return title.replace(/\s*\|\s*Hacker News$/, '').trim();
        }

        return null;
    }

    // ── Comment / block extraction ────────────────────────────────

    /**
     * Return all top-level comment blocks.
     * HN uses <tr class="athing comtr" id="..."> for each comment.
     * @returns {HTMLElement[]}
     */
    getCommentBlocks() {
        return Array.from(document.querySelectorAll('.athing.comtr'));
    }

    /**
     * Return the direct child comment blocks nested inside `block`.
     * Traverses next-sibling <tr> elements; children have exactly one
     * more indent level than the parent.
     * @param {HTMLElement} block
     * @returns {HTMLElement[]}
     */
    getChildBlocks(block) {
        const children = [];
        if (!block) return children;

        const parentRow = block.closest('tr');
        if (!parentRow) return children;

        const parentIndent = this.getBlockIndentLevel(block);
        if (parentIndent === null) return children;

        let currentRow = parentRow.nextElementSibling;

        while (currentRow) {
            let currentCommentElement = null;
            // Check if the row itself is a comment element
            if (
                currentRow.classList.contains('athing') &&
                currentRow.classList.contains('comtr')
            ) {
                currentCommentElement = currentRow;
            } else {
                // Look for the comment element within the row
                currentCommentElement = currentRow.querySelector('.athing.comtr');
            }

            if (!currentCommentElement) {
                // Not a comment row — could be a 'more' link etc.
                currentRow = currentRow.nextElementSibling;
                continue;
            }

            const currentIndent = this.getBlockIndentLevel(currentCommentElement);

            if (currentIndent === null) {
                // Cannot determine indent, skip
                currentRow = currentRow.nextElementSibling;
                continue;
            }

            if (currentIndent === parentIndent + 1) {
                // Direct child
                children.push(currentCommentElement);
            } else if (currentIndent <= parentIndent) {
                // We've reached a sibling of the parent or an ancestor
                break;
            }
            // If currentIndent > parentIndent + 1, it's a grandchild or deeper, skip

            currentRow = currentRow.nextElementSibling;
        }

        return children;
    }

    /**
     * Return a unique identifier for `block` — the comment's numeric ID.
     * @param {HTMLElement} block
     * @returns {number|null}
     */
    getBlockId(block) {
        if (!block) return null;
        const commentRow = block.closest('tr.athing.comtr') || block;
        const id = commentRow.id;
        if (!id) return null;
        return parseInt(id, 10);
    }

    /**
     * Return the author username for `block`.
     * @param {HTMLElement} block
     * @returns {string}
     */
    getBlockAuthor(block) {
        if (!block) return '';
        const authorElement = block.querySelector('.hnuser');
        return authorElement ? authorElement.textContent.trim() : '';
    }

    /**
     * Return the plain-text body of `block`.
     * @param {HTMLElement} block
     * @returns {string}
     */
    getBlockText(block) {
        if (!block) return '';
        const commentTextElement = block.querySelector('.commtext');
        return commentTextElement ? commentTextElement.innerText.trim() : '';
    }

    /**
     * Return a timestamp (ms epoch) for `block` by parsing the `.age a`
     * title attribute.
     * @param {HTMLElement} block
     * @returns {number|null}
     */
    getBlockTime(block) {
        if (!block) return null;
        const ageLink = block.querySelector('.age a');
        if (!ageLink) return null;
        const title = ageLink.getAttribute('title');
        if (!title) return null;

        // HN timestamps in the title attr look like "2025-01-15T15:30:00" or
        // "2025-01-15T15:30:00 1736951400" (unix timestamp after a space).
        // Prefer the Unix timestamp if present.
        const parts = title.split(' ');
        if (parts.length >= 2) {
            const unix = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(unix)) return unix * 1000;
        }

        // Fall back to parsing the ISO-ish date
        const ms = Date.parse(parts[0]);
        return isNaN(ms) ? null : ms;
    }

    /**
     * Return a permalink URL for `block`.
     * @param {HTMLElement} block
     * @returns {string|null}
     */
    getBlockPermalink(block) {
        const commentId = this.getBlockId(block);
        const postId = this.getPostId();
        if (!commentId || !postId) return null;

        const baseUrl = `${window.location.origin}/item?id=${postId}`;
        return `${baseUrl}#${commentId}`;
    }

    /**
     * Return the nesting indent level (0 = top-level).
     * HN uses a 40px width spacer image for each level of indentation.
     * @param {HTMLElement} block
     * @returns {number}
     */
    getBlockIndentLevel(block) {
        if (!block) return 0;

        // Ensure we're working with the TR element
        const commentRow = block.closest('tr.athing.comtr') || block;

        const indentImg = commentRow.querySelector('.ind img');
        if (!indentImg) {
            // No indent image — top-level comment (if it has an ID)
            return commentRow.id ? 0 : 0;
        }

        const widthAttr = indentImg.getAttribute('width');
        if (widthAttr === null) return 0;

        const width = parseInt(widthAttr, 10);
        if (isNaN(width)) return 0;

        // HN uses 40px per indent level
        return Math.round(width / 40);
    }

    /**
     * Return the downvote count for `block`, or 0.
     * HN places downvotes in a `.downvotes` span inside `.commtext`.
     * @param {HTMLElement} block
     * @returns {number}
     */
    getBlockDownvoteCount(block) {
        if (!block) return 0;
        const commentTextDiv = block.querySelector('.commtext');
        if (!commentTextDiv) return 0;

        const downvoteSpan = commentTextDiv.querySelector('.downvotes');
        if (!downvoteSpan) return 0;

        const countText = downvoteSpan.textContent.trim();
        const num = parseInt(countText, 10);
        return isNaN(num) ? 0 : num;
    }

    // ── Rich text ─────────────────────────────────────────────────

    /**
     * Return the raw HTML content of `block`.
     * @param {HTMLElement} block
     * @returns {string}
     */
    getBlockHTML(block) {
        if (!block) return '';
        const commentTextElement = block.querySelector('.commtext');
        return commentTextElement ? commentTextElement.innerHTML.trim() : '';
    }

    // ── Comment injection ─────────────────────────────────────────

    /**
     * Return the element inside `block` where action links should be inserted.
     * Prefers `.navs` (the parent/reply links area), falling back to `.comhead`.
     * @param {HTMLElement} block
     * @returns {HTMLElement|null}
     */
    getInjectTarget(block) {
        if (!block) return null;
        const navs = block.querySelector('.navs');
        if (navs) return navs;
        return block.querySelector('.comhead');
    }

    // ── Page-level injection ───────────────────────────────────────

    getPageActionAnchor() {
        return document.querySelector('.subtext .subline');
    }

    // ── Anchor resolution ─────────────────────────────────────────

    /**
     * Given a ref string (comment ID), return the corresponding DOM element.
     * @param {string} ref — typically the comment's numeric ID string
     * @returns {HTMLElement|null}
     */
    resolveBlockByRef(ref) {
        if (!ref) return null;
        return document.getElementById(ref);
    }

    // ── Prompt templates ───────────────────────────────────────────

    /**
     * Return the system message for LLM summarization — the existing
     * HN-specific prompt from summarization.js.
     * @returns {string}
     */
    getSystemMessage() {
        return `You are an AI assistant specialized in analyzing and summarizing Hacker News discussions.
Your goal is to help users quickly understand the key discussions and insights from Hacker News threads without having to read through lengthy comment sections.

Follow these guidelines:

1. Discussion Structure Understanding:
   Comments are formatted as: [hierarchy_path] (score: X) <replies: Y> {downvotes: Z} Author: Comment
   - hierarchy_path: Shows the comment's position in the discussion tree
   - You can cite multiple comments by separating paths with commas, e.g., [1.2, 1.3]
   - score: A normalized value between 1000 and 1, representing the comment's relative importance
   - replies: Number of direct responses to this comment
   - downvotes: Number of downvotes the comment received (exclude comments with 4+ downvotes)

2. Content Prioritization:
   - Focus on high-scoring comments as they represent valuable community insights
   - Pay attention to comments with many replies as they sparked discussion
   - Consider the combination of score, downvotes AND replies to gauge overall importance

3. Theme Identification:
   - Use top-level comments to identify main discussion themes
   - Group related comments into thematic clusters
   -

Track how each theme develops through reply chains
   - Track recommended resources (books, papers, tools, sites, media) mentioned in comments

4. Quality Assessment:
   - Prioritize comments that exhibit a combination of high score, low downvotes, substantial replies, and depth of content
   - Actively identify and highlight expert explanations or in-depth analyses
   - Capture all recommended resources, especially those praised or endorsed by multiple users

Based on the above instructions, you should summarize the discussion. Your output should be well-structured, informative, and easily digestible for someone who hasn't read the original thread.

Your response should be formatted using markdown and should have the following structure:

# Overview
Brief summary of the overall discussion in 2-3 sentences.

# Main Themes & Key Insights
[Bulleted list of themes, ordered by community engagement]

# [Theme 1 title]
[Summarize key insights with hierarchy_paths for linking back to comments]

# Key Perspectives
[Present contrasting perspectives with hierarchy_paths and author attribution]

# Notable Side Discussions
[Interesting tangents that added value with hierarchy_paths]

# Recommendations
[Extract recommended resources mentioned in comments with hierarchy_paths and author attribution. Include books, papers, tools, github repos, sites, media, etc. Do NOT list everything — select only the most praised and well-received resources (high score, multiple endorsements, or strong praise from credible sources). Max 8-10 items.]
`;
    }

    /**
     * Return the user message template for LLM summarization.
     * @returns {string}
     */
    getUserMessageTemplate() {
        return `Provide a concise and insightful summary of the following Hacker News discussion.
The goal is to help someone quickly grasp the main discussion points and key perspectives without reading all comments.
Please focus on extracting the main themes, significant viewpoints, and high-quality contributions.
The post title and comments are separated by three dashed lines:
---
Post Title:
${'{title}'}
---
Comments:
${'{text}'}
---`;
    }

    // ── Hub panel ─────────────────────────────────────────────────

    /**
     * Return the title for the hub panel header.
     * @returns {string}
     */
    getHubTitle() {
        return 'HN Companion';
    }

    /**
     * Return hub panel action descriptors.
     * @returns {Array<{id: string, label: string, icon?: string, onClick?: Function, href?: string}>}
     */
    getHubActions() {
        return [
            { id: 'authors', label: 'Authors' },
            { id: 'saved', label: 'Saved comments' },
            { id: 'favorites', label: 'Favorite HN', href: this.getFavoritesUrl() },
            { id: 'options', label: 'Options', href: 'options' },
        ];
    }

    // ── Favorites / bookmarks ─────────────────────────────────────

    /**
     * Return the favorites page URL for the currently logged-in user.
     * @returns {string}
     */
    getFavoritesUrl() {
        return 'https://news.ycombinator.com/login?goto=favorites';
    }

    /**
     * Return the favorites page URL for a given username.
     * @param {string} username
     * @returns {string}
     */
    getUserFavoritesUrl(username) {
        return `https://news.ycombinator.com/favorites?id=${encodeURIComponent(username)}`;
    }

    // ════════════════════════════════════════════════════════════════
    //  Ported helper methods from dom-utils.js
    // ════════════════════════════════════════════════════════════════

    // ── Scoring ───────────────────────────────────────────────────

    /**
     * Calculates a normalized score for a comment based on position and downvotes.
     * @param {number} position — 0-based position in the thread
     * @param {number} totalComments — total comments in the context
     * @param {number} [downvotes=0] — number of downvotes
     * @returns {number} A normalized score between 0-1000.
     */
    calculateCommentScore(position, totalComments, downvotes = 0) {
        const MAX_SCORE = 1000;
        const MAX_DOWNVOTES = 10;

        // Base score decreases with position
        const baseScore = Math.floor(
            MAX_SCORE - (position * MAX_SCORE) / Math.max(totalComments, 1)
        );

        // Apply penalty for downvotes
        const penaltyPerDownvote = baseScore / MAX_DOWNVOTES;
        const penalty = penaltyPerDownvote * downvotes;

        return Math.max(Math.floor(baseScore - penalty), 0);
    }

    // ── Formatting for LLM ────────────────────────────────────────

    /**
     * Formats a comment for LLM consumption with metadata in a standardized format.
     * @param {Object} comment — with id, author, text properties
     * @param {string} path — hierarchical path (e.g. "1.2.3")
     * @param {number} [replyCount=0] — direct replies
     * @param {number} [score=500] — normalized importance score
     * @param {number} [downvotes=0] — downvotes
     * @param {boolean} [isTarget=false] — whether this is the target comment
     * @returns {string} Formatted comment string.
     */
    formatCommentForLLM(
        comment,
        path,
        replyCount = 0,
        score = 500,
        downvotes = 0,
        isTarget = false
    ) {
        if (!comment || !comment.author) {
            return `[${path}] (score: ${score}) <replies: ${replyCount}> {downvotes: ${downvotes}} [unknown]: [missing content]`;
        }

        const targetMarker = isTarget ? ' [TARGET]' : '';

        return `[${path}] (score: ${score}) <replies: ${replyCount}> {downvotes: ${downvotes}} ${comment.author}${targetMarker}: ${comment.text}`;
    }

    // ── Comment tree traversal ────────────────────────────────────

    /**
     * Gets all direct child comment elements of a given parent comment.
     * @param {HTMLElement} parentComment — the parent comment element
     * @returns {HTMLElement[]}
     */
    getDirectChildComments(parentComment) {
        return this.getChildBlocks(parentComment);
    }

    /**
     * Gets all direct child comments of a given parent comment with enhanced metadata.
     * @param {HTMLElement} parentComment
     * @returns {Array<{id: string, author: string, text: string, path: string, score: number, replies: number, downvotes: number, isTarget: boolean}>}
     */
    getDirectChildCommentsWithMetadata(parentComment) {
        const childElements = this.getDirectChildComments(parentComment);
        if (!childElements.length) return [];

        const enhancedChildren = [];

        childElements.forEach((childElement, index) => {
            const commentId = this.getBlockId(childElement);
            const author = this.getBlockAuthor(childElement);
            const text = this.getBlockText(childElement);

            if (!commentId || !author) {
                console.warn(
                    'getDirectChildCommentsWithMetadata: Skipping child due to missing ID or author.',
                    childElement
                );
                return;
            }

            const downvotes = this.getBlockDownvoteCount(childElement);
            const directChildren = this.getDirectChildComments(childElement);
            const replyCount = directChildren.length;

            // Path: for direct children, use 1.1, 1.2, etc.
            const path = `1.${index + 1}`;

            const score = this.calculateCommentScore(
                index,
                childElements.length,
                downvotes
            );

            enhancedChildren.push({
                id: String(commentId),
                author,
                text,
                path,
                score,
                replies: replyCount,
                downvotes,
                isTarget: false,
            });
        });

        return enhancedChildren;
    }

    /**
     * Gathers all descendant comments (children, grandchildren, etc.) for a given comment.
     * Traverses down the comment tree based on indentation levels.
     * @param {HTMLElement} targetCommentElement
     * @returns {Array<{id: string, author: string, text: string, path: string, score: number, replies: number, downvotes: number, isTarget: boolean}>}
     */
    getDescendantComments(targetCommentElement) {
        const descendants = [];
        if (!targetCommentElement) {
            console.error('getDescendantComments: targetCommentElement is null');
            return descendants;
        }

        const targetRow = targetCommentElement.closest('tr');
        if (!targetRow) {
            console.error(
                'getDescendantComments: Could not find target row for:',
                targetCommentElement.id
            );
            return descendants;
        }

        const targetIndent = this.getBlockIndentLevel(targetCommentElement);
        if (targetIndent === null) {
            console.error(
                'getDescendantComments: Could not determine indent level for target:',
                targetCommentElement.id
            );
            return descendants;
        }

        // First pass: gather all descendants with their indentation levels
        const rawDescendants = [];
        let currentRow = targetRow.nextElementSibling;

        while (currentRow) {
            let currentCommentElement = null;
            if (
                currentRow.classList.contains('athing') &&
                currentRow.classList.contains('comtr')
            ) {
                currentCommentElement = currentRow;
            } else {
                currentCommentElement = currentRow.querySelector('.athing.comtr');
            }

            if (!currentCommentElement) {
                currentRow = currentRow.nextElementSibling;
                continue;
            }

            const currentIndent = this.getBlockIndentLevel(currentCommentElement);

            if (currentIndent === null) {
                currentRow = currentRow.nextElementSibling;
                continue;
            }

            if (currentIndent > targetIndent) {
                const commentId = this.getBlockId(currentCommentElement);
                const author = this.getBlockAuthor(currentCommentElement);
                const text = this.getBlockText(currentCommentElement);
                const downvotes = this.getBlockDownvoteCount(currentCommentElement);

                const directChildren = this.getDirectChildComments(
                    currentCommentElement
                );
                const replyCount = directChildren.length;

                if (commentId && author) {
                    rawDescendants.push({
                        id: String(commentId),
                        author,
                        text,
                        indentLevel: currentIndent - targetIndent,
                        downvotes,
                        replyCount,
                        element: currentCommentElement,
                    });
                } else {
                    console.warn(
                        'getDescendantComments: Skipping descendant due to missing ID or author.',
                        currentCommentElement
                    );
                }
            } else {
                // Indentation is equal or less — exited the descendant tree
                break;
            }

            currentRow = currentRow.nextElementSibling;
        }

        // Second pass: build the tree structure to calculate paths
        const totalComments = rawDescendants.length;
        if (totalComments === 0) return descendants;

        // Build a map of parent-child relationships based on indentation
        const childrenMap = new Map();
        for (let i = 0; i < totalComments; i++) {
            childrenMap.set(i, []);
        }

        for (let i = 0; i < totalComments; i++) {
            const currentIndent = rawDescendants[i].indentLevel;

            // Look backwards for the closest comment with one level less indentation
            for (let j = i - 1; j >= 0; j--) {
                if (rawDescendants[j].indentLevel === currentIndent - 1) {
                    childrenMap.get(j).push(i);
                    break;
                }
            }
        }

        // Recursive function to build paths
        const buildDescendantPaths = (index, basePath, level = 1) => {
            const comment = rawDescendants[index];
            const childIndices = childrenMap.get(index);

            const path = basePath ? `${basePath}.${level}` : `1.${level}`;

            const score = this.calculateCommentScore(
                index,
                totalComments,
                comment.downvotes
            );

            descendants.push({
                id: comment.id,
                author: comment.author,
                text: comment.text,
                path,
                score,
                replies: comment.replyCount,
                downvotes: comment.downvotes,
                isTarget: false,
            });

            childIndices.forEach((childIndex, i) => {
                buildDescendantPaths(childIndex, path, i + 1);
            });
        };

        // Process all top-level descendants (direct children of target)
        const topLevelDescendants = rawDescendants
            .map((_, index) => index)
            .filter((index) => rawDescendants[index].indentLevel === 1);

        topLevelDescendants.forEach((index, i) => {
            buildDescendantPaths(index, '1', i + 1);
        });

        return descendants;
    }

    /**
     * Gathers the context for a given comment, including itself and all its parents.
     * Traverses up the comment tree using the 'parent' links.
     * @param {HTMLElement} targetCommentElement
     * @returns {Array<{id: string, author: string, text: string, path: string, score: number, replies: number, downvotes: number, isTarget: boolean}>}
     */
    getCommentContext(targetCommentElement) {
        const context = [];
        if (!targetCommentElement) {
            console.error('getCommentContext: targetCommentElement is null');
            return context;
        }

        let currentElement = targetCommentElement;
        const visitedIds = new Set();
        const targetId = this.getBlockId(targetCommentElement);

        // First pass: gather all parent comments in reverse order (target → root)
        const reversedComments = [];

        while (currentElement) {
            const commentId = this.getBlockId(currentElement);

            // Prevent loops
            if (!commentId || visitedIds.has(commentId)) {
                if (visitedIds.has(commentId)) {
                    console.warn(
                        `getCommentContext: Loop detected at comment ID: ${commentId}`
                    );
                } else {
                    console.warn(
                        'getCommentContext: Element missing ID:',
                        currentElement
                    );
                }
                break;
            }
            visitedIds.add(commentId);

            const author = this.getBlockAuthor(currentElement);
            const text = this.getBlockText(currentElement);
            const downvotes = this.getBlockDownvoteCount(currentElement);

            const directChildren = this.getDirectChildComments(currentElement);
            const replyCount = directChildren.length;

            if (author) {
                reversedComments.push({
                    id: String(commentId),
                    author,
                    text,
                    downvotes,
                    replyCount,
                    element: currentElement,
                    isTarget: commentId === targetId,
                });
            } else {
                console.warn(
                    'getCommentContext: Skipping comment due to missing author.',
                    currentElement
                );
            }

            // Find parent link and navigate to parent
            const navsSpan = currentElement.querySelector('.comhead .navs');
            let parentLink = null;
            if (navsSpan) {
                const links = navsSpan.querySelectorAll('a');
                for (const link of links) {
                    if (link.textContent.trim() === 'parent') {
                        parentLink = link;
                        break;
                    }
                }
            }

            if (!parentLink) {
                break;
            }

            const parentHref = parentLink.getAttribute('href');
            const parentIdMatch = parentHref.match(/#(\d+)/);
            if (!parentIdMatch || !parentIdMatch[1]) {
                console.warn(
                    'getCommentContext: Could not extract parent ID from href:',
                    parentHref
                );
                break;
            }

            const parentId = parentIdMatch[1];
            const parentElement = this.resolveBlockByRef(parentId);
            if (!parentElement) {
                console.warn(
                    `getCommentContext: Could not find parent element with ID: ${parentId}`
                );
                break;
            }

            currentElement = parentElement;
        }

        // Second pass: reverse the list and calculate paths and scores
        const totalComments = reversedComments.length;

        for (let i = reversedComments.length - 1; i >= 0; i--) {
            const comment = reversedComments[i];

            // Path: simple numbering from root (1, 2, 3...)
            const path = String(totalComments - i);

            // Score based on position (earlier = higher score)
            const position = totalComments - i - 1;
            const score = this.calculateCommentScore(
                position,
                totalComments,
                comment.downvotes
            );

            context.push({
                id: comment.id,
                author: comment.author,
                text: comment.text,
                path,
                score,
                replies: comment.replyCount,
                downvotes: comment.downvotes,
                isTarget: comment.isTarget,
            });
        }

        return context;
    }

    /**
     * Resolves a comment element from a hierarchical path string.
     * @param {string} path — structured path (e.g. "3.2.2")
     * @returns {HTMLElement|null}
     */
    resolveCommentElementByPath(path) {
        if (!path) return null;

        const segments = path
            .split('.')
            .map((segment) => parseInt(segment, 10))
            .filter((value) => !Number.isNaN(value) && value > 0);

        if (segments.length === 0) return null;

        const topLevelComments = Array.from(
            document.querySelectorAll('tr.athing.comtr')
        ).filter((comment) => this.getBlockIndentLevel(comment) === 0);

        const rootIndex = segments[0] - 1;
        if (rootIndex < 0 || rootIndex >= topLevelComments.length) return null;

        let currentElement = topLevelComments[rootIndex];
        if (segments.length === 1) return currentElement;

        for (let i = 1; i < segments.length; i++) {
            const childIndex = segments[i] - 1;
            if (childIndex < 0) return null;

            const directChildren = this.getDirectChildComments(currentElement);
            if (!directChildren || childIndex >= directChildren.length) return null;

            currentElement = directChildren[childIndex];
        }

        return currentElement;
    }

    // ── Upvote count (used internally by statistics) ──────────────

    /**
     * Returns the upvote count for a comment element.
     * @param {HTMLElement} commentElement
     * @returns {number}
     */
    getUpvoteCount(commentElement) {
        const scoreElement = commentElement.querySelector('.score');
        if (!scoreElement) return 0;

        const scoreText = scoreElement.textContent.trim();
        const pointsMatch = scoreText.match(/(\d+)\s+points?/);
        if (pointsMatch && pointsMatch[1]) {
            const num = parseInt(pointsMatch[1], 10);
            return isNaN(num) ? 0 : num;
        }
        return 0;
    }

    // ── Comment statistics ────────────────────────────────────────

    /**
     * Analyzes all comments on the page and returns statistics:
     * top deepest threads, most direct replies, longest comments,
     * and author comment counts.
     * @returns {{topDeepest: Array, topMostDirectReplies: Array, topLongest: Array, authorComments: Map}}
     */
    calculateCommentStatistics() {
        const allCommentRows = document.querySelectorAll('tr.athing.comtr');
        if (!allCommentRows.length) {
            return {
                topDeepest: [],
                topMostDirectReplies: [],
                topLongest: [],
                authorComments: new Map(),
            };
        }

        const commentData = new Map();
        const tree = {};
        const authorCommentMap = new Map();

        // --- Pass 1: Gather basic info and build node map ---
        allCommentRows.forEach((commentRow) => {
            const commentId = commentRow.id;
            if (!commentId) return;

            const commentTextDiv = commentRow.querySelector('.commtext');
            const indentImg = commentRow.querySelector('.ind img');
            const depth = indentImg
                ? Math.round(parseInt(indentImg.getAttribute('width'), 10) / 40)
                : 0;
            const upvotes = this.getUpvoteCount(commentRow);
            const commentText = commentTextDiv
                ? commentTextDiv.textContent.trim()
                : '';

            const data = {
                id: commentId,
                element: commentRow,
                depth,
                textLength: commentText.length,
                upvotes,
                parentId: null,
                descendantCount: 0,
            };
            commentData.set(commentId, data);
            tree[commentId] = { data, children: [] };

            const author = this.getBlockAuthor(commentRow);
            if (author) {
                if (!authorCommentMap.has(author)) {
                    authorCommentMap.set(author, []);
                }
                const indentEl = commentRow?.querySelector?.('.ind img');
                const width = indentEl
                    ? parseInt(indentEl.getAttribute('width') || '0', 10)
                    : 0;
                authorCommentMap.get(author).push({
                    commentId,
                    commentRow,
                    depth,
                    isRoot: !indentEl || !Number.isFinite(width) || width <= 0,
                });
            }
        });

        // --- Pass 2: Build Tree Structure (Parent/Child Relationships) ---
        const commentList = Array.from(commentData.values());
        for (let i = 0; i < commentList.length; i++) {
            const currentComment = commentList[i];
            for (let j = i - 1; j >= 0; j--) {
                const potentialParent = commentList[j];
                if (potentialParent.depth < currentComment.depth) {
                    currentComment.parentId = potentialParent.id;
                    if (tree[potentialParent.id]) {
                        tree[potentialParent.id].children.push(currentComment.id);
                    }
                    break;
                }
            }
        }

        // --- Pass 3: Calculate descendant counts via DFS ---
        const calculateDescendants = (nodeId) => {
            const node = tree[nodeId];
            if (!node) return 0;
            let count = 0;
            for (const childId of node.children) {
                count += 1 + calculateDescendants(childId);
            }
            node.data.descendantCount = count;
            return count;
        };

        for (const nodeId of Object.keys(tree)) {
            if (commentData.get(nodeId)?.parentId === null) {
                calculateDescendants(nodeId);
            }
        }

        // --- Pass 4: Determine statistics ---

        // Top 5 deepest threads (by depth)
        const sortedByDepth = Array.from(commentData.values())
            .filter((c) => c.parentId !== null)
            .sort((a, b) => b.depth - a.depth)
            .slice(0, 5);

        const topDeepest = sortedByDepth.map((c) => ({
            id: c.id,
            element: c.element,
            depth: c.depth,
        }));

        // Top 5 comments with most direct replies
        const topMostDirectReplies = Object.keys(tree)
            .sort((a, b) => tree[b].children.length - tree[a].children.length)
            .slice(0, 5)
            .map((id) => ({
                id,
                element: tree[id].data.element,
                replies: tree[id].children.length,
                author: this.getBlockAuthor(tree[id].data.element),
                text: tree[id].data.element
                    ? this.getBlockText(tree[id].data.element)
                    : '',
            }));

        // Top 5 longest comments
        const topLongest = Array.from(commentData.values())
            .sort((a, b) => b.textLength - a.textLength)
            .slice(0, 5)
            .map((c) => ({
                id: c.id,
                element: c.element,
                textLength: c.textLength,
                author: c.element ? this.getBlockAuthor(c.element) : '',
            }));

        return {
            topDeepest,
            topMostDirectReplies,
            topLongest,
            authorComments: authorCommentMap,
        };
    }
};
