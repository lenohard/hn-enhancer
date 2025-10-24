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
  const {
    apiKey,
    model,
    messages,
    systemPrompt,
    userPrompt,
    max_tokens = 8192,
    temperature = 0.7,
  } = data;

  console.log("处理Gemini API请求，模型:", model);
  console.log("API密钥长度:", apiKey ? apiKey.length : 0);
  console.log("消息数量:", messages ? messages.length : 0);

  // Validate required parameters - support both formats
  if (!apiKey || !model || (!messages && (!systemPrompt || !userPrompt))) {
    console.error(
      "Gemini API请求缺少必要参数 (apiKey, model, or messages/prompts)"
    );
    throw new Error("Missing required parameters for Gemini API request");
  }

  // Convert systemPrompt/userPrompt format to messages format if needed
  let processedMessages = messages;
  if (!messages && systemPrompt && userPrompt) {
    processedMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];
  }

  // Use OpenAI-compatible endpoint
  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

  console.log("Gemini API端点:", endpoint);

  // Use OpenAI-compatible format - much simpler!
  const payload = {
    model: model.replace("models/", ""), // Remove 'models/' prefix if present
    messages: processedMessages,
    temperature: temperature,
    max_tokens: max_tokens,
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
        Authorization: "Bearer ***",
      },
      bodySize: JSON.stringify(payload).length,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
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

    case "FETCH_AI_SETTINGS":
      return handleAsyncMessage(
        message,
        async () => {
          const settingsData = await chrome.storage.sync.get("settings");
          const aiProvider = settingsData.settings?.providerSelection;
          const model = settingsData.settings?.[aiProvider]?.model;
          const language = settingsData.settings?.language || "en";
          const maxTokens = settingsData.settings?.maxTokens || 100000;
          const temperature = settingsData.settings?.temperature || 0.7;
          return { aiProvider, model, language, maxTokens, temperature };
        },
        sendResponse
      );

    case "GEMINI_API_REQUEST":
      return handleAsyncMessage(
        message,
        async () => await handleGeminiRequest(message.data),
        sendResponse
      );

    case "OPENAI_API_REQUEST":
      if (message.data.streaming) {
        return handleStreamingMessage(
          message,
          sender,
          async () => await handleOpenAIRequest(message.data),
          sendResponse
        );
      } else {
        return handleAsyncMessage(
          message,
          async () => await handleOpenAIRequest(message.data),
          sendResponse
        );
      }

    case "ANTHROPIC_API_REQUEST":
      if (message.data.streaming) {
        return handleStreamingMessage(
          message,
          sender,
          async () => await handleAnthropicRequest(message.data),
          sendResponse
        );
      } else {
        return handleAsyncMessage(
          message,
          async () => await handleAnthropicRequest(message.data),
          sendResponse
        );
      }

    case "DEEPSEEK_API_REQUEST":
      return handleAsyncMessage(
        message,
        async () => await handleDeepSeekRequest(message.data),
        sendResponse
      );

    case "LITELLM_API_REQUEST":
      if (message.data.streaming) {
        return handleStreamingMessage(
          message,
          sender,
          async () => await handleLiteLLMRequest(message.data),
          sendResponse
        );
      } else {
        return handleAsyncMessage(
          message,
          async () => await handleLiteLLMRequest(message.data),
          sendResponse
        );
      }
    case "HN_CHAT_REQUEST":
      if (message.data?.streaming) {
        return handleStreamingMessage(
          message,
          sender,
          async () => await handleChatRequest(message.data),
          sendResponse
        );
      }
      return handleAsyncMessage(
        message,
        async () => await handleChatRequest(message.data),
        sendResponse
      );

    case "FETCH_GEMINI_MODELS":
      return handleAsyncMessage(
        message,
        async () => await handleFetchGeminiModels(message.data),
        sendResponse
      );

    case "FETCH_LITELLM_MODELS":
      return handleAsyncMessage(
        message,
        async () => await handleFetchLiteLLMModels(message.data),
        sendResponse
      );

    default:
      console.log("Unknown message type:", message.type);
  }
});

// Handle streaming message and send response
function handleStreamingMessage(
  message,
  sender,
  streamingOperation,
  sendResponse
) {
  (async () => {
    try {
      console.log(`开始处理流式消息: ${message.type}`);
      const response = await streamingOperation();

      if (response instanceof Response) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let lastChunkTime = Date.now();

        const streamTimeout = setTimeout(() => {
          console.error("流式传输超时");
          sendResponse({ success: false, error: "Streaming timed out." });
          reader.releaseLock();
        }, 30000); // 30秒超时

        const processStream = async () => {
          while (true) {
            try {
              const { done, value } = await reader.read();
              if (done) {
                console.log("流处理完成");
                sendResponse({ success: true, streaming: true, done: true });
                break;
              }

              lastChunkTime = Date.now();
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (line.startsWith("data:")) {
                  const data = line.substring(5).trim();
                  if (data === "[DONE]") {
                    console.log("收到 [DONE] 信号");
                    sendResponse({
                      success: true,
                      streaming: true,
                      done: true,
                    });
                    return;
                  }
                  try {
                    const parsed = JSON.parse(data);
                    // Log the parsed chunk to see its structure
                    console.log(
                      "Parsed stream chunk:",
                      JSON.stringify(parsed, null, 2)
                    );
                    if (sender.tab?.id) {
                      chrome.tabs.sendMessage(sender.tab.id, {
                        type: `${message.type}_STREAM_CHUNK`,
                        data: parsed,
                      });
                    }
                  } catch (e) {
                    console.error(
                      "Error parsing streaming data chunk:",
                      data,
                      e
                    );
                  }
                } else if (line) {
                  // For Anthropic which doesn't use 'data:' prefix
                  try {
                    const parsed = JSON.parse(line);
                    if (parsed.type === "content_block_delta") {
                      if (sender.tab?.id) {
                        chrome.tabs.sendMessage(sender.tab.id, {
                          type: `${message.type}_STREAM_CHUNK`,
                          data: parsed,
                        });
                      }
                    }
                  } catch (e) {
                    // ignore parsing errors
                  }
                }
              }
            } catch (error) {
              console.error("读取流时出错:", error);
              sendResponse({ success: false, error: error.toString() });
              break;
            }
          }
          clearTimeout(streamTimeout);
        };

        processStream();
      } else {
        console.log(`流式消息处理成功 (非流式响应): ${message.type}`);
        sendResponse({ success: true, streaming: false, data: response });
      }
    } catch (error) {
      console.error(`流式消息处理失败: ${message.type}. 错误:`, error);
      console.error(`错误详情:`, error.stack);
      sendResponse({ success: false, error: error.toString() });
    }
  })();

  return true; // Indicate that sendResponse will be called asynchronously
}

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
  const {
    apiKey,
    model,
    messages,
    streaming = false,
    max_tokens = 2048,
    temperature = 0.7,
  } = data;

  console.log("处理OpenAI API请求，模型:", model, "流式:", streaming);

  if (!apiKey || !model || !messages) {
    console.error("OpenAI API请求缺少必要参数");
    throw new Error("Missing required parameters for OpenAI API request");
  }

  const endpoint = "https://api.openai.com/v1/chat/completions";

  console.log("OpenAI API端点:", endpoint);

  const payload = {
    model: model,
    messages: messages,
    temperature: temperature,
    max_tokens: max_tokens,
    stream: streaming,
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

    if (streaming) {
      // Return the response stream for streaming
      return response;
    } else {
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
    }
  } catch (error) {
    console.error("OpenAI API请求失败:", error);
    console.error("错误详情:", error.stack);
    throw error;
  }
}

// Handle Anthropic API requests
async function handleAnthropicRequest(data) {
  const {
    apiKey,
    model,
    messages,
    streaming = false,
    max_tokens = 2048,
    temperature = 0.7,
    system,
  } = data;

  console.log("处理Anthropic API请求，模型:", model, "流式:", streaming);

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
    max_tokens: max_tokens,
    temperature: temperature,
    stream: streaming,
    ...(system && { system: system }), // Add system prompt if provided
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

    if (streaming) {
      // Return the response stream for streaming
      return response;
    } else {
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
    }
  } catch (error) {
    console.error("Anthropic API请求失败:", error);
    console.error("错误详情:", error.stack);
    throw error;
  }
}

// Handle DeepSeek API requests
async function handleDeepSeekRequest(data) {
  const {
    apiKey,
    model,
    messages,
    max_tokens = 2048,
    temperature = 0.7,
  } = data;

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
    temperature: temperature,
    max_tokens: max_tokens,
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

// Handle Chat Request (routes to specific provider handlers)
async function handleChatRequest(data) {
  // The 'messages' received here is the full conversation history
  const { provider, model, messages, streaming = false } = data;
  console.log(`处理聊天请求，提供者: ${provider}, 模型: ${model}`);
  console.log("收到的完整对话历史:", JSON.stringify(messages, null, 2));

  if (!provider || !model || !messages || messages.length === 0) {
    console.error("聊天请求缺少必要参数或消息历史为空");
    throw new Error(
      "Missing required parameters or empty message history for chat request"
    );
  }

  // 1. Get API Key (securely from storage)
  const settingsData = await chrome.storage.sync.get("settings");
  const apiKey = settingsData.settings?.[provider]?.apiKey;

  // Handle cases where API key might not be needed (LiteLLM local models) or is missing
  if (!apiKey && provider !== "litellm") {
    console.error(`缺少 ${provider} 的 API 密钥`);
    throw new Error(`Missing API key for ${provider}`);
  }

  const streamingCapableProviders = ["openai", "anthropic", "litellm"];
  const shouldStream =
    streaming && streamingCapableProviders.includes(provider);

  if (streaming && !shouldStream) {
    console.log(
      `Provider ${provider} does not support streaming. Falling back to non-streaming response.`
    );
  }

  // 2. Call the appropriate handler
  try {
    switch (provider) {
      case "openai":
        const openaiResponse = await handleOpenAIRequest({
          apiKey,
          model,
          messages,
          streaming: shouldStream,
        });
        if (shouldStream) {
          return openaiResponse;
        }
        // Directly return the text content on success
        return (
          openaiResponse.choices[0]?.message?.content || "No response content"
        );

      case "anthropic":
        // Pass messages array directly
        const anthropicResponse = await handleAnthropicRequest({
          apiKey,
          model,
          messages, // Pass the original messages array
          streaming: shouldStream,
        });
        if (shouldStream) {
          return anthropicResponse;
        }
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
        return (
          deepseekResponse.choices[0]?.message?.content || "No response content"
        );

      case "gemini":
        // Pass the full message history to the handler, it will adapt it
        const geminiResponse = await handleGeminiRequest({
          apiKey,
          model,
          messages, // Pass the original history
        });
        // Extract text content from OpenAI-compatible response format
        return (
          geminiResponse.choices[0]?.message?.content || "No response content"
        );

      case "litellm":
        // Pass messages array directly (same format as OpenAI)
        const litellmResponse = await handleLiteLLMRequest({
          apiKey,
          model,
          messages,
          streaming: shouldStream,
        });
        if (shouldStream) {
          return litellmResponse;
        }
        // Directly return the text content on success
        return (
          litellmResponse.choices[0]?.message?.content || "No response content"
        );

      default:
        throw new Error(`Unsupported chat provider: ${provider}`);
    }
  } catch (error) {
    console.error(`处理 ${provider} 聊天请求时出错:`, error);
    // Re-throw the error so handleAsyncMessage catches it and sends { success: false, error: ... }
    throw error;
  }
}

// Handle LiteLLM API requests
async function handleLiteLLMRequest(data) {
  const {
    apiKey,
    model,
    messages,
    streaming = false,
    max_tokens = 2048,
    temperature = 0.7,
  } = data;

  console.log("处理LiteLLM API请求，模型:", model, "流式:", streaming);

  if (!model || !messages) {
    console.error("LiteLLM API请求缺少必要参数");
    throw new Error("Missing required parameters for LiteLLM API request");
  }

  const endpoint = "http://127.0.0.1:4000/chat/completions";

  console.log("LiteLLM API端点:", endpoint);

  const payload = {
    model: model,
    messages: messages,
    temperature: temperature,
    max_tokens: max_tokens,
    stream: streaming,
  };

  // API key should only be in Authorization header, not in request body for LiteLLM proxy

  // Log the payload being sent
  console.log("LiteLLM 请求负载:", JSON.stringify(payload, null, 2));

  try {
    console.log("发送LiteLLM API请求...");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      },
      body: JSON.stringify(payload),
    });

    console.log("收到LiteLLM API响应, 状态码:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("LiteLLM API错误:", {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
      });
      throw new Error(
        `LiteLLM API Error: HTTP error code: ${response.status} \nBody: ${errorText}`
      );
    }

    if (streaming) {
      // Return the response stream for streaming
      return response;
    } else {
      const responseData = await response.json();
      console.log(
        "LiteLLM API响应数据结构:",
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
    }
  } catch (error) {
    console.error("LiteLLM API请求失败:", error);
    console.error("错误详情:", error.stack);
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
      headers: { "Content-Type": "application/json" },
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
    const chatModels =
      responseData.models?.filter((model) =>
        model.supportedGenerationMethods?.includes("generateContent")
      ) || [];

    console.log(`找到 ${chatModels.length} 个支持聊天的Gemini模型`);

    return {
      models: chatModels.map((model) => ({
        name: model.name,
        displayName: model.displayName || model.name,
        description: model.description || "",
        inputTokenLimit: model.inputTokenLimit || 0,
        outputTokenLimit: model.outputTokenLimit || 0,
      })),
    };
  } catch (error) {
    console.error("Gemini模型列表API请求失败:", error);
    throw error;
  }
}

// Handle fetching LiteLLM models
async function handleFetchLiteLLMModels(data) {
  const { apiKey } = data;

  console.log("处理获取LiteLLM模型列表请求");

  const endpoint = "http://127.0.0.1:4000/models";

  console.log("LiteLLM模型列表API端点:", endpoint);

  try {
    console.log("发送LiteLLM模型列表API请求...");
    console.log("请求配置:", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      },
    });

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      },
    });

    console.log("收到LiteLLM模型列表API响应, 状态码:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("LiteLLM模型列表API错误:", {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
      });
      throw new Error(
        `LiteLLM Models API Error: HTTP error code: ${response.status} \nBody: ${errorText}`
      );
    }

    const responseData = await response.json();
    console.log("LiteLLM模型列表响应数据:", responseData);

    // Transform the response to match expected format
    // LiteLLM returns OpenAI-compatible format: { data: [{ id: "model-name", object: "model", ... }] }
    const models = responseData.data || [];

    return {
      models: models.map((model) => ({
        name: model.id || model.name,
        displayName: model.id || model.name,
        description: `LiteLLM model: ${model.id || model.name}`,
        inputTokenLimit: 0,
        outputTokenLimit: 0,
      })),
    };
  } catch (error) {
    console.error("LiteLLM模型列表API请求失败:", error);
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
