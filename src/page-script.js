(function () {

    // Listen for processed data from content script
    window.addEventListener('message', async function (event) {
        // reject all messages from other domains
        if (event.origin !== window.location.origin) {
            return;
        }

        // console.log('page-Script - Received message:', event.type, JSON.stringify(event.data));

        switch (event.data.type) {
            case 'HN_CHECK_AI_AVAILABLE':
                if ('ai' in self && 'summarizer' in self.ai) {
                    const available = (await self.ai.summarizer.capabilities()).available;

                    window.postMessage({
                        type: 'HN_CHECK_AI_AVAILABLE_RESPONSE',
                        data: {
                            available
                        }
                    });
                }
                break;
            case 'HN_AI_SUMMARIZE':
                const options = {
                    sharedContext: 'Summarize this discussion from Hacker News with comments. Show long content in bullet points..',
                    type: 'tl;dr',
                    format: 'plain-text',
                    length: 'medium',
                };
                if ('ai' in self && 'summarizer' in self.ai) {

                    const available = (await self.ai.summarizer.capabilities()).available;
                    if (available === 'no') {
                        window.postMessage({
                            type: 'HN_AI_SUMMARIZE_RESPONSE',
                            data: {
                                error: `Chrome Built-in AI is not available. AI Summarizer availability status: ${available}`
                            }
                        });
                        return;
                    }
                    const text = event.data.data.text;
                    const commentPathToIdMap = event.data.data.commentPathToIdMap;
                    const summarizer = await self.ai.summarizer.create(options);

                    try {
                        const language = event.data.data.language || 'en';
                        let context = 'This is a discussion thread in a tech community.';
                        
                        // Add language instruction to context if not English
                        if (language !== 'en') {
                            const languageNames = {
                                'zh': 'Chinese (中文)',
                                'es': 'Spanish (Español)',
                                'fr': 'French (Français)',
                                'de': 'German (Deutsch)',
                                'ja': 'Japanese (日本語)',
                                'ko': 'Korean (한국어)',
                                'ru': 'Russian (Русский)',
                                'pt': 'Portuguese (Português)',
                                'it': 'Italian (Italiano)'
                            };
                            
                            const languageName = languageNames[language] || language;
                            context = `This is a discussion thread in a tech community. Please summarize in ${languageName}.`;
                        }
                        
                        const summary = await summarizer.summarize(
                            text,
                            {context: context}
                        );
                        // console.log('Chrome Built-in AI summary:\n', summary);

                        window.postMessage({
                            type: 'HN_AI_SUMMARIZE_RESPONSE',
                            data: {
                                summary,
                                commentPathToIdMap
                            }
                        });
                    } catch (error) {
                        window.postMessage({
                            type: 'HN_AI_SUMMARIZE_RESPONSE',
                            data: {
                                error: `Summarization by Chrome Built-in failed. Error: ${available}`
                            }
                        });
                    }
                }
            break;
        }
    });
})();
