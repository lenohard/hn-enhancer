async function onInstalled() {
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

// Uncomment this line to enable the onInstalled handler
// Handle Gemini API requests
async function handleGeminiRequest(data) {
  const { apiKey, model, systemPrompt, userPrompt } = data;

  console.log("处理Gemini API请求，模型:", model);

  if (!apiKey || !model) {
    console.error("Gemini API请求缺少必要参数");
    throw new Error("Missing required parameters for Gemini API request");
  }

  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    model +
    ":generateContent";
  const url = `${endpoint}?key=${apiKey}`;

  console.log("Gemini API端点:", endpoint);

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: systemPrompt }, { text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    },
  };

  console.log(
    "Gemini请求负载结构:",
    JSON.stringify(
      {
        endpoint: endpoint,
        method: "POST",
        payloadSize: JSON.stringify(payload).length,
        apiKeyLength: apiKey ? apiKey.length : 0,
        systemPromptLength: systemPrompt ? systemPrompt.length : 0,
        userPromptLength: userPrompt ? userPrompt.length : 0,
      },
      null,
      2
    )
  );

  try {
    console.log("发送Gemini API请求...");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    console.log("收到Gemini API响应, 状态码:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API错误:", {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
      });
      throw new Error(
        `Gemini API Error: HTTP error code: ${response.status}, URL: ${
          url.split("?")[0]
        } \nBody: ${errorText}`
      );
    }

    const responseData = await response.json();
    console.log(
      "Gemini API响应数据结构:",
      JSON.stringify(
        {
          hasData: !!responseData,
          hasCandidates: !!(responseData && responseData.candidates),
          candidatesCount:
            responseData && responseData.candidates
              ? responseData.candidates.length
              : 0,
        },
        null,
        2
      )
    );

    return responseData;
  } catch (error) {
    console.error("Gemini API请求失败:", error);
    console.error("错误详情:", error.stack);
    throw error;
  }
}

// 启用安装处理程序
chrome.runtime.onInstalled.addListener(onInstalled);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background script received message of type:", message.type);

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
        async () => {
          const response = await handleChatRequest(message.data);
          // Transform response to expected format
          if (response.success) {
            return {
              success: true,
              response: response.data,
            };
          } else {
            return {
              success: false,
              error: response.error,
            };
          }
        },
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
    max_tokens: 2048,
  };

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

  // 将消息转换为Anthropic格式
  const systemMessage = messages.find((m) => m.role === "system");
  const userMessages = messages.filter((m) => m.role === "user");

  const payload = {
    model: model,
    messages: userMessages,
    max_tokens: 2048,
  };

  // 如果有系统消息，添加到请求中
  if (systemMessage) {
    payload.system = systemMessage.content;
  }

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
    max_tokens: 2048,
  };

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
    stream: false,
  };

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
    max_tokens: 2048,
  };

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
  const { provider, model, messages } = data;
  console.log(`处理聊天请求，提供者: ${provider}, 模型: ${model}`);

  if (!provider || !model || !messages) {
    console.error("聊天请求缺少必要参数");
    throw new Error("Missing required parameters for chat request");
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
        return {
          success: true,
          data:
            openaiResponse.choices[0]?.message?.content ||
            "No response content",
        };

      case "anthropic":
        const anthropicResponse = await handleAnthropicRequest({
          apiKey,
          model,
          messages,
        });
        return {
          success: true,
          data: anthropicResponse.content[0]?.text || "No response content",
        };

      case "deepseek":
        const deepseekResponse = await handleDeepSeekRequest({
          apiKey,
          model,
          messages,
        });
        return {
          success: true,
          data:
            deepseekResponse.choices[0]?.message?.content ||
            "No response content",
        };

      case "ollama":
        const ollamaResponse = await handleOllamaRequest({
          model,
          messages,
        });
        return {
          success: true,
          data: ollamaResponse.message?.content || "No response content",
        };

      case "openrouter":
        const openrouterResponse = await handleOpenRouterRequest({
          apiKey,
          model,
          messages,
        });
        return {
          success: true,
          data:
            openrouterResponse.choices[0]?.message?.content ||
            "No response content",
        };

      case "gemini":
        const geminiResponse = await handleGeminiRequest({
          apiKey,
          model,
          systemPrompt:
            messages.find((m) => m.role === "system")?.content || "",
          userPrompt: messages.find((m) => m.role === "user")?.content || "",
        });
        return {
          success: true,
          data:
            geminiResponse.candidates[0]?.content?.parts[0]?.text ||
            "No response content",
        };

      // NOTE: Chrome AI is explicitly disallowed for chat functionality.
      // case "chrome-ai":
      //   ... (code removed)

      default:
        throw new Error(`Unsupported chat provider for chat: ${provider}`);
    }
  } catch (error) {
    console.error(`处理 ${provider} 聊天请求时出错:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Handle Chrome AI API requests
async function handleChromeAIRequest(data) {
  const { text } = data;

  console.log("处理Chrome AI API请求");

  if (!text) {
    console.error("Chrome AI API请求缺少必要参数");
    throw new Error("Missing required parameters for Chrome AI API request");
  }

  try {
    console.log("检查Chrome AI API是否可用...");

    // 检查Chrome AI API是否可用
    if (!chrome.summarization) {
      throw new Error(
        "Chrome AI API不可用。请确保您使用的是Chrome 131+版本，并且已下载模型。"
      );
    }

    console.log("发送Chrome AI API请求...");

    // 使用Chrome的内置摘要API
    const summary = await chrome.summarization.summarize({
      text: text,
      type: "default",
    });

    console.log("收到Chrome AI API响应:", summary ? "成功" : "失败");

    if (!summary) {
      throw new Error("Chrome AI未能生成摘要");
    }

    return { summary };
  } catch (error) {
    console.error("Chrome AI API请求失败:", error);
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
