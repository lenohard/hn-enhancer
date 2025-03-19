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
    
    if (!apiKey || !model) {
        throw new Error('Missing required parameters for Gemini API request');
    }
    
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
    const url = `${endpoint}?key=${apiKey}`;
    
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
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API Error: HTTP error code: ${response.status}, URL: ${url.split('?')[0]} \nBody: ${errorText}`);
    }
    
    return await response.json();
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
            const response = await asyncOperation();
            sendResponse({success: true, data: response});
        } catch (error) {
            console.error(`Message: ${message.type}. Error: ${error}`);
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
