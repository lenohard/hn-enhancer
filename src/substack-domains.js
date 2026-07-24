/**
 * Substack custom-domain helpers (native *.substack.com + user-enabled domains).
 */
window.SubstackDomains = class SubstackDomains {
    static STORAGE_KEY = 'substackCustomDomains';

    static isSubstackPostPath(pathname) {
        return /^\/(p|post)\/[\w-]+(\/comments)?\/?$/.test(pathname || '');
    }

    static normalizeHostname(hostname) {
        return (hostname || '').replace(/^www\./i, '').toLowerCase();
    }

    static isNativeSubstackHost(hostname) {
        return /\.substack\.com$/i.test(this.normalizeHostname(hostname));
    }

    static isCustomDomainEnabled(hostname, customDomains) {
        const host = this.normalizeHostname(hostname);
        return (customDomains || []).some(
            (entry) => this.normalizeHostname(entry) === host
        );
    }

    static matchesSubstackUrl(url, customDomains = []) {
        try {
            const parsed = new URL(url);
            if (!this.isSubstackPostPath(parsed.pathname)) {
                return false;
            }
            const host = this.normalizeHostname(parsed.hostname);
            if (this.isNativeSubstackHost(host)) {
                return true;
            }
            return this.isCustomDomainEnabled(host, customDomains);
        } catch (_error) {
            return false;
        }
    }

    static async getCustomDomains() {
        try {
            const data = await chrome.storage.sync.get(this.STORAGE_KEY);
            const domains = data[this.STORAGE_KEY];
            return Array.isArray(domains) ? domains : [];
        } catch (error) {
            console.error('[SubstackDomains] Failed to load custom domains:', error);
            return [];
        }
    }

    static async saveCustomDomains(domains) {
        const normalized = [...new Set(
            (domains || []).map((entry) => this.normalizeHostname(entry)).filter(Boolean)
        )];
        await chrome.storage.sync.set({ [this.STORAGE_KEY]: normalized });
        return normalized;
    }

    static async addCustomDomain(hostname) {
        const host = this.normalizeHostname(hostname);
        if (!host || this.isNativeSubstackHost(host)) {
            return await this.getCustomDomains();
        }
        const domains = await this.getCustomDomains();
        if (!domains.includes(host)) {
            domains.push(host);
        }
        return await this.saveCustomDomains(domains);
    }

    static async removeCustomDomain(hostname) {
        const host = this.normalizeHostname(hostname);
        const domains = (await this.getCustomDomains()).filter(
            (entry) => this.normalizeHostname(entry) !== host
        );
        return await this.saveCustomDomains(domains);
    }

    /**
     * Heuristic detection for popup (runs in page context via executeScript).
     * @returns {object}
     */
    static detectPageSignals() {
        const pathnameOk = this.isSubstackPostPath(location.pathname);
        const hostname = this.normalizeHostname(location.hostname);
        const signals = [];

        const feedLink = document.querySelector(
            'link[rel="alternate"][type="application/rss+xml"], link[rel="alternate"][href*="substack.com/feed"]'
        );
        const substackFeed = feedLink?.href?.match(
            /https?:\/\/([\w-]+\.substack\.com)\/feed/i
        )?.[1] || null;
        if (substackFeed) {
            signals.push('rss');
        }

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
        if (/substack/i.test(metaGenerator)) {
            signals.push('meta');
        }

        const likelySubstack = pathnameOk && signals.length > 0;
        const isNative = this.isNativeSubstackHost(hostname);

        return {
            pathnameOk,
            hostname,
            isNative,
            signals,
            substackFeed,
            likelySubstack,
        };
    }
};
