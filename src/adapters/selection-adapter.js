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
     * Return the currently selected text as the "post text" for summarization.
     * Falls back to the page's main content area text.
     * @returns {string}
     */
    getPostText() {
        const selection = window.getSelection();
        const selected = selection ? selection.toString().trim() : '';
        if (selected.length > 20) return selected;

        // Fallback: try common article containers
        const article = document.querySelector('article, [role="main"], main, .post-content, .article-content, .entry-content');
        if (article) return article.innerText.trim().slice(0, 50000);

        return document.body.innerText.trim().slice(0, 50000);
    }

    /** For universal pages, "comment blocks" don't exist. */
    getCommentBlocks() { return []; }

    getSystemMessage() {
        return `You are a helpful reading companion. Summarize the provided text clearly and concisely. Use [P#] to reference specific paragraphs when citing.`;
    }

    getUserMessageTemplate() {
        return `Summarize the following text:\n\n`;
    }

    // ---- Summary flow hooks ----

    isDedicatedCommentsPage() { return false; }

    shouldAutoGeneratePostSummary() { return true; }

    getPostBodyElement() {
        const text = this.getPostText();
        if (!text) return null;
        const div = document.createElement('div');
        text.split(/\n+/).filter(Boolean).forEach((line, i) => {
            const p = document.createElement('p');
            p.textContent = `[P${i + 1}] ${line}`;
            div.appendChild(p);
        });
        return div;
    }

    // ---- Chat flow hooks ----

    getChatContextOptions() {
        return [{ id: 'selection', label: 'Selection', group: 'post' }];
    }

    getChatSystemMessage() {
        return `You are a helpful reading companion. Answer questions about the provided text clearly and concisely. Use [P#] to reference specific paragraphs when citing.`;
    }
};
