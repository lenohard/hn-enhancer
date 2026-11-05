/**
 * Tests for src/config-sync.js — merge semantics plus an end-to-end two-device
 * sync against an in-memory WebDAV server and a chrome.storage mock.
 */

function createChromeMock(initial = {}) {
  const areas = {
    local: { ...(initial.local || {}) },
    sync: { ...(initial.sync || {}) },
  };

  const makeArea = (name) => ({
    async get(keys) {
      const data = areas[name];
      if (keys === undefined || keys === null) return { ...data };
      const list = Array.isArray(keys) ? keys : [keys];
      const result = {};
      list.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(data, key)) result[key] = data[key];
      });
      return result;
    },
    async set(items) {
      Object.assign(areas[name], items);
    },
    async remove(keys) {
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete areas[name][key]);
    },
    async clear() {
      Object.keys(areas[name]).forEach((key) => delete areas[name][key]);
    },
  });

  return {
    storage: { local: makeArea("local"), sync: makeArea("sync") },
    areas,
  };
}

function makeResponse(status, body = "") {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    async text() {
      return body;
    },
    async json() {
      return JSON.parse(body);
    },
  };
}

function createWebDAVServer() {
  const files = new Map();
  const requests = [];

  const fetchImpl = async (url, init = {}) => {
    const method = init.method || "GET";
    const path = new URL(url).pathname;
    requests.push(`${method} ${path}`);

    if (method === "MKCOL") return makeResponse(files.has(path) ? 405 : 201);
    if (method === "PUT") {
      files.set(path, String(init.body));
      return makeResponse(files.size === 1 ? 201 : 204);
    }
    if (method === "GET") {
      if (!files.has(path)) return makeResponse(404);
      return makeResponse(200, files.get(path));
    }
    if (method === "PROPFIND") {
      if (!files.has(path)) return makeResponse(404);
      const size = files.get(path).length;
      return makeResponse(
        207,
        `<D:multistatus><D:response><D:prop><D:getetag>"e${size}"</D:getetag>` +
          `<D:getcontentlength>${size}</D:getcontentlength></D:prop></D:response></D:multistatus>`
      );
    }
    return makeResponse(405);
  };

  return { files, requests, fetchImpl };
}

const BASE_CONFIG = {
  enabled: true,
  baseUrl: "http://127.0.0.1:5244/dav",
  username: "sync-user",
  password: "sync-pass",
  directory: "hn-enhancer",
  autoSync: true,
  periodMinutes: 10,
};

describe("ConfigSync merge helpers", () => {
  let internals;

  beforeAll(async () => {
    await import("../src/config-sync.js");
    internals = globalThis.HNConfigSync.__internals;
  });

  test("stableStringify ignores key order", () => {
    expect(internals.stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(
      internals.stableStringify({ a: [2, { c: 4, d: 3 }], b: 1 })
    );
  });

  test("maps union independent additions", () => {
    const conflicts = [];
    const merged = internals.mergeThreeWay(
      {},
      { alice: { id: 1 } },
      { bob: { id: 2 } },
      "authors",
      conflicts
    );
    expect(merged).toEqual({ alice: { id: 1 }, bob: { id: 2 } });
    expect(conflicts).toHaveLength(0);
  });

  test("a deletion on one side wins when the other side is unchanged", () => {
    const conflicts = [];
    const merged = internals.mergeThreeWay(
      { alice: { id: 1 }, bob: { id: 2 } },
      { bob: { id: 2 } },
      { alice: { id: 1 }, bob: { id: 2 } },
      "authors",
      conflicts
    );
    expect(merged).toEqual({ bob: { id: 2 } });
    expect(conflicts).toHaveLength(0);
  });

  test("nested objects merge per leaf instead of whole-value", () => {
    const conflicts = [];
    const merged = internals.mergeThreeWay(
      { "openai-router": { model: "a", apiKey: "k0" } },
      { "openai-router": { model: "b", apiKey: "k0" } },
      { "openai-router": { model: "a", apiKey: "k1" } },
      "settings",
      conflicts
    );
    expect(merged).toEqual({ "openai-router": { model: "b", apiKey: "k1" } });
    expect(conflicts).toHaveLength(0);
  });

  test("a genuine conflict keeps local and is reported", () => {
    const conflicts = [];
    const merged = internals.mergeThreeWay(
      { language: "en" },
      { language: "zh-CN" },
      { language: "en-GB" },
      "settings",
      conflicts
    );
    expect(merged).toEqual({ language: "zh-CN" });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].path).toBe("settings.language");
  });

  test("string arrays merge as sets and respect deletions", () => {
    const conflicts = [];
    const merged = internals.mergeThreeWay(
      ["a.com", "b.com"],
      ["a.com", "c.com"],
      ["a.com", "b.com", "d.com"],
      "domains",
      conflicts
    );
    expect(merged).toEqual(["a.com", "c.com", "d.com"]);
  });
});

describe("ConfigSync end-to-end", () => {
  let HNConfigSync;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    if (typeof globalThis.btoa === "undefined") {
      globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
    }
    await import("../src/config-sync.js");
    HNConfigSync = globalThis.HNConfigSync;
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
    delete globalThis.chrome;
  });

  function activateDevice(mock, server) {
    globalThis.chrome = { storage: mock.storage };
    globalThis.fetch = server.fetchImpl;
  }

  function device(initial = {}) {
    return createChromeMock({
      ...initial,
      local: { configSyncConfig: { ...BASE_CONFIG }, ...(initial.local || {}) },
    });
  }

  test("push, idempotent re-sync, and adoption on a fresh device", async () => {
    const server = createWebDAVServer();

    const deviceA = device({ sync: { settings: { language: "en" }, substackCustomDomains: ["a.com"] } });
    deviceA.areas.local.bookmarkedAuthors = { alice: { username: "alice", bookmarkedAt: 1 } };
    deviceA.areas.local.savedComments = { "42": { commentId: "42", type: "comment", text: "hi" } };

    activateDevice(deviceA, server);
    const first = await HNConfigSync.sync({ reason: "test" });
    expect(first.ok).toBe(true);
    expect(first.pushed).toBe(true);
    expect(first.rev).toBe(1);

    const remote = JSON.parse(server.files.get("/dav/hn-enhancer/hn-enhancer-sync.json"));
    expect(remote.sections.settings).toEqual({ language: "en" });
    expect(Object.keys(remote.sections.authors)).toEqual(["alice"]);

    const second = await HNConfigSync.sync({ reason: "test" });
    expect(second.ok).toBe(true);
    expect(second.pushed).toBe(false);
    expect(second.conflictCount).toBe(0);

    const deviceB = device();
    activateDevice(deviceB, server);
    const adopted = await HNConfigSync.sync({ reason: "test" });
    expect(adopted.ok).toBe(true);
    expect(adopted.appliedToLocal).toEqual(expect.arrayContaining(["settings", "domains", "authors", "comments"]));
    expect(deviceB.areas.sync.settings).toEqual({ language: "en" });
    expect(deviceB.areas.sync.substackCustomDomains).toEqual(["a.com"]);
    expect(deviceB.areas.local.bookmarkedAuthors).toEqual({ alice: { username: "alice", bookmarkedAt: 1 } });
    expect(deviceB.areas.local.savedComments).toEqual({ "42": { commentId: "42", type: "comment", text: "hi" } });
  });

  test("a deletion on one device propagates to the other", async () => {
    const server = createWebDAVServer();

    const deviceA = device({ sync: { settings: { language: "en" } } });
    deviceA.areas.local.bookmarkedAuthors = { alice: { username: "alice" } };
    activateDevice(deviceA, server);
    await HNConfigSync.sync({ reason: "test" });

    const deviceB = device();
    activateDevice(deviceB, server);
    await HNConfigSync.sync({ reason: "test" });
    expect(deviceB.areas.local.bookmarkedAuthors).toHaveProperty("alice");

    // A unsaves the author
    deviceA.areas.local.bookmarkedAuthors = {};
    activateDevice(deviceA, server);
    const pushDelete = await HNConfigSync.sync({ reason: "test" });
    expect(pushDelete.pushed).toBe(true);

    activateDevice(deviceB, server);
    const pulled = await HNConfigSync.sync({ reason: "test" });
    expect(pulled.appliedToLocal).toContain("authors");
    expect(deviceB.areas.local.bookmarkedAuthors).toEqual({});
  });

  test("sequential edits converge instead of ping-ponging", async () => {
    const server = createWebDAVServer();

    const deviceA = device({ sync: { settings: { language: "en" } } });
    activateDevice(deviceA, server);
    await HNConfigSync.sync({ reason: "test" });

    const deviceB = device();
    activateDevice(deviceB, server);
    await HNConfigSync.sync({ reason: "test" });

    deviceB.areas.sync.settings = { language: "zh-CN" };
    activateDevice(deviceB, server);
    const pushed = await HNConfigSync.sync({ reason: "test" });
    expect(pushed.pushed).toBe(true);

    activateDevice(deviceA, server);
    const pulled = await HNConfigSync.sync({ reason: "test" });
    expect(pulled.appliedToLocal).toContain("settings");
    expect(deviceA.areas.sync.settings).toEqual({ language: "zh-CN" });
    expect(pulled.conflictCount).toBe(0);
  });

  test("simultaneous edits report a conflict and both sides stay intact", async () => {
    const server = createWebDAVServer();

    const deviceA = device({ sync: { settings: { language: "en" } } });
    activateDevice(deviceA, server);
    await HNConfigSync.sync({ reason: "test" });

    const deviceB = device();
    activateDevice(deviceB, server);
    await HNConfigSync.sync({ reason: "test" });

    // Both devices edit the same field before either syncs again.
    deviceA.areas.sync.settings = { language: "en-GB" };
    deviceB.areas.sync.settings = { language: "zh-CN" };

    activateDevice(deviceA, server);
    const runA = await HNConfigSync.sync({ reason: "test" });
    expect(runA.pushed).toBe(true);

    activateDevice(deviceB, server);
    const runB = await HNConfigSync.sync({ reason: "test" });
    expect(runB.conflictCount).toBeGreaterThan(0);
    expect(runB.conflicts[0].path).toBe("settings.language");
    expect(deviceB.areas.sync.settings).toEqual({ language: "zh-CN" });

    // The other side converges on the next round instead of oscillating.
    activateDevice(deviceA, server);
    const converge = await HNConfigSync.sync({ reason: "test" });
    expect(deviceA.areas.sync.settings).toEqual({ language: "zh-CN" });
    expect(converge.pushed).toBe(false);
  });

  test("authentication failures surface as a readable error", async () => {
    const server = createWebDAVServer();
    server.fetchImpl = async () => makeResponse(401);

    const deviceA = device({ sync: { settings: { language: "en" } } });
    activateDevice(deviceA, server);

    const result = await HNConfigSync.sync({ reason: "test" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("认证失败");

    const state = deviceA.areas.local.configSyncState;
    expect(state.lastError).toContain("认证失败");
  });

  test("missing baseUrl skips the run", async () => {
    const deviceA = createChromeMock({
      local: { configSyncConfig: { ...BASE_CONFIG, baseUrl: "" } },
      sync: { settings: { language: "en" } },
    });
    activateDevice(deviceA, createWebDAVServer());
    const result = await HNConfigSync.sync({ reason: "test" });
    expect(result.skipped).toBe(true);
  });
});