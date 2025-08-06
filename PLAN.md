# Summarization Caching - Current Issue and Progress

## Issue Description
The current summarization caching implementation mixes summaries for entire posts with summaries for individual comment threads. This occurs because the `summarizeThread` function, intended for individual comment threads, was still using `getHNThread` which retrieves the entire post's content. As a result, the caching key generated (`postId` with a `null` `commentId` because `getCurrentCommentId` incorrectly determined it was a full post summary) was not unique for sub-thread summaries, leading to overwriting or incorrect retrieval.

## Problematic Code Location
- `src/summarization.js`: `summarizeThread` and `summarizeTextWithAI`
- `src/hn-state.js`: `getSummary` and `saveSummary` were functioning correctly but were provided with an ambiguous `commentId`.

## Progress Made
1.  **Initial Caching Implementation**: Implemented caching methods (`saveSummary`, `getSummary`, `clearSummary`, `clearAllSummariesForPost`, `getSummaryCacheStats`) in `src/hn-state.js`.
2.  **Integration into Summarization**: Integrated caching logic into `summarizeTextWithAI` in `src/summarization.js` to check cache before generating new summaries and save after generation.
3.  **Cross-Context Communication Fix**: Resolved the `TypeError: Cannot read properties of undefined (reading 'sync')` by migrating `getAIProviderModel` to use background script messaging, ensuring proper access to `chrome.storage.sync`.
4.  **UI for Cache Management**: Added cache statistics display and clear cache functionality to the options page (`src/options/options.html` and `src/options/options.js`).
5.  **Initial Attempt to Differentiate**: Identified that `summarizeThread` was not correctly extracting sub-thread content, leading to incorrect caching keys.

## Next Steps (after memory clear and restart)
1.  **Refine `summarizeThread`**: Modify `summarizeThread` in `src/summarization.js` to correctly extract only the target comment and its descendants using `DomUtils.getDescendantComments` and `formatCommentForLLM`.
2.  **Ensure Correct `commentId`**: Pass the actual `commentId` of the sub-thread's root comment to `HNState.saveSummary` and `HNState.getSummary` within `summarizeThread`. This will create distinct caching keys for sub-thread summaries.
3.  **Review `summarizeAllComments`**: Confirm that `summarizeAllComments` correctly uses a `null` `commentId` to represent a full post summary.
4.  **Thorough Testing**: Test both full post summaries and individual comment thread summaries to confirm they are cached and retrieved independently.
