const titleEl = document.getElementById('title');
const messageEl = document.getElementById('message');
const metaEl = document.getElementById('meta');
const enableBtn = document.getElementById('enable-btn');
const optionsBtn = document.getElementById('options-btn');

function showMeta(text) {
    metaEl.textContent = text;
    metaEl.classList.remove('hidden');
}

function hideActions() {
    enableBtn.classList.add('hidden');
    optionsBtn.classList.add('hidden');
}

async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
}

async function sendBackgroundMessage(type, data) {
    const response = await chrome.runtime.sendMessage({ type, data });
    if (!response?.success) {
        throw new Error(response?.error || 'Request failed');
    }
    return response.data;
}

/** Reload tab, then inject scripts after load (inject-before-reload is wiped by reload). */
function reloadTabAndInject(tabId) {
    return new Promise((resolve, reject) => {
        if (!tabId) {
            reject(new Error('No tab to reload'));
            return;
        }

        const timeoutMs = 30000;
        const timeoutId = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            reject(new Error('Page reload timed out'));
        }, timeoutMs);

        function onUpdated(updatedTabId, changeInfo) {
            if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
                return;
            }
            chrome.tabs.onUpdated.removeListener(onUpdated);
            clearTimeout(timeoutId);
            sendBackgroundMessage('INJECT_ENHANCER_TAB', { tabId })
                .then(resolve)
                .catch(reject);
        }

        chrome.tabs.onUpdated.addListener(onUpdated);
        chrome.tabs.reload(tabId);
    });
}

async function detectSubstack(tab) {
    if (!tab?.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
        return null;
    }

    try {
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const pathnameOk = /^\/(p|post)\/[\w-]+(\/comments)?\/?$/.test(location.pathname);
                const hostname = location.hostname.replace(/^www\./i, '').toLowerCase();
                const signals = [];

                const feedLink = document.querySelector(
                    'link[rel="alternate"][type="application/rss+xml"], link[rel="alternate"][href*="substack.com/feed"]'
                );
                const substackFeed = feedLink?.href?.match(
                    /https?:\/\/([\w-]+\.substack\.com)\/feed/i
                )?.[1] || null;
                if (substackFeed) signals.push('rss');

                if (
                    document.querySelector('[href*="substackcdn.com"], [src*="substackcdn.com"]') ||
                    document.querySelector('script[src*="substack.com"], link[href*="substackcdn.com"]')
                ) {
                    signals.push('cdn');
                }

                if (
                    document.querySelector('.body.markup, .available-content, .post-header, .comment-anchor')
                ) {
                    signals.push('dom');
                }

                const metaGenerator = document.querySelector('meta[name="generator"]')?.content || '';
                if (/substack/i.test(metaGenerator)) signals.push('meta');

                return {
                    pathnameOk,
                    hostname,
                    isNative: /\.substack\.com$/i.test(hostname),
                    signals,
                    substackFeed,
                    likelySubstack: pathnameOk && signals.length > 0,
                };
            },
        });
        return result;
    } catch (error) {
        console.error('[popup] detect failed:', error);
        return null;
    }
}

async function initPopup() {
    hideActions();
    optionsBtn.classList.remove('hidden');
    optionsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    const tab = await getActiveTab();
    if (!tab?.url) {
        messageEl.textContent = 'No active tab to inspect.';
        return;
    }

    let url;
    try {
        url = new URL(tab.url);
    } catch (_error) {
        messageEl.textContent = 'This page cannot be enhanced.';
        return;
    }

    const detection = await detectSubstack(tab);
    if (!detection) {
        messageEl.textContent = 'Could not inspect this page. Try reloading the tab.';
        showMeta(url.hostname);
        return;
    }

    const { hostname, isNative, likelySubstack, substackFeed, pathnameOk } = detection;
    const status = await sendBackgroundMessage('GET_SUBSTACK_DOMAIN_STATUS', { hostname });
    const enabled = !!status?.enabled;
    const domains = status?.domains || [];

    if (isNative) {
        titleEl.textContent = 'Substack (native)';
        messageEl.innerHTML = pathnameOk
            ? '<span class="status-ok">This *.substack.com post is already supported.</span>'
            : 'Open a post page (<code>/p/slug</code>) to use Summary and comments.';
        showMeta(hostname);
        return;
    }

    if (!likelySubstack) {
        titleEl.textContent = 'Not detected';
        messageEl.textContent = pathnameOk
            ? 'On a post URL, but no Substack signals found (RSS, CDN, layout).'
            : 'Navigate to a Substack post page, then open this popup again.';
        showMeta(hostname);
        return;
    }

    titleEl.textContent = 'Substack custom domain';
    const feedHint = substackFeed ? `Linked publication: ${substackFeed}` : '';
    showMeta([hostname, feedHint].filter(Boolean).join(' · '));

    if (enabled) {
        messageEl.innerHTML = '<span class="status-ok">Enhancer is enabled on this site.</span>';
        if (pathnameOk) {
            enableBtn.textContent = 'Inject / reload';
            enableBtn.classList.remove('hidden');
            enableBtn.addEventListener('click', async () => {
                enableBtn.disabled = true;
                try {
                    messageEl.innerHTML = '<span class="status-ok">Reloading and injecting…</span>';
                    await reloadTabAndInject(tab.id);
                    messageEl.innerHTML = '<span class="status-ok">Injected. Hub panel should appear on the post page.</span>';
                } catch (error) {
                    messageEl.textContent = `Failed: ${error.message}`;
                } finally {
                    enableBtn.disabled = false;
                }
            });
        } else {
            messageEl.innerHTML += ' Open a post page (<code>/p/slug</code>) to use Summary.';
        }
        return;
    }

    messageEl.innerHTML = '<span class="status-warn">Substack detected on a custom domain.</span> Enable to inject Summary, comments, and navigation.';
    enableBtn.classList.remove('hidden');
    enableBtn.addEventListener('click', async () => {
        enableBtn.disabled = true;
        enableBtn.textContent = 'Enabling…';
        try {
            await sendBackgroundMessage('ENABLE_SUBSTACK_DOMAIN', { hostname });
            messageEl.innerHTML = '<span class="status-ok">Enabled. Reloading and injecting…</span>';
            await reloadTabAndInject(tab.id);
        } catch (error) {
            enableBtn.disabled = false;
            enableBtn.textContent = 'Enable on this site';
            messageEl.textContent = `Failed: ${error.message}`;
        }
    });

    if (domains.length > 0) {
        showMeta(`${hostname} · ${domains.length} custom site(s) enabled`);
    }
}

initPopup();
