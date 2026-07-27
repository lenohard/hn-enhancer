async function onInstalled() {
  console.log("[BACKGROUND] 扩展已安装/启动");
  await registerSubstackCustomDomainScripts();
  const data = await chrome.storage.sync.get("settings");
  const settings = data.settings;

  // Set default provider to openai-router if not configured
  if (!settings?.providerSelection) {
    try {
      const updatedSettings = {
        ...settings,
        providerSelection: "openai-router",
      };
      await chrome.storage.sync.set({ settings: updatedSettings });
      chrome.runtime.openOptionsPage();
    } catch (e) {
      console.log("Error opening options page:", e);
    }
  }
}

// Keep in sync with manifest content_scripts js/css arrays
const HN_CONTENT_SCRIPT_JS = [
  "src/hn-state.js",
  "src/api-client.js",
  "src/screenshot-capture.js",
  "src/markdown-utils.js",
  "src/dom-utils.js",
  "src/summary-panel.js",
  "src/navigation.js",
  "src/summarization.js",
  "src/author-tracking.js",
  "src/ui-components.js",
  "src/chat-modal.js",
  "src/hub-panel.js",
  "src/extract-panel.js",
  "src/prompts.js",
  "src/substack-domains.js",
  "src/adapters/site-adapter.js",
  "src/adapters/hn-adapter.js",
  "src/adapters/substack-adapter.js",
  "src/adapters/adapter-registry.js",
  "src/hn-enhancer.js",
  "content.js",
];

const HN_CONTENT_SCRIPT_CSS = ["styles.css"];

function normalizeHostname(hostname) {
  return (hostname || "").replace(/^www\./i, "").toLowerCase();
}

async function getSubstackCustomDomains() {
  const data = await chrome.storage.sync.get("substackCustomDomains");
  const domains = data.substackCustomDomains;
  if (!Array.isArray(domains)) {
    return [];
  }
  return [...new Set(domains.map(normalizeHostname).filter(Boolean))];
}

async function saveSubstackCustomDomains(domains) {
  const normalized = [...new Set(domains.map(normalizeHostname).filter(Boolean))];
  await chrome.storage.sync.set({ substackCustomDomains: normalized });
  return normalized;
}

function contentScriptIdForDomain(hostname) {
  return `hn-substack-${normalizeHostname(hostname).replace(/\./g, "-")}`;
}

/** Match both apex and www — users often visit www.* while we store the bare hostname. */
function contentScriptMatchesForHostname(hostname) {
  const host = normalizeHostname(hostname);
  const hosts = new Set([host]);
  if (host.startsWith("www.")) {
    hosts.add(host.slice(4));
  } else {
    hosts.add(`www.${host}`);
  }

  const patterns = [];
  for (const h of hosts) {
    patterns.push(`https://${h}/*`, `http://${h}/*`);
  }
  return patterns;
}

/** Serialize concurrent registration calls (onInstalled + on load + enable). */
let substackRegistrationPromise = null;

async function unregisterHnSubstackContentScripts() {
  const existing = await chrome.scripting.getRegisteredContentScripts();
  const staleIds = existing
    .filter((entry) => entry.id?.startsWith("hn-substack-"))
    .map((entry) => entry.id);

  if (!staleIds.length) {
    return;
  }

  try {
    await chrome.scripting.unregisterContentScripts({ ids: staleIds });
  } catch (error) {
    console.warn("[BACKGROUND] unregisterContentScripts:", error);
  }
}

async function registerSubstackCustomDomainScriptsImpl() {
  if (!chrome.scripting?.registerContentScripts) {
    return;
  }

  const domains = await getSubstackCustomDomains();
  await unregisterHnSubstackContentScripts();

  if (!domains.length) {
    return;
  }

  const scripts = domains.map((hostname) => ({
    id: contentScriptIdForDomain(hostname),
    matches: contentScriptMatchesForHostname(hostname),
    js: HN_CONTENT_SCRIPT_JS,
    css: HN_CONTENT_SCRIPT_CSS,
    runAt: "document_end",
  }));

  try {
    await chrome.scripting.registerContentScripts(scripts);
    console.log("[BACKGROUND] Registered Substack custom domain scripts:", domains);
  } catch (error) {
    console.warn("[BACKGROUND] Bulk register failed, retrying one-by-one:", error);
    for (const script of scripts) {
      try {
        await chrome.scripting.unregisterContentScripts({ ids: [script.id] }).catch(() => {});
        await chrome.scripting.registerContentScripts([script]);
      } catch (innerError) {
        console.error("[BACKGROUND] Failed to register script", script.id, innerError);
        throw innerError;
      }
    }
  }
}

function registerSubstackCustomDomainScripts() {
  if (!chrome.scripting?.registerContentScripts) {
    return Promise.resolve();
  }

  if (!substackRegistrationPromise) {
    substackRegistrationPromise = registerSubstackCustomDomainScriptsImpl()
      .finally(() => {
        substackRegistrationPromise = null;
      });
  }

  return substackRegistrationPromise;
}

async function injectEnhancerIntoTab(tabId) {
  if (!tabId || !chrome.scripting?.executeScript) {
    return;
  }

  try {
    const domains = await getSubstackCustomDomains();
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (customDomains) => {
        window.__HN_SUBSTACK_CUSTOM_DOMAINS = customDomains;
      },
      args: [domains],
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: HN_CONTENT_SCRIPT_CSS,
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: HN_CONTENT_SCRIPT_JS,
    });
    console.log("[BACKGROUND] Injected enhancer into tab", tabId);
  } catch (error) {
    console.error("[BACKGROUND] Failed to inject enhancer into tab:", error);
    throw error;
  }
}

async function enableSubstackCustomDomain(hostname) {
  const host = normalizeHostname(hostname);
  if (!host || /\.substack\.com$/i.test(host)) {
    return { success: true, domains: await getSubstackCustomDomains(), alreadyNative: true };
  }

  const domains = await getSubstackCustomDomains();
  if (!domains.includes(host)) {
    domains.push(host);
  }
  const saved = await saveSubstackCustomDomains(domains);
  await registerSubstackCustomDomainScripts();
  return { success: true, domains: saved };
}

async function removeSubstackCustomDomain(hostname) {
  const host = normalizeHostname(hostname);
  const domains = (await getSubstackCustomDomains()).filter((entry) => entry !== host);
  const saved = await saveSubstackCustomDomains(domains);
  await registerSubstackCustomDomainScripts();
  return { success: true, domains: saved };
}



// 启用安装处理程序
chrome.runtime.onInstalled.addListener(onInstalled);
chrome.runtime.onStartup.addListener(() => {
  registerSubstackCustomDomainScripts().catch((error) => {
    console.error("[BACKGROUND] Failed to register Substack custom domains:", error);
  });
});

registerSubstackCustomDomainScripts().catch((error) => {
  console.error("[BACKGROUND] Failed to register Substack custom domains on load:", error);
});

// 添加启动日志
console.log("[BACKGROUND] Background script 已加载");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[BACKGROUND] 收到消息, 类型:", message.type);
  console.log(
    "[BACKGROUND] 消息数据:",
    message.type === "CAPTURE_VISIBLE_TAB"
      ? "[visible-tab capture requested]"
      : ["HN_CHAT_REQUEST", "OPENAI_ROUTER_API_REQUEST"].includes(message.type)
        ? {
            ...message.data,
            messages: `[${message.data?.messages?.length || 0} messages; visual data omitted]`,
          }
        : message.data
  );
  console.log("[BACKGROUND] 发送者:", sender);

  // Handle the message
  switch (message.type) {
    case "HN_SHOW_OPTIONS":
      chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
      break;

    case "CAPTURE_VISIBLE_TAB":
      return handleAsyncMessage(
        message,
        async () => {
          if (!sender.tab) {
            throw new Error("Visible-tab capture requires a webpage tab");
          }
          const dataUrl = await new Promise((resolve, reject) => {
            chrome.tabs.captureVisibleTab(
              sender.tab.windowId,
              { format: "jpeg", quality: 75 },
              (capturedUrl) => {
                const error = chrome.runtime.lastError;
                if (error) {
                  reject(new Error(error.message));
                } else if (!capturedUrl) {
                  reject(new Error("The browser returned an empty screenshot"));
                } else {
                  resolve(capturedUrl);
                }
              }
            );
          });
          return { dataUrl };
        },
        sendResponse
      );

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
          const routerUrl = settingsData.settings?.["openai-router"]?.url || "http://127.0.0.1:4000";
          const supportsImages =
            settingsData.settings?.[aiProvider]?.supportsImages === true;
          const screenshotEnabled =
            settingsData.settings?.screenshotEnabled === true;
          return {
            aiProvider,
            model,
            language,
            maxTokens,
            temperature,
            routerUrl,
            supportsImages,
            screenshotEnabled,
          };
        },
        sendResponse
      );

    case "OPENAI_ROUTER_API_REQUEST":
      if (message.data.streaming) {
        return handleStreamingMessage(
          message,
          sender,
          async () => await handleOpenAIRouterRequest(message.data),
          sendResponse
        );
      } else {
        return handleAsyncMessage(
          message,
          async () => await handleOpenAIRouterRequest(message.data),
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

    case "FETCH_OPENAI_ROUTER_MODELS":
      return handleAsyncMessage(
        message,
        async () => await handleFetchOpenAIRouterModels(message.data),
        sendResponse
      );

    case "GET_SUBSTACK_DOMAIN_STATUS":
      return handleAsyncMessage(
        message,
        async () => {
          const hostname = normalizeHostname(message.data?.hostname);
          const domains = await getSubstackCustomDomains();
          return {
            hostname,
            domains,
            enabled: domains.includes(hostname),
          };
        },
        sendResponse
      );

    case "ENABLE_SUBSTACK_DOMAIN":
      return handleAsyncMessage(
        message,
        async () => await enableSubstackCustomDomain(message.data?.hostname),
        sendResponse
      );

    case "INJECT_ENHANCER_TAB":
      return handleAsyncMessage(
        message,
        async () => {
          await injectEnhancerIntoTab(message.data?.tabId);
          return { injected: true };
        },
        sendResponse
      );

    case "REMOVE_SUBSTACK_DOMAIN":
      return handleAsyncMessage(
        message,
        async () => await removeSubstackCustomDomain(message.data?.hostname),
        sendResponse
      );

    case "LIST_SUBSTACK_DOMAINS":
      return handleAsyncMessage(
        message,
        async () => ({ domains: await getSubstackCustomDomains() }),
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
        let hasResponded = false;

        const processStream = async () => {
          try {
            while (true) {
              try {
                const { done, value } = await reader.read();
                if (done) {
                  console.log("流处理完成");
                  if (!hasResponded) {
                    hasResponded = true;
                    sendResponse({ success: true, streaming: true, done: true });
                  }
                  break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  if (line.startsWith("data:")) {
                    const data = line.substring(5).trim();
                    if (data === "[DONE]") {
                      console.log("收到 [DONE] 信号");
                      if (!hasResponded) {
                        hasResponded = true;
                        sendResponse({
                          success: true,
                          streaming: true,
                          done: true,
                        });
                      }
                      return;
                    }
                    try {
                      const parsed = JSON.parse(data);
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
                  }
                }
              } catch (error) {
                console.error("读取流时出错:", error);
                if (!hasResponded) {
                  hasResponded = true;
                  sendResponse({ success: false, error: error.toString() });
                }
                break;
              }
            }
          } catch (error) {
            console.error("流处理出错:", error);
            if (!hasResponded) {
              hasResponded = true;
              sendResponse({ success: false, error: error.toString() });
            }
          }
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

// Handle Chat Request (routes to OpenAI Router)
async function handleChatRequest(data) {
  const { messages, streaming = false, url } = data;
  console.log("处理聊天请求，提供者: openai-router");

  if (!messages || messages.length === 0) {
    console.error("聊天请求缺少必要参数或消息历史为空");
    throw new Error(
      "Missing required parameters or empty message history for chat request"
    );
  }

  const settingsData = await chrome.storage.sync.get("settings");
  const model = settingsData.settings?.["openai-router"]?.model;
  const apiKey = settingsData.settings?.["openai-router"]?.apiKey;
  const routerUrl = url || settingsData.settings?.["openai-router"]?.url || "http://127.0.0.1:4000";

  const shouldStream = streaming;

  try {
    const routerResponse = await handleOpenAIRouterRequest({
      apiKey,
      model,
      messages,
      streaming: shouldStream,
      url: routerUrl,
    });
    if (shouldStream) {
      return routerResponse;
    }
    return (
      routerResponse.choices[0]?.message?.content || "No response content"
    );
  } catch (error) {
    console.error("处理聊天请求时出错:", error);
    throw error;
  }
}

// Handle OpenAI Router API requests
async function handleOpenAIRouterRequest(data) {
  const {
    apiKey,
    model,
    messages,
    streaming = false,
    url = "http://127.0.0.1:4000",
  } = data;

  console.log("Processing OpenAI Router API request，模型:", model, "流式:", streaming);

  if (!model || !messages) {
    console.error("OpenAI Router API request missing required parameters");
    throw new Error("Missing required parameters for OpenAI Router API request");
  }

  // Normalize URL by removing trailing slash and appending /v1/chat/completions
  const baseUrl = url.replace(/\/$/, '');
  const endpoint = `${baseUrl}/v1/chat/completions`;

  console.log("OpenAI Router API endpoint:", endpoint);

  const payload = {
    model: model,
    messages: messages,
    stream: streaming,
  };

  if (data.include_usage) {
    payload.include_usage = true;
  }


  // API key should only be in Authorization header, not in request body for OpenAI Router proxy

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      },
      body: JSON.stringify(payload),
    });

    console.log("Received OpenAI Router API response, 状态码:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI Router API error:", {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
      });

      throw new Error(
        `OpenAI Router API Error: HTTP error code: ${response.status} \nBody: ${errorText}`
      );
    }

    if (streaming) {
      // Return the response stream for streaming
      return response;
    } else {
      const responseData = await response.json();
      console.log(
        "OpenAI Router API response structure:",
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
    console.error("OpenAI Router API request failed:", error);
    console.error("错误详情:", error.stack);
    throw error;
  }
}

// Handle fetching OpenAI Router models
async function handleFetchOpenAIRouterModels(data) {
  const { apiKey, url = "http://127.0.0.1:4000" } = data;

  console.log("Processing fetch OpenAI Router models request");

  // Normalize URL by removing trailing slash and appending /v1/models
  const baseUrl = url.replace(/\/$/, '');
  const endpoint = `${baseUrl}/v1/models`;

  console.log("OpenAI Router models API endpoint:", endpoint);

  try {
    console.log("Sending OpenAI Router models API request...");
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

    console.log("Received OpenAI Router models API response, 状态码:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI Router models API error:", {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
      });
      throw new Error(
        `OpenAI Router Models API Error: HTTP error code: ${response.status} \nBody: ${errorText}`
      );
    }

    const responseData = await response.json();
    console.log("OpenAI Router models API response data:", responseData);

    // Transform the response to match expected format
    // OpenAI Router returns OpenAI-compatible format: { data: [{ id: "model-name", object: "model", ... }] }
    const models = responseData.data || [];

    return {
      models: models.map((model) => ({
        name: model.id || model.name,
        displayName: model.id || model.name,
        description: `OpenAI Router model: ${model.id || model.name}`,
        inputTokenLimit: 0,
        outputTokenLimit: 0,
      })),
    };
  } catch (error) {
    console.error("OpenAI Router models API request failed:", error);
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

// Open options page when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
