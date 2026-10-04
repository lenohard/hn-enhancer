/*
 * OpenCode Go model routing metadata.
 *
 * Keep this list intentionally explicit: the model ID selects the wire
 * protocol, while unknown/new models use the OpenAI-compatible default.
 *
 * The metadata only describes the OpenCode Go router, which publishes the
 * Anthropic Messages and OpenAI Responses surfaces next to chat/completions.
 * Other gateways are resolved from the configured base URL: they default to
 * /v1/chat/completions unless the user pins a protocol (see
 * getHNOpenAIRouterProtocol below) — DashScope compatible-mode, for example,
 * returns 404 for /v1/messages.
 */
(function (global) {
  const DEFAULT_MODEL_CONFIG = Object.freeze({
    provider: "Unknown",
    protocol: "chat-completions",
    endpoint: "/v1/chat/completions",
  });

  const MODEL_CONFIG = {
    // OpenAI Responses API
    "grok-4.6": {
      provider: "xAI",
      protocol: "responses",
      endpoint: "/v1/responses",
    },
    "gpt-5.6-luna": {
      provider: "OpenAI",
      protocol: "responses",
      endpoint: "/v1/responses",
    },
    "muse-spark-1.3-contributor": {
      provider: "Muse",
      protocol: "responses",
      endpoint: "/v1/responses",
    },
    "muse-spark-1.2-contributor": {
      provider: "Muse",
      protocol: "responses",
      endpoint: "/v1/responses",
    },

    // OpenAI-compatible Chat Completions API
    "glm-5.3-flash": {
      provider: "Zhipu AI (GLM)",
      protocol: "chat-completions",
      endpoint: "/v1/chat/completions",
    },
    "glm-5.3": {
      provider: "Zhipu AI (GLM)",
      protocol: "chat-completions",
      endpoint: "/v1/chat/completions",
    },
    "glm-5.2": {
      provider: "Zhipu AI (GLM)",
      protocol: "chat-completions",
      endpoint: "/v1/chat/completions",
    },
    "glm-5.1": {
      provider: "Zhipu AI (GLM)",
      protocol: "chat-completions",
      endpoint: "/v1/chat/completions",
    },
    "kimi-k3": {
      provider: "Moonshot AI (Kimi)",
      protocol: "chat-completions",
      endpoint: "/v1/chat/completions",
    },
    "kimi-k2.7-code": {
      provider: "Moonshot AI (Kimi)",
      protocol: "chat-completions",
      endpoint: "/v1/chat/completions",
    },
    "kimi-k2.6": {
      provider: "Moonshot AI (Kimi)",
      protocol: "chat-completions",
      endpoint: "/v1/chat/completions",
    },
    "longcat-2.0": {
      provider: "LongCat",
      protocol: "chat-completions",
      endpoint: "/v1/chat/completions",
    },
    "deepseek-v4-pro": {
      provider: "DeepSeek",
      protocol: "chat-completions",
      endpoint: "/v1/chat/completions",
    },
    "deepseek-v4-flash": {
      provider: "DeepSeek",
      protocol: "chat-completions",
      endpoint: "/v1/chat/completions",
    },
    "deepseek-v4-flash-vision-exp": {
      provider: "DeepSeek",
      protocol: "chat-completions",
      endpoint: "/v1/chat/completions",
    },
    "mimo-v2.5": {
      provider: "Xiaomi (MiMo)",
      protocol: "chat-completions",
      endpoint: "/v1/chat/completions",
    },
    "mimo-v2.5-pro": {
      provider: "Xiaomi (MiMo)",
      protocol: "chat-completions",
      endpoint: "/v1/chat/completions",
    },
    "hy4-preview": {
      provider: "Hy",
      protocol: "chat-completions",
      endpoint: "/v1/chat/completions",
    },
    hy3: {
      provider: "Hy",
      protocol: "chat-completions",
      endpoint: "/v1/chat/completions",
    },
    "omen-alpha": {
      provider: "Omen",
      protocol: "chat-completions",
      endpoint: "/v1/chat/completions",
    },

    // Anthropic Messages API
    "minimax-m3": {
      provider: "MiniMax",
      protocol: "messages",
      endpoint: "/v1/messages",
    },
    "minimax-m2.7": {
      provider: "MiniMax",
      protocol: "messages",
      endpoint: "/v1/messages",
    },
    "minimax-m2.5": {
      provider: "MiniMax",
      protocol: "messages",
      endpoint: "/v1/messages",
    },
    "qwen3.8-max": {
      provider: "Alibaba (Qwen)",
      protocol: "messages",
      endpoint: "/v1/messages",
    },
    "qwen3.8-flash": {
      provider: "Alibaba (Qwen)",
      protocol: "messages",
      endpoint: "/v1/messages",
    },
    "qwen3.7-max": {
      provider: "Alibaba (Qwen)",
      protocol: "messages",
      endpoint: "/v1/messages",
    },
    "qwen3.7-plus": {
      provider: "Alibaba (Qwen)",
      protocol: "messages",
      endpoint: "/v1/messages",
    },
    "qwen3.6-plus": {
      provider: "Alibaba (Qwen)",
      protocol: "messages",
      endpoint: "/v1/messages",
    },
  };

  global.HN_OPENAI_ROUTER_MODEL_CONFIG = Object.freeze(MODEL_CONFIG);
  global.HN_OPENAI_ROUTER_DEFAULT_CONFIG = DEFAULT_MODEL_CONFIG;
  global.getHNOpenAIRouterModelConfig = (model) => {
    const modelId = typeof model === "string" ? model.trim().toLowerCase() : "";
    return global.HN_OPENAI_ROUTER_MODEL_CONFIG[modelId] || DEFAULT_MODEL_CONFIG;
  };

  // Wire protocols this extension can speak, and the path each one uses.
  const PROTOCOL_PATHS = Object.freeze({
    "chat-completions": "/v1/chat/completions",
    messages: "/v1/messages",
    responses: "/v1/responses",
  });

  const MULTI_PROTOCOL_ROUTER_HOST = "opencode.ai";
  const isMultiProtocolRouter = (url) => {
    try {
      return new URL(url).hostname.endsWith(MULTI_PROTOCOL_ROUTER_HOST);
    } catch {
      return false;
    }
  };

  // Settings written by builds that auto-derived the protocol from the model
  // table carry no marker, so their `protocol` may be a leftover rather than a
  // choice. Version 2 means the value was written by the options page.
  const PROTOCOL_SETTINGS_VERSION = 2;
  global.HN_OPENAI_ROUTER_PROTOCOL_VERSION = PROTOCOL_SETTINGS_VERSION;
  global.isHNLegacyRouterProtocolSettings = (routerSettings) =>
    ((routerSettings && routerSettings.protocolVersion) || 0) <
    PROTOCOL_SETTINGS_VERSION;

  /**
   * Resolve the protocol for a request.
   * `override` is the user's choice — "auto"/undefined follows the router.
   * A pin is always honoured; only when the settings predate protocol
   * version 2 (`legacyAutoProtocol`) is a pin that merely repeats the model
   * metadata on a gateway that does not publish that surface treated as an
   * auto-derived leftover, since it would otherwise be sent to an endpoint
   * that answers 404.
   */
  global.getHNOpenAIRouterProtocol = (
    model,
    override,
    baseUrl,
    legacyAutoProtocol = false
  ) => {
    const derived = global.getHNOpenAIRouterModelConfig(model).protocol;
    const router = isMultiProtocolRouter(baseUrl);
    const pinned = PROTOCOL_PATHS[override] ? override : null;
    if (pinned) {
      if (!legacyAutoProtocol) return pinned;
      if (pinned !== derived || router) return pinned;
    }
    return router ? derived : "chat-completions";
  };

  global.getHNOpenAIRouterEndpointPath = (
    model,
    override,
    baseUrl,
    legacyAutoProtocol = false
  ) =>
    PROTOCOL_PATHS[
      global.getHNOpenAIRouterProtocol(
        model,
        override,
        baseUrl,
        legacyAutoProtocol
      )
    ];

  /**
   * Normalize the configured base URL: trim, drop trailing slashes and any API
   * path the user pasted, so appending "/v1/..." cannot duplicate a path.
   */
  global.normalizeHNOpenAIRouterBaseUrl = (url) => {
    const base = (url || "").trim().replace(/\/+$/, "");
    const suffix = [...Object.values(PROTOCOL_PATHS), "/v1/models", "/v1"].find(
      (path) => base.endsWith(path)
    );
    return suffix ? base.slice(0, -suffix.length).replace(/\/+$/, "") : base;
  };

  global.HN_OPENAI_ROUTER_PROTOCOL_PATHS = PROTOCOL_PATHS;
})(globalThis);
