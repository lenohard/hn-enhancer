async function onInstalled() {
    const data = await chrome.storage.sync.get('settings');
    const providerSelection = data.settings?.providerSelection;

    if (!providerSelection) {
        try {
            chrome.runtime.openOptionsPage();
        } catch (e) {
            console.log('Error opening options page:', e);
        }
    }
}

// Uncomment this line to enable the onInstalled handler
// Handle Gemini API requests
async function handleGeminiRequest(data) {
    const { apiKey, model, systemPrompt, userPrompt } = data;
    
    console.log('处理Gemini API请求，模型:', model);
    
    if (!apiKey || !model) {
        console.error('Gemini API请求缺少必要参数');
        throw new Error('Missing required parameters for Gemini API request');
    }
    
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
    const url = `${endpoint}?key=${apiKey}`;
    
    console.log('Gemini API端点:', endpoint);
    
    const payload = {
        contents: [
            {
                role: "user",
                parts: [
                    { text: systemPrompt },
                    { text: userPrompt }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 8192
        }
    };
    
    console.log('Gemini请求负载结构:', JSON.stringify({
        endpoint: endpoint,
        method: 'POST',
        payloadSize: JSON.stringify(payload).length,
        apiKeyLength: apiKey ? apiKey.length : 0,
        systemPromptLength: systemPrompt ? systemPrompt.length : 0,
        userPromptLength: userPrompt ? userPrompt.length : 0
    }, null, 2));
    
    try {
        console.log('发送Gemini API请求...');
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        console.log('收到Gemini API响应, 状态码:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API错误:', {
                status: response.status,
                statusText: response.statusText,
                errorBody: errorText
            });
            throw new Error(`Gemini API Error: HTTP error code: ${response.status}, URL: ${url.split('?')[0]} \nBody: ${errorText}`);
        }
        
        const responseData = await response.json();
        console.log('Gemini API响应数据结构:', JSON.stringify({
            hasData: !!responseData,
            hasCandidates: !!(responseData && responseData.candidates),
            candidatesCount: responseData && responseData.candidates ? responseData.candidates.length : 0
        }, null, 2));
        
        return responseData;
    } catch (error) {
        console.error('Gemini API请求失败:', error);
        console.error('错误详情:', error.stack);
        throw error;
    }
}

// chrome.runtime.onInstalled.addListener(onInstalled);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    console.log('Background script received message of type:', message.type);

    // Handle the message
    switch (message.type) {
        case 'HN_SHOW_OPTIONS':
            chrome.runtime.openOptionsPage();
            break;

        case 'FETCH_API_REQUEST':
            return handleAsyncMessage(
                message,
                async () => await fetchWithTimeout(message.data.url, message.data),
                sendResponse
            );

        case 'GEMINI_API_REQUEST':
            return handleAsyncMessage(
                message,
                async () => await handleGeminiRequest(message.data),
                sendResponse
            );

        default:
            console.log('Unknown message type:', message.type);
    }
});

// Handle async message and send response
function handleAsyncMessage(message, asyncOperation, sendResponse) {
    (async () => {
        try {
            console.log(`开始处理异步消息: ${message.type}`);
            const response = await asyncOperation();
            console.log(`异步消息处理成功: ${message.type}`);
            sendResponse({success: true, data: response});
        } catch (error) {
            console.error(`异步消息处理失败: ${message.type}. 错误:`, error);
            console.error(`错误详情:`, error.stack);
            sendResponse({success: false, error: error.toString()});
        }
    })();

    // indicate that sendResponse will be called later and hence keep the message channel open
    return true;
}

// Utility function for API calls with timeout
async function fetchWithTimeout(url, options = {}) {

    const {method = 'GET', headers = {}, body = null, timeout = 60_000} = options;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        console.log(`Making ${method} request to: ${url.split('?')[0]}`);
        
        const response = await fetch(url, {
            method,
            headers,
            body,
            signal: controller.signal
        });
        clearTimeout(id);

        if (!response.ok) {
            const responseText = await response.text();
            const errorText = `API Error: HTTP error code: ${response.status}, URL: ${url.split('?')[0]} \nBody: ${responseText}`;
            console.error(errorText);
            throw new Error(errorText);
        }

        return await response.json();
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeout}ms: ${url.split('?')[0]}`);
        }
        throw error;
    }
}

// chrome.runtime.onInstalled.addListener(onInstalled);
