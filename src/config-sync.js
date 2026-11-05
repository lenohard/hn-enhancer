/*
 * Cross-device config sync over WebDAV.
 *
 * Synced (user config only, never caches):
 *   - settings              (chrome.storage.sync)  AI provider / router / prompt preferences
 *   - substackCustomDomains (chrome.storage.sync)
 *   - bookmarkedAuthors     (chrome.storage.local)
 *   - savedComments         (chrome.storage.local) saved HN comments, quoted text, links, images
 *
 * Merge model: three-way merge against the last synced snapshot (configSyncState.base).
 * A device only adopts the remote value of a field when that field is unchanged since the
 * last sync, so a stale device can never silently drop newer work. Fields changed on both
 * sides keep the local value and land in `conflicts` (surfaced in the options page).
 *
 * The remote document is a plain JSON file, safe to inspect or hand-edit:
 *   { schema, rev, updatedAt, device, sections: { settings, domains, authors, comments } }
 *
 * Runtime: background service worker (network + storage writes) and options page
 * (config editing + status). Content scripts never call this module.
 */
(function (global) {
    "use strict";

    const DOC_SCHEMA = 1;
    const DOC_FILENAME = "hn-enhancer-sync.json";
    const CONFIG_KEY = "configSyncConfig";
    const STATE_KEY = "configSyncState";
    const REQUEST_TIMEOUT_MS = 20000;

    /** Every synced section, with the storage area and key it lives under. */
    const SECTIONS = {
        settings: { area: "sync", key: "settings" },
        domains: { area: "sync", key: "substackCustomDomains" },
        authors: { area: "local", key: "bookmarkedAuthors" },
        comments: { area: "local", key: "savedComments" },
    };

    const DEFAULT_CONFIG = {
        enabled: false,
        baseUrl: "",
        username: "",
        password: "",
        directory: "hn-enhancer",
        autoSync: true,
        periodMinutes: 10,
    };

    // ---------------------------------------------------------------- helpers

    function isPlainObject(value) {
        return !!value && typeof value === "object" && !Array.isArray(value);
    }

    /** JSON with sorted object keys, so equality is order-independent. */
    function stableStringify(value) {
        if (value === undefined) return "undefined";
        if (value === null || typeof value !== "object") return JSON.stringify(value);
        if (Array.isArray(value)) {
            return "[" + value.map(stableStringify).join(",") + "]";
        }
        const keys = Object.keys(value)
            .filter((key) => value[key] !== undefined)
            .sort();
        return (
            "{" +
            keys
                .map((key) => JSON.stringify(key) + ":" + stableStringify(value[key]))
                .join(",") +
            "}"
        );
    }

    function deepEqual(a, b) {
        return stableStringify(a) === stableStringify(b);
    }

    function mergeArrays(base, local, remote) {
        const keyOf = (item) => stableStringify(item);
        const baseKeys = new Set((base || []).map(keyOf));
        const localItems = new Map((local || []).map((item) => [keyOf(item), item]));
        const remoteItems = new Map((remote || []).map((item) => [keyOf(item), item]));
        const result = [];
        new Set([...localItems.keys(), ...remoteItems.keys()]).forEach((key) => {
            const inLocal = localItems.has(key);
            const inRemote = remoteItems.has(key);
            if (inLocal && inRemote) {
                result.push(localItems.get(key));
            } else if (inLocal && !baseKeys.has(key)) {
                result.push(localItems.get(key)); // added here only
            } else if (!inLocal && inRemote && !baseKeys.has(key)) {
                result.push(remoteItems.get(key)); // added elsewhere only
            }
            // present in base but gone on one side => deliberate deletion, drop it
        });
        return result;
    }

    /**
     * Three-way merge of one field.
     * @param {*} base last synced value
     * @param {*} local current local value
     * @param {*} remote current remote value
     * @param {string} path dotted path used in conflict reports
     * @param {Array<object>} conflicts collector
     */
    function mergeThreeWay(base, local, remote, path, conflicts) {
        if (deepEqual(local, remote)) return local;
        if (deepEqual(base, local)) return remote; // local untouched
        if (deepEqual(base, remote)) return local; // remote untouched locally newer

        if (isPlainObject(local) || isPlainObject(remote)) {
            if (!isPlainObject(local) || !isPlainObject(remote)) {
                conflicts.push({ path, local, remote });
                return local;
            }
            const baseObject = isPlainObject(base) ? base : {};
            const merged = {};
            const keys = new Set([
                ...Object.keys(baseObject),
                ...Object.keys(local),
                ...Object.keys(remote),
            ]);
            keys.forEach((key) => {
                const value = mergeThreeWay(
                    baseObject[key],
                    local[key],
                    remote[key],
                    path ? `${path}.${key}` : key,
                    conflicts
                );
                if (value !== undefined) merged[key] = value;
            });
            return merged;
        }

        if (Array.isArray(local) && Array.isArray(remote)) {
            return mergeArrays(Array.isArray(base) ? base : [], local, remote);
        }

        conflicts.push({ path, local, remote });
        return local;
    }

    /** UTF-8 safe Basic auth header value. */
    function basicAuthHeader(username, password) {
        const bytes = new TextEncoder().encode(`${username}:${password}`);
        let binary = "";
        bytes.forEach((byte) => {
            binary += String.fromCharCode(byte);
        });
        return `Basic ${btoa(binary)}`;
    }

    function guessDeviceLabel() {
        const nav = typeof navigator !== "undefined" ? navigator : {};
        const ua = nav.userAgent || "";
        let browser = "browser";
        const brands = (nav.userAgentData && nav.userAgentData.brands) || [];
        const brandNames = brands
            .map((brand) => brand.brand)
            .filter((name) => name && !/Not.?A.?Brand/i.test(name));
        const matchBrand = brandNames.find((name) => /Arc|Orion|Edge|Brave|Vivaldi|Opera|Chrome|Chromium/i.test(name));
        if (matchBrand) {
            browser = matchBrand;
        } else if (/Firefox\//i.test(ua)) {
            browser = "Firefox";
        } else if (/Arc\//i.test(ua)) {
            browser = "Arc";
        } else if (/Orion\//i.test(ua)) {
            browser = "Orion";
        } else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
            browser = "Safari";
        } else if (/Chrome\//i.test(ua)) {
            browser = "Chrome";
        }
        let platform = "unknown";
        const platformSource = (nav.userAgentData && nav.userAgentData.platform) || nav.platform || "";
        if (/mac/i.test(platformSource) || /Mac OS X/i.test(ua)) platform = "macOS";
        else if (/win/i.test(platformSource) || /Windows/i.test(ua)) platform = "Windows";
        else if (/android/i.test(platformSource) || /Android/i.test(ua)) platform = "Android";
        else if (/ios|iphone|ipad/i.test(platformSource) || /iPhone|iPad/i.test(ua)) platform = "iOS";
        else if (/linux/i.test(platformSource) || /Linux/i.test(ua)) platform = "Linux";
        return `${platform}/${browser}`;
    }

    /** Coerce a section value into the shape the merge expects (never undefined). */
    function normalizeSectionValue(name, value) {
        if (name === "settings") return value === undefined || value === null ? null : value;
        if (name === "domains") return Array.isArray(value) ? value : [];
        return isPlainObject(value) ? value : {};
    }

    function normalizeConfig(raw) {
        const config = { ...DEFAULT_CONFIG, ...(isPlainObject(raw) ? raw : {}) };
        config.baseUrl = String(config.baseUrl || "").trim().replace(/\/+$/, "");
        config.directory = String(config.directory || "")
            .trim()
            .replace(/^\/+|\/+$/g, "");
        config.username = String(config.username || "");
        config.password = String(config.password || "");
        config.enabled = Boolean(config.enabled);
        config.autoSync = config.autoSync !== false;
        const period = Number(config.periodMinutes);
        config.periodMinutes = Number.isFinite(period) && period >= 1 ? Math.round(period) : 10;
        return config;
    }

    // ---------------------------------------------------------------- backend

    /** WebDAV backend. Nothing here touches extension storage. */
    class WebDAVBackend {
        constructor(config) {
            this.config = config;
        }

        _url(relativePath = "") {
            const base = this.config.baseUrl;
            const parts = [this.config.directory, relativePath].filter(Boolean);
            const path = parts
                .join("/")
                .split("/")
                .filter(Boolean)
                .map((segment) => encodeURIComponent(segment))
                .join("/");
            return path ? `${base}/${path}` : `${base}/`;
        }

        _headers(extra = {}) {
            const headers = { ...extra };
            if (this.config.username || this.config.password) {
                headers.Authorization = basicAuthHeader(this.config.username, this.config.password);
            }
            return headers;
        }

        async _request(method, url, { headers = {}, body } = {}) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
            try {
                return await fetch(url, {
                    method,
                    headers: this._headers(headers),
                    body,
                    signal: controller.signal,
                    cache: "no-store",
                });
            } catch (error) {
                if (error && error.name === "AbortError") {
                    throw new Error(`WebDAV 请求超时（${REQUEST_TIMEOUT_MS}ms）：${method} ${url}`);
                }
                throw new Error(
                    `无法连接 WebDAV 服务器（${method} ${url}）：${error && error.message ? error.message : error}`
                );
            } finally {
                clearTimeout(timer);
            }
        }

        _assertAuth(response, url) {
            if (response.status === 401 || response.status === 403) {
                throw new Error(`WebDAV 认证失败（HTTP ${response.status}）：检查用户名/密码或该账号的目录权限。${url}`);
            }
        }

        async ensureDirectory() {
            if (!this.config.directory) return;
            const segments = this.config.directory.split("/").filter(Boolean);
            let current = "";
            for (const segment of segments) {
                current = current ? `${current}/${segment}` : segment;
                const collectionUrl = this._url(current);
                const response = await this._request("MKCOL", collectionUrl);
                this._assertAuth(response, collectionUrl);
                // 201 created, 405 already exists, 301/409 tolerated (parent created it)
                if (![201, 200, 204, 405, 301, 302, 409].includes(response.status)) {
                    throw new Error(`创建 WebDAV 目录失败（HTTP ${response.status}）：${collectionUrl}`);
                }
            }
        }

        /** @returns {Promise<{etag: string|null, size: number|null, lastModified: string|null}>} */
        async stat() {
            const url = this._url(DOC_FILENAME);
            const response = await this._request("PROPFIND", url, { headers: { Depth: "0" } });
            this._assertAuth(response, url);
            if (response.status === 404) return { exists: false, etag: null, size: null, lastModified: null };
            if (response.status !== 207) {
                throw new Error(`WebDAV PROPFIND 失败（HTTP ${response.status}）：${url}`);
            }
            const xml = await response.text();
            const readProp = (name) => {
                const match = xml.match(new RegExp(`<(?:[A-Za-z0-9]+:)?${name}>([^<]*)</`, "i"));
                return match ? match[1] : null;
            };
            const size = readProp("getcontentlength");
            return {
                exists: true,
                etag: readProp("getetag"),
                size: size === null ? null : Number(size),
                lastModified: readProp("getlastmodified"),
            };
        }

        /** @returns {Promise<{doc: object|null, etag: string|null}>} */
        async getDoc() {
            const url = this._url(DOC_FILENAME);
            const response = await this._request("GET", url);
            this._assertAuth(response, url);
            if (response.status === 404) return { doc: null, etag: null };
            if (!response.ok) {
                throw new Error(`读取远端同步文件失败（HTTP ${response.status}）：${url}`);
            }
            const text = await response.text();
            if (!text || !text.trim()) return { doc: null, etag: null };
            let doc;
            try {
                doc = JSON.parse(text);
            } catch (error) {
                throw new Error(`远端同步文件不是有效 JSON：${url}（${error.message}）`);
            }
            if (!isPlainObject(doc) || !isPlainObject(doc.sections)) {
                throw new Error(`远端同步文件结构不正确（缺少 sections）：${url}`);
            }
            if (Number(doc.schema) > DOC_SCHEMA) {
                throw new Error(`远端同步文件版本 ${doc.schema} 高于本扩展支持的 ${DOC_SCHEMA}，请升级扩展。`);
            }
            const etag = response.headers.get("ETag") || (await this.stat().catch(() => ({ etag: null }))).etag;
            return { doc, etag };
        }

        async putDoc(doc) {
            const url = this._url(DOC_FILENAME);
            const response = await this._request("PUT", url, {
                headers: { "Content-Type": "application/json; charset=utf-8" },
                body: JSON.stringify(doc, null, 2),
            });
            this._assertAuth(response, url);
            if (![200, 201, 204].includes(response.status)) {
                const detail = await response.text().catch(() => "");
                throw new Error(
                    `写入远端同步文件失败（HTTP ${response.status}）：${url}${detail ? ` — ${detail.slice(0, 200)}` : ""}`
                );
            }
            return true;
        }
    }

    // ---------------------------------------------------------------- storage

    async function readLocalSections() {
        const [syncArea, localArea] = await Promise.all([
            chrome.storage.sync.get([SECTIONS.settings.key, SECTIONS.domains.key]),
            chrome.storage.local.get([SECTIONS.authors.key, SECTIONS.comments.key]),
        ]);
        return {
            settings: syncArea[SECTIONS.settings.key] || null,
            domains: Array.isArray(syncArea[SECTIONS.domains.key]) ? syncArea[SECTIONS.domains.key] : [],
            authors: localArea[SECTIONS.authors.key] || {},
            comments: localArea[SECTIONS.comments.key] || {},
        };
    }

    async function writeSection(name, value) {
        const section = SECTIONS[name];
        if (!section) throw new Error(`未知的同步区段：${name}`);
        if (name === "settings" && (value === null || value === undefined)) return;
        const area = section.area === "sync" ? chrome.storage.sync : chrome.storage.local;
        await area.set({ [section.key]: value });
    }

    // ---------------------------------------------------------------- engine

    let inFlight = null;
    // While this module writes storage, change listeners must ignore its own events.
    // A timestamp (not a boolean) covers the async gap between set() resolving and
    // chrome.storage.onChanged firing.
    let applyingUntil = 0;

    class ConfigSync {
        static DOC_FILENAME = DOC_FILENAME;
        static CONFIG_KEY = CONFIG_KEY;
        static STATE_KEY = STATE_KEY;
        static SECTIONS = SECTIONS;
        static DEFAULT_CONFIG = DEFAULT_CONFIG;
        static isApplyingRemote() {
            return Date.now() < applyingUntil;
        }

        static async getConfig() {
            const data = await chrome.storage.local.get(CONFIG_KEY);
            return normalizeConfig(data[CONFIG_KEY]);
        }

        /** Patch the stored config; unset fields are preserved (so the password survives re-renders). */
        static async saveConfig(patch = {}) {
            const current = await this.getConfig();
            const next = normalizeConfig({ ...current, ...patch });
            await chrome.storage.local.set({ [CONFIG_KEY]: next });
            return next;
        }

        static async getState() {
            const data = await chrome.storage.local.get(STATE_KEY);
            return isPlainObject(data[STATE_KEY]) ? data[STATE_KEY] : {};
        }

        static async getStatus() {
            const [config, state] = await Promise.all([this.getConfig(), this.getState()]);
            return {
                config: {
                    ...config,
                    password: config.password ? "••••••" : "",
                    hasPassword: Boolean(config.password),
                },
                state: {
                    rev: Number(state.rev) || 0,
                    lastSyncAt: state.lastSyncAt || null,
                    lastReason: state.lastReason || null,
                    lastError: state.lastError || null,
                    conflicts: Array.isArray(state.conflicts) ? state.conflicts : [],
                },
            };
        }

        static async testConnection(configOverride) {
            const config = await this.getConfig();
            const merged = normalizeConfig({ ...config, ...(configOverride || {}) });
            if (!merged.baseUrl) throw new Error("请先填写 WebDAV 地址（例如 http://127.0.0.1:5244/dav）。");
            const backend = new WebDAVBackend(merged);
            await backend.ensureDirectory();
            const info = await backend.stat();
            return {
                ok: true,
                directory: merged.directory || "(根目录)",
                remoteDocExists: Boolean(info.exists),
                etag: info.etag,
                size: info.size,
                lastModified: info.lastModified,
            };
        }

        /** Bidirectional three-way sync. Safe to call concurrently: calls share one run. */
        static async sync({ reason = "manual" } = {}) {
            if (inFlight) return inFlight;
            inFlight = this._runSync(reason).finally(() => {
                inFlight = null;
            });
            return inFlight;
        }

        static async _runSync(reason) {
            const config = await this.getConfig();
            if (!config.baseUrl) {
                return { ok: false, skipped: true, error: "未配置 WebDAV 地址" };
            }
            const backend = new WebDAVBackend(config);
            const previous = await this.getState();

            try {
                const local = await readLocalSections();
                const { doc: remoteDoc } = await backend.getDoc();
                const rawRemoteSections = (remoteDoc && remoteDoc.sections) || {};
                const rawBase = isPlainObject(previous.base) ? previous.base : {};

                const conflicts = [];
                const merged = {};
                Object.keys(SECTIONS).forEach((name) => {
                    merged[name] = mergeThreeWay(
                        normalizeSectionValue(name, rawBase[name]),
                        normalizeSectionValue(name, local[name]),
                        normalizeSectionValue(name, rawRemoteSections[name]),
                        name,
                        conflicts
                    );
                });
                if (merged.settings === undefined) merged.settings = null;

                // 1) pull: write merged values back locally when they differ
                const appliedToLocal = [];
                for (const name of Object.keys(SECTIONS)) {
                    if (deepEqual(merged[name], local[name])) continue;
                    applyingUntil = Date.now() + 5000;
                    await writeSection(name, merged[name]);
                    appliedToLocal.push(name);
                }

                // 2) push: only when the merged document differs from what is on the server
                const changedSections = Object.keys(SECTIONS).filter(
                    (name) => !deepEqual(merged[name], normalizeSectionValue(name, rawRemoteSections[name]))
                );
                let pushed = false;
                let rev = Number(remoteDoc && remoteDoc.rev) || Number(previous.rev) || 0;
                if (changedSections.length > 0) {
                    const nextDoc = {
                        schema: DOC_SCHEMA,
                        rev: rev + 1,
                        updatedAt: new Date().toISOString(),
                        device: guessDeviceLabel(),
                        appliedBy: reason,
                        sections: {
                            settings: merged.settings,
                            domains: merged.domains || [],
                            authors: merged.authors || {},
                            comments: merged.comments || {},
                        },
                    };
                    await backend.ensureDirectory();
                    await backend.putDoc(nextDoc);
                    if (!remoteDoc) {
                        // First write: make sure we can read back what we just uploaded.
                        const verify = await backend.getDoc();
                        if (!verify.doc) throw new Error("写入后读取远端同步文件失败（服务器返回 404）");
                    }
                    pushed = true;
                    rev = nextDoc.rev;
                }

                const nextState = {
                    base: {
                        settings: merged.settings,
                        domains: merged.domains || [],
                        authors: merged.authors || {},
                        comments: merged.comments || {},
                    },
                    rev,
                    lastSyncAt: new Date().toISOString(),
                    lastReason: reason,
                    appliedToLocal,
                    pushed,
                    conflicts: conflicts.slice(0, 25),
                    conflictCount: conflicts.length,
                    lastError: null,
                };
                await chrome.storage.local.set({ [STATE_KEY]: nextState });
                return {
                    ok: true,
                    rev,
                    appliedToLocal,
                    pushed,
                    conflictCount: conflicts.length,
                    conflicts: conflicts.slice(0, 25),
                };
            } catch (error) {
                const message = (error && error.message) || String(error);
                await chrome.storage.local.set({
                    [STATE_KEY]: {
                        ...previous,
                        lastAttemptAt: new Date().toISOString(),
                        lastReason: reason,
                        lastError: message,
                    },
                });
                return { ok: false, error: message };
            }
        }

        /** Forget the merge baseline; the next sync re-merges everything as a union. */
        static async resetBaseline() {
            const state = await this.getState();
            await chrome.storage.local.set({ [STATE_KEY]: { ...state, base: {} } });
            return true;
        }
    }

    ConfigSync.__internals = { stableStringify, deepEqual, mergeThreeWay, mergeArrays };

    global.HNConfigSync = ConfigSync;
    if (typeof window !== "undefined") {
        window.HNConfigSync = ConfigSync;
    }
})(typeof globalThis !== "undefined" ? globalThis : this);