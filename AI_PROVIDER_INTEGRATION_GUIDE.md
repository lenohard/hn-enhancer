# AI Provider Integration Guide for HN Enhancer

## Overview
This document serves as a comprehensive guide for adding new AI providers to the HN Enhancer browser extension. It documents the architecture, implementation patterns, and step-by-step process learned during the LiteLLM integration.

## Architecture Overview

The HN Enhancer extension follows a modular architecture for AI provider integration:

### Core Components

1. **Background Script** (`background.js`)
   - Handles all external API calls (CORS limitations)
   - Contains provider-specific request handlers
   - Routes chat requests to appropriate providers
   - Manages model fetching functionality

2. **Summarization Module** (`src/summarization.js`)
   - Contains provider-specific summarization methods
   - Handles token limits and text processing
   - Manages UI updates and error handling

3. **Options Page** (`src/options/options.html` + `src/options/options.js`)
   - User interface for provider configuration
   - API key management
   - Model selection and testing

4. **Chat Modal** (`src/chat-modal.js`)
   - Handles conversational AI interactions
   - Sends generic chat requests that get routed by background script

## Implementation Pattern

Every AI provider follows this consistent pattern:

### 1. Background Script Integration

#### Message Listener
Add a case to the message listener in `background.js`:
```javascript
case "PROVIDER_API_REQUEST":
  return handleAsyncMessage(
    message,
    async () => await handleProviderRequest(message.data),
    sendResponse
  );
```

#### API Handler Function
Implement the request handler:
```javascript
async function handleProviderRequest(data) {
  const { apiKey, model, messages } = data;
  
  // Validation
  if (!model || !messages) {
    throw new Error("Missing required parameters");
  }
  
  // API call
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey && { "Authorization": `Bearer ${apiKey}` }),
    },
    body: JSON.stringify(payload),
  });
  
  // Error handling and response processing
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error: ${response.status} \nBody: ${errorText}`);
  }
  
  return await response.json();
}
```

#### Chat Request Handler
Add provider case to `handleChatRequest` function:
```javascript
case "provider-name":
  const providerResponse = await handleProviderRequest({
    apiKey,
    model,
    messages,
  });
  return providerResponse.choices[0]?.message?.content || "No response content";
```

#### Model Fetching (Optional)
For providers with dynamic model lists:
```javascript
case "FETCH_PROVIDER_MODELS":
  return handleAsyncMessage(
    message,
    async () => await handleFetchProviderModels(message.data),
    sendResponse
  );

async function handleFetchProviderModels(data) {
  // Fetch models from provider API
  // Transform to standard format
  return {
    models: models.map(model => ({
      name: model.id,
      displayName: model.name,
      description: model.description,
      inputTokenLimit: 0,
      outputTokenLimit: 0
    }))
  };
}
```

### 2. Summarization Integration

Add provider case to switch statement in `summarizeThread` method:
```javascript
case "provider-name":
  const providerKey = data.settings?.[providerSelection]?.apiKey;
  await this.summarizeUsingProvider(
    formattedComment,
    model,
    providerKey,
    commentPathToIdMap
  );
  break;
```

Implement the summarization method:
```javascript
async summarizeUsingProvider(text, model, apiKey, commentPathToIdMap) {
  // Validation (API key may be optional for local providers)
  if (!text || !model) {
    console.error("Missing required parameters");
    this.enhancer.summaryPanel.updateContent({
      title: "Error",
      text: "Missing configuration",
    });
    return;
  }

  try {
    // Token limiting
    const tokenLimit = 15_000;
    const tokenLimitText = this.splitInputTextAtTokenLimit(text, tokenLimit);

    // Prompt preparation
    const systemPrompt = this.getSystemMessage();
    const postTitle = this.enhancer.domUtils.getHNPostTitle();
    const userPrompt = await this.getUserMessage(postTitle, tokenLimitText);

    // Message formatting
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    // API call
    const response = await this.enhancer.apiClient.sendBackgroundMessage(
      "PROVIDER_API_REQUEST",
      { apiKey, model, messages }
    );

    // Response processing
    const summary = response?.choices[0]?.message?.content;
    if (!summary) {
      throw new Error("No summary generated from API response");
    }

    // UI update
    await this.showSummaryInPanel(summary, commentPathToIdMap, response.duration);
    
  } catch (error) {
    console.error("Error in provider summarization:", error);
    
    // Provider-specific error handling
    let errorMessage = `Error generating summary using ${model}. `;
    if (error.message.includes("Connection refused")) {
      errorMessage += "Server is not running.";
    } else if (error.message.includes("429")) {
      errorMessage += "Rate limit exceeded.";
    } else {
      errorMessage += error.message;
    }

    this.enhancer.summaryPanel.updateContent({
      title: "Error",
      text: errorMessage,
    });
  }
}
```

### 3. Options Page Integration

#### HTML Structure
Add provider section to `options.html`:
```html
<div class="space-y-3">
    <div class="flex items-center">
        <input id="provider-id" name="provider-selection" type="radio"
               class="relative size-4 appearance-none rounded-full border border-gray-300 bg-white before:absolute before:inset-1 before:rounded-full before:bg-white checked:border-indigo-600 checked:bg-indigo-600...">
        <label for="provider-id" class="ml-3 block text-sm font-medium text-gray-900">Provider Name</label>
        <span class="inline-flex items-center rounded-md ml-3 bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-700/10">Label</span>
        
        <!-- Info tooltip -->
        <details class="ml-2 inline-block relative">
            <summary class="list-none text-gray-400 hover:text-gray-500 cursor-pointer">
                <!-- SVG icon -->
            </summary>
            <div class="absolute right-0 -translate-x-1 mt-2 w-80 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-10 p-4 text-sm text-gray-600">
                Provider description and usage instructions.
            </div>
        </details>
    </div>
    
    <div class="ml-7 space-y-3">
        <!-- API Key Input -->
        <div class="mt-2 grid grid-cols-1">
            <input type="password" id="provider-key" name="provider-key"
                   placeholder="Enter API Key (optional if applicable)"
                   class="col-start-1 row-start-1 block w-full rounded-md bg-white px-3 py-1.5...">
        </div>
        
        <!-- Model Selection -->
        <div>
            <label for="provider-model" class="block text-sm font-medium text-gray-900">Model</label>
            <div class="mt-2 flex gap-2">
                <div class="flex-1 grid grid-cols-1">
                    <input type="text" id="provider-model" name="provider-model"
                           placeholder="Enter model name"
                           class="col-start-1 row-start-1 block w-full rounded-md...">
                </div>
                <button type="button" id="refresh-provider-models"
                        class="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white...">
                    刷新
                </button>
            </div>
        </div>
    </div>
</div>
```

#### JavaScript Integration
Add to `options.js`:

1. **Model Fetching Function**:
```javascript
async function fetchProviderModels() {
    try {
        const apiKey = document.getElementById('provider-key').value;
        
        const data = await sendBackgroundMessage('FETCH_PROVIDER_MODELS', {
            apiKey: apiKey || undefined
        });

        // Update UI with models (convert input to select if needed)
        const inputElement = document.getElementById('provider-model');
        // Implementation depends on whether you want dropdown or text input
        
    } catch (error) {
        console.error('获取模型时出错:', error);
        alert(`获取模型失败: ${error.message}`);
    }
}
```

2. **Event Listeners**:
```javascript
// Refresh button
const refreshButton = document.getElementById('refresh-provider-models');
refreshButton.addEventListener('click', async () => {
    const originalText = refreshButton.textContent;
    refreshButton.textContent = '刷新中...';
    refreshButton.disabled = true;
    
    try {
        await fetchProviderModels();
        refreshButton.textContent = '已刷新';
        setTimeout(() => refreshButton.textContent = originalText, 2000);
    } catch (error) {
        refreshButton.textContent = '刷新失败';
        setTimeout(() => refreshButton.textContent = originalText, 3000);
    } finally {
        refreshButton.disabled = false;
    }
});

// Input enable/disable
const providerInputs = document.querySelectorAll('#provider-key, #provider-model');
// Add to existing radio button change listener
providerInputs.forEach(input => input.disabled = radio.id !== 'provider-id');
```

3. **Update Cancel Button Selector**:
```javascript
const cancelButton = document.querySelector('button[type="button"]:not(#test-connection):not(#refresh-gemini-models):not(#refresh-provider-models)');
```

## Provider-Specific Considerations

### API Key Requirements
- **Required**: OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter
- **Optional**: LiteLLM (depends on underlying model), Ollama (local)
- **Not needed**: Chrome Built-in AI

Update the API key validation in `handleChatRequest`:
```javascript
if (!apiKey && provider !== "ollama" && provider !== "chrome-ai" && provider !== "litellm") {
    throw new Error(`Missing API key for ${provider}`);
}
```

### Response Format Handling
Different providers return different response formats:

- **OpenAI-compatible** (OpenAI, LiteLLM, DeepSeek, OpenRouter, Gemini): `response.choices[0].message.content`
- **Anthropic**: `response.content[0].text`
- **Ollama**: `response.message.content`
- **Chrome AI**: `response.summary`

### Token Limits
Set appropriate token limits based on provider capabilities:
- OpenAI: 25,000 (GPT-4) / 15,000 (GPT-3.5)
- Others: Conservative 15,000 default
- Local models: May need adjustment based on model size

### Error Handling
Implement provider-specific error messages:
- Connection errors for local providers
- Rate limiting for cloud providers
- Authentication errors
- Model availability errors

## File Locations Summary

1. **Background Script**: `/background.js`
   - Add message case
   - Implement handler function
   - Update chat request handler
   - Add model fetching (optional)

2. **Summarization**: `/src/summarization.js`
   - Add switch case
   - Implement summarization method

3. **Options HTML**: `/src/options/options.html`
   - Add provider section

4. **Options JS**: `/src/options/options.js`
   - Add model fetching function
   - Add event listeners
   - Update input enable/disable logic

## Testing Checklist

- [ ] Provider appears in options page
- [ ] API key input works (if required)
- [ ] Model selection works
- [ ] Model refresh button works (if applicable)
- [ ] Test connection works
- [ ] Summarization works
- [ ] Chat functionality works
- [ ] Error handling displays appropriate messages
- [ ] Settings persist across browser sessions

## LiteLLM Specific Implementation

### Base URL
- Chat endpoint: `http://127.0.0.1:4000/chat/completions`
- Models endpoint: `http://127.0.0.1:4000/models`

### Key Features
- OpenAI-compatible API format
- Optional API key (for local models)
- Dynamic model fetching
- Supports multiple underlying providers through unified interface

### Special Considerations
- API key is optional for local models but may be required for cloud providers
- Model names depend on LiteLLM configuration
- Server must be running locally for functionality

## Common Pitfalls

1. **CORS Issues**: All API calls must go through background script
2. **Message Passing**: Use proper async message handling pattern
3. **Error Propagation**: Ensure errors bubble up correctly for UI display
4. **Input Validation**: Check for missing required parameters
5. **Storage**: Use Chrome storage API for persistence
6. **UI State**: Properly enable/disable inputs based on provider selection
7. **Token Limits**: Set appropriate limits to avoid API errors

## Future Enhancements

- Support for streaming responses
- Custom token limit configuration per provider
- Provider health monitoring
- Model capability detection
- Automatic fallback between providers

---

*This document was created during the LiteLLM integration process and should be updated as the architecture evolves.*