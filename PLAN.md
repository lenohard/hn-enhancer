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

**UI Improvements (2025-04-09):**
- **Statistics Panel UI Refinement:**
  - Made the statistics panel more compact with reduced padding and margins.
  - Changed layout to ensure each statistic occupies its own line for better readability.
  - Added subtle dividers between statistics items.
  - Optimized font sizes and spacing for a cleaner appearance.
  - Improved alignment of labels and values using flexbox layout.
  - Fixed vertical alignment issues between labels and values.
  - Ensured consistent display of statistics on the same line.

**Next Steps:**

- Build the extension using `pnpm run dev-build`.
- Test the feature thoroughly in the browser.

# Feature Plan: Chat with LLM about Comment

**Goal:** Allow users to initiate a chat session with an LLM focused on a specific Hacker News comment, automatically providing the context of the comment and its parent thread.

**Sub-tasks:**

1.  **UI Integration:**

    - **Action:** Add a "Chat" link to each comment's header metadata (`.comhead .navs`). (Placement corrected 2025-04-08)
    - **Interface:** Create a modal dialog for the chat interface. This keeps it separate from the main page and summary panel initially.
    - **Files:** `src/hn-enhancer.js` (for injecting the link), new `src/chat-modal.js` (for the modal UI and logic).

2.  **Context Gathering:**

    - **Action:** When the "Chat" button is clicked for a comment:
      - Identify the target comment element.
      - Traverse the DOM upwards to find all parent comment elements using indentation or existing parent links.
      - Extract the text content (author and comment body) for the target comment and all its parents.
    - **Files:** `src/dom-utils.js` (add or reuse functions for parent traversal and text extraction), `src/chat-modal.js` (to trigger context gathering).

3.  **LLM Interaction & Chat Logic:**

    - **LLM Choice:** Prioritize using Chrome's built-in AI (`window.ai`) if available (`HNEnhancer.isChomeAiAvailable`). Fallback to an external API via `ApiClient` if Chrome AI is not ready or if configured by the user (future enhancement).
    - **Prompting:** Construct an initial prompt containing the extracted parent context and the target comment. Example: "You are discussing a Hacker News comment thread. Here is the context:\n\nParent 1 (author):\n[Parent 1 text]\n\nParent 2 (author):\n[Parent 2 text]\n\nTarget Comment (author):\n[Target comment text]\n\nStart the discussion about the target comment."
    - **Chat Interface:** Implement the modal with:
      - A display area for the conversation history (user messages and LLM responses).
      - An input field for the user to type messages.
      - A "Send" button.
    - **Communication:** Handle sending the user's input (prepended with conversation history for context) to the LLM and displaying the streamed or complete response.
    - **Files:** `src/chat-modal.js`, `src/summarization.js` (if reusing Chrome AI logic), `src/api-client.js` (if using external API).

4.  **Integration:**

    - **Action:** In `src/hn-enhancer.js`, add event listeners to the new "Chat" buttons to instantiate and show the `ChatModal`, passing the target comment element.
    - **Files:** `src/hn-enhancer.js`, `src/chat-modal.js`.

5.  **Testing:**

    - Verify the "Chat" button appears correctly on all comments.
    - Test context gathering for comments at various depths.
    - Test chat functionality with Chrome AI (if available).
    - Test chat functionality with a placeholder or mock external API if Chrome AI is unavailable.
    - Test modal opening/closing and basic UI interactions.

**Debugging Chat Feature (2025-04-08):**

- **Issue 1:** "Chat" link was present but clicking it did nothing.
- **Investigation 1:** Checked `src/hn-enhancer.js`. Found the `injectChatLink` function had the code to open the modal (`this.openChatModal(...)`) commented out.
- **Fix 1:** Uncommented the relevant lines in the `click` event listener within `injectChatLink` in `src/hn-enhancer.js`.

- **Issue 2:** After fixing Issue 1, clicking "Chat" caused a console error: `TypeError: this.enhancer.markdownUtils.renderSimpleMarkdown is not a function` originating from `src/chat-modal.js`.
- **Investigation 2:**
  - Checked `src/chat-modal.js`: Confirmed the `_displayMessage` method was calling `renderSimpleMarkdown`.
  - Checked `src/markdown-utils.js`: Found the class `MarkdownUtils` provides a static method `convertMarkdownToHTML`, but no `renderSimpleMarkdown` method exists.
- **Fix 2:** Updated the call in `src/chat-modal.js` (`_displayMessage` method) to use the correct static method: `this.enhancer.markdownUtils.convertMarkdownToHTML(text)`.

- **Result:** Chat modal now opens and initial context rendering no longer throws a TypeError.

- **Task (2025-04-08):** Align Chat LLM usage with Summarization LLM usage.
- **Goal:** Ensure the chat feature uses the same AI provider/model selected in the extension settings.
- **Changes:**
  - **`src/chat-modal.js`:**
    - Modified `_gatherContextAndInitiateChat` to fetch AI provider/model settings using `summarization.getAIProviderModel`.
    - Added logic to check provider: if `chrome-ai`, attempt to use `window.ai`; otherwise, prepare to use background script.
    - Modified `_sendMessageToAI` to handle `chrome-ai` via `window.ai` or send a new `HN_CHAT_REQUEST` message to the background script for other providers.
  - **`src/summarization.js`:**
    - Updated `showConfigureAIMessage` to accept an optional `targetElement` parameter, allowing the message to be displayed directly in the chat modal if needed.
  - **`background.js`:**
    - Added a new message handler case for `HN_CHAT_REQUEST`.
    - Implemented `handleChatRequest` function to:
      - Fetch the API key from storage based on the provider.
      - Format the prompt into a basic message structure.
      - Call the appropriate existing API handler function (e.g., `handleOpenAIRequest`, `handleGeminiRequest`).
      - Extract and return the text response.
  - **`src/api-client.js`:**
    - Fixed `sendBackgroundMessage` logging by adding optional chaining (`?.`) when accessing `data.url` to prevent errors when the data object (like for chat) doesn't contain a URL.
- **Issue:** After applying the changes, attempting to use the chat feature with an external provider (e.g., Gemini) results in a console error: `No response from background message [object Object]`. This error originates from `api-client.js` when `chrome.runtime.sendMessage` doesn't receive a valid response from the background script for the `HN_CHAT_REQUEST`. Further investigation needed in `background.js`'s `handleChatRequest` or the specific API handlers it calls.

- **Debug Attempt (2025-04-08):**
  - Modified `handleChatRequest` in `background.js` to:
    - Return consistent response format with success/error status
    - Properly extract text content from all API responses
    - Add comprehensive error handling
  - **Result:** Error persists, indicating issue may be in message passing between `chat-modal.js` and `background.js` or response handling in `api-client.js`
  - **Next Steps:**
    - Check `api-client.js` message handling
    - Verify `chrome.runtime.sendMessage` implementation
    - Add debug logging to trace message flow

6.  **Refinement & Documentation:**
    - Improve UI/UX of the chat modal.
    - Add error handling (e.g., API errors, context gathering failures).
    - Consider adding features like copying chat history, clearing chat.
    - Document the new feature in `README.md` or help modal.
