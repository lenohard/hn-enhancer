/**
 * Handles AI summarization functionality for the Hacker News Companion extension
 */
class Summarization {
    constructor(enhancer) {
        this.enhancer = enhancer;
        this.SummarizeCheckStatus = {
            OK: 'ok',
            TEXT_TOO_SHORT: 'too_short',
            THREAD_TOO_SHALLOW: 'too_shallow',
            THREAD_TOO_DEEP: 'chrome_depth_limit'
        };
    }

    /**
     * Summarizes a thread starting from a specific comment
     * @param {Element} comment - The comment element to start summarization from
     */
    async summarizeThread(comment) {
        // Get the item id from the 'age' link that shows '10 hours ago' or similar
        const itemLinkElement = comment.querySelector('.age')?.getElementsByTagName('a')[0];
        if (!itemLinkElement) {
            console.error('Could not find the item link element to get the item id for summarization');
            return;
        }

        // get the content of the thread
        const itemId = itemLinkElement.href.split('=')[1];
        const {formattedComment, commentPathToIdMap} = await this.getHNThread(itemId);
        if (!formattedComment) {
            console.error(`Could not get the thread for summarization. item id: ${itemId}`);
            return;
        }

        const commentDepth = commentPathToIdMap.size;
        const {aiProvider, model} = await this.getAIProviderModel();

        if (!aiProvider) {
            console.log('AI provider not configured. Prompting user to complete setup.');
            this.showConfigureAIMessage();
            return;
        }

        const authorElement = comment.querySelector('.hnuser');
        const author = authorElement.textContent || '';
        const highlightedAuthor = `<span class="highlight-author">${author}</span>`;

        const summarizeCheckResult = this.shouldSummarizeText(formattedComment, commentDepth, aiProvider);

        if (summarizeCheckResult.status !== this.SummarizeCheckStatus.OK) {
            const messageTemplates = {
                title: 'Summarization not recommended',
                metadata: {
                    [this.SummarizeCheckStatus.TEXT_TOO_SHORT]: `Thread too brief to use the selected cloud AI <strong>${aiProvider}</strong>`,
                    [this.SummarizeCheckStatus.THREAD_TOO_SHALLOW]: `Thread not deep enough to use the selected cloud AI <strong>${aiProvider}</strong>`,
                    [this.SummarizeCheckStatus.THREAD_TOO_DEEP]: `Thread too deep for the selected AI <strong>${aiProvider}</strong>`
                },
                text: (status, highlightedAuthor) => {
                    return status === this.SummarizeCheckStatus.THREAD_TOO_DEEP
                        ? `This ${highlightedAuthor} thread is too long or deeply nested to be handled by Chrome Built-in AI. The underlying model Gemini Nano may struggle and hallucinate with large content and deep nested threads due to model size limitations. This model works best with individual comments or brief discussion threads.
                        <br/><br/>However, if you still want to summarize this thread, you can <a href="#" id="options-page-link">configure another AI provider</a> like local <a href="https://ollama.com/" target="_blank">Ollama</a> or cloud AI services like OpenAI or Claude.`

                        : `This ${highlightedAuthor} thread is concise enough to read directly. Summarizing short threads with a cloud AI service would be inefficient.
                        <br/><br/> However, if you still want to summarize this thread, you can <a href="#" id="options-page-link">configure a local AI provider</a> like <a href="https://developer.chrome.com/docs/ai/built-in" target="_blank">Chrome Built-in AI</a> or <a href="https://ollama.com/" target="_blank">Ollama</a> for more efficient processing of shorter threads.`;
                }
            };

            this.enhancer.summaryPanel.updateContent({
                title: messageTemplates.title,
                metadata: messageTemplates.metadata[summarizeCheckResult.status],
                text: messageTemplates.text(summarizeCheckResult.status, highlightedAuthor)
            });

            // Once the error message is rendered in the summary panel, add the click handler for the Options page link
            const optionsLink = this.enhancer.summaryPanel.panel.querySelector('#options-page-link');
            if (optionsLink) {
                optionsLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.openOptionsPage();
                });
            }
            return;
        }

        // Show an in-progress text in the summary panel
        const metadata = `Analyzing discussion in ${highlightedAuthor} thread`;
        const modelInfo = aiProvider ? ` using <strong>${aiProvider} ${model || ''}</strong>` : '';

        this.enhancer.summaryPanel.updateContent({
            title: 'Thread Summary',
            metadata: metadata,
            text: `<div>Generating summary${modelInfo}... This may take a few moments.<span class="loading-spinner"></span></div>`
        });

        this.summarizeTextWithAI(formattedComment, commentPathToIdMap);
    }

    /**
     * Checks if text should be summarized based on various criteria
     * @param {string} formattedText - The text to check
     * @param {number} commentDepth - The depth of comments
     * @param {string} aiProvider - The AI provider to use
     * @returns {Object} Result with status indicating if summarization should proceed
     */
    shouldSummarizeText(formattedText, commentDepth, aiProvider) {
        // Ollama can handle all kinds of data - large, small, deep threads. So return true
        if (aiProvider === 'ollama') {
            return { status: this.SummarizeCheckStatus.OK };
        }

        // Chrome Built-in AI cannot handle deep threads, so limit the summarization to a certain depth
        if (aiProvider === 'chrome-ai') {
            return commentDepth <= 5
                ? { status: this.SummarizeCheckStatus.OK }
                : { status: this.SummarizeCheckStatus.THREAD_TOO_DEEP };
        }

        // OpenAI and Claude can handle larger data, but they are expensive, so there should be a minimum length and depth
        const minSentenceLength = 8;
        const minCommentDepth = 3;
        const sentences = formattedText.split(/[.!?]+(?:\s+|$)/)
            .filter(sentence => sentence.trim().length > 0);

        if (sentences.length <= minSentenceLength) {
            return { status: this.SummarizeCheckStatus.TEXT_TOO_SHORT };
        }
        if (commentDepth <= minCommentDepth) {
            return { status: this.SummarizeCheckStatus.THREAD_TOO_SHALLOW };
        }

        return { status: this.SummarizeCheckStatus.OK };
    }

    /**
     * Summarizes all comments in the current post
     */
    async summarizeAllComments() {
        const itemId = this.enhancer.domUtils.getCurrentHNItemId();
        if (!itemId) {
            console.error(`Could not get item id of the current port to summarize all comments in it.`);
            return;
        }

        try {
            if (!this.enhancer.summaryPanel.isVisible) {
                this.enhancer.summaryPanel.toggle();
            }

            const {aiProvider, model} = await this.getAIProviderModel();

            // Soon after installing the extension, the settings may not be available. Show a message to configure the AI provider.
            if(!aiProvider) {
                console.log('AI provider not configured. Prompting user to complete setup.');
                this.showConfigureAIMessage();
                return;
            }

            // If the AI provider is Chrome Built-in AI, do not summarize because it does not handle long text.
            if(aiProvider === 'chrome-ai') {
                this.enhancer.summaryPanel.updateContent({
                    title: `Summarization not recommended`,
                    metadata: `Content too long for the selected AI <strong>${aiProvider}</strong>`,
                    text: `This post is too long to be handled by Chrome Built-in AI. The underlying model Gemini Nano may struggle and hallucinate with large content and deep nested threads due to model size limitations. This model works best with individual comments or brief discussion threads.
                    <br/><br/>However, if you still want to summarize this thread, you can <a href="#" id="options-page-link">configure another AI provider</a> like local <a href="https://ollama.com/" target="_blank">Ollama</a> or cloud AI services like OpenAI or Claude.`
                });

                // Once the error message is rendered in the summary panel, add the click handler for the Options page link
                const optionsLink = this.enhancer.summaryPanel.panel.querySelector('#options-page-link');
                if (optionsLink) {
                    optionsLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.openOptionsPage();
                    });
                }
                return;
            }
            // Show a meaningful in-progress message before starting the summarization
            const modelInfo = aiProvider ? ` using <strong>${aiProvider} ${model || ''}</strong>` : '';
            this.enhancer.summaryPanel.updateContent({
                title: 'Post Summary',
                metadata: `Analyzing all threads in this post...`,
                text: `<div>Generating summary${modelInfo}... This may take a few moments. <span class="loading-spinner"></span></div>`
            });

            const {formattedComment, commentPathToIdMap} = await this.getHNThread(itemId);
            this.summarizeTextWithAI(formattedComment, commentPathToIdMap);

        } catch (error) {
            console.error('Error preparing for summarization:', error);
            this.enhancer.summaryPanel.updateContent({
                title: 'Summarization Error',
                metadata: '',
                text: `Error preparing for summarization: ${error.message}`
            });
        }
    }

    /**
     * Gets AI provider and model from storage
     * @returns {Promise<Object>} The AI provider, model, and language
     */
    async getAIProviderModel() {
        const settingsData = await chrome.storage.sync.get('settings');
        const aiProvider = settingsData.settings?.providerSelection;
        const model = settingsData.settings?.[aiProvider]?.model;
        const language = settingsData.settings?.language || 'en';
        return {aiProvider, model, language};
    }

    /**
     * Shows a message to configure AI provider
     */
    showConfigureAIMessage() {
        const message = 'To use the summarization feature, you need to configure an AI provider. <br/><br/>' +
            'Please <a href="#" id="options-page-link">open the settings page</a> to select and configure your preferred AI provider ' +
            '(OpenAI, Anthropic, <a href="https://ollama.com/" target="_blank">Ollama</a>, <a href="https://openrouter.ai/" target="_blank">OpenRouter</a> ' +
            'or <a href="https://developer.chrome.com/docs/ai/built-in" target="_blank">Chrome Built-in AI</a>).';

        this.enhancer.summaryPanel.updateContent({
            title: 'AI Provider Setup Required',
            text: message
        });

        // Add event listener after updating content
        const optionsLink = this.enhancer.summaryPanel.panel.querySelector('#options-page-link');
        if (optionsLink) {
            optionsLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.openOptionsPage();
            });
        }
    }

    /**
     * Opens the options page
     */
    openOptionsPage() {
        chrome.runtime.sendMessage({
            type: 'HN_SHOW_OPTIONS',
            data: {}
        }).catch(error => {
            console.error('Error sending message to show options:', error);
        });
    }

    /**
     * Gets HN thread data for summarization
     * @param {string} itemId - The ID of the item to get thread data for
     * @returns {Promise<Object>} The formatted comment and comment path to ID map
     */
    async getHNThread(itemId) {
        try {
            // Here, we will get the post with the itemId, parse the comments and enhance it with a better structure and score
            //  Get the comments from the HN API as well as the DOM.
            //  API comments are in JSON format structured as a tree and represents the hierarchy of comments.
            //  DOM comments (comments in the HTML page) are in the right sequence according to the up votes.

            const commentsJson = await this.enhancer.apiClient.fetchHNCommentsFromAPI(itemId);
            const commentsInDOM = this.getCommentsFromDOM();

            // Merge the two data sets to structure the comments based on hierarchy, votes and position
            const enhancedComments = this.enrichPostComments(commentsJson, commentsInDOM);

            // Create the path-to-id mapping in order to backlink the comments to the main page.
            const commentPathToIdMap = new Map();
            enhancedComments.forEach((comment, id) => {
                commentPathToIdMap.set(comment.path, id);
            });

            // Convert structured comments to formatted text
            const formattedComment = [...enhancedComments.values()]
                .map(comment => {
                    return [
                        `[${comment.path}]`,
                        `(score: ${comment.score})`,
                        `<replies: ${comment.replies}>`,
                        `{downvotes: ${comment.downvotes}}`,
                        `${comment.author}:`,
                        comment.text
                    ].join(' ') + '\n';
                })
                .join('');

            this.enhancer.logDebug('formattedComment...', formattedComment);

            return {
                formattedComment,
                commentPathToIdMap
            };
        } catch (error) {
            console.error(`Error: ${error.message}`);
        }
    }

    /**
     * Gets comments from the DOM
     * @returns {Map} Map of comments from the DOM
     */
    getCommentsFromDOM() {
        // Comments in the DOM are arranged according to their up votes. This gives us the position of the comment.
        //  We will also extract the downvotes and text of the comment (after sanitizing it).
        // Create a map to store comment positions, downvotes and the comment text.
        const commentsInDOM = new Map();

        // Step 1: collect all comments and their metadata
        const commentRows = document.querySelectorAll('.comtr');
        this.enhancer.logDebug(`Found ${commentRows.length} DOM comments in post`);

        let skippedComments = 0;
        commentRows.forEach((commentRow, index) => {
            // if comment is flagged, it will have the class "coll" (collapsed) or "noshow" (children of collapsed comments)
            // if the commText class is not found, the comment is deleted or not visible.
            // Check for these two conditions and skip it.
            const commentFlagged = commentRow.classList.contains('coll') || commentRow.classList.contains('noshow');
            const commentTextDiv = commentRow.querySelector('.commtext');
            if( commentFlagged || !commentTextDiv ) {
                skippedComments++;
                return;
            }

            // Step 2: Sanitize the comment text (remove unnecessary html tags, encodings)
            function sanitizeCommentText() {
                // Clone the comment div so that we don't modify the DOM of the main page
                const tempDiv = commentTextDiv.cloneNode(true);

                // Remove unwanted HTML elements from the clone
                [...tempDiv.querySelectorAll('a, code, pre')].forEach(element => element.remove());

                // Replace <p> tags with their text content
                tempDiv.querySelectorAll('p').forEach(p => {
                    const text = p.textContent;
                    p.replaceWith(text);
                });

                // decode the HTML entities (to remove url encoding and new lines)
                function decodeHTML(html) {
                    const txt = document.createElement('textarea');
                    txt.innerHTML = html;
                    return txt.value;
                }

                // Remove unnecessary new lines and decode HTML entities
                const sanitizedText = decodeHTML(tempDiv.innerHTML).replace(/\n+/g, ' ');

                return sanitizedText;
            }
            const commentText = sanitizeCommentText();

            // Step 3: Get the down votes of the comment in order to calculate the score later
            const downvotes = this.enhancer.domUtils.getDownvoteCount(commentTextDiv);

            const commentId = commentRow.getAttribute('id');

            // Step 4: Add the position, text and downvotes of the comment to the map
            commentsInDOM.set(Number(commentId), {
                position: index,
                text: commentText,
                downvotes: downvotes,
            });
        });

        this.enhancer.logDebug(`...Comments from DOM:: Total: ${commentRows.length}. Skipped (flagged): ${skippedComments}. Remaining: ${commentsInDOM.size}`);

        return commentsInDOM;
    }

    /**
     * Enriches post comments with additional metadata
     * @param {Object} commentsTree - The comments tree from the API
     * @param {Map} commentsInDOM - The comments from the DOM
     * @returns {Map} The enriched comments
     */
    enrichPostComments(commentsTree, commentsInDOM) {
        // Here, we enrich the comments as follows:
        //  add the position of the comment in the DOM (according to the up votes)
        //  add the text and the down votes of the comment (also from the DOM)
        //  add the author and number of children as replies (from the comment tree)
        //  sort them based on the position in the DOM (according to the up votes)
        //  add the path of the comment (1.1, 1.2, 2.1 etc.) based on the position in the DOM
        //  add the score of the comment based on the position and down votes

        // Step 1: Flatten the comment tree to map with metadata, position and parent relationship
        //  This is a recursive function that traverses the comment tree and adds the metadata to the map
        let flatComments = new Map();

        let apiComments = 0;
        let skippedComments = 0;
        
        const flattenCommentTree = (comment, parentId) => {
            // Track the number of comments as we traverse the tree to find the comments from HN API.
            apiComments++;

            // If this is the story item (root of the tree), flatten its children, but do not add the story item to the map.
            //  We must call flattenCommentTree with the parent id as null so that the 'path' for the top level comments is correct.
            if (comment.type === 'story') {
                if (comment.children && comment.children.length > 0) {
                    comment.children.forEach(child => {
                        flattenCommentTree(child, null);
                    });
                }
                return;
            }

            // Get the DOM comment corresponding to this comment from the commentsInDOM map
            const commentInDOM = commentsInDOM.get(comment.id);
            if(!commentInDOM) {
                // This comment is not found in the DOM comments because it was flagged or collapsed, skip it
                skippedComments++;
                return;
            }

            // Add comment to map along with its metadata including position, downvotes and parentId that are needed for scoring.
            flatComments.set(comment.id, {
                id: comment.id,  // Add the id in the comment object so that you can access later
                author: comment.author,
                replies: comment.children?.length || 0,
                position: commentInDOM.position,
                text: commentInDOM.text,
                downvotes: commentInDOM.downvotes,
                parentId: parentId,
            });

            // Process children of the current comment, pass the comment id as the parent id to the next iteration
            //  so that the parent-child relationship is retained, and we can use it to calculate the path later.
            if (comment.children && comment.children.length > 0) {
                comment.children.forEach(child => {
                    flattenCommentTree(child, comment.id);
                });
            }
        };

        // Flatten the comment tree and collect comments as a map
        flattenCommentTree(commentsTree, null);

        // Log the comments so far, skip the top level comment (story) because it is not added to the map
        this.enhancer.logDebug(`...Comments from API:: Total: ${apiComments - 1}. Skipped: ${skippedComments}. Remaining: ${flatComments.size}`);

        // Step 2: Start building the map of enriched comments, start with the flat comments and sorting them by position.
        //  We have to do this BEFORE calculating the path because the path is based on the position of the comments.
        const enrichedComments = new Map([...flatComments.entries()]
            .sort((a, b) => a[1].position - b[1].position));

        // Step 3: Calculate paths (1.1, 2.3 etc.) using the parentId and the sequence of comments
        //  This step must be done AFTER sorting the comments by position because the path is based on the position of the comments.
        let topLevelCounter = 1;

        const calculatePath = (comment) => {
            let path;

            if (!comment.parentId) {
                // Top level comment - its parent is the story ('summarize all comments' flow) OR this is the root comment ('summarize thread' flow).
                //  The path is just a number like 1, 2, 3, etc.
                path = String(topLevelCounter++);
            } else {
                // Child comment at any level.
                //  The path is the parent's path + the position of the comment in the parent's children list.
                const parentPath = enrichedComments.get(comment.parentId).path;

                // get all the children of this comment's parents - this is the list of siblings
                const siblings = [...enrichedComments.values()]
                    .filter(c => c.parentId === comment.parentId);

                // Find the position of this comment in the siblings list - this is the sequence number in the path
                const positionInParent = siblings
                    .findIndex(c => c.id === comment.id) + 1;

                // Set the path as the parent's path + the position in the parent's children list
                path = `${parentPath}.${positionInParent}`;
            }
            return path;
        };

        // Step 4: Calculate the score for each comment based on its position and downvotes
        const calculateScore = (comment, totalCommentCount) => {
            // Example score calculation using downvotes
            const downvotes = comment.downvotes || 0;

            // Score is a number between 1000 and 0, and is calculated as follows:
            //   default_score = 1000 - (comment_position * 1000 / total_comment_count)
            //   penalty for down votes = default_score * # of downvotes

            const MAX_SCORE = 1000;
            const MAX_DOWNVOTES = 10;

            const defaultScore = Math.floor(MAX_SCORE - (comment.position * MAX_SCORE / totalCommentCount));
            const penaltyPerDownvote = defaultScore / MAX_DOWNVOTES;
            const penalty = penaltyPerDownvote * downvotes;

            const score = Math.floor(Math.max(defaultScore - penalty, 0));
            return score;
        };

        // Final step: Add the path and score for each comment as calculated above
        enrichedComments.forEach(comment => {
            comment.path = calculatePath(comment);
            comment.score = calculateScore(comment, enrichedComments.size);
        });

        return enrichedComments;
    }

    /**
     * Summarizes text using the selected AI provider
     * @param {string} formattedComment - The formatted comment text
     * @param {Map} commentPathToIdMap - Map of comment paths to IDs
     */
    async summarizeTextWithAI(formattedComment, commentPathToIdMap) {
        try {
            const data = await chrome.storage.sync.get('settings');

            const providerSelection = data.settings?.providerSelection;
            const model = data.settings?.[providerSelection]?.model;

            if (!providerSelection) {
                console.log('AI provider not configured. Prompting user to complete setup.');
                this.showConfigureAIMessage();
                return;
            }

            this.enhancer.logInfo(`Summarization - AI Provider: ${providerSelection}, Model: ${model || 'none'}`);

            // Remove unnecessary anchor tags from the text
            formattedComment = this.enhancer.markdownUtils.stripAnchors(formattedComment);

            switch (providerSelection) {
                case 'chrome-ai':
                    this.summarizeUsingChromeBuiltInAI(formattedComment, commentPathToIdMap);
                    break;

                case 'openai':
                    const apiKey = data.settings?.[providerSelection]?.apiKey;
                    await this.summarizeUsingOpenAI(formattedComment, model, apiKey, commentPathToIdMap);
                    break;

                case 'openrouter':
                    const openrouterKey = data.settings?.[providerSelection]?.apiKey;
                    await this.summarizeUsingOpenRouter(formattedComment, model, openrouterKey, commentPathToIdMap);
                    break;

                case 'anthropic':
                    const claudeApiKey = data.settings?.[providerSelection]?.apiKey;
                    await this.summarizeUsingAnthropic(formattedComment, model, claudeApiKey, commentPathToIdMap);
                    break;

                case 'deepseek':
                    const deepSeekApiKey = data.settings?.[providerSelection]?.apiKey;
                    await this.summarizeUsingDeepSeek(formattedComment, model, deepSeekApiKey, commentPathToIdMap);
                    break;

                case 'ollama':
                    await this.summarizeUsingOllama(formattedComment, model, commentPathToIdMap);
                    break;

                case "gemini":
                    await this.summarizeUsingGemini(formattedComment, model, commentPathToIdMap);
                    break;

                case 'none':
                    await this.showSummaryInPanel(formattedComment, commentPathToIdMap, 0);
                    break;
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
        }
    }

    /**
     * Summarizes text using OpenRouter
     * @param {string} text - The text to summarize
     * @param {string} model - The model to use
     * @param {string} apiKey - The API key
     * @param {Map} commentPathToIdMap - Map of comment paths to IDs
     */
    async summarizeUsingOpenRouter(text, model, apiKey, commentPathToIdMap) {
        // Validate required parameters
        if (!text || !model || !apiKey) {
            console.error('Missing required parameters for OpenRouter summarization');
            this.enhancer.summaryPanel.updateContent({
                title: 'Error',
                text: 'Missing API configuration'
            });
            return;
        }

        try {
            // Rate Limit for OpenRouter
            const tokenLimit = 60000;
            const tokenLimitText = this.splitInputTextAtTokenLimit(text, tokenLimit);

            // Create the system and user prompts for better summarization
            const systemPrompt = this.getSystemMessage();
            const postTitle = this.enhancer.domUtils.getHNPostTitle();
            const userPrompt = await this.getUserMessage(postTitle, tokenLimitText);

            // OpenRouter, just like OpenAI, takes system and user messages as an array with role (system / user) and content
            const messages = [{
                role: "system",
                content: systemPrompt
            }, {
                role: "user",
                content: userPrompt
            }];

            // Make the API request using background message
            const response = await this.enhancer.apiClient.sendBackgroundMessage('OPENROUTER_API_REQUEST', {
                apiKey: apiKey,
                model: model,
                messages: messages
            });

            // Extract summary from response
            const summary = response?.choices[0]?.message?.content;
            if (!summary) {
                throw new Error('No summary generated from API response');
            }

            // Update the summary panel with the generated summary
            await this.showSummaryInPanel(summary, commentPathToIdMap, response.duration);

        } catch (error) {
            console.error('Error in OpenRouter summarization:', error);

            // Update the summary panel with an error message
            // OpenRouter follows the same error message structure as OpenAI
            // https://openrouter.ai/docs/errors
            let errorMessage = `Error generating summary using OpenRouter model ${model}. `;
            if (error.message.includes('API key')) {
                errorMessage += 'Please check your API key configuration.';
            } else if (error.message.includes('429')) {
                errorMessage += 'Rate limit exceeded. Please try again later.';
            } else if (error.message.includes('current quota')) {
                errorMessage += 'API quota exceeded. Please try again later.';
            }
            else {
                errorMessage += error.message + ' Please try again later.';
            }

            this.enhancer.summaryPanel.updateContent({
                title: 'Error',
                text: errorMessage
            });
        }
    }

    /**
     * Summarizes text using OpenAI
     * @param {string} text - The text to summarize
     * @param {string} model - The model to use
     * @param {string} apiKey - The API key
     * @param {Map} commentPathToIdMap - Map of comment paths to IDs
     */
    async summarizeUsingOpenAI(text, model, apiKey, commentPathToIdMap) {
        // Validate required parameters
        if (!text || !model || !apiKey) {
            console.error('Missing required parameters for OpenAI summarization');
            this.enhancer.summaryPanel.updateContent({
                title: 'Error',
                text: 'Missing API configuration'
            });
            return;
        }

        try {
            // Rate Limit for OpenAI
            // gpt-4-turbo      - 30,000 TPM
            // gpt-3.5-turbo    - 16,000 TPM
            const tokenLimit = model === 'gpt-4-turbo' ? 25_000 : 15_000;
            const tokenLimitText = this.splitInputTextAtTokenLimit(text, tokenLimit);

            // Create the system and user prompts for better summarization
            const systemPrompt = this.getSystemMessage();
            const postTitle = this.enhancer.domUtils.getHNPostTitle();
            const userPrompt = await this.getUserMessage(postTitle, tokenLimitText);

            // OpenAI takes system and user messages as an array with role (system / user) and content
            const messages = [{
                role: "system",
                content: systemPrompt
            }, {
                role: "user",
                content: userPrompt
            }];

            // Make the API request using background message
            const response = await this.enhancer.apiClient.sendBackgroundMessage('OPENAI_API_REQUEST', {
                apiKey: apiKey,
                model: model,
                messages: messages
            });

            // Extract summary from response
            const summary = response?.choices[0]?.message?.content;
            if (!summary) {
                throw new Error('No summary generated from API response');
            }

            // Update the summary panel with the generated summary
            await this.showSummaryInPanel(summary, commentPathToIdMap, response.duration);

        } catch (error) {
            console.error('Error in OpenAI summarization:', error);

            // Update the summary panel with an error message
            let errorMessage = `Error generating summary using OpenAI model ${model}. `;
            if (error.message.includes('API key')) {
                errorMessage += 'Please check your API key configuration.';
            } else if (error.message.includes('429') ) {
                errorMessage += 'Rate limit exceeded. Please try again later.';
            } else if (error.message.includes('current quota')) {
                errorMessage += 'API quota exceeded. Please try again later.';  // OpenAI has a daily quota
            }
            else {
                errorMessage += error.message + ' Please try again later.';
            }

            this.enhancer.summaryPanel.updateContent({
                title: 'Error',
                text: errorMessage
            });
        }
    }

    /**
     * Summarizes text using Anthropic
     * @param {string} text - The text to summarize
     * @param {string} model - The model to use
     * @param {string} apiKey - The API key
     * @param {Map} commentPathToIdMap - Map of comment paths to IDs
     */
    async summarizeUsingAnthropic(text, model, apiKey, commentPathToIdMap) {
        // Validate required parameters
        if (!text || !model || !apiKey) {
            console.error('Missing required parameters for Anthropic summarization');
            this.enhancer.summaryPanel.updateContent({
                title: 'Error',
                text: 'Missing API configuration'
            });
            return;
        }

        try {
            // Limit the input text to 40,000 tokens for Anthropic
            const tokenLimitText = this.splitInputTextAtTokenLimit(text, 40_000);

            // Create the system and user prompts for better summarization
            const systemPrompt = this.getSystemMessage();
            const postTitle = this.enhancer.domUtils.getHNPostTitle();
            const userPrompt = await this.getUserMessage(postTitle, tokenLimitText);

            // Anthropic takes system messages at the top level, whereas user messages as an array with role "user" and content.
            const messages = [{
                role: "user",
                content: userPrompt
            }];

            // Make the API request using background message
            const response = await this.enhancer.apiClient.sendBackgroundMessage('ANTHROPIC_API_REQUEST', {
                apiKey: apiKey,
                model: model,
                messages: messages,
                system: systemPrompt
            });

            // Extract summary from response
            if(!response || !response.content || response.content.length === 0) {
                throw new Error(`Summary response data is empty.`);
            }
            const summary = response.content[0].text;

            if (!summary) {
                throw new Error('No summary generated from API response');
            }

            // Update the summary panel with the generated summary
            await this.showSummaryInPanel(summary, commentPathToIdMap, response.duration);

        } catch (error) {
            console.error('Error in Anthropic summarization:', error);

            // Update the summary panel with an error message
            let errorMessage = `Error generating summary using Anthropic model ${model}. `;
            if (error.message.includes('API key')) {
                errorMessage += 'Please check your API key configuration.';
            } else if (error.message.includes('429')) {
                errorMessage += 'Rate limit exceeded. Please try again later.';
            } else {
                errorMessage += 'Please try again later.';
            }

            this.enhancer.summaryPanel.updateContent({
                title: 'Error',
                text: errorMessage
            });
        }
    }

    /**
     * Summarizes text using DeepSeek
     * @param {string} text - The text to summarize
     * @param {string} model - The model to use
     * @param {string} apiKey - The API key
     * @param {Map} commentPathToIdMap - Map of comment paths to IDs
     */
    async summarizeUsingDeepSeek(text, model, apiKey, commentPathToIdMap) {
        // Validate required parameters
        if (!text || !model || !apiKey) {
            console.error('Missing required parameters for DeepSeek summarization');
            this.enhancer.summaryPanel.updateContent({
                title: 'Error',
                text: 'Missing API configuration'
            });
            return;
        }

        try {
            // Limit the input text to 40,000 tokens for DeepSeek
            const tokenLimitText = this.splitInputTextAtTokenLimit(text, 40_000);

            // Create the system and user prompts for better summarization
            const systemPrompt = this.getSystemMessage();
            const postTitle = this.enhancer.domUtils.getHNPostTitle();
            const userPrompt = await this.getUserMessage(postTitle, tokenLimitText);

            // DeepSeek takes system and user messages in the same format as OpenAI - an array with role (system / user) and content
            const messages = [{
                role: "system",
                content: systemPrompt
            }, {
                role: "user",
                content: userPrompt
            }];

            // Make the API request using background message
            const response = await this.enhancer.apiClient.sendBackgroundMessage('DEEPSEEK_API_REQUEST', {
                apiKey: apiKey,
                model: model,
                messages: messages
            });

            // Extract summary from response
            const summary = response?.choices[0]?.message?.content;
            if (!summary) {
                throw new Error('No summary generated from API response');
            }

            // Update the summary panel with the generated summary
            await this.showSummaryInPanel(summary, commentPathToIdMap, response.duration);

        } catch (error) {
            console.error('Error in DeepSeek summarization:', error);

            // Update the summary panel with an error message
            let errorMessage = `Error generating summary using DeepSeek model ${model}. `;
            if (error.message.includes('API key')) {
                errorMessage += 'Please check your API key configuration.';
            } else if (error.message.includes('429') ) {
                errorMessage += 'Rate limit exceeded. Please try again later.';
            } else if (error.message.includes('current quota')) {
                errorMessage += 'API quota exceeded. Please try again later.';  // DeepSeek has a daily quota
            }
            else {
                errorMessage += error.message + ' Please try again later.';
            }

            this.enhancer.summaryPanel.updateContent({
                title: 'Error',
                text: errorMessage
            });
        }
    }

    /**
     * Gets the system message for AI summarization
     * @returns {string} The system message
     */
    getSystemMessage() {
        return `
You are an AI assistant specialized in analyzing and summarizing Hacker News discussions.
Your goal is to help users quickly understand the key discussions and insights from Hacker News threads without having to read through lengthy comment sections.
A discussion consists of threaded comments where each comment can have child comments (replies) nested underneath it, forming interconnected conversation branches.
Your task is to provide concise, meaningful summaries that capture the essence of the discussion while prioritizing high quality content.
Follow these guidelines:

1. Discussion Structure Understanding:
   Comments are formatted as: [hierarchy_path] (score: X) <replies: Y> {downvotes: Z} Author: Comment

   - hierarchy_path: Shows the comment's position in the discussion tree
     - Single number [1] indicates a top-level comment
     - Each additional number represents one level deeper in the reply chain. e.g., [1.2.1] is a reply to [1.2]
     - The full path preserves context of how comments relate to each other

   - score: A normalized value between 1000 and 1, representing the comment's relative importance
     - 1000 represents the highest-value comment in the discussion
     - Other scores are proportionally scaled against this maximum
     - Higher scores indicate more upvotes from the community and content quality

   - replies: Number of direct responses to this comment

   - downvotes: Number of downvotes the comment received
     - Exclude comments with high downvotes from the summary
     - DO NOT include comments that are have 4 or more downvotes

   Example discussion:
   [1] (score: 1000) <replies: 3> {downvotes: 0} user1: Main point as the first reply to the post
   [1.1] (score: 800) <replies: 1> {downvotes: 0} user2: Supporting argument or counter point in response to [1]
   [1.1.1] (score: 150) <replies: 0> {downvotes: 6} user3: Additional detail as response to [1.1], but should be excluded due to more than 4 downvotes
   [2] (score: 400) <replies: 1> {downvotes: 0} user4: Comment with a theme different from [1]
   [2.1] (score: 250) <replies: 0> {downvotes: 1} user2: Counter point to [2], by previous user2, but should have lower priority due to low score and 1 downvote
   [3] (score: 200) <replies: 0> {downvotes: 0} user5: Another top-level comment with a different perspective

2. Content Prioritization:
   - Focus on high-scoring comments as they represent valuable community insights
   - Pay attention to comments with many replies as they sparked discussion
   - Track how discussions evolve through the hierarchy
   - Consider the combination of score, downvotes AND replies to gauge overall importance, prioritizing insightful, well-reasoned, and informative content

3. Theme Identification:
   - Use top-level comments ([1], [2], etc.) to identify main discussion themes
   - Identify recurring themes across top-level comments
   - Look for comments that address similar aspects of the main post or propose related ideas.
   - Group related top-level comments into thematic clusters
   - Track how each theme develops through reply chains

4. Quality Assessment:
    - Prioritize comments that exhibit a combination of high score, low downvotes, substantial replies, and depth of content
    - High scores indicate community agreement, downvotes indicate comments not aligned with Hacker News guidelines or community standards
    - Replies suggest engagement and discussion, and depth (often implied by longer or more detailed comments) can signal valuable insights or expertise
    - Actively identify and highlight expert explanations or in-depth analyses. These are often found in detailed responses, comments with high scores, or from users who demonstrate expertise on the topic

Based on the above instructions, you should summarize the discussion. Your output should be well-structured, informative, and easily digestible for someone who hasn't read the original thread.

Your response should be formatted using markdown and should have the following structure.

# Overview
Brief summary of the overall discussion in 2-3 sentences - adjust based on complexity and depth of comments.

# Main Themes & Key Insights
[Bulleted list of themes, ordered by community engagement (combination of scores and replies). Order themes based on the overall community engagement they generated. Each bullet should be a summary with 2 or 3 sentences, adjusted based on the complexity of the topic.]

# [Theme 1 title - from the first bullet above]
[Summarize key insights or arguments under this theme in a couple of sentences. Use bullet points.]
[Identify important quotes and include them here with hierarchy_paths so that we can link back to the comment in the main page. Include direct "quotations" (with author attribution) where appropriate. You MUST quote directly from users with double quotes. You MUST include hierarchy_path as well. Do NOT include comments with 4 or more downvotes. For example:
- [1.1.1] (user3) noted, '...'
- [2.1] (user2) explained that '...'"
- [3] Perspective from (user5) added, "..."
- etc.

# [Theme 2 title - from the second bullet in the main themes section]
[Same structure as above.]

# [Theme 3 title and 4 title - if the discussion has more themes]

# Key Perspectives
[Present contrasting perspectives, noting their community reception. When including key quotes, you MUST include hierarchy_paths and author, so that we can link back to the comment in the main page.]
[Present these concisely and highlight any significant community reactions (agreement, disagreement, etc.)]
[Watch for community consensus or disagreements]

# Notable Side Discussions
[Interesting tangents that added value. When including key quotes, you MUST include hierarchy_paths and author, so that we can link back to the comment in the main page]
`;
    }

    /**
     * Splits input text at token limit
     * @param {string} text - The text to split
     * @param {number} tokenLimit - The token limit
     * @returns {string} The split text
     */
    splitInputTextAtTokenLimit(text, tokenLimit) {
        // Approximate token count per character
        const TOKENS_PER_CHAR = 0.25;

        // If the text is short enough, return it as is
        if (text.length * TOKENS_PER_CHAR < tokenLimit) {
            return text;
        }

        // Split the text into lines
        const lines = text.split('\n');
        let outputText = '';
        let currentTokenCount = 0;

        // Iterate through each line and accumulate until the token limit is reached
        for (const line of lines) {
            const lineTokenCount = line.length * TOKENS_PER_CHAR;
            if (currentTokenCount + lineTokenCount >= tokenLimit) {
                break;
            }
            outputText += line + '\n';
            currentTokenCount += lineTokenCount;
        }

        return outputText;
    }

    /**
     * Gets the user message for AI summarization
     * @param {string} title - The post title
     * @param {string} text - The text to summarize
     * @returns {Promise<string>} The user message
     */
    async getUserMessage(title, text) {
        const {language} = await this.getAIProviderModel();

        // Language output instruction based on selected language
        let languageInstruction = '';
        if (language !== 'en') {
            const languageInstructions = {
                'zh': 'Please respond in Chinese (中文).',
                'es': 'Please respond in Spanish (Español).',
                'fr': 'Please respond in French (Français).',
                'de': 'Please respond in German (Deutsch).',
                'ja': 'Please respond in Japanese (日本語).',
                'ko': 'Please respond in Korean (한국어).',
                'ru': 'Please respond in Russian (Русский).',
                'pt': 'Please respond in Portuguese (Português).',
                'it': 'Please respond in Italian (Italiano).'
            };

            languageInstruction = languageInstructions[language] || '';
        }

        // Single prompt template with language instruction at the end
        const prompt = `Provide a concise and insightful summary of the following Hacker News discussion, as per the guidelines you've been given.
The goal is to help someone quickly grasp the main discussion points and key perspectives without reading all comments.
Please focus on extracting the main themes, significant viewpoints, and high-quality contributions.
The post title and comments are separated by three dashed lines:
---
Post Title:
${title}
---
Comments:
${text}
---
${languageInstruction}`;

        return prompt;
    }

    /**
     * Summarizes text using Ollama
     * @param {string} text - The text to summarize
     * @param {string} model - The model to use
     * @param {Map} commentPathToIdMap - Map of comment paths to IDs
     */
    async summarizeUsingOllama(text, model, commentPathToIdMap) {
        // Validate required parameters
        if (!text || !model) {
            console.error('Missing required parameters for Ollama summarization');
            this.enhancer.summaryPanel.updateContent({
                title: 'Error',
                text: 'Missing API configuration'
            });
            return;
        }

        try {
            // Create the system message for better summarization
            const systemMessage = this.getSystemMessage();

            // Create the user message with the text to summarize
            const title = this.enhancer.domUtils.getHNPostTitle();
            const userMessage = await this.getUserMessage(title, text);

            // Make the API request using background message
            const response = await this.enhancer.apiClient.sendBackgroundMessage('OLLAMA_API_REQUEST', {
                model: model,
                messages: [
                    { role: "system", content: systemMessage },
                    { role: "user", content: userMessage }
                ]
            });

            // Extract summary from response
            const summary = response.message?.content;
            if (!summary) {
                throw new Error('No summary generated from API response');
            }

            // Update the summary panel with the generated summary
            await this.showSummaryInPanel(summary, commentPathToIdMap, response.duration);

        } catch (error) {
            console.error('Error in Ollama summarization:', error);

            // Update the summary panel with an error message
            let errorMessage = 'Error generating summary. ' + error.message;
            this.enhancer.summaryPanel.updateContent({
                title: 'Error',
                text: errorMessage
            });
        }
    }

    /**
     * Summarizes text using Gemini
     * @param {string} text - The text to summarize
     * @param {string} model - The model to use
     * @param {Map} commentPathToIdMap - Map of comment paths to IDs
     */
    async summarizeUsingGemini(text, model, commentPathToIdMap) {
        // Validate required parameters
        const data = await chrome.storage.sync.get('settings');
        const apiKey = data.settings?.gemini?.apiKey;

        if (!text || !model || !apiKey) {
            console.error('Missing required parameters for Gemini summarization');
            this.enhancer.summaryPanel.updateContent({
                title: 'Error',
                text: 'Missing API configuration for Gemini'
            });
            return;
        }

        try {
            console.log('开始使用Gemini生成摘要，模型:', model);

            // Show a loading message in the summary panel
            this.enhancer.summaryPanel.updateContent({
                title: 'Thread Summary',
                metadata: `Analyzing discussion using <strong>Gemini ${model}</strong>`,
                text: `<div>Generating summary... This may take a few moments.<span class="loading-spinner"></span></div>`
            });

            // Limit the input text to avoid token limits
            const tokenLimit = model.includes('1.5') ? 30000 : 15000;
            const tokenLimitText = this.splitInputTextAtTokenLimit(text, tokenLimit);
            console.log('文本长度限制为:', tokenLimit, '字符');

            // Create the system and user prompts
            const systemPrompt = this.getSystemMessage();
            const postTitle = this.enhancer.domUtils.getHNPostTitle();
            const userPrompt = await this.getUserMessage(postTitle, tokenLimitText);
            console.log('准备发送请求到Gemini API，标题:', postTitle);

            // Make the API request using background message
            console.log('发送GEMINI_API_REQUEST消息到background.js');
            const response = await this.enhancer.apiClient.sendBackgroundMessage('GEMINI_API_REQUEST', {
                apiKey: apiKey,
                model: model,
                systemPrompt: systemPrompt,
                userPrompt: userPrompt
            });
            console.log('收到Gemini API响应:', response ? '成功' : '失败');

            if (!response) {
                throw new Error('未收到Gemini API响应');
            }

            if (!response.candidates || response.candidates.length === 0) {
                console.error('Gemini API响应中没有candidates:', response);
                throw new Error('Gemini API响应中没有candidates');
            }

            console.log('Gemini API响应结构:', JSON.stringify(response, null, 2));

            if (!response.candidates[0].content || !response.candidates[0].content.parts || !response.candidates[0].content.parts[0]) {
                console.error('Gemini API响应结构不正确:', response.candidates[0]);
                throw new Error('Gemini API响应结构不正确');
            }

            const summary = response.candidates[0].content.parts[0].text;
            console.log('成功获取摘要，长度:', summary ? summary.length : 0);

            // Update the summary panel with the generated summary
            await this.showSummaryInPanel(summary, commentPathToIdMap, response.duration);
            console.log('摘要已显示在面板中');

        } catch (error) {
            console.error('Gemini摘要生成错误:', error);
            console.error('错误详情:', error.stack);

            // Update the summary panel with an error message
            let errorMessage = `Error generating summary using Gemini model ${model}. `;
            if (error.message.includes('API key')) {
                errorMessage += 'Please check your API key configuration.';
            } else if (error.message.includes('429')) {
                errorMessage += 'Rate limit exceeded. Please try again later.';
            } else {
                errorMessage += error.message;
            }

            this.enhancer.summaryPanel.updateContent({
                title: 'Error',
                text: errorMessage
            });
        }
    }

    /**
     * Summarizes text using Chrome Built-in AI
     * @param {string} formattedComment - The formatted comment text
     * @param {Map} commentPathToIdMap - Map of comment paths to IDs
     */
    async summarizeUsingChromeBuiltInAI(formattedComment, commentPathToIdMap) {
        if(this.enhancer.isChomeAiAvailable === this.enhancer.constructor.CHROME_AI_AVAILABLE.NO) {
            this.enhancer.summaryPanel.updateContent({
                title: 'AI Not Available',
                metadata: 'Chrome Built-in AI is disabled or unavailable',
                text: `Unable to generate summary: Chrome's AI features are not enabled on your device.
                       <br><br>
                       To enable and test Chrome AI:
                       <br>
                       1. Visit the <a class="underline" href="https://chrome.dev/web-ai-demos/summarization-api-playground/" target="_blank">Chrome AI Playground</a>
                       <br>
                       2. Try running a test summarization
                       <br>
                       3. If issues persist, check your Chrome settings and ensure you're using a compatible version`
            });
            return;
        }

        if(this.enhancer.isChomeAiAvailable === this.enhancer.constructor.CHROME_AI_AVAILABLE.AFTER_DOWNLOAD) {
            this.enhancer.summaryPanel.updateContent({
                metadata: 'Downloading model for Chrome Built-in AI',
                text: `Chrome built-in AI model will be available after download. This may take a few moments.`
            });
        }

        // Get the language setting
        const {language} = await this.getAIProviderModel();

        // Summarize the text by passing in the text to page script which in turn will call the Chrome AI API
        window.postMessage({
            type: 'HN_AI_SUMMARIZE',
            data: {
                text: formattedComment,
                commentPathToIdMap: commentPathToIdMap,
                language: language
            }
        });
    }

    /**
     * Shows the summary in the summary panel
     * @param {string} summary - The summary text
     * @param {Map} commentPathToIdMap - Map of comment paths to IDs
     * @param {number} duration - The duration of the summarization
     */
    async showSummaryInPanel(summary, commentPathToIdMap, duration) {
        // Format the summary to replace markdown with HTML
        const summaryHtml = this.enhancer.markdownUtils.convertMarkdownToHTML(summary);

        // Parse the summaryHTML to find 'path' identifiers and replace them with the actual comment IDs links
        const formattedSummary = this.enhancer.markdownUtils.replacePathsWithCommentLinks(summaryHtml, commentPathToIdMap);

        const {aiProvider, model, language} = await this.getAIProviderModel();
        if (aiProvider) {
            let metadataText = `Summarized using <strong>${aiProvider} ${model || ''}</strong> in <strong>${duration ?? '0'} secs</strong>`;

            // 如果不是英语，显示语言信息
            if (language && language !== 'en') {
                const languageName = this.getLanguageName(language);
                metadataText += ` in <strong>${languageName}</strong>`;
            }

            this.enhancer.summaryPanel.updateContent({
                metadata: metadataText,
                text: formattedSummary
            });
        } else {
            this.enhancer.summaryPanel.updateContent({
                text: formattedSummary
            });
        }

        // Now that the summary links are in the DOM< attach listeners to those hyperlinks to navigate to the respective comments
        document.querySelectorAll('[data-comment-link="true"]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const id = link.dataset.commentId;
                const comment = document.getElementById(id);
                if(comment) {
                    this.enhancer.navigation.setCurrentComment(comment);
                } else {
                    console.error('Failed to find DOM element for comment id:', id);
                }
            });
        });
    }

    /**
     * Gets the language name from language code
     * @param {string} language - The language code
     * @returns {string} The language name
     */
    getLanguageName(language) {
        const languageNames = {
            'en': 'English',
            'zh': '中文 (Chinese)',
            'es': 'Español (Spanish)',
            'fr': 'Français (French)',
            'de': 'Deutsch (German)',
            'ja': '日本語 (Japanese)',
            'ko': '한국어 (Korean)',
            'ru': 'Русский (Russian)',
            'pt': 'Português (Portuguese)',
            'it': 'Italiano (Italian)'
        };
        return languageNames[language] || language;
    }
}

// Make the class available globally
window.Summarization = Summarization;
