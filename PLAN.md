# Feature Plan: Comment Statistics Display

**Goal:** Enhance the HN Enhancer extension to display useful statistics about the comment tree in Hacker News posts, shown separately from the summary panel.

**Statistics to Display:**

- Deepest node depth
- Node with most comments
- Longest comment

**Sub-tasks:**

1.  **Project Codebase Analysis:** (Completed)

    - Explored the codebase to understand how comments are fetched, processed, and rendered.
    - Identified relevant files: `src/summary-panel.js`, `src/dom-utils.js`, `src/summarization.js`, `src/ui-components.js`, `src/hn-enhancer.js`.

2.  **Data Extraction and Calculation:** (Completed)

    - Implemented logic in `src/dom-utils.js` (`calculateCommentStatistics` function) to traverse the comment DOM tree and calculate the required statistics.
    - Added `getUpvoteCount` function to `src/dom-utils.js`.

3.  **UI Display Implementation:** (Completed)

    - **Location:** Display statistics in a dedicated panel (`.hn-statistics-panel`) above the main comment tree.
    - **Structure:** Used a table format within the new panel.
    - **Modification:**
      - Added `createStatisticsPanel` method to `src/ui-components.js` to generate the panel's HTML.
      - Removed statistics-related HTML and logic from `src/summary-panel.js`.

4.  **Integration and Testing:** (Completed - Integration Done)

    - Integrated the statistics calculation and UI display into the HN Enhancer extension's main flow.
    - **Modification:**
      - Updated `src/hn-enhancer.js`:
        - Created an instance of the statistics panel in the constructor.
        - Added `updateStatisticsPanel` method to populate the panel.
        - In `initCommentsPageNavigation`, appended the panel to the DOM and called `calculateCommentStatistics` and `updateStatisticsPanel`.
      - Updated `src/summarization.js`:
        - Removed the call to `calculateCommentStatistics()` and passing of `statistics` data in `showSummaryInPanel()`.
    - **Next:** Test the feature thoroughly.

5.  **Documentation and Refinement:** (Pending)
    - Document the implemented feature and its functionality.
    - Refine the code and UI based on testing and feedback.
      - Improved statistics panel styling (background colors, margins, padding, shadow).
    - Consider potential future enhancements.

**Completed Modifications:**

- **`src/summary-panel.js`**: Removed UI structure and logic for statistics display.
- **`src/dom-utils.js`**: Implemented `calculateCommentStatistics` and `getUpvoteCount`. (Refactored during debugging - see below)
- **`src/summarization.js`**: Removed statistics calculation integration from the summary display flow in `showSummaryInPanel`.
- **`src/ui-components.js`**: Added `createStatisticsPanel` method to generate the statistics UI.
- **`src/hn-enhancer.js`**: Integrated the creation, DOM insertion, calculation, and population of the new statistics panel. (Updated during debugging - see below)

**Debugging Statistics Feature (2025-04-07):**

- **Issue:** Statistics panel displayed "N/A" for all values.
- **Investigation:**
  - Checked `src/hn-enhancer.js`: Integration logic appeared correct.
  - Examined `src/dom-utils.js`: Found `calculateCommentStatistics` had issues:
    - Incorrectly identified comment hierarchy (didn't use indentation).
    - Didn't return the actual count/length values needed for display.
- **Fixes:**
  - **`src/dom-utils.js`:** Rewrote `calculateCommentStatistics` to:
    - Correctly identify all comment rows (`tr.athing.comtr`).
    - Calculate depth using indentation (`.ind img` width).
    - Build a tree structure based on depth to find parent/child relationships.
    - Calculate the total number of descendants for each comment.
    - Return a comprehensive object containing actual values (depth, counts, length) and corresponding links.
  - **`src/hn-enhancer.js`:** Updated `updateStatisticsPanel` to:
    - Correctly parse the new statistics object structure.
    - Display the counts/lengths alongside the links in the panel.
- **Result:** Statistics calculation and display logic corrected.

**Next Steps:**

- Build the extension using `pnpm run dev-build`.
- Test the feature thoroughly in the browser.
