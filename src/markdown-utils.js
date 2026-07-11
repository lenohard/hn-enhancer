/**
 * Utility functions for handling markdown conversion
 */
class MarkdownUtils {
    /**
     * Converts markdown text to HTML
     * @param {string} markdown - The markdown text to convert
     * @returns {string} The converted HTML
     */
    static convertMarkdownToHTML(markdown) {
        // Helper function to wrap all lists as unordered lists
        function wrapLists(html) {
            // Wrap any sequence of list items in ul tags
            return html.replace(/<li>(?:[^<]|<(?!\/li>))*<\/li>(?:\s*<li>(?:[^<]|<(?!\/li>))*<\/li>)*/g,
                match => `<ul>${match}</ul>`);
        }

        // First escape HTML special characters
        let html = markdown
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Convert markdown to HTML
        // noinspection RegExpRedundantEscape,HtmlUnknownTarget
        html = html
            // Headers
            .replace(/^##### (.*$)/gim, '<h5>$1</h5>')
            .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')

            // Blockquotes
            .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')

            // Code blocks and inline code
            .replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')

            //  both bullet points and numbered lists to li elements
            .replace(/^\s*[\-\*]\s(.+)/gim, '<li>$1</li>')
            .replace(/^\s*(\d+)\.\s(.+)/gim, '<li>$2</li>')

            // Bold and Italic
            .replace(/\*\*(?=\S)([^\*]+?\S)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(?=\S)([^\*]+?\S)\*/g, '<em>$1</em>')
            .replace(/_(?=\S)([^\*]+?\S)_/g, '<em>$1</em>')

            // Images and links
            .replace(/!\[(.*?)\]\((.*?)\)/gim, "<img alt='$1' src='$2' />")
            .replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2'>$1</a>")

            // Horizontal rules
            .replace(/^\s*[\*\-_]{3,}\s*$/gm, '<hr>')

            // Paragraphs and line breaks
            .replace(/\n\s*\n/g, '</p><p>')
        // .replace(/\n/g, '<br />');

        // Wrap all lists as unordered lists
        html = wrapLists(html);

        // Wrap everything in paragraphs if not already wrapped
        if (!html.startsWith('<')) {
            html = `<p>${html}</p>`;
        }

        return html.trim();
    }

    /**
     * Strips anchor tags from text
     * @param {string} text - The text to strip anchors from
     * @returns {string} The text without anchor tags
     */
    static stripAnchors(text) {
        // Use a regular expression to match <a> tags and their contents
        const anchorRegex = /<a\b[^>]*>.*?<\/a>/g;

        // Replace all matches with an empty string
        return text.replace(anchorRegex, '');
    }

    /**
     * Replaces path identifiers with comment links
     * @param {string} text - The text to replace paths in
     * @param {Map<string, string>} commentPathToIdMap - Map of comment paths to IDs
     * @returns {string} The text with paths replaced with links
     */
    static replacePathsWithCommentLinks(text, commentPathToIdMap) {
        // Regex to find [...] blocks
        return text.replace(/\[([^\]]+)\]/g, (match, content) => {
            // Check if content is a list of paths (digits, dots, commas, spaces only)
            // And contains at least one digit (to avoid empty [] or just [,,])
            if (/^[\d\.,\s]+$/.test(content) && /\d/.test(content)) {
                const parts = content.split(',');
                
                const linkedParts = parts.map(part => {
                    // split by comma might leave spaces, e.g. " 1.2"
                    // we need to preserve spaces in the output if we want to be exact, 
                    // but for [1.2, 1.3], usually we just want the link on the number.
                    // Let's try to preserve leading/trailing spaces for the non-link parts if we can,
                    // but split(',') consumes the comma. 
                    // Simpler: trim the part to find the path.
                    
                    const trimmed = part.trim();
                    if (/^\d+(?:\.\d+)*$/.test(trimmed)) {
                        const id = commentPathToIdMap?.get(trimmed);
                        const idAttr = id ? ` data-comment-id="${id}"` : "";
                        return `<a href="#" class="summary-comment-link" title="Go to comment ${trimmed}" data-comment-link="true"${idAttr} data-comment-path="${trimmed}">[${trimmed}]</a>`;
                    }
                    return part;
                });
                return linkedParts.join(", ");
            }

            // Fallback for "path + description" -> [1.2.3 some text]
            // We want to link the whole thing to 1.2.3
            const pathMatch = content.match(/^(\d+(?:\.\d+)*)(\s+.*)$/);
            if (pathMatch) {
                const path = pathMatch[1];
                const id = commentPathToIdMap?.get(path);
                const idAttr = id ? ` data-comment-id="${id}"` : "";
                return `<a href="#"
                           title="Go to comment ${path}"
                           data-comment-link="true"${idAttr} data-comment-path="${path}"
                           style="color: rgb(130, 130, 130); text-decoration: underline;"
                        >${match}</a>`;
            }

            return match;
        });
    }
}

// Make the class available globally
window.MarkdownUtils = MarkdownUtils;
