(function() {
    console.log("初始化 HN Companion 扩展...");

    if (window.hnEnhancer) {
        console.log("HN Companion 已初始化，跳过重复加载");
        return;
    }

    let hubGuardObserver = null;

    async function loadCustomDomains() {
        try {
            const data = await chrome.storage.sync.get("substackCustomDomains");
            window.__HN_SUBSTACK_CUSTOM_DOMAINS = Array.isArray(data.substackCustomDomains)
                ? data.substackCustomDomains
                : [];
        } catch (error) {
            console.warn("[HN Companion] Could not load Substack custom domains:", error);
            window.__HN_SUBSTACK_CUSTOM_DOMAINS = [];
        }
    }

    function canResolveAdapter() {
        if (typeof AdapterRegistry === "undefined") {
            return false;
        }
        return !!AdapterRegistry.resolve(window.location.href);
    }

    function ensureHubMounted() {
        if (!window.hnEnhancer?.hubPanel) {
            return;
        }
        if (document.querySelector(".hn-hub-panel")) {
            return;
        }
        window.hnEnhancer.hubPanel.mount();
        console.log("[HN Companion] Re-mounted hub panel");
    }

    function startHubGuard() {
        if (hubGuardObserver) {
            return;
        }
        hubGuardObserver = new MutationObserver(() => {
            ensureHubMounted();
        });
        hubGuardObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
    }

    function initEnhancer() {
        if (window.hnEnhancer) {
            ensureHubMounted();
            return true;
        }
        if (typeof window.HNEnhancer === "undefined") {
            return false;
        }
        if (!canResolveAdapter()) {
            return false;
        }

        try {
            window.hnEnhancer = new window.HNEnhancer();
            console.log("HN Companion 扩展已成功加载");
            startHubGuard();
            return true;
        } catch (e) {
            console.error("初始化 HNEnhancer 时出错:", e);
            console.error("错误详情:", e.stack);
            return false;
        }
    }

    function watchForSpaNavigation() {
        let lastHref = location.href;
        const observer = new MutationObserver(async () => {
            if (location.href === lastHref) {
                return;
            }
            lastHref = location.href;
            await loadCustomDomains();
            if (!window.hnEnhancer) {
                initEnhancer();
            }
        });
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
    }

    async function bootstrap() {
        await loadCustomDomains();

        if (initEnhancer()) {
            return;
        }

        let attempts = 0;
        const maxAttempts = 50;
        const interval = setInterval(async function() {
            attempts += 1;
            await loadCustomDomains();
            if (initEnhancer()) {
                clearInterval(interval);
                return;
            }
            if (attempts >= maxAttempts) {
                clearInterval(interval);
                if (!window.hnEnhancer) {
                    if (canResolveAdapter()) {
                        console.error("[HN Companion] Adapter matched but init failed after retries");
                    } else {
                        console.log(
                            "[HN Companion] Waiting for supported page",
                            { href: location.href, domains: window.__HN_SUBSTACK_CUSTOM_DOMAINS }
                        );
                        watchForSpaNavigation();
                    }
                }
            }
        }, 200);
    }

    bootstrap();
})();

document.addEventListener("DOMContentLoaded", () => {
    if (document.querySelector('script[data-hn-page-script="true"]')) {
        return;
    }

    const pageScript = document.createElement("script");
    pageScript.src = chrome.runtime.getURL("src/page-script.js");
    pageScript.dataset.hnPageScript = "true";
    document.head.appendChild(pageScript);
});
