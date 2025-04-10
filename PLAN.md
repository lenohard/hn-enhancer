*This is a markdown file for planning and documenting the development of new features for the HN Enhancer extension. 
It includes details about the feature goals, tasks, modifications, debugging, and next steps, etc.
After each fix or implementation or research, the changes and info are documented in the file.*

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
- **Deepest Comments Logic Update (2025-04-09):** Modified `calculateCommentStatistics` in `src/dom-utils.js` to consider only *leaf nodes* (comments with no replies) when determining the top 5 deepest comments, sorting them by depth. (Refactored for clarity in commit `966a581`).

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

* Related Components  
 • src/hn-enhancer.js
    • injectChatLink(): 注入 "Chat" 链接并添加事件监听器。
    • openChatModal(): 实现打开聊天模态框的逻辑。
 • src/chat-modal.js (需要添加此文件到聊天中)
    • ChatModal 类: 实现聊天 UI 和核心逻辑。
    • _gatherContextAndInitiateChat(): 获取评论上下文并开始聊天。
    • _sendMessageToAI(): 将消息发送给 AI 提供者。
    • _displayMessage(): 显示聊天消息 (需要修复 Markdown 渲染调用)。
 • src/styles.css
    • 添加聊天模态框和链接的 CSS 规则 (例如 .hn-enhancer-modal, .chat-modal-content, .hn-chat-link)。
 • src/api-client.js
    • sendBackgroundMessage(): 确保能正确处理发送到 background 脚本的聊天请求消息。
 • src/summarization.js
    • showConfigureAIMessage(): 修改以支持在聊天模态框中显示配置消息。
    • getAIProviderModel(): 可能被 ChatModal 用来获取当前 AI 设置。
 • background.js
    • onMessage 监听器: 添加处理 HN_CHAT_REQUEST 消息类型的 case。
    • handleChatRequest(): 添加此新函数来处理聊天请求，调用相应的 LLM API 处理器。
 • src/dom-utils.js
    • getCommentContext(): 需要实现或完善此函数以获取目标评论及其父评论的文本内容。


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

    - **LLM Choice:** Use the LLM Provider selected in the extension settings for summarization
    - **Prompting:** Construct an initial prompt containing the extracted parent context and the target comment. Example: "You are discussing a Hacker News comment thread. Here is the context:\n\nParent 1 (author):\n[Parent 1 text]\n\nParent 2 (author):\n[Parent 2 text]\n\nTarget Comment (author):\n[Target comment text]\n\nStart the discussion about the target comment."
    - **Chat Interface:** Implement the modal with:
      - A display area for the conversation history (user messages and LLM responses).
      - An input field for the user to type messages.
      - A "Send" button.
    - **Communication:** Handle sending the user's input (prepended with conversation history for context) to the LLM and displaying the streamed or complete response.
    - **Files:** `src/chat-modal.js`, `src/summarization.js` , `src/api-client.js` .


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

- **Debugging Chat (Gemini Provider - 2025-04-09):**
  - **Issue 1 (Commit `9480d63`):** Clicking "Send" had no effect. Console was empty initially.
  - **Investigation 1:** Added logging to `_handleSendMessage` and `_sendMessageToAI` in `chat-modal.js`. Found that the message payload for non-Chrome AI providers was incorrect (missing `messages` array expected by `background.js`).
  - **Fix 1:**
    - Modified `_sendMessageToAI` to construct the `messages` array including context and user input.
    - Added logging before sending the message.
    - Adjusted `api-client.js` `sendBackgroundMessage` to match the new call signature.
  - **Issue 2 (Commit `c9d76b6`):** Found a duplicate `catch` block in `_sendMessageToAI` in `chat-modal.js`.
  - **Fix 2:** Removed the redundant `catch` block.
  - **Issue 3 (Commit `373dd59`):** Console error `TypeError: markdown.replace is not a function` in `_displayMessage` and `ReferenceError: response is not defined` in `_sendMessageToAI`'s `catch` block.
  - **Investigation 3:** `background.js` `handleChatRequest` was returning `{ success: true, data: responseText }`, which `api-client.js` passed as an object to `_displayMessage`. The `catch` block error was due to accessing `response` outside its scope.
  - **Fix 3:**
    - Modified `handleChatRequest` in `background.js` to return the raw text string directly on success and re-throw errors.
    - Removed the faulty `if (response ...)` block from the `catch` in `_sendMessageToAI`.
  - **Issue 4 (Commit `43e3ba3`):** Still getting `TypeError: markdown.replace is not a function`.
  - **Investigation 4:** The `onMessage` listener for `HN_CHAT_REQUEST` in `background.js` was incorrectly wrapping the string result from `handleChatRequest` into `{ success: false, error: undefined }` before `handleAsyncMessage` wrapped it again. `api-client.js` was also trying to add a `duration` property to the string response.
  - **Fix 4:**
    - Corrected the `HN_CHAT_REQUEST` handler in `background.js`'s `onMessage` listener to directly return the result of `handleChatRequest`.
    - Modified `api-client.js` `sendBackgroundMessage` to log duration separately and not attempt to modify the potentially non-object `response.data`.
  - **Result:** Chat functionality with Gemini provider is now working correctly. Messages are sent, responses are received and displayed without type errors.

# Feature Plan: Chat Context Switching

**Goal:** Allow users to switch the context provided to the LLM within the chat modal. Currently, it uses the target comment and its parents. Add options to use the target comment and its descendants, or the target comment and its direct children.

**Sub-tasks:**

1.  **UI Implementation (chat-modal.js, styles.css):** (Completed 2025-04-10)
    - Added radio buttons for context selection ("Parents", "Descendants", "Children") below the header in the chat modal.
    - Added CSS styles for the context selector container and radio buttons.
2.  **Context Gathering Logic (dom-utils.js):**
    - Implement `getDescendantComments(targetCommentElement)`: Traverse DOM *downwards* from the target comment, collecting all comments with greater indentation until indentation returns to the target's level or less. Handle nested structures correctly.
    - Move/Refactor `_getDirectChildComments` from `hn-enhancer.js` to `dom-utils.js` as `getDirectChildComments(targetCommentElement)` and ensure it works correctly.
3.  **Chat Modal Logic Update (chat-modal.js):**
    - Add state variable `currentContextType` (default: 'parents').
    - Modify `_gatherContextAndInitiateChat` to:
        - Accept `contextType` parameter.
        - Call the appropriate `dom-utils` function (`getCommentContext`, `getDescendantComments`, `getDirectChildComments`) based on `contextType`.
        - Format the gathered comments into the initial `conversationHistory` (system prompt).
        - Update the initial "Context loaded..." message to reflect the type and count.
    - Add event listeners to the context switching UI elements.
    - Implement a `_switchContext(newContextType)` method:
        - Update `currentContextType`.
        - Clear conversation area and `conversationHistory`.
        - Call `_gatherContextAndInitiateChat` with the `newContextType`.
        - Disable input while context is loading.
4.  **Prompting Update (chat-modal.js):** (Completed 2025-04-10)
    - Modified the system prompt generation in `_gatherContextAndInitiateChat` to clearly state the context type being provided.
    - Updated the "Context loaded..." message.
5.  **Testing:** (Next Step)
    - Test opening the chat modal (defaults to "Parents" context).
    - Test switching to "Descendants" context for comments with varying levels of replies.
    - Test switching to "Direct Children" context.
    - Test switching back and forth between context types.
    - Verify the correct comments are included in the initial system prompt for each type.
    - Verify chat functionality works correctly after switching context.

**Next Steps:**

- Implement UI elements for context switching in `chat-modal.js` and `styles.css`.

- **Debugging Parent Comment Traversal (Commits `a33a691`, `4a26318`, `5df120a`):**
  - **Issue:** The `getCommentContext` function in `src/dom-utils.js` failed to find parent comments, logging "No parent link found..." even when the link was visible.
  - **Investigation:**
    - Added debug logs to trace the execution flow and inspect the `currentElement`'s HTML.
    - Confirmed the parent link existed in the HTML (`<a href="#12345" class="clicky">parent</a>`) but lacked the `hnl` class expected by the original selector (`a.hnl[href*="parent"]`).
  - **Fix:**
    - Modified `getCommentContext` in `src/dom-utils.js` to:
      - Search within the `.comhead .navs` span for an `<a>` tag whose `textContent` is exactly "parent".
      - Updated the regular expression to extract the parent ID from the `href="#<ID>"` format.
  - **Result:** Parent comment traversal now correctly identifies and follows the parent links in the DOM.

- **System Prompt & Message Structure Update (Commit `78edb42`):**
  - **Goal:** Standardize the prompt sent to the LLM and improve logging.
  - **Changes:**
    - **`src/chat-modal.js`:**
      - Modified `_sendMessageToAI` to construct a new message structure:
        - A fixed introductory system prompt string is defined.
        - The comment context (parents + target) is formatted into a single string with clear separators.
        - Two messages with `role: 'user'` are created:
          1.  The fixed prompt combined with the formatted context string.
          2.  The user's actual input message.
      - Added logging to show the constructed `messages` array before sending it to the background script.
    - **`background.js`:**
      - Updated `handleChatRequest` to log the received `messages` array.
      - Modified the calls to `handleGeminiRequest` and `handleChromeAIRequest` to combine the content of the two incoming 'user' messages into a single string suitable for their respective APIs.
      - Updated `handleAnthropicRequest` to pass the `messages` array directly without special 'system' role extraction.
      - Added detailed logging within each API handler (`handleOpenAIRequest`, `handleGeminiRequest`, etc.) to show the exact payload being sent to the external LLM API just before the `fetch` call.
  - **Result:** The structure of the prompt sent to the LLM is now consistent, using a predefined instruction and formatted context. Debugging is easier due to added logging of message structures and API payloads.

- **Conversation History & API Formatting Fix (Commit `b504f4c`, `ec0d608`, `e1fed3d`):**
  - **Issue:** Multi-turn conversations were losing context, and the payload sent to different LLM APIs (especially Gemini) was incorrect (e.g., merging system prompt with the first user message).
  - **Investigation:**
    - Confirmed `chat-modal.js` wasn't maintaining a persistent `conversationHistory` array.
    - Found `background.js` wasn't correctly adapting the history format for each provider.
    - Specifically, the Gemini handler was merging the system prompt into the first user message instead of using the `systemInstruction` field.
  - **Fix:**
    - **`src/chat-modal.js`:** Implemented `conversationHistory` array to store messages (`{ role, content }`). Modified `_handleSendMessage` and `_sendMessageToAI` to manage and pass this history. Added logic to store assistant responses in the history.
    - **`background.js`:**
      - Updated `handleChatRequest` to receive the full `conversationHistory`.
      - Modified `handleGeminiRequest` to:
        - Process the full history, mapping roles (`assistant` -> `model`) and merging consecutive messages of the same role.
        - Extract the `system` message content.
        - Send the `system` content via the `systemInstruction` field in the final payload, instead of merging it with the first user message. (Commit `e1fed3d`)
      - Updated `handleChromeAIRequest` to combine history into a single string suitable for its API.
  - **Result:** Multi-turn conversations now maintain context correctly. Payloads sent to different LLM providers are formatted according to their specific API requirements, with Gemini correctly using `systemInstruction`.

- **Chat UI Refinements (2025-04-10):**
  - **Goal:** Improve the visual flow of messages in the chat modal.
  - **Changes:**
    - **`src/chat-modal.js`:** Modified `_displayMessage` to explicitly remove the "System: Gathering context..." message when the "System: Context loaded..." message is shown. (Commit: b523d14)
    - **`src/styles.css`:** Removed `text-align: center;` from the `.chat-message-system` class to left-align system messages like user and LLM messages. (Commit: 4b03183)
  - **Result:** System messages are now left-aligned, and the initial "Gathering context..." message is cleanly removed, improving readability.

6.  **Refinement & Documentation:**
    - Improve UI/UX of the chat modal.
    - Add error handling (e.g., API errors, context gathering failures).
    - Consider adding features like copying chat history, clearing chat.
    - Document the new feature in `README.md` or help modal.

# Feature Plan: Chat Context Switching

**Goal:** Allow users to switch the context provided to the LLM within the chat modal. Currently, it uses the target comment and its parents. Add options to use the target comment and its descendants, or the target comment and its direct children.

**Sub-tasks:**

1.  **UI Implementation (chat-modal.js, styles.css):** (Completed 2025-04-10)
    - Added radio buttons for context selection ("Parents", "Descendants", "Children") below the header in the chat modal.
    - Added CSS styles for the context selector container and radio buttons.
2.  **Context Gathering Logic (dom-utils.js):** (Completed 2025-04-10)
    - Implemented `getDescendantComments(targetCommentElement)`.
    - Moved and refactored `_getDirectChildComments` from `hn-enhancer.js` to `dom-utils.js`.
3.  **Chat Modal Logic Update (chat-modal.js):** (Completed 2025-04-10)
    - Added state variable `currentContextType`.
    - Modified `_gatherContextAndInitiateChat` to:
        - Accept `contextType` parameter.
        - Call the appropriate `dom-utils` function (`getCommentContext`, `getDescendantComments`, `getDirectChildComments`) based on `contextType`.
        - Format the gathered comments into the initial `conversationHistory` (system prompt).
        - Update the initial "Context loaded..." message to reflect the type and count.
    - Add event listeners to the context switching UI elements.
    - Implement a `_switchContext(newContextType)` method:
        - Update `currentContextType`.
        - Clear conversation area and `conversationHistory`.
        - Call `_gatherContextAndInitiateChat` with the `newContextType`.
        - Disable input while context is loading.
4.  **Prompting & Context Structure Update (chat-modal.js, dom-utils.js):** (Decision Made 2025-04-10)
    - **Decision:** Use JSON format (flat list with `parent_id`) to represent the comment context structure for the LLM, instead of relying on indentation. This provides a more explicit and reliable way for the LLM to understand comment relationships.
    - **Reasoning:** JSON is standard, easily handled in JS, and less ambiguous for LLMs than inferring structure from indentation. A flat list with `parent_id` balances structural clarity with implementation simplicity compared to a fully nested JSON tree.
    - **Implementation Plan:**
        - **`dom-utils.js`:** Modify `getCommentContext`, `getDescendantComments`, `getDirectChildComments` to include `parent_id` (if feasible based on traversal logic) and an `is_target` boolean flag in the returned comment objects.
        - **`chat-modal.js`:**
            - In `_gatherContextAndInitiateChat`, serialize the `contextArray` (containing comment objects with `id`, `author`, `text`, `parent_id`, `is_target`) into a JSON string.
            - Update the system prompt (`systemPrompt`) to:
                - Explain that the context is provided as a JSON array.
                - Define the fields in each JSON object (`id`, `author`, `text`, `parent_id`, `is_target`).
                - Instruct the LLM on how to use `parent_id` (where `null` indicates a root of the snippet) to understand the comment hierarchy.
                - Mention the `is_target` flag identifies the comment the user initiated the chat from.
5.  **Testing:** (Next Step)
    - Test opening the chat modal (defaults to "Parents" context).
    - Test switching to "Descendants" context for comments with varying levels of replies.
    - Test switching to "Direct Children" context.
    - Test switching back and forth between context types.
    - Verify the correct comments are included in the initial system prompt (as JSON) for each context type.
    - Verify chat functionality works correctly after switching context.
    - Verify LLM responses indicate understanding of the comment structure based on the JSON.

**Next Steps:**

- Implement the JSON context structure changes:
    - Modify `dom-utils.js` context gathering functions to include `parent_id` and `is_target`.
    - Modify `chat-modal.js` to serialize context to JSON and update the system prompt accordingly.


# Known Bugs:
1. 当有的评论被折叠后，就无法通过点击统计面板里的链接定位到该评论.
2. 点击 "Chat" 链接后，模态框会打开，会有多余的一条消息：Gathering parents context.... 但是再点击其他上下文之后就没有了。只有正常的: Context loaded (xxx) xxxxx
