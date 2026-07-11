from pathlib import Path

update = """\n### Root-Level Toggle Behaviour & Karma Fetch Throttling (2025-12-11)\n**Root toggle update**: The \"Toggle GC\" control now flips only the immediate child comments beneath each root. It inspects the first child to decide between collapse/expand and never touches deeper descendants, so root-level toggles no longer cascade unexpectedly.\n- `src/hn-enhancer.js`: `toggleGrandchildrenForAllRoots()` now flattens root comments into their direct children and calls `_toggleComment` on each child individually, logging the action for debugging.\n\n**Karma fetch throttling**: Author karma requests are capped at ~20 per page load and aggressively cached to stay gentle on Hacker News.\n- `src/hn-enhancer.js`: `buildKarmaStatistics()` scans at most `KARMA_FETCH_SCAN_LIMIT = 20` root authors and pauses `KARMA_FETCH_DELAY_MS = 2000` between uncached fetches (≈40 seconds worst case).\n- `src/author-tracking.js`: `AuthorTracking.USER_INFO_CACHE_TTL_MS` extends to 24 hours, while `HNEnhancer.KARMA_ERROR_CACHE_TTL_MS = 30000` ms softens retries after failures.\n- Karma stats are memoized per item id so refreshing the same thread reuses cached numbers without extra network traffic.\n"""

path = Path("AGENTS.md")
text = path.read_text()
if update.strip() in text:
    raise SystemExit("Update already present; skipping append")
path.write_text(text.rstrip() + "\n" + update.strip() + "\n")
