# Feature: Bookmarked Hacker News Authors

## Summary
- Provide a way to "favorite" an individual reply on Hacker News.
- Persist the reply metadata (permalink, author username/id, comment id) for later use.
- Highlight any replies authored by the bookmarked users on any Hacker News page.
- Surface the bookmarked users in the statistics panel with jump-to-comment links.

## Requirements & Scope
- Add a UI affordance on each comment (likely near the existing focus button) to bookmark the reply's author.
- When bookmarked, store: author username, canonical comment link, comment id, and the time it was bookmarked.
- Persist bookmarks via `chrome.storage.local` (through `HNState`) and expose retrieval/update utilities.
- On page init, highlight all comments whose author appears in the bookmarks list. Highlighting should reuse the existing styling system if possible (consider extending `.focus-node` / stats classes) or introduce a dedicated style token.
- Statistics panel gains a new "Bookmarked users" section that lists usernames. Clicking a username should scroll and focus the most relevant visible comment by that author on the current page.
- Consider deduplication: repeated clicks on bookmark should toggle/remove, or show a disabled state.
- Ensure bookmarks sync between tabs by reacting to storage changes (if feasible within scope).

## Open Questions
- Desired highlight style (color, icon, badge) for bookmarked replies?
- Should bookmarking toggle (click again to remove) or require management elsewhere?
- Do we need to track multiple comment permalinks per user, or only the original bookmarked reply?
- Should bookmarks sync via `chrome.storage.sync` or stay `local` only?

## Related Modules / Files to Review
- `src/dom-utils.js`: author extraction utilities and comment metadata helpers.
- `src/navigation.js`: focus logic and comment lookup for statistics navigation.
- `src/ui-components.js`: statistics panel construction and injection points.
- `src/hn-state.js`: persistence layer for summaries, chat history, etc.—extend for bookmarks.
- `src/hn-enhancer.js`: comment initialization and button injection hooks.
- `src/styles.css`: comment highlighting and button styling.

## Initial Implementation Plan
1. **State Layer**: Extend `HNState` with bookmark CRUD (save/remove/list) using `chrome.storage.local` and in-memory cache, plus `chrome.storage.onChanged` handling if needed.
2. **UI Hook**: Inject a bookmark button in `HNEnhancer` alongside the focus button; wire click handler to toggle bookmark for that comment's author.
3. **Highlighting**: During comment render/setup, check bookmarked author set and apply highlight class to matching comment nodes; keep UI reactive to storage updates.
4. **Statistics Section**: Update `UIComponents` (or relevant stats builder) to append a "Bookmarked users" section listing usernames with counts; clicking navigates via `Navigation.setCurrentComment` to the first matching comment in view.
5. **Persistence & Cleanup**: Handle removal/toggling, ensure duplicates are avoided, and provide feedback (tooltip/icon change) for bookmarked authors.
6. **Testing/Verification**: Manually verify bookmarking, highlighting, navigation from stats, and persistence across reloads.

## Risks & Considerations
- Need to ensure highlighting does not clash with existing focus/keyboard navigation styles.
- Storage read/write should be batched to avoid performance issues when many bookmarks exist.
- Navigation to bookmarked comments must handle cases where the author has no comment on the current page.

## Progress Log
- [ ] Requirements confirmation with user.
- [ ] Implementation.
- [ ] Manual verification across HN front page and comment threads.
- [ ] Documentation update in `PROD.md` and task closeout.

## Design Notes (2025-12-10)
- Storage model: `bookmarkedAuthors` persisted via `chrome.storage.local` through `HNState`, keyed by username with `commentId`, `permalink`, `bookmarkTimestamp` and last known `postId` for quick navigation.
- Comment metadata: retrieved from DOM via existing `DomUtils` helpers; permalink derived from `#<commentId>` anchored to current item id.
- UI affordance: add "bookmark" link adjacent to existing focus link in comment header navs. Text toggles to "unbookmark" when active.
- Highlighting: apply `.hn-bookmarked-comment` class to `.athing.comtr` rows authored by bookmarked users on page load and whenever bookmarks change. Class will add subtle background/indicator.
- Statistics: extend statistics builder to inject new stat item labelled "Bookmarked users" showing clickable list of usernames. Selecting a username finds first visible comment by that author and calls `Navigation.setCurrentComment(comment, true)` to scroll.
- Toggle behaviour: clicking bookmark again removes the author from bookmarks; per-author single bookmark suffices but we retain last bookmarked comment metadata.
- Sync behaviour: leverage storage change events to refresh highlights/panel when bookmarks added/removed from other tabs.
