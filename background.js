async function onInstalled() {
  console.log("[BACKGROUND] 扩展已安装/启动");
  const data = await chrome.storage.sync.get("settings");
  const providerSelection = data.settings?.providerSelection;

  if (!providerSelection) {
    try {
      chrome.runtime.openOptionsPage();
    } catch (e) {
      console.log("Error opening options page:", e);
    }
  }
}

// Handle Gemini API requests
async function handleGeminiRequest(data) {
  // Handle both formats: messages array or systemPrompt/userPrompt
  const { apiKey, model, messages, systemPrompt, userPrompt } = data;

  console.log("处理Gemini API请求，模型:", model);
  console.log("API密钥长度:", apiKey ? apiKey.length : 0);
  console.log("消息数量:", messages ? messages.length : 0);

  // Validate required parameters - support both formats
  if (!apiKey || !model || (!messages && (!systemPrompt || !userPrompt))) {
    console.error("Gemini API请求缺少必要参数 (apiKey, model, or messages/prompts)");
    throw new Error("Missing required parameters for Gemini API request");
  }

  // Convert systemPrompt/userPrompt format to messages format if needed
  let processedMessages = messages;
  if (!messages && systemPrompt && userPrompt) {
    processedMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];
  }

  // Use OpenAI-compatible endpoint
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

  console.log("Gemini API端点:", endpoint);

  // Use OpenAI-compatible format - much simpler!
  const payload = {
    model: model.replace('models/', ''), // Remove 'models/' prefix if present
    messages: processedMessages,
    temperature: 0.7,
    max_tokens: 8192,
  };

  // Log the final payload being sent
  console.log("Gemini 请求负载:", JSON.stringify(payload, null, 2));

  try {
    console.log("发送Gemini API请求...");
    console.log("请求URL:", endpoint);
    console.log("请求配置:", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": "Bearer ***"
      },
      bodySize: JSON.stringify(payload).length
    });
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    console.log("收到Gemini API响应, 状态码:", response.status);
    console.log("响应头:", Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API错误:", {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
      });
      throw new Error(
        `Gemini API Error: HTTP error code: ${response.status}, URL: ${endpoint} \nBody: ${errorText}`
      );
    }

    const responseData = await response.json();
    console.log(
      "Gemini API响应数据结构:",
      JSON.stringify(
        {
          hasData: !!responseData,
          hasChoices: !!(responseData && responseData.choices),
          choicesCount:
            responseData && responseData.choices
              ? responseData.choices.length
              : 0,
        },
        null,
        2
      )
    );

    return responseData;
  } catch (error) {
    console.error("Gemini API请求失败:", error);
    console.error("错误类型:", error.name);
    console.error("错误消息:", error.message);
    console.error("错误详情:", error.stack);
    
    // 提供更具体的错误信息
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      console.error("网络错误可能原因:");
      console.error("1. 网络连接问题");
      console.error("2. API密钥无效或格式错误");
      console.error("3. 请求被阻止 (防火墙/代理)");
      console.error("4. Gemini API服务不可用");
      console.error("5. 请求负载过大或格式错误");
    }
    
    throw error;
  }
}

// 启用安装处理程序
chrome.runtime.onInstalled.addListener(onInstalled);

// 添加启动日志
console.log("[BACKGROUND] Background script 已加载");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[BACKGROUND] 收到消息, 类型:", message.type);
  console.log("[BACKGROUND] 消息数据:", message.data);
  console.log("[BACKGROUND] 发送者:", sender);

  // Handle the message
  switch (message.type) {
    case "HN_SHOW_OPTIONS":
      chrome.runtime.openOptionsPage();
      break;

    case "FETCH_API_REQUEST":
      return handleAsyncMessage(
        message,
        async () => await fetchWithTimeout(message.data.url, message.data),
        sendResponse
      );

    case "GEMINI_API_REQUEST":
      return handleAsyncMessage(
        message,
        async () => await handleGeminiRequest(message.data),
        sendResponse
      );

    case "OPENAI_API_REQUEST":
      return handleAsyncMessage(
        message,
        async () => await handleOpenAIRequest(message.data),
        sendResponse
      );

    case "ANTHROPIC_API_REQUEST":
      return handleAsyncMessage(
        message,
        async () => await handleAnthropicRequest(message.data),
        sendResponse
      );

    case "DEEPSEEK_API_REQUEST":
      return handleAsyncMessage(
        message,
        async () => await handleDeepSeekRequest(message.data),
        sendResponse
      );

    case "OLLAMA_API_REQUEST":
      return handleAsyncMessage(
        message,
        async () => await handleOllamaRequest(message.data),
        sendResponse
      );

    case "OPENROUTER_API_REQUEST":
      return handleAsyncMessage(
        message,
        async () => await handleOpenRouterRequest(message.data),
        sendResponse
      );

    case "CHROME_AI_API_REQUEST":
      return handleAsyncMessage(
        message,
        async () => await handleChromeAIRequest(message.data),
        sendResponse
      );
    case "HN_CHAT_REQUEST":
      return handleAsyncMessage(
        message,
        async () => await handleChatRequest(message.data), // Directly return the result (string or thrown error)
        sendResponse
      );

    case "FETCH_GEMINI_MODELS":
      return handleAsyncMessage(
        message,
        async () => await handleFetchGeminiModels(message.data),
        sendResponse
      );

    default:
      console.log("Unknown message type:", message.type);
  }
});

// Handle async message and send response
function handleAsyncMessage(message, asyncOperation, sendResponse) {
  (async () => {
    try {
      console.log(`开始处理异步消息: ${message.type}`);
      const response = await asyncOperation();
      console.log(`异步消息处理成功: ${message.type}`);
      sendResponse({ success: true, data: response });
    } catch (error) {
      console.error(`异步消息处理失败: ${message.type}. 错误:`, error);
      console.error(`错误详情:`, error.stack);
      sendResponse({ success: false, error: error.toString() });
    }
  })();

  // indicate that sendResponse will be called later and hence keep the message channel open
  return true;
}

// Handle OpenAI API requests
async function handleOpenAIRequest(data) {
  const { apiKey, model, messages } = data;

  console.log("处理OpenAI API请求，模型:", model);

  if (!apiKey || !model || !messages) {
    console.error("OpenAI API请求缺少必要参数");
    throw new Error("Missing required parameters for OpenAI API request");
  }

  const endpoint = "https://api.openai.com/v1/chat/completions";

  console.log("OpenAI API端点:", endpoint);

  const payload = {
    model: model,
    messages: messages,
    temperature: 0.7,
    max_tokens: 2048, // Consider making this configurable later
  };

  // Log the payload being sent
  console.log("OpenAI 请求负载:", JSON.stringify(payload, null, 2));

  try {
    console.log("发送OpenAI API请求...");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    console.log("收到OpenAI API响应, 状态码:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API错误:", {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
      });
      throw new Error(
        `OpenAI API Error: HTTP error code: ${response.status} \nBody: ${errorText}`
      );
    }

    const responseData = await response.json();
    console.log(
      "OpenAI API响应数据结构:",
      JSON.stringify(
        {
          hasData: !!responseData,
          hasChoices: !!(responseData && responseData.choices),
          choicesCount:
            responseData && responseData.choices
              ? responseData.choices.length
              : 0,
        },
        null,
        2
      )
    );

    return responseData;
  } catch (error) {
    console.error("OpenAI API请求失败:", error);
    console.error("错误详情:", error.stack);
    throw error;
  }
}

// Handle Anthropic API requests
async function handleAnthropicRequest(data) {
  const { apiKey, model, messages } = data;

  console.log("处理Anthropic API请求，模型:", model);

  if (!apiKey || !model || !messages) {
    console.error("Anthropic API请求缺少必要参数");
    throw new Error("Missing required parameters for Anthropic API request");
  }

  const endpoint = "https://api.anthropic.com/v1/messages";

  console.log("Anthropic API端点:", endpoint);

  // Use the messages array directly as received
  const payload = {
    model: model,
    messages: messages, // Pass the full messages array
    max_tokens: 2048,
    // No separate system prompt extraction needed anymore
  };

  // Log the payload being sent
  console.log("Anthropic 请求负载:", JSON.stringify(payload, null, 2));

  try {
    console.log("发送Anthropic API请求...");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true", // this is required to resolve CORS issue
      },
      body: JSON.stringify(payload),
    });

    console.log("收到Anthropic API响应, 状态码:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API错误:", {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
      });
      throw new Error(
        `Anthropic API Error: HTTP error code: ${response.status} \nBody: ${errorText}`
      );
    }

    const responseData = await response.json();
    console.log(
      "Anthropic API响应数据结构:",
      JSON.stringify(
        {
          hasData: !!responseData,
          hasContent: !!(responseData && responseData.content),
          contentLength:
            responseData && responseData.content
              ? responseData.content.length
              : 0,
        },
        null,
        2
      )
    );

    return responseData;
  } catch (error) {
    console.error("Anthropic API请求失败:", error);
    console.error("错误详情:", error.stack);
    throw error;
  }
}

// Handle DeepSeek API requests
async function handleDeepSeekRequest(data) {
  const { apiKey, model, messages } = data;

  console.log("处理DeepSeek API请求，模型:", model);

  if (!apiKey || !model || !messages) {
    console.error("DeepSeek API请求缺少必要参数");
    throw new Error("Missing required parameters for DeepSeek API request");
  }

  const endpoint = "https://api.deepseek.com/v1/chat/completions";

  console.log("DeepSeek API端点:", endpoint);

  const payload = {
    model: model,
    messages: messages,
    temperature: 0.7,
    max_tokens: 2048, // Consider making this configurable later
  };

  // Log the payload being sent
  console.log("DeepSeek 请求负载:", JSON.stringify(payload, null, 2));

  try {
    console.log("发送DeepSeek API请求...");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    console.log("收到DeepSeek API响应, 状态码:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("DeepSeek API错误:", {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
      });
      throw new Error(
        `DeepSeek API Error: HTTP error code: ${response.status} \nBody: ${errorText}`
      );
    }

    const responseData = await response.json();
    console.log(
      "DeepSeek API响应数据结构:",
      JSON.stringify(
        {
          hasData: !!responseData,
          hasChoices: !!(responseData && responseData.choices),
          choicesCount:
            responseData && responseData.choices
              ? responseData.choices.length
              : 0,
        },
        null,
        2
      )
    );

    return responseData;
  } catch (error) {
    console.error("DeepSeek API请求失败:", error);
    console.error("错误详情:", error.stack);
    throw error;
  }
}

// Handle Ollama API requests
async function handleOllamaRequest(data) {
  const { model, messages } = data;

  console.log("处理Ollama API请求，模型:", model);

  if (!model || !messages) {
    console.error("Ollama API请求缺少必要参数");
    throw new Error("Missing required parameters for Ollama API request");
  }

  const endpoint = "http://localhost:11434/api/chat";

  console.log("Ollama API端点:", endpoint);

  const payload = {
    model: model,
    messages: messages,
    stream: false, // Keep stream false for simple request/response
  };

  // Log the payload being sent
  console.log("Ollama 请求负载:", JSON.stringify(payload, null, 2));

  try {
    console.log("发送Ollama API请求...");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    console.log("收到Ollama API响应, 状态码:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Ollama API错误:", {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
      });
      throw new Error(
        `Ollama API Error: HTTP error code: ${response.status} \nBody: ${errorText}`
      );
    }

    const responseData = await response.json();
    console.log(
      "Ollama API响应数据结构:",
      JSON.stringify(
        {
          hasData: !!responseData,
          hasMessage: !!(responseData && responseData.message),
          hasContent: !!(
            responseData &&
            responseData.message &&
            responseData.message.content
          ),
        },
        null,
        2
      )
    );

    return responseData;
  } catch (error) {
    console.error("Ollama API请求失败:", error);
    console.error("错误详情:", error.stack);
    throw error;
  }
}

// Handle OpenRouter API requests
async function handleOpenRouterRequest(data) {
  const { apiKey, model, messages } = data;

  console.log("处理OpenRouter API请求，模型:", model);

  if (!apiKey || !model || !messages) {
    console.error("OpenRouter API请求缺少必要参数");
    throw new Error("Missing required parameters for OpenRouter API request");
  }

  const endpoint = "https://openrouter.ai/api/v1/chat/completions";

  console.log("OpenRouter API端点:", endpoint);

  const payload = {
    model: model,
    messages: messages,
    temperature: 0.7,
    max_tokens: 2048, // Consider making this configurable later
  };

   // Log the payload being sent
  console.log("OpenRouter 请求负载:", JSON.stringify(payload, null, 2));

  try {
    console.log("发送OpenRouter API请求...");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/levelup-apps/hn-enhancer",
        "X-Title": "Hacker News Companion",
      },
      body: JSON.stringify(payload),
    });

    console.log("收到OpenRouter API响应, 状态码:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter API错误:", {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
      });
      throw new Error(
        `OpenRouter API Error: HTTP error code: ${response.status} \nBody: ${errorText}`
      );
    }

    const responseData = await response.json();
    console.log(
      "OpenRouter API响应数据结构:",
      JSON.stringify(
        {
          hasData: !!responseData,
          hasChoices: !!(responseData && responseData.choices),
          choicesCount:
            responseData && responseData.choices
              ? responseData.choices.length
              : 0,
        },
        null,
        2
      )
    );

    return responseData;
  } catch (error) {
    console.error("OpenRouter API请求失败:", error);
    console.error("错误详情:", error.stack);
    throw error;
  }
}

// Handle Chat Request (routes to specific provider handlers)
async function handleChatRequest(data) {
  // The 'messages' received here is the full conversation history
  const { provider, model, messages } = data;
  console.log(`处理聊天请求，提供者: ${provider}, 模型: ${model}`);
  console.log("收到的完整对话历史:", JSON.stringify(messages, null, 2));

  if (!provider || !model || !messages || messages.length === 0) {
    console.error("聊天请求缺少必要参数或消息历史为空");
    throw new Error("Missing required parameters or empty message history for chat request");
  }

  // 1. Get API Key (securely from storage)
  const settingsData = await chrome.storage.sync.get("settings");
  const apiKey = settingsData.settings?.[provider]?.apiKey;

  // Handle cases where API key might not be needed (Ollama) or is missing
  if (!apiKey && provider !== "ollama" && provider !== "chrome-ai") {
    console.error(`缺少 ${provider} 的 API 密钥`);
    throw new Error(`Missing API key for ${provider}`);
  }

  // 2. Call the appropriate handler
  try {
    switch (provider) {
      case "openai":
        const openaiResponse = await handleOpenAIRequest({
          apiKey,
          model,
          messages,
        });
        // Directly return the text content on success
        return openaiResponse.choices[0]?.message?.content || "No response content";

      case "anthropic":
        // Pass messages array directly
        const anthropicResponse = await handleAnthropicRequest({
          apiKey,
          model,
          messages, // Pass the original messages array
        });
        // Directly return the text content on success
        return anthropicResponse.content[0]?.text || "No response content";

      case "deepseek":
        // Pass messages array directly
        const deepseekResponse = await handleDeepSeekRequest({
          apiKey,
          model,
          messages,
        });
        // Directly return the text content on success
        return deepseekResponse.choices[0]?.message?.content || "No response content";

      case "ollama":
         // Pass messages array directly
        const ollamaResponse = await handleOllamaRequest({
          model,
          messages, // Pass the original messages array
        });
        // Directly return the text content on success
        return ollamaResponse.message?.content || "No response content";

      case "openrouter":
         // Pass messages array directly
        const openrouterResponse = await handleOpenRouterRequest({
          apiKey,
          model,
          messages,
        });
        // Directly return the text content on success
        return openrouterResponse.choices[0]?.message?.content || "No response content";

      case "gemini":
        // Pass the full message history to the handler, it will adapt it
        const geminiResponse = await handleGeminiRequest({
          apiKey,
          model,
          messages, // Pass the original history
        });
        // Extract text content from OpenAI-compatible response format
        return geminiResponse.choices[0]?.message?.content || "No response content";


      case "chrome-ai":
         // Pass the full message history to the handler, it will adapt it
        const chromeAIResponse = await handleChromeAIRequest({
            messages, // Pass the original history
        });
        // Directly return the text content on success
        return chromeAIResponse.summary || "No response content";

      default:
        throw new Error(`Unsupported chat provider: ${provider}`);
    }
  } catch (error) {
    console.error(`处理 ${provider} 聊天请求时出错:`, error);
    // Re-throw the error so handleAsyncMessage catches it and sends { success: false, error: ... }
    throw error;
  }
}

// Handle Chrome AI API requests
async function handleChromeAIRequest(data) {
  // Now expects messages array instead of text
  const { messages } = data;

  console.log("处理Chrome AI API请求");

  if (!messages || messages.length === 0) {
    console.error("Chrome AI API请求缺少必要参数 (messages)");
    throw new Error("Missing required parameters for Chrome AI API request");
  }

  // --- Adapt history for Chrome AI summarize API ---
  // Combine the content of all messages into a single string, labeling roles.
  const combinedText = messages.map(m => {
      const roleLabel = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System';
      return `${roleLabel}:\n${m.content}`;
  }).join("\n\n---\n\n");

  console.log("组合后的文本发送给 Chrome AI:", combinedText.substring(0, 500) + "..."); // Log combined text (truncated)

  try {
    console.log("检查Chrome AI API是否可用...");

    // 检查Chrome AI API是否可用
    if (!chrome.summarization) {
      throw new Error(
        "Chrome AI API不可用。请确保您使用的是Chrome 131+版本，并且已下载模型。"
      );
    }

    console.log("发送Chrome AI API请求...");
    console.log("Chrome AI 请求文本 (组合后):", combinedText.substring(0, 500) + "..."); // Log combined text (truncated)

    // 使用Chrome的内置摘要API
    const summary = await chrome.summarization.summarize({
      text: combinedText, // Use the combined text
      type: "default", // Or consider other types if needed
    });

    console.log("收到Chrome AI API响应:", summary ? "成功" : "失败");
    console.log("Chrome AI 响应摘要:", summary);

    if (!summary) {
      throw new Error("Chrome AI未能生成摘要");
    }

    return { summary };
  } catch (error) {
    console.error("Chrome AI API请求失败:", error);
    throw error;
  }
}

// Handle fetching Gemini models
async function handleFetchGeminiModels(data) {
  const { apiKey } = data;

  console.log("处理获取Gemini模型列表请求");
  console.log("API密钥长度:", apiKey ? apiKey.length : 0);

  if (!apiKey) {
    console.error("获取Gemini模型列表请求缺少API密钥");
    throw new Error("Missing API key for fetching Gemini models");
  }

  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models";
  const url = `${endpoint}?key=${apiKey}`;

  console.log("Gemini模型列表API端点:", endpoint);
  console.log("完整请求URL (隐藏密钥):", `${endpoint}?key=***`);

  try {
    console.log("发送Gemini模型列表API请求...");
    console.log("请求配置:", {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log("收到Gemini模型列表API响应, 状态码:", response.status);
    console.log("响应头:", Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini模型列表API错误:", {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
      });
      throw new Error(
        `Gemini Models API Error: HTTP error code: ${response.status} \nBody: ${errorText}`
      );
    }

    const responseData = await response.json();
    console.log("Gemini模型列表API响应数据:", responseData);

    // Filter models that support generateContent
    const chatModels = responseData.models?.filter(model => 
      model.supportedGenerationMethods?.includes('generateContent')
    ) || [];

    console.log(`找到 ${chatModels.length} 个支持聊天的Gemini模型`);

    return {
      models: chatModels.map(model => ({
        name: model.name,
        displayName: model.displayName || model.name,
        description: model.description || '',
        inputTokenLimit: model.inputTokenLimit || 0,
        outputTokenLimit: model.outputTokenLimit || 0
      }))
    };
  } catch (error) {
    console.error("Gemini模型列表API请求失败:", error);
    console.error("错误类型:", error.name);
    console.error("错误消息:", error.message);
    console.error("错误详情:", error.stack);
    
    // 提供更具体的错误信息
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      console.error("网络错误可能原因:");
      console.error("1. 网络连接问题");
      console.error("2. API密钥无效");
      console.error("3. CORS问题");
      console.error("4. 防火墙或代理阻止请求");
    }
    
    throw error;
  }
}

// Utility function for API calls with timeout
async function fetchWithTimeout(url, options = {}) {
  const {
    method = "GET",
    headers = {},
    body = null,
    timeout = 60_000,
  } = options;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    console.log(`Making ${method} request to: ${url.split("?")[0]}`);

    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(id);

    if (!response.ok) {
      const responseText = await response.text();
      const errorText = `API Error: HTTP error code: ${response.status}, URL: ${
        url.split("?")[0]
      } \nBody: ${responseText}`;
      console.error(errorText);
      throw new Error(errorText);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(id);
    if (error.name === "AbortError") {
      throw new Error(
        `Request timeout after ${timeout}ms: ${url.split("?")[0]}`
      );
    }
    throw error;
  }
}

// chrome.runtime.onInstalled.addListener(onInstalled);
