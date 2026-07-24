// AdapterRegistry — resolves the correct SiteAdapter for a given URL.
//
// Usage:
//   const adapter = AdapterRegistry.resolve(location.href);
//   if (!adapter) { /* unsupported site — skipped */ }

class AdapterRegistryClass {
    constructor() {
        /** @type {SiteAdapter[]} */
        this.adapters = [];
    }

    /**
     * Register a site adapter.  Order matters — the first match wins.
     * @param {SiteAdapter} adapter
     */
    register(adapter) {
        this.adapters.push(adapter);
    }

    /**
     * Find the adapter whose `matches(url)` returns true.
     * @param {string} url
     * @returns {SiteAdapter|null}
     */
    resolve(url) {
        for (const adapter of this.adapters) {
            if (adapter.matches(url)) return adapter;
        }
        return null;
    }

    /**
     * Return all registered adapters (e.g. for the options page).
     * @returns {SiteAdapter[]}
     */
    list() {
        return [...this.adapters];
    }
}

// Singleton
window.AdapterRegistry = new AdapterRegistryClass();

// Register built-in adapters (order = priority: HN first, then Substack).
// The HnAdapter and SubstackAdapter are imported above; they register
// themselves via their constructors (or we can explicitly register here).
window.AdapterRegistry.register(new HnAdapter());
window.AdapterRegistry.register(new SubstackAdapter());
