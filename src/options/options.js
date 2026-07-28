// Save settings to Chrome storage
async function saveSettings() {
  const language = document.getElementById("language-select").value;
  const streamingEnabled = document.getElementById("streaming-enabled").checked;
  const bodyEnabled = document.getElementById("body-enabled").checked;
  const imagesEnabled = document.getElementById("images-enabled").checked;
  const screenshotEnabled = document.getElementById("screenshot-enabled").checked;
  const modelSupportsImages = document.getElementById(
    "router-model-supports-images"
  ).checked;
  const maxTokens =
    parseInt(document.getElementById("max-tokens").value) || 100000;
  const temperature =
    parseFloat(document.getElementById("temperature").value) || 0.7;
  const settings = {
    providerSelection: "openai-router",
    language,
    streamingEnabled,
    bodyEnabled,
    imagesEnabled,
    screenshotEnabled,
    maxTokens,
    temperature,
    "openai-router": {
      apiKey: document.getElementById("router-key").value,
      model: document.getElementById("router-model").value,
      url: document.getElementById("router-url").value,
      supportsImages: modelSupportsImages,
    },
  };

  try {
    await chrome.storage.sync.set({ settings });
    try {
      await routerModelPicker?.setModelSupportsImages(
        settings["openai-router"].model,
        modelSupportsImages
      );
    } catch (error) {
      console.warn("Could not update cached model capabilities:", error);
    }
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

const ROUTER_MODELS_CACHE_KEY = "openai-router-models-cache";
const ROUTER_MODEL_SUGGESTION_LIMIT = 80;

function setupPasswordVisibilityToggle(inputId, toggleButtonId) {
  const input = document.getElementById(inputId);
  const toggleButton = document.getElementById(toggleButtonId);
  if (!input || !toggleButton) return;

  const showIcon = toggleButton.querySelector(".password-toggle-show");
  const hideIcon = toggleButton.querySelector(".password-toggle-hide");

  toggleButton.addEventListener("click", () => {
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    showIcon?.classList.toggle("hidden", isHidden);
    hideIcon?.classList.toggle("hidden", !isHidden);
    toggleButton.setAttribute("aria-pressed", String(isHidden));
    toggleButton.setAttribute(
      "aria-label",
      isHidden ? "Hide API key" : "Show API key"
    );
    toggleButton.title = isHidden ? "Hide API key" : "Show API key";
  });
}

function normalizeRouterUrl(url) {
  return (url || "").trim().replace(/\/$/, "");
}

function sortRouterModels(models) {
  return [...models].sort((a, b) => {
    const nameA = (a.displayName || a.name).toLowerCase();
    const nameB = (b.displayName || b.name).toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

function filterRouterModels(searchTerm, allModels) {
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

function formatRouterModelCacheAge(timestamp) {
  if (!timestamp) {
    return "";
  }
  const ageMs = Date.now() - timestamp;
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

class RouterModelPicker {
  constructor() {
    this.input = document.getElementById("router-model");
    this.list = document.getElementById("router-model-suggestions");
    this.status = document.getElementById("router-model-status");
    this.urlInput = document.getElementById("router-url");
    this.keyInput = document.getElementById("router-key");
    this.allModels = [];
    this.cacheTimestamp = null;
    this.highlightIndex = -1;
    this.isOpen = false;

    if (!this.input || !this.list) {
      return;
    }

    this.setupEvents();
  }

  getCacheKey() {
    return normalizeRouterUrl(this.urlInput?.value);
  }

  updateStatus(extraMessage) {
    if (!this.status) {
      return;
    }
    if (extraMessage) {
      this.status.textContent = extraMessage;
      return;
    }
    if (!this.allModels.length) {
      this.status.textContent =
        "No cached model list. Click 刷新 to fetch models from your router.";
      return;
    }
    const age = formatRouterModelCacheAge(this.cacheTimestamp);
    this.status.textContent = `${this.allModels.length} cached models (${age}). Type to filter, or click 刷新 for the latest list.`;
  }

  async readCacheEntry() {
    const cachedData = await chrome.storage.local.get(ROUTER_MODELS_CACHE_KEY);
    const cache = cachedData[ROUTER_MODELS_CACHE_KEY] || {};
    const cacheKey = this.getCacheKey();

    if (cache[cacheKey]?.models?.length) {
      return cache[cacheKey];
    }

    // Migrate legacy flat cache shape: { models, timestamp }
    if (Array.isArray(cache.models) && cache.models.length) {
      const migrated = {
        models: cache.models,
        timestamp: cache.timestamp || Date.now(),
      };
      await this.writeCacheEntry(migrated.models);
      return migrated;
    }

    return null;
  }

  async writeCacheEntry(models) {
    const cachedData = await chrome.storage.local.get(ROUTER_MODELS_CACHE_KEY);
    const cache = cachedData[ROUTER_MODELS_CACHE_KEY] || {};
    const cacheKey = this.getCacheKey();
    // Preserve previously-set `supportsImages` flags by model name when refreshing.
    const previousFlags = new Map(
      (cache[cacheKey]?.models || []).map((m) => [m.name, m.supportsImages])
    );
    const merged = (models || []).map((m) => ({
      ...m,
      supportsImages:
        typeof m.supportsImages === "boolean"
          ? m.supportsImages
          : previousFlags.get(m.name) === true,
    }));
    cache[cacheKey] = {
      models: merged,
      timestamp: Date.now(),
    };
    await chrome.storage.local.set({ [ROUTER_MODELS_CACHE_KEY]: cache });
    return merged;
  }

  async toggleSupportsImages(modelName) {
    const idx = this.allModels.findIndex((m) => m.name === modelName);
    if (idx === -1) return;
    const model = this.allModels[idx];
    await this.setModelSupportsImages(modelName, !model.supportsImages);
    if (this.input.value.trim() === modelName) {
      this._notifyModelImageSupport?.(modelName);
    }
    this.renderSuggestions(this.input.value, { forceOpen: true });
  }

  async setModelSupportsImages(modelName, supportsImages) {
    const model = this.allModels.find((entry) => entry.name === modelName);
    if (!model) return;
    model.supportsImages = supportsImages === true;
    this.allModels = sortRouterModels(
      await this.writeCacheEntry(this.allModels)
    );
  }

  getModelSupportsImages(modelName) {
    if (!modelName) return false;
    const model = this.allModels.find((m) => m.name === modelName);
    return model?.supportsImages === true;
  }

  setModels(models, timestamp) {
    this.allModels = sortRouterModels(models || []);
    this.cacheTimestamp = timestamp || null;
    this.updateStatus();
  }

  async loadFromCache() {
    try {
      const entry = await this.readCacheEntry();
      if (entry?.models?.length) {
        this.setModels(entry.models, entry.timestamp);
        return true;
      }
      this.setModels([], null);
      return false;
    } catch (error) {
      console.error("Error loading cached router models:", error);
      this.updateStatus("Could not load cached model list.");
      return false;
    }
  }

  async fetchModels() {
    const apiKey = this.keyInput?.value;
    const url = this.urlInput?.value;
    const data = await sendBackgroundMessage("FETCH_OPENAI_ROUTER_MODELS", {
      apiKey: apiKey || undefined,
      url,
    });
    const models = data.models || [];
    const cachedModels = await this.writeCacheEntry(models);
    this.setModels(cachedModels, Date.now());
    this.renderSuggestions(this.input.value, { forceOpen: true });
    return models;
  }

  getFilteredModels(term) {
    const filtered = filterRouterModels(term, this.allModels);
    return filtered.slice(0, ROUTER_MODEL_SUGGESTION_LIMIT);
  }

  renderSuggestions(term, { forceOpen = false } = {}) {
    if (!this.list) {
      return;
    }

    const models = this.getFilteredModels(term);
    this.highlightIndex = -1;
    this.list.innerHTML = "";

    if (!this.allModels.length) {
      this.closeSuggestions();
      return;
    }

    if (!models.length) {
      const empty = document.createElement("li");
      empty.className = "px-3 py-2 text-sm text-gray-500";
      empty.textContent = term ? "No matching models" : "No models available";
      empty.setAttribute("role", "option");
      empty.setAttribute("aria-disabled", "true");
      this.list.appendChild(empty);
      this.openSuggestions();
      return;
    }

    models.forEach((model, index) => {
      const item = document.createElement("li");
      item.className =
        "router-model-suggestion flex items-start gap-2 px-3 py-2 text-sm cursor-pointer";
      item.setAttribute("role", "option");
      item.dataset.modelName = model.name;
      item.dataset.index = String(index);

      const body = document.createElement("div");
      body.className = "flex-1 min-w-0";

      const label = document.createElement("div");
      label.className = "font-medium text-gray-900 truncate";
      label.textContent = model.displayName || model.name;
      body.appendChild(label);

      if (model.description && model.description !== label.textContent) {
        const desc = document.createElement("div");
        desc.className = "text-xs text-gray-500 truncate";
        desc.textContent = model.description;
        body.appendChild(desc);
      }

      item.appendChild(body);

      // Image-support toggle badge
      const imgBadge = document.createElement("button");
      imgBadge.type = "button";
      const supportsImages = model.supportsImages === true;
      imgBadge.className = supportsImages
        ? "router-model-img-badge is-on"
        : "router-model-img-badge";
      imgBadge.title = supportsImages
        ? "Supports images — click to mark as not supporting"
        : "Click to mark this model as supporting images";
      imgBadge.setAttribute(
        "aria-label",
        supportsImages
          ? "Mark as not supporting images"
          : "Mark as supporting images"
      );
      imgBadge.innerHTML =
        '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Zm1 0v7.586l2.293-2.293a1 1 0 0 1 1.414 0L9 10.586l1.293-1.293a1 1 0 0 1 1.414 0L13 10.586V3H3Zm0 9.414L4.414 11 5 11.586 4.414 12 3 12.414ZM5.5 7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/></svg>';
      imgBadge.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.toggleSupportsImages(model.name);
      });
      item.appendChild(imgBadge);

      item.addEventListener("mousedown", (event) => {
        if (event.target.closest(".router-model-img-badge")) return;
        event.preventDefault();
        this.selectModel(model.name);
      });

      this.list.appendChild(item);
    });

    if (forceOpen || document.activeElement === this.input) {
      this.openSuggestions();
    }
  }

  setHighlightedIndex(nextIndex) {
    const items = [...this.list.querySelectorAll(".router-model-suggestion")];
    if (!items.length) {
      this.highlightIndex = -1;
      return;
    }

    this.highlightIndex = Math.max(0, Math.min(nextIndex, items.length - 1));
    items.forEach((item, index) => {
      item.classList.toggle("is-active", index === this.highlightIndex);
      if (index === this.highlightIndex) {
        item.scrollIntoView({ block: "nearest" });
      }
    });
  }

  selectModel(modelName) {
    this.input.value = modelName;
    this.closeSuggestions();
    this.input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /** Wire a callback fired whenever the selected model changes. */
  onModelImageSupportChange(fn) {
    this._notifyModelImageSupport = (modelName) =>
      fn(modelName, this.getModelSupportsImages(modelName));
  }

  openSuggestions() {
    if (!this.allModels.length) {
      return;
    }
    this.list.classList.remove("hidden");
    this.input.setAttribute("aria-expanded", "true");
    this.isOpen = true;
  }

  closeSuggestions() {
    this.list.classList.add("hidden");
    this.input.setAttribute("aria-expanded", "false");
    this.highlightIndex = -1;
    this.isOpen = false;
    this.list
      .querySelectorAll(".router-model-suggestion.is-active")
      .forEach((item) => item.classList.remove("is-active"));
  }

  setupEvents() {
    this.input.addEventListener("input", () => {
      this.renderSuggestions(this.input.value, { forceOpen: true });
    });

    this.input.addEventListener("change", () => {
      this._notifyModelImageSupport?.(this.input.value.trim());
    });

    this.input.addEventListener("focus", () => {
      this.renderSuggestions(this.input.value, { forceOpen: true });
    });

    this.input.addEventListener("keydown", (event) => {
      const items = this.list.querySelectorAll(".router-model-suggestion");
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!this.isOpen) {
          this.renderSuggestions(this.input.value, { forceOpen: true });
        }
        this.setHighlightedIndex(this.highlightIndex + 1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!this.isOpen) {
          this.renderSuggestions(this.input.value, { forceOpen: true });
        }
        this.setHighlightedIndex(
          this.highlightIndex <= 0 ? items.length - 1 : this.highlightIndex - 1
        );
        return;
      }
      if (event.key === "Enter" && this.isOpen && this.highlightIndex >= 0) {
        event.preventDefault();
        const active = items[this.highlightIndex];
        if (active?.dataset.modelName) {
          this.selectModel(active.dataset.modelName);
        }
        return;
      }
      if (event.key === "Escape") {
        this.closeSuggestions();
      }
    });

    document.addEventListener("click", (event) => {
      if (
        !this.input.contains(event.target) &&
        !this.list.contains(event.target)
      ) {
        this.closeSuggestions();
      }
    });

    this.urlInput?.addEventListener("change", async () => {
      await this.loadFromCache();
      this.renderSuggestions(this.input.value);
    });
  }
}

let routerModelPicker;

async function initRouterModelPicker() {
  routerModelPicker = new RouterModelPicker();
  await routerModelPicker.loadFromCache();
  const supportsImagesInput = document.getElementById(
    "router-model-supports-images"
  );
  routerModelPicker.onModelImageSupportChange((_modelName, supportsImages) => {
    if (supportsImagesInput) {
      supportsImagesInput.checked = supportsImages;
    }
  });

  supportsImagesInput?.addEventListener("change", () => {
    routerModelPicker
      .setModelSupportsImages(
        routerModelPicker.input.value.trim(),
        supportsImagesInput.checked
      )
      .catch((error) => {
        console.warn("Could not update cached model capabilities:", error);
      });
  });
}

async function fetchOpenAIRouterModels() {
  if (!routerModelPicker) {
    routerModelPicker = new RouterModelPicker();
  }
  try {
    const models = await routerModelPicker.fetchModels();
    console.log(`Loaded ${models.length} OpenAI Router models`);
    routerModelPicker.updateStatus(
      `Refreshed ${models.length} models from router.`
    );
    return models;
  } catch (error) {
    console.error("Error fetching OpenAI Router models:", error);
    throw error;
  }
}

async function loadOpenAIRouterModels() {
  if (!routerModelPicker) {
    routerModelPicker = new RouterModelPicker();
  }
  await routerModelPicker.loadFromCache();
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

      if (settings.imagesEnabled !== undefined) {
        document.getElementById("images-enabled").checked =
          settings.imagesEnabled;
      } else {
        document.getElementById("images-enabled").checked = false;
      }

      document.getElementById("body-enabled").checked =
        settings.bodyEnabled !== false;

      document.getElementById("screenshot-enabled").checked =
        settings.screenshotEnabled === true;

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

      // Set OpenAI Router settings
      if (settings["openai-router"]) {
        document.getElementById("router-key").value =
          settings["openai-router"].apiKey || "";
        document.getElementById("router-url").value =
          settings["openai-router"].url || "http://127.0.0.1:4000";
      }

      await initRouterModelPicker();
      const routerModelElement = document.getElementById("router-model");
      if (routerModelElement && settings["openai-router"]?.model) {
        routerModelElement.value = settings["openai-router"].model;
      }
      const savedSupportsImages =
        settings["openai-router"]?.supportsImages === true;
      document.getElementById("router-model-supports-images").checked =
        savedSupportsImages;
      await routerModelPicker?.setModelSupportsImages(
        settings["openai-router"]?.model,
        savedSupportsImages
      );
    } else {
      await initRouterModelPicker();
    }
  } catch (error) {
    console.error("Error loading settings:", error);
  }
}

// Test the current provider configuration
async function testProviderConnection() {
  // Get the test button and change its text
  const testButton = document.getElementById("test-connection");
  const originalText = testButton.textContent;
  testButton.textContent = "测试中...";
  testButton.disabled = true;

  try {
    let testMessage = '这是一条测试消息，请回复"测试成功"';

    const testData = {
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

    // Send test request to background script
    const response = await sendBackgroundMessage(
      "OPENAI_ROUTER_API_REQUEST",
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

      if (response.choices && response.choices[0]?.message?.content) {
        responseText = response.choices[0].message.content;
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

async function loadSubstackCustomDomains() {
  const data = await sendBackgroundMessage("LIST_SUBSTACK_DOMAINS");
  return data?.domains || [];
}

function normalizeDomainInput(raw) {
  return (raw || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./i, "")
    .toLowerCase();
}

async function renderSubstackDomainsList() {
  const listEl = document.getElementById("substack-domains-list");
  if (!listEl) {
    return;
  }

  try {
    const domains = await loadSubstackCustomDomains();
    if (!domains.length) {
      listEl.innerHTML =
        '<div class="text-gray-500 px-1 py-2">No custom domains enabled. Use the extension popup on a Substack post page.</div>';
      return;
    }

    listEl.innerHTML = domains
      .map(
        (domain) => `
        <div class="flex items-center justify-between gap-2 py-1.5 px-1 border-b border-gray-200 last:border-0">
          <span class="truncate" title="${domain}">${domain}</span>
          <button type="button" class="remove-substack-domain rounded px-2 py-0.5 text-xs font-semibold text-red-600 hover:bg-red-50" data-domain="${domain}">Remove</button>
        </div>`
      )
      .join("");

    listEl.querySelectorAll(".remove-substack-domain").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const domain = btn.dataset.domain;
        if (!domain || !confirm(`Remove ${domain} from enabled Substack sites?`)) {
          return;
        }
        btn.disabled = true;
        try {
          await sendBackgroundMessage("REMOVE_SUBSTACK_DOMAIN", { hostname: domain });
          await renderSubstackDomainsList();
        } catch (error) {
          alert(`Failed to remove domain: ${error.message}`);
          btn.disabled = false;
        }
      });
    });
  } catch (error) {
    listEl.innerHTML = `<div class="text-red-600 px-1 py-2">Error loading domains: ${error.message}</div>`;
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

  // Update OpenAI Router URL preview update
  const routerUrlInput = document.getElementById("router-url");
  const fullUrlPreview = document.getElementById("full-url-preview");
  function updateUrlPreview() {
    const baseUrl = routerUrlInput.value.replace(/\/$/, "");
    fullUrlPreview.textContent = `Actual request: ${baseUrl}/v1/chat/completions`;
  }
  routerUrlInput.addEventListener("input", updateUrlPreview);
  updateUrlPreview(); // Initialize

  setupPasswordVisibilityToggle("router-key", "router-key-toggle-visibility");

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
      alert(`Failed to fetch OpenAI Router models: ${error.message}`);
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

  // Substack custom domains
  const addSubstackDomainBtn = document.getElementById("add-substack-domain");
  const substackDomainInput = document.getElementById("substack-domain-input");

  if (addSubstackDomainBtn && substackDomainInput) {
    addSubstackDomainBtn.addEventListener("click", async () => {
      const hostname = normalizeDomainInput(substackDomainInput.value);
      if (!hostname || hostname.includes(" ")) {
        alert("Enter a valid domain (e.g. stratechery.com)");
        return;
      }
      addSubstackDomainBtn.disabled = true;
      try {
        await sendBackgroundMessage("ENABLE_SUBSTACK_DOMAIN", { hostname });
        substackDomainInput.value = "";
        await renderSubstackDomainsList();
      } catch (error) {
        alert(`Failed to add domain: ${error.message}`);
      } finally {
        addSubstackDomainBtn.disabled = false;
      }
    });

    substackDomainInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addSubstackDomainBtn.click();
      }
    });
  }

  await renderSubstackDomainsList();

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
          `<div class="text-gray-500 px-1 py-2">Nothing saved yet. Save HN comments, page links (hub Save), or selected text via the FAB.</div>`;
        return;
      }

      savedCommentsList.innerHTML = entries
        .map((entry) => {
          const openUrl = HNState.getSavedCommentOpenUrl(entry);
          const type = entry.type || "comment";
          const typeLabel = HNState.getSavedItemTypeLabel(type);
          const title = HNState.getSavedItemDisplayTitle(entry);
          const author = entry.author || "unknown";
          const snippet = truncateText(entry.text, 180);
          const savedAt = entry.savedAt
            ? new Date(entry.savedAt).toLocaleString()
            : "";
          const pageLine =
            type !== "comment" && entry.pageUrl
              ? `<div class="mt-1 text-xs text-gray-400">${escapeHtml(truncateText(entry.pageUrl, 120))}</div>`
              : "";
          const openLabel =
            type === "comment" ? "Open &amp; focus" : "Open";
          const metaLine =
            type === "comment"
              ? `by ${escapeHtml(author)}${savedAt ? ` · ${escapeHtml(savedAt)}` : ""}`
              : `${escapeHtml(entry.siteKey || "")}${savedAt ? ` · ${escapeHtml(savedAt)}` : ""}`;
          const openAttr = openUrl
            ? `href="${escapeHtml(openUrl)}" target="_blank" rel="noopener noreferrer"`
            : `href="#" aria-disabled="true"`;
          return `<div class="saved-comment-item mb-2 rounded-md border border-gray-200 bg-white p-3" data-comment-id="${escapeHtml(entry.commentId)}">
            <div class="flex flex-wrap items-center gap-2">
              <span class="inline-flex rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">${escapeHtml(typeLabel)}</span>
              <div class="font-medium text-gray-900"><a class="text-indigo-700 hover:underline" ${openAttr}>${escapeHtml(title)}</a></div>
            </div>
            <div class="mt-1 text-xs text-gray-500">${metaLine}</div>
            ${pageLine}
            <div class="mt-2 text-gray-700">${escapeHtml(snippet) || "(no text stored)"}</div>
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <a class="text-indigo-600 hover:text-indigo-500 font-medium" ${openAttr}>${openLabel}</a>
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
  document.getElementById("cancel-settings")?.addEventListener("click", () => {
    window.close();
  });


});
