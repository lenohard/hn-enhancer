from pathlib import Path

path = Path("AGENTS.md")
text = path.read_text()
anchor = (
    "- `src/navigation.js`: `setCurrentComment` accepts a second parameter `scrollIntoView` "
    "(default `true`). The focus button calls this with `false` to avoid unnecessary "
    "scrolling when the user is already looking at the comment.\n"
)
update = (
    "\n### Root-Level Toggle Behaviour & Karma Fetch Throttling (2025-12-11)\n"
    "**Root toggle update**: The \"Toggle GC\" control now operates only on the immediate child comments of each root post. "
    "It determines the action (collapse vs expand) from the first child’s state and toggles the other first-level replies without "
    "touching deeper descendants, preventing unintended cascading collapses.\n"
    "- `src/hn-enhancer.js`: `toggleGrandchildrenForAllRoots()` flattens all root comments into their direct children and calls "
    "`_toggleComment` on each child individually, logging the chosen action for easier debugging.\n\n"
    "**Karma fetch throttling**: Author karma lookups stay within ~20 requests per page load and are heavily cached.\n"
    "- `src/hn-enhancer.js`: `buildKarmaStatistics()` limits scans to `KARMA_FETCH_SCAN_LIMIT = 20` root authors and spaces requests "
    "with `KARMA_FETCH_DELAY_MS = 2000` (≈40 seconds for the full batch).\n"
    "- `src/author-tracking.js`: `AuthorTracking.USER_INFO_CACHE_TTL_MS` is now 24 hours, so hover popups and karma stats reuse data "
    "across sessions; failures fall back after `HNEnhancer.KARMA_ERROR_CACHE_TTL_MS = 30000` ms.\n"
    "- Karma results are memoized per HN item id, keeping follow-up stats instant and avoiding duplicate background fetches.\n"
)
if anchor not in text:
    raise SystemExit("Anchor not found; AGENTS.md format may have changed")
path.write_text(text.replace(anchor, anchor + update))
