// Save settings to Chrome storage
async function saveSettings() {
  const selectedProvider = document.querySelector(
    'input[name="provider-selection"]:checked'
  );

  // 如果没有选中任何提供商，默认选择第一个
  if (!selectedProvider) {
    const firstProvider = document.querySelector(
      'input[name="provider-selection"]'
    );
    if (firstProvider) {
      firstProvider.checked = true;
    }
  }

  const providerSelection =
    document.querySelector('input[name="provider-selection"]:checked')?.id ||
    "openai";
  const language = document.getElementById("language-select").value;
  const streamingEnabled = document.getElementById("streaming-enabled").checked;
  const maxTokens =
    parseInt(document.getElementById("max-tokens").value) || 100000;
  const temperature =
    parseFloat(document.getElementById("temperature").value) || 0.7;
  const settings = {
    providerSelection,
    language,
    streamingEnabled,
    maxTokens,
    temperature,
    openai: {
      apiKey: document.getElementById("openai-key").value,
      model: document.getElementById("openai-model").value,
    },
    anthropic: {
      apiKey: document.getElementById("anthropic-key").value,
      model: document.getElementById("anthropic-model").value,
    },
    gemini: {
      apiKey: document.getElementById("gemini-key").value,
      model: document.getElementById("gemini-model").value,
    },
    deepseek: {
      apiKey: document.getElementById("deepseek-key").value,
      model: document.getElementById("deepseek-model").value,
    },
    "openai-router": {
      apiKey: document.getElementById("router-key").value,
      model: document.getElementById("router-model").value,
      url: document.getElementById("router-url").value,
    },
  };

  try {
    await chrome.storage.sync.set({ settings });
    // Optional: Show save confirmation
    const saveButton = document.querySelector('button[type="submit"]');
    const originalText = saveButton.textContent;
    saveButton.textContent = "Saved!";
    setTimeout(() => {
      saveButton.textContent = originalText;
    }, 2000);
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}

async function sendBackgroundMessage(type, data) {
  let response;
  try {
    response = await chrome.runtime.sendMessage({ type, data });
  } catch (error) {
    console.error(`Error sending browser runtime message ${type}:`, error);
    throw error;
  }

  if (!response) {
    console.error(`No response from background message ${type}`);
    throw new Error(`No response from background message ${type}`);
  }
  if (!response.success) {
    console.error(
      `Error response from background message ${type}:`,
      response.error
    );
    throw new Error(response.error);
  }

  return response.data;
}

// Fetch Gemini models from API
async function fetchGeminiModels() {
  try {
    // Get the API key from the input field
    const apiKey = document.getElementById("gemini-key").value;

    if (!apiKey) {
      throw new Error("请先输入Gemini API密钥");
    }

    const data = await sendBackgroundMessage("FETCH_GEMINI_MODELS", {
      apiKey: apiKey,
    });

    const selectElement = document.getElementById("gemini-model");
    // Clear existing options
    selectElement.innerHTML = "";

    // Add models to select element
    data.models.forEach((model) => {
      const option = document.createElement("option");
      // Use the model name (like "models/gemini-2.0-flash-lite") as value
      option.value = model.name;
      // Use display name for the text, fallback to name if no display name
      option.textContent = model.displayName || model.name;
      // Add description as title for tooltip
      if (model.description) {
        option.title = model.description;
      }
      selectElement.appendChild(option);
    });

    // If no models found, add a placeholder option
    if (data.models.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "未找到可用模型";
      selectElement.appendChild(option);
    }

    // Store the fetched models in chrome storage for future use
    await chrome.storage.local.set({
      geminiModels: {
        models: data.models,
        timestamp: Date.now(),
      },
    });

    console.log(`成功获取 ${data.models.length} 个Gemini模型`);
  } catch (error) {
    console.log("获取Gemini模型列表时出错:", error);
    // Handle error by adding an error option
    const selectElement = document.getElementById("gemini-model");
    selectElement.innerHTML = "";
    const option = document.createElement("option");
    option.value = "";
    option.textContent = `错误: ${error.message}`;
    selectElement.appendChild(option);

    // Show error to user
    alert(`获取Gemini模型列表失败: ${error.message}`);
  }
}

// Function to filter OpenAI Router models based on search term
function filterOpenAIRouterModels(searchTerm, allModels) {
  if (!searchTerm) {
    return allModels;
  }

  const lowerSearchTerm = searchTerm.toLowerCase();
  return allModels.filter((model) => {
    const name = (model.displayName || model.name).toLowerCase();
    const description = (model.description || "").toLowerCase();
    return (
      name.includes(lowerSearchTerm) || description.includes(lowerSearchTerm)
    );
  });
}

// Function to update OpenAI Router model dropdown options
function updateOpenAIRouterModelOptions(models, selectElement, currentValue) {
  selectElement.innerHTML = "";

  // Sort models alphabetically by display name
  const sortedModels = models.sort((a, b) => {
    const nameA = (a.displayName || a.name).toLowerCase();
    const nameB = (b.displayName || b.name).toLowerCase();
    return nameA.localeCompare(nameB);
  });

  // Add models to select element
  sortedModels.forEach((model) => {
    const option = document.createElement("option");
    option.value = model.name;
    option.textContent = model.displayName || model.name;
    if (model.description) {
      option.title = model.description;
    }
    selectElement.appendChild(option);
  });

  // Restore the previous value if it exists in the options
  if (currentValue) {
    selectElement.value = currentValue;
  }

  // If no models found, add a "no results" option
  if (sortedModels.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No models found";
    option.disabled = true;
    selectElement.appendChild(option);
  }
}

// Function to fetch available OpenAI Router models
async function fetchOpenAIRouterModels() {
  try {
    // Get the API key from the input field (optional for OpenAI Router)
    const apiKey = document.getElementById("router-key").value;
    const url = document.getElementById("router-url").value;

    const data = await sendBackgroundMessage("FETCH_OPENAI_ROUTER_MODELS", {
      apiKey: apiKey || undefined,
      url: url,
    });

    const inputElement = document.getElementById("router-model");

    // If models are returned, show them in a select dropdown instead of text input
    if (data.models && data.models.length > 0) {
      // Check if we need to replace the input with a select
      if (inputElement.tagName.toLowerCase() === "input") {
        // Store the current value before replacing the element
        const currentValue = inputElement.value;

        const selectElement = document.createElement("select");
        selectElement.id = "router-model";
        selectElement.name = "router-model";
        selectElement.className = inputElement.className;

        // Replace input with select
        inputElement.parentNode.replaceChild(selectElement, inputElement);

        // Show search container
        const searchContainer = document.getElementById(
          "router-search-container"
        );
        if (searchContainer) {
          searchContainer.classList.remove("hidden");
        }

        // Store all models for filtering
        selectElement.allModels = data.models;

        // Update options with all models
        updateOpenAIRouterModelOptions(data.models, selectElement, currentValue);

        // Add the dropdown arrow
        const container = selectElement.parentNode;
        if (!container.querySelector("svg")) {
          const svg = document.createElement("div");
          svg.innerHTML = `<svg class="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" data-slot="icon">
                        <path fill-rule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
                    </svg>`;
          container.appendChild(svg.firstElementChild);
        }

        // Setup search functionality
        const searchInput = document.getElementById("router-model-search");
        if (searchInput) {
          searchInput.addEventListener("input", (e) => {
            const searchTerm = e.target.value;
            const filteredModels = filterOpenAIRouterModels(searchTerm, data.models);
            updateOpenAIRouterModelOptions(
              filteredModels,
              selectElement,
              selectElement.value
            );
          });
        }
      } else {
        // Already a select, just update options but preserve current value
        const currentValue = inputElement.value;

        // Show search container
        const searchContainer = document.getElementById(
          "router-search-container"
        );
        if (searchContainer) {
          searchContainer.classList.remove("hidden");
        }

        // Store all models for filtering
        inputElement.allModels = data.models;

        // Update options with all models
        updateOpenAIRouterModelOptions(data.models, inputElement, currentValue);

        // Setup search functionality if not already setup
        const searchInput = document.getElementById("router-model-search");
        if (searchInput && !searchInput.hasAttribute("data-setup")) {
          searchInput.setAttribute("data-setup", "true");
          searchInput.addEventListener("input", (e) => {
            const searchTerm = e.target.value;
            const filteredModels = filterOpenAIRouterModels(searchTerm, data.models);
            updateOpenAIRouterModelOptions(
              filteredModels,
              inputElement,
              inputElement.value
            );
          });
        }
      }

      console.log(`加载了 ${data.models.length}  OpenAI Router models`);
    } else {
      console.log("No OpenAI Router models found");
    }

    // Cache the models data
    const modelsToCache = {
      models: data.models,
      timestamp: Date.now(),
    };
    chrome.storage.local.set({ "openai-router-models-cache": modelsToCache });
  } catch (error) {
    console.error("Error fetching OpenAI Router models:", error);
    alert(`Failed to fetch OpenAI Router models: ${error.message}`);
  }
}

// Load Gemini models from storage or use defaults
async function loadGeminiModels() {
  try {
    // Try to load cached models from storage
    const cachedData = await chrome.storage.local.get("geminiModels");
    const geminiModels = cachedData.geminiModels;

    const selectElement = document.getElementById("gemini-model");

    // Check if we have cached models and they're not too old (24 hours)
    const isDataFresh =
      geminiModels &&
      geminiModels.timestamp &&
      Date.now() - geminiModels.timestamp < 24 * 60 * 60 * 1000;

    if (isDataFresh && geminiModels.models && geminiModels.models.length > 0) {
      // Use cached models
      selectElement.innerHTML = "";
      geminiModels.models.forEach((model) => {
        const option = document.createElement("option");
        option.value = model.name;
        option.textContent = model.displayName || model.name;
        if (model.description) {
          option.title = model.description;
        }
        selectElement.appendChild(option);
      });
      console.log(`加载了 ${geminiModels.models.length} 个缓存的Gemini模型`);
    } else {
      // Use default models if no cached data or data is stale
      console.log("使用默认Gemini模型列表");
    }
  } catch (error) {
    console.error("加载Gemini模型时出错:", error);
    // Keep default models in case of error
  }
}

// Load OpenAI Router models from storage or keep as input
async function loadOpenAIRouterModels() {
  try {
    // Try to load cached models from storage
    const cachedData = await chrome.storage.local.get("openai-router-models-cache");
    const routerModels = cachedData["openai-router-models-cache"];

    const inputElement = document.getElementById("router-model");

    // Check if we have cached models and they're not too old (24 hours)
    const isDataFresh =
      routerModels &&
      routerModels.timestamp &&
      Date.now() - routerModels.timestamp < 24 * 60 * 60 * 1000;

    if (
      isDataFresh &&
      routerModels.models &&
      routerModels.models.length > 0
    ) {
      // Replace input with select if we have cached models
      if (inputElement.tagName.toLowerCase() === "input") {
        const currentValue = inputElement.value;

        const selectElement = document.createElement("select");
        selectElement.id = "router-model";
        selectElement.name = "router-model";
        selectElement.className = inputElement.className;

        // Replace input with select
        inputElement.parentNode.replaceChild(selectElement, inputElement);

        // Show search container
        const searchContainer = document.getElementById(
          "router-search-container"
        );
        if (searchContainer) {
          searchContainer.classList.remove("hidden");
        }

        // Store all models for filtering
        selectElement.allModels = routerModels.models;

        // Update options with all models
        updateOpenAIRouterModelOptions(
          routerModels.models,
          selectElement,
          currentValue
        );

        // Add the dropdown arrow
        const container = selectElement.parentNode;
        if (!container.querySelector("svg")) {
          const svg = document.createElement("div");
          svg.innerHTML = `<svg class="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" data-slot="icon">
                        <path fill-rule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
                    </svg>`;
          container.appendChild(svg.firstElementChild);
        }

        // Setup search functionality
        const searchInput = document.getElementById("router-model-search");
        if (searchInput) {
          searchInput.addEventListener("input", (e) => {
            const searchTerm = e.target.value;
            const filteredModels = filterOpenAIRouterModels(
              searchTerm,
              routerModels.models
            );
            updateOpenAIRouterModelOptions(
              filteredModels,
              selectElement,
              selectElement.value
            );
          });
        }
      }
      console.log(`加载了 ${routerModels.models.length}  cached OpenAI Router models`);
    } else {
      // Keep as input field if no cached data or data is stale
      console.log("Using OpenAI Router text input");
    }
  } catch (error) {
    console.error("Error loading OpenAI Router models:", error);
    // Keep as input field in case of error
  }
}
async function loadSettings() {
  try {
    const data = await chrome.storage.sync.get("settings");
    const settings = data.settings;

    if (settings) {
      // Set language selection
      if (settings.language) {
        document.getElementById("language-select").value = settings.language;
      }

      // Set streaming setting
      if (settings.streamingEnabled !== undefined) {
        document.getElementById("streaming-enabled").checked =
          settings.streamingEnabled;
      }

      // Set max tokens setting
      if (settings.maxTokens !== undefined) {
        document.getElementById("max-tokens").value = settings.maxTokens;
      } else {
        document.getElementById("max-tokens").value = 100000; // Default value
      }

      // Set temperature setting
      if (settings.temperature !== undefined) {
        document.getElementById("temperature").value = settings.temperature;
      } else {
        document.getElementById("temperature").value = 0.7; // Default value
      }

      // Set provider selection
      const providerRadio = document.getElementById(settings.providerSelection);
      if (providerRadio) providerRadio.checked = true;

      // Set OpenAI settings
      if (settings.openai) {
        document.getElementById("openai-key").value =
          settings.openai.apiKey || "";
        document.getElementById("openai-model").value =
          settings.openai.model || "gpt-4";
      }

      // Set Anthropic settings
      if (settings.anthropic) {
        document.getElementById("anthropic-key").value =
          settings.anthropic.apiKey || "";
        document.getElementById("anthropic-model").value =
          settings.anthropic.model || "claude-3-opus";
      }

      // Set Gemini settings
      if (settings.gemini) {
        document.getElementById("gemini-key").value =
          settings.gemini.apiKey || "";
        // Load Gemini models first, then set the selected model
        await loadGeminiModels();
        document.getElementById("gemini-model").value =
          settings.gemini.model || "gemini-2.0-flash-lite";
      }

      // Set DeepSeek settings
      if (settings.deepseek) {
        document.getElementById("deepseek-key").value =
          settings.deepseek.apiKey || "";
        document.getElementById("deepseek-model").value =
          settings.deepseek.model || "deepseek-chat";
      }

      // Set OpenAI Router settings
      if (settings["openai-router"]) {
        document.getElementById("router-key").value =
          settings["openai-router"].apiKey || "";
        document.getElementById("router-url").value =
          settings["openai-router"].url || "http://127.0.0.1:4000";
        // Load OpenAI Router models first, then set the selected model
        await loadOpenAIRouterModels();
        const routerModelElement = document.getElementById("router-model");
        if (routerModelElement) {
          routerModelElement.value = settings["openai-router"].model || "gpt-3.5-turbo";
        }
      } else {
        // Even if no settings exist, try to load cached models
        await loadOpenAIRouterModels();
      }
    }
  } catch (error) {
    console.error("Error loading settings:", error);
  }
}

// Test the current provider configuration
async function testProviderConnection() {
  // Get the currently selected provider
  const selectedProvider = document.querySelector(
    'input[name="provider-selection"]:checked'
  )?.id;
  if (!selectedProvider) {
    showTestResult("请先选择一个AI提供商", "error");
    return;
  }

  // Get the test button and change its text
  const testButton = document.getElementById("test-connection");
  const originalText = testButton.textContent;
  testButton.textContent = "测试中...";
  testButton.disabled = true;

  try {
    // Prepare test data based on the selected provider
    let testData = {};
    let testMessage = '这是一条测试消息，请回复"测试成功"';

    switch (selectedProvider) {
      case "openai":
        testData = {
          apiKey: document.getElementById("openai-key").value,
          model: document.getElementById("openai-model").value,
          streaming: true,
          include_usage: true,
          messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: testMessage },
          ],
        };
        break;
      case "anthropic":
        testData = {
          apiKey: document.getElementById("anthropic-key").value,
          model: document.getElementById("anthropic-model").value,
          streaming: true,
          include_usage: true,
          messages: [{ role: "user", content: testMessage }],
        };
        break;
      case "gemini":
        testData = {
          apiKey: document.getElementById("gemini-key").value,
          model: document.getElementById("gemini-model").value,
          systemPrompt: "You are a helpful assistant.",
          userPrompt: testMessage,
        };
        break;
      case "deepseek":
        testData = {
          apiKey: document.getElementById("deepseek-key").value,
          model: document.getElementById("deepseek-model").value,
          streaming: true,
          include_usage: true,
          messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: testMessage },
          ],
        };
        break;
      case "ollama":
        testData = {
          model: document.getElementById("ollama-model").value,
          streaming: true,
          include_usage: true,
          messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: testMessage },
          ],
        };
        break;
      case "openai-router":
        testData = {
          apiKey: document.getElementById("router-key").value,
          model: document.getElementById("router-model").value,
          url: document.getElementById("router-url").value,
          streaming: true,
          include_usage: true,
          messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: testMessage },
          ],
        };
        break;
      default:
        throw new Error(`未知的提供商: ${selectedProvider}`);
    }

    // Send test request to background script
    const response = await sendBackgroundMessage(
      `${selectedProvider.toUpperCase()}_API_REQUEST`,
      testData
    );

    console.log("测试响应:", response);

    if (response?.streaming || response?.success) {
      showTestResult("连接测试成功 (流式响应)", "success");
      return;
    }

    // Check if the response is valid
    if (response) {
      let responseText = "";

      // Extract response text based on provider
      switch (selectedProvider) {
        case "gemini":
          if (
            response.candidates &&
            response.candidates[0]?.content?.parts[0]?.text
          ) {
            responseText = response.candidates[0].content.parts[0].text;
          }
          break;
        case "anthropic":
          if (response.content && response.content[0]?.text) {
            responseText = response.content[0].text;
          }
          break;
        case "openai":
        case "deepseek":
        case "openai-router":
          if (response.choices && response.choices[0]?.message?.content) {
            responseText = response.choices[0].message.content;
          }
          break;
      }

      if (responseText) {
        showTestResult(
          `连接测试成功!\n\n响应: ${responseText.substring(0, 100)}${
            responseText.length > 100 ? "..." : ""
          }`,
          "success"
        );
      } else {
        showTestResult(
          `连接成功，但响应格式不符合预期。请查看控制台获取详细信息。`,
          "warning"
        );
        console.error("响应格式不符合预期:", response);
      }
    } else {
      showTestResult("测试失败: 未收到响应", "error");
    }
  } catch (error) {
    console.error("测试连接时出错:", error);
    showTestResult(`测试失败: ${error.message}`, "error");
  } finally {
    // Reset button state
    testButton.textContent = originalText;
    testButton.disabled = false;
  }
}

// Function to show test result with visual feedback
function showTestResult(message, type) {
  // Create or update the test result element
  let resultElement = document.getElementById("test-result");
  if (!resultElement) {
    resultElement = document.createElement("div");
    resultElement.id = "test-result";
    resultElement.className = "mt-3 p-3 rounded-md text-sm";

    // Insert after the test button
    const testButton = document.getElementById("test-connection");
    testButton.parentNode.insertBefore(resultElement, testButton.nextSibling);
  }

  // Remove existing classes
  resultElement.className = "mt-3 p-3 rounded-md text-sm";

  // Apply type-specific styling
  switch (type) {
    case "success":
      resultElement.className +=
        " bg-green-50 text-green-800 border border-green-200";
      break;
    case "error":
      resultElement.className +=
        " bg-red-50 text-red-800 border border-red-200";
      break;
    case "warning":
      resultElement.className +=
        " bg-yellow-50 text-yellow-800 border border-yellow-200";
      break;
    default:
      resultElement.className +=
        " bg-gray-50 text-gray-800 border border-gray-200";
  }

  // Set the message
  resultElement.innerHTML = message.replace(/\n/g, "<br>");

  // Auto-hide after 10 seconds for success messages
  if (type === "success") {
    setTimeout(() => {
      if (resultElement && resultElement.parentNode) {
        resultElement.remove();
      }
    }, 10000);
  }
}

// Initialize event listeners and load settings
document.addEventListener("DOMContentLoaded", async () => {
  // Load saved settings (this will also load Gemini models if needed)
  await loadSettings();

  // Add save button event listener
  const form = document.querySelector("form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveSettings();
  });

  // Add test connection button event listener
  const testButton = document.getElementById("test-connection");
  testButton.addEventListener("click", testProviderConnection);

  // Add refresh Gemini models button event listener
  const refreshGeminiButton = document.getElementById("refresh-gemini-models");
  refreshGeminiButton.addEventListener("click", async () => {
    const originalText = refreshGeminiButton.textContent;
    refreshGeminiButton.textContent = "刷新中...";
    refreshGeminiButton.disabled = true;

    try {
      await fetchGeminiModels();
      refreshGeminiButton.textContent = "已刷新";
      setTimeout(() => {
        refreshGeminiButton.textContent = originalText;
      }, 2000);
    } catch (error) {
      refreshGeminiButton.textContent = "刷新失败";
      setTimeout(() => {
        refreshGeminiButton.textContent = originalText;
      }, 3000);
    } finally {
      refreshGeminiButton.disabled = false;
    }
  });

  // Update OpenAI Router URL preview update
  const routerUrlInput = document.getElementById("router-url");
  const fullUrlPreview = document.getElementById("full-url-preview");
  function updateUrlPreview() {
    const baseUrl = routerUrlInput.value.replace(/\/$/, "");
    fullUrlPreview.textContent = `Actual request: ${baseUrl}/v1/chat/completions`;
  }
  routerUrlInput.addEventListener("input", updateUrlPreview);
  updateUrlPreview(); // Initialize

  // Add refresh OpenAI Router models button event listener
  const refreshRouterButton = document.getElementById(
    "refresh-router-models"
  );
  refreshRouterButton.addEventListener("click", async () => {
    const originalText = refreshRouterButton.textContent;
    refreshRouterButton.textContent = "刷新中...";
    refreshRouterButton.disabled = true;

    try {
      await fetchOpenAIRouterModels();
      refreshRouterButton.textContent = "已刷新";
      setTimeout(() => {
        refreshRouterButton.textContent = originalText;
      }, 2000);
    } catch (error) {
      refreshRouterButton.textContent = "刷新失败";
      setTimeout(() => {
        refreshRouterButton.textContent = originalText;
      }, 3000);
    } finally {
      refreshRouterButton.disabled = false;
    }
  });

  // Add cache management event listeners
  const viewCacheStatsButton = document.getElementById("view-cache-stats");
  const clearCacheButton = document.getElementById("clear-cache");
  const cacheStatsDiv = document.getElementById("cache-stats");

  viewCacheStatsButton.addEventListener("click", async () => {
    try {
      const stats = await HNState.getSummaryCacheStats();
      cacheStatsDiv.innerHTML = `
        <div class="space-y-2">
          <div><strong>Total Entries:</strong> ${stats.totalEntries}</div>
          <div><strong>Expired Entries:</strong> ${stats.expiredEntries}</div>
          <div><strong>Cache Size:</strong> ${stats.totalSizeKB} KB (${stats.totalSizeBytes} bytes)</div>
          <div class="text-xs text-gray-500 mt-2">Cache entries expire after 24 hours</div>
        </div>
      `;
      cacheStatsDiv.classList.remove("hidden");
    } catch (error) {
      cacheStatsDiv.innerHTML = `<div class="text-red-600">Error loading cache stats: ${error.message}</div>`;
      cacheStatsDiv.classList.remove("hidden");
    }
  });

  clearCacheButton.addEventListener("click", async () => {
    if (confirm("Are you sure you want to clear all cached summaries? This action cannot be undone.")) {
      try {
        // Get all storage data and remove summary keys
        const allData = await chrome.storage.local.get(null);
        const summaryKeys = Object.keys(allData).filter(key => key.startsWith('summary_'));
        
        if (summaryKeys.length > 0) {
          await chrome.storage.local.remove(summaryKeys);
          cacheStatsDiv.innerHTML = `<div class="text-green-600">Successfully cleared ${summaryKeys.length} cached summaries.</div>`;
        } else {
          cacheStatsDiv.innerHTML = `<div class="text-gray-600">No cached summaries found.</div>`;
        }
        cacheStatsDiv.classList.remove("hidden");
      } catch (error) {
        cacheStatsDiv.innerHTML = `<div class="text-red-600">Error clearing cache: ${error.message}</div>`;
        cacheStatsDiv.classList.remove("hidden");
      }
    }
  });

  // Saved comments list (post title + open/focus + unsave)
  const savedCommentsList = document.getElementById("saved-comments-list");
  const refreshSavedCommentsButton = document.getElementById(
    "refresh-saved-comments"
  );

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const truncateText = (value, max = 160) => {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max)}…`;
  };

  const renderSavedCommentsList = async () => {
    if (!savedCommentsList) return;
    if (typeof HNState === "undefined") {
      savedCommentsList.innerHTML =
        `<div class="text-red-600 px-1 py-2">HNState is not available.</div>`;
      return;
    }

    try {
      const savedMap = await HNState.getSavedComments();
      const entries = Array.from(savedMap.values()).sort(
        (a, b) => (b.savedAt || 0) - (a.savedAt || 0)
      );

      if (entries.length === 0) {
        savedCommentsList.innerHTML =
          `<div class="text-gray-500 px-1 py-2">No saved comments yet. On HN, click <strong>save</strong> on a comment.</div>`;
        return;
      }

      savedCommentsList.innerHTML = entries
        .map((entry) => {
          const openUrl = HNState.getSavedCommentOpenUrl(entry);
          const title = entry.postTitle || `Post ${entry.postId || "?"}`;
          const author = entry.author || "unknown";
          const snippet = truncateText(entry.text, 180);
          const savedAt = entry.savedAt
            ? new Date(entry.savedAt).toLocaleString()
            : "";
          const openAttr = openUrl
            ? `href="${escapeHtml(openUrl)}" target="_blank" rel="noopener noreferrer"`
            : `href="#" aria-disabled="true"`;
          return `<div class="saved-comment-item mb-2 rounded-md border border-gray-200 bg-white p-3" data-comment-id="${escapeHtml(entry.commentId)}">
            <div class="font-medium text-gray-900"><a class="text-indigo-700 hover:underline" ${openAttr}>${escapeHtml(title)}</a></div>
            <div class="mt-1 text-xs text-gray-500">by ${escapeHtml(author)}${savedAt ? ` · ${escapeHtml(savedAt)}` : ""}</div>
            <div class="mt-2 text-gray-700">${escapeHtml(snippet) || "(no text stored)"}</div>
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <a class="text-indigo-600 hover:text-indigo-500 font-medium" ${openAttr}>Open &amp; focus</a>
              <button type="button" class="unsave-comment-btn text-red-600 hover:text-red-500 font-medium" data-comment-id="${escapeHtml(entry.commentId)}">Unsave</button>
            </div>
          </div>`;
        })
        .join("");
    } catch (error) {
      savedCommentsList.innerHTML = `<div class="text-red-600 px-1 py-2">Failed to load saved comments: ${escapeHtml(error.message)}</div>`;
    }
  };

  refreshSavedCommentsButton?.addEventListener("click", () => {
    renderSavedCommentsList();
  });

  savedCommentsList?.addEventListener("click", async (event) => {
    const unsaveBtn = event.target.closest(".unsave-comment-btn");
    if (!unsaveBtn) return;
    event.preventDefault();
    const commentId = unsaveBtn.getAttribute("data-comment-id");
    if (!commentId || typeof HNState === "undefined") return;
    try {
      await HNState.removeSavedComment(commentId);
      await renderSavedCommentsList();
    } catch (error) {
      console.error("Failed to unsave comment:", error);
    }
  });

  await renderSavedCommentsList();

  // Backup export / import (authors + saved comments + AI settings)
  const exportBookmarksButton = document.getElementById("export-bookmarks");
  const importBookmarksButton = document.getElementById("import-bookmarks");
  const importBookmarksFile = document.getElementById("import-bookmarks-file");
  const bookmarksIoStatus = document.getElementById("bookmarks-io-status");

  const showBookmarksIoStatus = (html, isError = false) => {
    if (!bookmarksIoStatus) return;
    bookmarksIoStatus.innerHTML = html;
    bookmarksIoStatus.classList.toggle("text-red-600", isError);
    bookmarksIoStatus.classList.remove("hidden");
  };

  exportBookmarksButton?.addEventListener("click", async () => {
    try {
      if (typeof HNState === "undefined") {
        throw new Error("HNState is not available on the options page.");
      }
      const data = await HNState.exportBookmarksData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `hn-companion-backup-${stamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      const authorCount = Object.keys(data.bookmarkedAuthors || {}).length;
      const commentCount = Object.keys(data.savedComments || {}).length;
      const hasSettings = !!data.settings;
      showBookmarksIoStatus(
        `<div class="text-green-600">Exported ${authorCount} authors, ${commentCount} saved comments${hasSettings ? ", and AI settings (incl. API keys)" : ""}.</div>`
      );
    } catch (error) {
      showBookmarksIoStatus(
        `<div class="text-red-600">Export failed: ${error.message}</div>`,
        true
      );
    }
  });

  importBookmarksButton?.addEventListener("click", () => {
    importBookmarksFile?.click();
  });

  importBookmarksFile?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      if (typeof HNState === "undefined") {
        throw new Error("HNState is not available on the options page.");
      }
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await HNState.importBookmarksData(data);
      if (result.settings) {
        await loadSettings();
      }
      const settingsPart = result.settings
        ? ", AI settings merged"
        : "";
      showBookmarksIoStatus(
        `<div class="text-green-600">Merged import: ${result.authors} authors, ${result.comments} comments${settingsPart} (same IDs/keys overwritten).</div>`
      );
      await renderSavedCommentsList();
    } catch (error) {
      showBookmarksIoStatus(
        `<div class="text-red-600">Import failed: ${error.message}</div>`,
        true
      );
    }
  });

  // Add cancel button event listener
  const cancelButton = document.querySelector(
    'button[type="button"]:not(#test-connection):not(#refresh-gemini-models):not(#refresh-router-models):not(#view-cache-stats):not(#clear-cache):not(#export-bookmarks):not(#import-bookmarks):not(#refresh-saved-comments):not(.unsave-comment-btn)'
  );
  cancelButton.addEventListener("click", () => {
    window.close();
  });

  // Add radio button change listeners to enable/disable corresponding inputs
  const radioButtons = document.querySelectorAll(
    'input[name="provider-selection"]'
  );
  radioButtons.forEach((radio) => {
    radio.addEventListener("change", () => {
      // Enable/disable input fields based on selection
      const openaiInputs = document.querySelectorAll(
        "#openai-key, #openai-model"
      );
      const anthropicInputs = document.querySelectorAll(
        "#anthropic-key, #anthropic-model"
      );
      const geminiInputs = document.querySelectorAll(
        "#gemini-key, #gemini-model"
      );
      const deepseekInputs = document.querySelectorAll(
        "#deepseek-key, #deepseek-model"
      );
      const routerInputs = document.querySelectorAll(
        "#router-key, #router-model"
      );

      openaiInputs.forEach((input) => (input.disabled = radio.id !== "openai"));
      anthropicInputs.forEach(
        (input) => (input.disabled = radio.id !== "anthropic")
      );
      geminiInputs.forEach((input) => (input.disabled = radio.id !== "gemini"));
      deepseekInputs.forEach(
        (input) => (input.disabled = radio.id !== "deepseek")
      );
      routerInputs.forEach(
        (input) => (input.disabled = radio.id !== "openai-router")
      );
    });
  });

  // Initial trigger of radio button change event to set initial state
  const checkedRadio = document.querySelector(
    'input[name="provider-selection"]:checked'
  );
  if (checkedRadio) {
    checkedRadio.dispatchEvent(new Event("change"));
  } else {
    // 如果没有选中任何提供商，默认选择第一个
    const firstProvider = document.querySelector(
      'input[name="provider-selection"]'
    );
    if (firstProvider) {
      firstProvider.checked = true;
      firstProvider.dispatchEvent(new Event("change"));
    }
  }
});
