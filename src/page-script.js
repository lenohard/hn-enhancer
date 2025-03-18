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
                        
                        // Add language-specific context
                        if (language !== 'en') {
                            const languageMap = {
                                'zh': '请用中文总结这个技术社区的讨论线程。',
                                'es': 'Por favor, resume este hilo de discusión de una comunidad tecnológica en español.',
                                'fr': 'Veuillez résumer ce fil de discussion d\'une communauté technologique en français.',
                                'de': 'Bitte fassen Sie diesen Diskussionsfaden einer technischen Community auf Deutsch zusammen.',
                                'ja': 'このテクノロジーコミュニティのディスカッションスレッドを日本語で要約してください。',
                                'ko': '이 기술 커뮤니티의 토론 스레드를 한국어로 요약해 주세요.',
                                'ru': 'Пожалуйста, резюмируйте эту ветку обсуждения технического сообщества на русском языке.',
                                'pt': 'Por favor, resuma este tópico de discussão de uma comunidade tecnológica em português.',
                                'it': 'Per favore, riassumi questa discussione di una comunità tecnologica in italiano.'
                            };
                            
                            if (languageMap[language]) {
                                context = languageMap[language];
                            }
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
