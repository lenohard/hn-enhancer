import { jest } from "@jest/globals";

/**
 * Selection lookup / save / saved-text storage regression tests.
 *
 * These tests exercise the main-class halves of the selection feature without
 * constructing HNEnhancer (the constructor touches DOM, adapters and routing):
 * methods are borrowed through the real prototype and combined with mocked
 * `apiClient`, `hnState`, adapter and hub panel.
 */

const SETTINGS = {
  aiProvider: "openai-router",
  model: "qwen/qwen3.8-flash",
  language: "zh",
  maxTokens: 4000,
  temperature: 0.7,
  routerUrl: "http://127.0.0.1:4000",
  protocol: "chat-completions",
};

let HNEnhancer;
let HNState;
let HNPrompts;
let MarkdownUtils;
let consoleErrorSpy;

function installLocation(href, hostname) {
  global.location = {
    href,
    hostname: hostname || new URL(href).hostname,
    pathname: new URL(href).pathname,
  };
}

function installDocumentTitle(title) {
  global.document = { title };
}

/**
 * Minimal in-memory chrome.storage.local with real error injection hooks.
 */
function installChromeStorage(initial = {}) {
  const data = { ...initial };
  const local = {
    data,
    get: jest.fn(async (key) => ({ [key]: data[key] })),
    set: jest.fn(async (obj) => {
      Object.assign(data, obj);
    }),
  };
  global.chrome = { storage: { local } };
  return local;
}

function rejectStorage(local, { onGet = false, onSet = false }) {
  if (onGet) local.get.mockImplementation(async () => { throw new Error("storage read failed"); });
  if (onSet) local.set.mockImplementation(async () => { throw new Error("storage write failed"); });
}

/**
 * Prototype-backed enhancer with mocked collaborators.
 */
function createEnhancer({ settings = SETTINGS, chatResponse = "译文：测试", chatError = null, settingsError = null } = {}) {
  const enhancer = Object.create(HNEnhancer.prototype);
  enhancer.apiClient = {
    sendBackgroundMessage: jest.fn(async (type, payload) => {
      if (type === "FETCH_AI_SETTINGS") {
        if (settingsError) throw settingsError;
        return settings;
      }
      if (type === "HN_CHAT_REQUEST") {
        if (chatError) throw chatError;
        return typeof chatResponse === "function" ? chatResponse(payload) : chatResponse;
      }
      throw new Error(`unexpected background message: ${type}`);
    }),
  };
  enhancer.hnState = { saveItem: jest.fn(async () => new Map()), getSavedComments: jest.fn(async () => new Map()) };
  enhancer.summarization = { summarizeAllComments: jest.fn() };
  enhancer.openPostChatModal = jest.fn();
  enhancer.adapter = {
    getSiteKey: jest.fn(() => "example.com"),
    getPostId: jest.fn(() => null),
    setSelectionOverride: jest.fn(),
    clearSelectionScope: jest.fn(),
  };
  enhancer.hubPanel = { updateStats: jest.fn() };
  enhancer.savedComments = new Map();
  enhancer.summaryPanel = { render: jest.fn() };
  return enhancer;
}

function chatCalls(enhancer) {
  return enhancer.apiClient.sendBackgroundMessage.mock.calls.filter(
    ([type]) => type === "HN_CHAT_REQUEST"
  );
}

function lastChatPayload(enhancer) {
  const calls = chatCalls(enhancer);
  expect(calls).toHaveLength(1);
  return calls[0][1];
}

const SNAPSHOT = {
  text: "a",
  context: "Surrounding paragraph before and after the selection.",
  pageUrl: "https://news.ycombinator.com/item?id=424242",
  postTitle: "Ask HN: A tiny post",
  siteKey: "news.ycombinator.com",
  postId: "424242",
  rect: { top: 10, left: 10, width: 40, height: 16 },
};

beforeAll(async () => {
  global.window = {};
  await import("../src/markdown-utils.js");
  global.MarkdownUtils = global.window.MarkdownUtils;
  await import("../src/prompts.js");
  global.HNPrompts = global.window.HNPrompts;
  await import("../src/hn-state.js");
  global.HNState = global.window.HNState;
  await import("../src/hn-enhancer.js");
  HNEnhancer = global.window.HNEnhancer;
  MarkdownUtils = global.MarkdownUtils;
  HNPrompts = global.HNPrompts;
  HNState = global.HNState;
  // Expected error paths log via console.error; keep the suite output readable.
  consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
  consoleErrorSpy?.mockRestore();
  delete global.window;
  delete global.document;
  delete global.location;
  delete global.chrome;
  delete global.HNState;
  delete global.HNPrompts;
  delete global.MarkdownUtils;
});

beforeEach(() => {
  installLocation("https://news.ycombinator.com/item?id=424242");
  installDocumentTitle("  Ask HN: A tiny post  ");
  installChromeStorage();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("lookupSelectedText", () => {
  test("single-character selection is sent as a standalone lookup", async () => {
    const enhancer = createEnhancer({ chatResponse: "art. （冠词）一个；泛指某一事物。" });

    const result = await enhancer.lookupSelectedText(SNAPSHOT);

    expect(result).toBe("art. （冠词）一个；泛指某一事物。");
    const payload = lastChatPayload(enhancer);
    expect(payload.messages).toHaveLength(2);
    expect(payload.messages[0]).toEqual({
      role: "system",
      content: HNPrompts.selectionLookup.system,
    });
    const userMessage = JSON.parse(payload.messages[1].content);
    expect(userMessage).toEqual({
      selectedText: "a",
      surroundingText: SNAPSHOT.context,
      pageTitle: "Ask HN: A tiny post",
      sourceUrl: "https://news.ycombinator.com/item?id=424242",
    });
    expect(payload.messages[1].role).toBe("user");
  });

  test("lookup prompt is the independent selection prompt, not a summary prompt", async () => {
    const enhancer = createEnhancer();

    await enhancer.lookupSelectedText(SNAPSHOT);

    const system = lastChatPayload(enhancer).messages[0].content;
    expect(system).toBe(HNPrompts.selectionLookup.system);
    expect(system).not.toBe(HNPrompts.hn.summarizePost?.system);
    expect(system).not.toBe(HNPrompts.hn.chat?.system);
    expect(system).not.toBe(HNPrompts.universal?.summary?.system);
    // A summary prompt would ask for the thread/document structure and citations.
    expect(system).not.toMatch(/\[P#\] citations linking back to comments/);
  });

  test("lookup does not mutate summary scope, chat state, or saved items", async () => {
    const enhancer = createEnhancer();

    await enhancer.lookupSelectedText(SNAPSHOT);

    expect(enhancer.summarization.summarizeAllComments).not.toHaveBeenCalled();
    expect(enhancer.openPostChatModal).not.toHaveBeenCalled();
    expect(enhancer.adapter.setSelectionOverride).not.toHaveBeenCalled();
    expect(enhancer.adapter.clearSelectionScope).not.toHaveBeenCalled();
    expect(enhancer._useSelectionScope).toBeUndefined();
    expect(enhancer.hnState.saveItem).not.toHaveBeenCalled();
    expect(enhancer.savedComments.size).toBe(0);
  });

  test("request payload carries only bounded selection, source and model settings", async () => {
    const enhancer = createEnhancer();
    const snapshot = {
      ...SNAPSHOT,
      text: "word",
      context: "c".repeat(5000),
      postTitle: "t".repeat(900),
      // Extra UI fields must not leak into the model request.
      rect: { top: 1, left: 2, width: 3, height: 4 },
      siteKey: "news.ycombinator.com",
      postId: "424242",
    };

    await enhancer.lookupSelectedText(snapshot);

    const payload = lastChatPayload(enhancer);
    expect(Object.keys(payload).sort()).toEqual(
      ["maxTokens", "messages", "model", "protocol", "sessionId", "streaming", "url"].sort()
    );
    expect(payload.model).toBe(SETTINGS.model);
    expect(payload.url).toBe(SETTINGS.routerUrl);
    expect(payload.protocol).toBe("chat-completions");
    expect(payload.streaming).toBe(false);

    const userMessage = JSON.parse(payload.messages[1].content);
    expect(Object.keys(userMessage).sort()).toEqual(
      ["pageTitle", "selectedText", "sourceUrl", "surroundingText"].sort()
    );
    expect(userMessage.selectedText).toBe("word");
    expect(userMessage.surroundingText).toHaveLength(1600);
    expect(snapshot.context.startsWith(userMessage.surroundingText)).toBe(true);
    expect(userMessage.pageTitle).toHaveLength(500);
    expect(snapshot.postTitle.startsWith(userMessage.pageTitle)).toBe(true);
  });

  test("no image or attachment data is smuggled into the lookup request", async () => {
    const enhancer = createEnhancer();
    const snapshot = {
      ...SNAPSHOT,
      nearbyImages: [{ url: "https://example.com/a.jpg", ref: "I1" }],
    };

    await enhancer.lookupSelectedText(snapshot);

    const serialized = JSON.stringify(lastChatPayload(enhancer));
    expect(serialized).not.toMatch(/data:image/i);
    expect(serialized).not.toMatch(/\.jpe?g|\.png/i);
    expect(serialized).not.toMatch(/"images?"|imageUrl|image_url/);
  });

  test("uses the current router protocol and clamps maxTokens", async () => {
    const cases = [
      { maxTokens: 100000, expected: 8192 },
      { maxTokens: 8192, expected: 8192 },
      { maxTokens: 1234, expected: 1234 },
      { maxTokens: 1234.9, expected: 1234 },
      { maxTokens: 16, expected: 16 },
      { maxTokens: 15, expected: 16 },
      { maxTokens: 1, expected: 16 },
      { maxTokens: 0, expected: 8192 },
      { maxTokens: -5, expected: 8192 },
      { maxTokens: "not-a-number", expected: 8192 },
      { maxTokens: undefined, expected: 8192 },
    ];

    for (const { maxTokens, expected } of cases) {
      const enhancer = createEnhancer({ settings: { ...SETTINGS, maxTokens } });
      await enhancer.lookupSelectedText(SNAPSHOT);
      expect(lastChatPayload(enhancer).maxTokens).toBe(expected);
    }
  });

  test("honours the configured non-chat protocol", async () => {
    const enhancer = createEnhancer({ settings: { ...SETTINGS, protocol: "responses" } });
    await enhancer.lookupSelectedText(SNAPSHOT);
    expect(lastChatPayload(enhancer).protocol).toBe("responses");
  });

  test("lookup writes nothing to saved storage", async () => {
    const local = installChromeStorage();
    const enhancer = createEnhancer();
    enhancer.hnState = HNState;

    await enhancer.lookupSelectedText(SNAPSHOT);

    expect(local.set).not.toHaveBeenCalled();
    expect(local.data.savedComments).toBeUndefined();
  });

  test("a text-only snapshot still produces empty bounded fields", async () => {
    const enhancer = createEnhancer();

    await enhancer.lookupSelectedText({ text: "词" });

    const userMessage = JSON.parse(lastChatPayload(enhancer).messages[1].content);
    expect(userMessage).toEqual({
      selectedText: "词",
      surroundingText: "",
      pageTitle: "",
      sourceUrl: "",
    });
  });

  test("each lookup is an independent session", async () => {
    const enhancer = createEnhancer();
    await enhancer.lookupSelectedText(SNAPSHOT);
    await enhancer.lookupSelectedText({ ...SNAPSHOT, text: "b" });
    const calls = chatCalls(enhancer);
    expect(calls).toHaveLength(2);
    expect(calls[0][1].sessionId).not.toBe(calls[1][1].sessionId);
    expect(calls[0][1].sessionId).toMatch(/^selection-/);
  });

  test("strips thinking content from the model response", async () => {
    const enhancer = createEnhancer({ chatResponse: "  <think>internal notes</think>译文：文字  " });
    await expect(enhancer.lookupSelectedText(SNAPSHOT)).resolves.toBe("译文：文字");
    expect(MarkdownUtils.stripThinkingContent("<think>x</think>ok")).toBe("ok");
  });

  test("rejects empty and whitespace-only selections without calling the model", async () => {
    const enhancer = createEnhancer();
    await expect(enhancer.lookupSelectedText({ ...SNAPSHOT, text: "   " })).rejects.toThrow();
    await expect(enhancer.lookupSelectedText({ ...SNAPSHOT, text: "" })).rejects.toThrow();
    await expect(enhancer.lookupSelectedText({})).rejects.toThrow();
    await expect(enhancer.lookupSelectedText(undefined)).rejects.toThrow();
    expect(enhancer.apiClient.sendBackgroundMessage).not.toHaveBeenCalled();
  });

  test("rejects oversized selections but accepts the 12000-char boundary", async () => {
    const enhancer = createEnhancer();
    await expect(
      enhancer.lookupSelectedText({ ...SNAPSHOT, text: "x".repeat(12001) })
    ).rejects.toThrow(/12,000/);
    expect(enhancer.apiClient.sendBackgroundMessage).not.toHaveBeenCalled();

    await expect(
      enhancer.lookupSelectedText({ ...SNAPSHOT, text: "x".repeat(12000) })
    ).resolves.toBe("译文：测试");
  });

  test("rejects when model configuration is missing", async () => {
    const enhancer = createEnhancer({ settings: { ...SETTINGS, model: undefined } });
    await expect(enhancer.lookupSelectedText(SNAPSHOT)).rejects.toThrow(/Options/);
    expect(chatCalls(enhancer)).toHaveLength(0);
  });

  test("propagates settings and model request failures", async () => {
    const settingsFailure = createEnhancer({ settingsError: new Error("background unavailable") });
    await expect(settingsFailure.lookupSelectedText(SNAPSHOT)).rejects.toThrow("background unavailable");
    expect(chatCalls(settingsFailure)).toHaveLength(0);

    const requestFailure = createEnhancer({ chatError: new Error("model request failed") });
    await expect(requestFailure.lookupSelectedText(SNAPSHOT)).rejects.toThrow("model request failed");
  });

  test("rejects when the model returns no usable content", async () => {
    for (const chatResponse of ["", "   ", "No response content", "<think>only thinking</think>"]) {
      const enhancer = createEnhancer({ chatResponse });
      await expect(enhancer.lookupSelectedText(SNAPSHOT)).rejects.toThrow(/没有返回解读内容|请重试/);
    }
  });
});

describe("saveSelectedText", () => {
  test("saves a one-character selection with its source", async () => {
    const local = installChromeStorage();
    const enhancer = createEnhancer();
    enhancer.hnState = HNState;
    enhancer._showSaveToast = jest.fn();

    await expect(enhancer.saveSelectedText("  a  ")).resolves.toBe(true);

    const stored = Object.values(local.data.savedComments);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      type: "text",
      text: "a",
      pageUrl: "https://news.ycombinator.com/item?id=424242",
      permalink: "https://news.ycombinator.com/item?id=424242",
      postTitle: "Ask HN: A tiny post",
      siteKey: "example.com",
    });
    expect(enhancer.hubPanel.updateStats).toHaveBeenCalled();
    expect(enhancer._showSaveToast).toHaveBeenCalledTimes(1);
    expect(enhancer._showSaveToast.mock.calls[0][0]).toMatch(/已保存/);
  });

  test("snapshot source survives a page URL change while the popup is open", async () => {
    const local = installChromeStorage();
    const enhancer = createEnhancer();
    enhancer.hnState = HNState;
    enhancer._showSaveToast = jest.fn();

    installLocation("https://news.ycombinator.com/");
    await expect(enhancer.saveSelectedText(SNAPSHOT.text, SNAPSHOT)).resolves.toBe(true);

    const [entry] = Object.values(local.data.savedComments);
    expect(entry.pageUrl).toBe("https://news.ycombinator.com/item?id=424242");
    expect(entry.permalink).toBe("https://news.ycombinator.com/item?id=424242");
    expect(entry.postTitle).toBe("Ask HN: A tiny post");
    expect(entry.postId).toBe("424242");
    expect(entry.siteKey).toBe("news.ycombinator.com");
    // Snapshot stays untouched (rect/text are UI-only fields).
    expect(SNAPSHOT.rect).toEqual({ top: 10, left: 10, width: 40, height: 16 });
  });

  test("two snippets sharing the first 200 characters are stored separately", async () => {
    const local = installChromeStorage();
    const enhancer = createEnhancer();
    enhancer.hnState = HNState;
    enhancer._showSaveToast = jest.fn();

    const shared = "S".repeat(200);
    const first = `${shared}first-tail`;
    const second = `${shared}second-tail`;

    await expect(enhancer.saveSelectedText(first, SNAPSHOT)).resolves.toBe(true);
    await expect(enhancer.saveSelectedText(second, SNAPSHOT)).resolves.toBe(true);

    const entries = Object.values(local.data.savedComments);
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.text).sort()).toEqual([first, second].sort());
    expect(new Set(entries.map((entry) => entry.commentId)).size).toBe(2);
  });

  test("empty selection is rejected without touching storage or claiming success", async () => {
    const local = installChromeStorage();
    const enhancer = createEnhancer();
    enhancer.hnState = HNState;
    enhancer._showSaveToast = jest.fn();

    await expect(enhancer.saveSelectedText("   ")).resolves.toBe(false);
    await expect(enhancer.saveSelectedText(null)).resolves.toBe(false);
    expect(local.set).not.toHaveBeenCalled();
    expect(enhancer.hubPanel.updateStats).not.toHaveBeenCalled();
    expect(enhancer._showSaveToast).not.toHaveBeenCalled();
  });

  test("concurrent saves of different snippets keep both entries", async () => {
    const local = installChromeStorage();
    const enhancer = createEnhancer();
    enhancer.hnState = HNState;
    enhancer._showSaveToast = jest.fn();

    const [first, second] = await Promise.all([
      enhancer.saveSelectedText("alpha snippet", SNAPSHOT),
      enhancer.saveSelectedText("beta snippet", SNAPSHOT),
    ]);

    expect(first).toBe(true);
    expect(second).toBe(true);
    const stored = Object.values(local.data.savedComments);
    expect(stored.map((entry) => entry.text).sort()).toEqual(["alpha snippet", "beta snippet"]);
  });

  test("a save after a failed save still persists", async () => {
    const local = installChromeStorage();
    rejectStorage(local, { onSet: true });
    const enhancer = createEnhancer();
    enhancer.hnState = HNState;
    enhancer._showSaveToast = jest.fn();

    await expect(enhancer.saveSelectedText("first try", SNAPSHOT)).resolves.toBe(false);

    local.set.mockImplementation(async (obj) => {
      Object.assign(local.data, obj);
    });
    await expect(enhancer.saveSelectedText("second try", SNAPSHOT)).resolves.toBe(true);

    const stored = Object.values(local.data.savedComments);
    expect(stored.map((entry) => entry.text)).toEqual(["second try"]);
  });

  test("storage read failure reports failure instead of a false success", async () => {
    const local = installChromeStorage();
    rejectStorage(local, { onGet: true });
    const enhancer = createEnhancer();
    enhancer.hnState = HNState;
    enhancer._showSaveToast = jest.fn();

    await expect(enhancer.saveSelectedText("word", SNAPSHOT)).resolves.toBe(false);
    expect(local.set).not.toHaveBeenCalled();
    expect(enhancer.hubPanel.updateStats).not.toHaveBeenCalled();
    enhancer._showSaveToast.mock.calls.forEach(([message]) => {
      expect(message).not.toMatch(/已保存/);
    });
  });

  test("storage write failure reports failure and persists nothing", async () => {
    const local = installChromeStorage();
    rejectStorage(local, { onSet: true });
    const enhancer = createEnhancer();
    enhancer.hnState = HNState;
    enhancer._showSaveToast = jest.fn();

    await expect(enhancer.saveSelectedText("word", SNAPSHOT)).resolves.toBe(false);
    expect(local.set).toHaveBeenCalled();
    expect(local.data.savedComments).toBeUndefined();
    expect(enhancer.hubPanel.updateStats).not.toHaveBeenCalled();
    enhancer._showSaveToast.mock.calls.forEach(([message]) => {
      expect(message).not.toMatch(/已保存/);
    });
  });
});

describe("HNState long selection text", () => {
  const TYPE_TEXT = "text";
  const LONG_TEXT = "长".repeat(15000);

  test("text items above 10k characters round-trip unclipped", async () => {
    const local = installChromeStorage();
    const commentId = HNState.makeSaveId(TYPE_TEXT, "https://example.com/post", LONG_TEXT);

    await HNState.saveItem({
      commentId,
      type: TYPE_TEXT,
      siteKey: "example.com",
      text: LONG_TEXT,
      pageUrl: "https://example.com/post",
    });

    expect(local.data.savedComments[commentId].text).toHaveLength(15000);
    const saved = await HNState.getSavedComments();
    expect(saved.get(commentId).text).toBe(LONG_TEXT);
    expect(saved.get(commentId).text.length).toBe(LONG_TEXT.length);
  });

  test("non-text items keep the 10k cap", async () => {
    const local = installChromeStorage();
    const commentId = HNState.makeSaveId("comment", "12345");

    await HNState.saveItem({ commentId, type: "comment", text: LONG_TEXT });

    expect(local.data.savedComments[commentId].text).toHaveLength(HNState.SAVED_COMMENT_TEXT_MAX);
  });

  test("strict read failure propagates out of saveItem", async () => {
    const local = installChromeStorage();
    rejectStorage(local, { onGet: true });

    await expect(HNState.saveItem({ commentId: "text_x", type: TYPE_TEXT, text: "hi" }))
      .rejects.toThrow("storage read failed");
    expect(local.set).not.toHaveBeenCalled();
  });

  test("strict write failure propagates out of saveItem", async () => {
    const local = installChromeStorage();
    rejectStorage(local, { onSet: true });

    await expect(HNState.saveItem({ commentId: "text_y", type: TYPE_TEXT, text: "hi" }))
      .rejects.toThrow("storage write failed");
  });

  test("a rejected save does not poison the next save", async () => {
    const local = installChromeStorage();
    rejectStorage(local, { onGet: true });

    await expect(HNState.saveItem({ commentId: "text_z", type: TYPE_TEXT, text: "boom" }))
      .rejects.toThrow("storage read failed");

    local.get.mockImplementation(async (key) => ({ [key]: local.data[key] }));
    await expect(HNState.saveItem({ commentId: "text_z2", type: TYPE_TEXT, text: "recovered" }))
      .resolves.toBeInstanceOf(Map);
    expect(local.data.savedComments.text_z2.text).toBe("recovered");
  });

  test("concurrent saveItem calls serialize instead of overwriting", async () => {
    const local = installChromeStorage();
    const ids = ["text_c1", "text_c2", "text_c3"];

    const results = await Promise.all(
      ids.map((id, index) =>
        HNState.saveItem({ commentId: id, type: TYPE_TEXT, text: `snippet ${index}` })
      )
    );

    expect(Object.keys(local.data.savedComments).sort()).toEqual([...ids].sort());
    expect(Object.values(local.data.savedComments).map((entry) => entry.text).sort())
      .toEqual(["snippet 0", "snippet 1", "snippet 2"]);
    expect(results[2].size).toBe(3);
  });

  test("non-strict reads still degrade to an empty map", async () => {
    const local = installChromeStorage();
    rejectStorage(local, { onGet: true });

    const saved = await HNState.getSavedComments();
    expect(saved).toBeInstanceOf(Map);
    expect(saved.size).toBe(0);
  });
});

describe("dispose during an in-flight save", () => {
  test("a late save completion does not resurrect the toast after dispose", async () => {
    const enhancer = createEnhancer();
    let resolveSave;
    enhancer.hnState = {
      saveItem: jest.fn(() => new Promise((resolve) => { resolveSave = resolve; })),
      getSavedComments: jest.fn(async () => new Map()),
    };
    const createElement = jest.fn(() => ({ className: "", textContent: "", classList: { add() {}, remove() {} } }));
    global.document = {
      title: "Ask HN: A tiny post",
      querySelector: () => null,
      createElement,
      body: { appendChild: jest.fn() },
      querySelectorAll: () => [],
    };

    const pending = enhancer.saveSelectedText("word", SNAPSHOT);
    enhancer.dispose();
    resolveSave(new Map());

    await expect(pending).resolves.toBe(true);
    // Save itself succeeded, but no toast may be created after teardown.
    expect(createElement).not.toHaveBeenCalled();
    expect(enhancer._saveToastTimer).toBeUndefined();
  });

  test("dispose() flags the instance and clears its toast timer", async () => {
    const enhancer = createEnhancer();
    global.document = {
      title: "Ask HN: A tiny post",
      querySelector: () => null,
      createElement: jest.fn(() => ({ className: "", textContent: "", classList: { add() {}, remove() {} } })),
      body: { appendChild: jest.fn() },
      querySelectorAll: () => [],
    };

    enhancer.dispose();

    expect(enhancer._disposed).toBe(true);
    enhancer._showSaveToast("已保存原文和网页来源");
    expect(enhancer._saveToastTimer).toBeUndefined();
  });
});

describe("_getPageSaveContext", () => {
  test("uses adapter identity, page URL and trimmed title", async () => {
    const enhancer = createEnhancer();
    enhancer.adapter.getSiteKey.mockReturnValue("news.ycombinator.com");
    enhancer.adapter.getPostId.mockReturnValue("424242");

    expect(enhancer._getPageSaveContext()).toEqual({
      siteKey: "news.ycombinator.com",
      pageUrl: "https://news.ycombinator.com/item?id=424242",
      postTitle: "Ask HN: A tiny post",
      postId: "424242",
    });
  });

  test("falls back to hostname and URL when adapter/title are unavailable", async () => {
    installLocation("https://www.example.com/articles/one", "www.example.com");
    installDocumentTitle("");
    const enhancer = createEnhancer();
    enhancer.adapter = undefined;

    expect(enhancer._getPageSaveContext()).toEqual({
      siteKey: "example.com",
      pageUrl: "https://www.example.com/articles/one",
      postTitle: "https://www.example.com/articles/one",
      postId: null,
    });
  });

  test("a snapshot overrides the live page context for saving", async () => {
    const enhancer = createEnhancer();
    const snapshot = { pageUrl: "https://old.example.com/item?id=1", siteKey: "old.example.com", postTitle: "Old", postId: "1" };
    enhancer.hnState = { saveItem: jest.fn(async () => new Map()) };
    enhancer._showSaveToast = jest.fn();

    await enhancer.saveSelectedText("word", snapshot);

    expect(enhancer.hnState.saveItem).toHaveBeenCalledTimes(1);
    expect(enhancer.hnState.saveItem.mock.calls[0][0]).toMatchObject({
      pageUrl: "https://old.example.com/item?id=1",
      permalink: "https://old.example.com/item?id=1",
      siteKey: "old.example.com",
      postTitle: "Old",
      postId: "1",
      type: "text",
      text: "word",
    });
  });
});