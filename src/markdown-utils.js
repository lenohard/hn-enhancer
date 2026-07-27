/**
 * Utility functions for handling markdown conversion
 */
class MarkdownUtils {
    /**
     * Remove model-internal reasoning blocks before display, caching, or reuse.
     * Handles both completed and still-streaming <think> blocks.
     * @param {string} text
     * @returns {string}
     */
    static stripThinkingContent(text) {
        let cleaned = String(text ?? '');
        cleaned = cleaned.replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, '');
        cleaned = cleaned.replace(/<think\b[^>]*>?[\s\S]*$/gi, '');
        cleaned = cleaned.replace(/<\/think\s*>/gi, '');

        // Avoid briefly rendering a tag while its opening characters stream in.
        const lower = cleaned.toLowerCase();
        for (const prefix of ['<think', '<thin', '<thi', '<th', '<t']) {
            if (lower.endsWith(prefix)) {
                cleaned = cleaned.slice(0, -prefix.length);
                break;
            }
        }

        return cleaned.replace(/^\s*\n/, '');
    }

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

        function splitTableRow(line) {
            let value = line.trim();
            if (value.startsWith('|')) value = value.slice(1);
            if (value.endsWith('|')) value = value.slice(0, -1);

            const cells = [];
            let cell = '';
            for (let index = 0; index < value.length; index += 1) {
                const char = value[index];
                if (char === '\\' && value[index + 1] === '|') {
                    cell += '|';
                    index += 1;
                } else if (char === '|') {
                    cells.push(cell.trim());
                    cell = '';
                } else {
                    cell += char;
                }
            }
            cells.push(cell.trim());
            return cells;
        }

        function convertTables(text) {
            const lines = text.split('\n');
            const output = [];

            for (let index = 0; index < lines.length; index += 1) {
                const headerLine = lines[index];
                const separatorLine = lines[index + 1];
                if (!headerLine?.includes('|') || !separatorLine?.includes('|')) {
                    output.push(headerLine);
                    continue;
                }

                const headers = splitTableRow(headerLine);
                const separators = splitTableRow(separatorLine);
                const isTable =
                    headers.length > 0 &&
                    headers.length === separators.length &&
                    separators.every((cell) => /^:?-{3,}:?$/.test(cell));
                if (!isTable) {
                    output.push(headerLine);
                    continue;
                }

                const alignments = separators.map((cell) => {
                    if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
                    if (cell.endsWith(':')) return 'right';
                    return 'left';
                });
                const bodyRows = [];
                index += 2;
                while (index < lines.length && lines[index].includes('|')) {
                    const cells = splitTableRow(lines[index]);
                    if (cells.length === 1 && !cells[0]) break;
                    bodyRows.push(
                        headers.map((_, cellIndex) => cells[cellIndex] || '')
                    );
                    index += 1;
                }
                index -= 1;

                const headerHtml = headers
                    .map(
                        (cell, cellIndex) =>
                            `<th class="hn-table-align-${alignments[cellIndex]}">${cell}</th>`
                    )
                    .join('');
                const bodyHtml = bodyRows
                    .map(
                        (row) =>
                            `<tr>${row
                                .map(
                                    (cell, cellIndex) =>
                                        `<td class="hn-table-align-${alignments[cellIndex]}">${cell}</td>`
                                )
                                .join('')}</tr>`
                    )
                    .join('');
                output.push(
                    `<div class="hn-markdown-table-wrap"><table class="hn-markdown-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`
                );
            }

            return output.join('\n');
        }

        // First escape HTML special characters
        let html = MarkdownUtils.stripThinkingContent(markdown)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        html = convertTables(html);

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
            // [#2.1], [#post] — strip leading # and link by path
            const hashPathMatch = content.match(/^#(post|\d+(?:\.\d+)*)$/i);
            if (hashPathMatch) {
                const path = hashPathMatch[1].toLowerCase() === 'post'
                    ? 'post'
                    : hashPathMatch[1];
                const id = commentPathToIdMap?.get(path);
                const idAttr = id ? ` data-comment-id="${id}"` : "";
                return `<a href="#" class="summary-comment-link" title="Go to comment ${path}" data-comment-link="true"${idAttr} data-comment-path="${path}">${match}</a>`;
            }

            // [来自 #3] or similar prefix before #path
            const attributedMatch = content.match(/^(.+?)#(post|\d+(?:\.\d+)*)$/i);
            if (attributedMatch) {
                const path = attributedMatch[2].toLowerCase() === 'post'
                    ? 'post'
                    : attributedMatch[2];
                const id = commentPathToIdMap?.get(path);
                const idAttr = id ? ` data-comment-id="${id}"` : "";
                return `<a href="#" class="summary-comment-link" title="Go to comment ${path}" data-comment-link="true"${idAttr} data-comment-path="${path}">${match}</a>`;
            }

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

    /**
     * Replace paragraph/image refs with private-use tokens so they survive
     * markdown escaping. Handles [P11], [I2], and paragraph ranges.
     * @param {string} text
     * @returns {{ text: string, tokens: string[][] }}
     */
    static tokenizeParagraphRefs(text) {
        const tokens = [];
        const emit = (refs) => {
            const token = `\uE000${tokens.length}\uE001`;
            tokens.push(refs);
            return token;
        };

        // Ranges first: (P12–14), [P12-14], （P12–14）
        text = text.replace(
            /(?:\[|\(|（)\s*P(\d+)\s*[-–—~至]\s*P?(\d+)\s*(?:\]|）|\))/gi,
            (match, startStr, endStr) => {
                const start = parseInt(startStr, 10);
                const end = parseInt(endStr, 10);
                if (!start || !end || end < start || end - start > 30) return match;
                const refs = [];
                for (let i = start; i <= end; i++) refs.push(`P${i}`);
                return emit(refs);
            }
        );

        // Single refs: [P11], [I2], (P11), （I2）
        text = text.replace(
            /(?:\[|\(|（)\s*([PIS]\d+)\s*(?:\]|）|\))/gi,
            (match, ref) => emit([ref])
        );

        return { text, tokens };
    }

    /**
     * Restore source-ref tokens as clickable jump buttons.
     * @param {string} html
     * @param {string[][]} tokens
     * @returns {string}
     */
    static restoreParagraphRefTokens(html, tokens) {
        const makeBtn = (ref) =>
            `<button type="button" class="hn-summary-ref" data-ref="${ref}">[${ref}]</button>`;

        tokens.forEach((refs, index) => {
            const token = `\uE000${index}\uE001`;
            html = html.split(token).join(refs.map(makeBtn).join(""));
        });

        return html;
    }
}

// Make the class available globally
window.MarkdownUtils = MarkdownUtils;
