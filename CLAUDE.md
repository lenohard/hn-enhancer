## Build Commands
- Development build: `pnpm run dev-build`
- Watch mode: `pnpm run dev`
- Release build: `pnpm run release-build`
- Build Tailwind: `pnpm run build:tailwind`
- Build Tailwind (watch): `pnpm run build:tailwind:watch`

## Test Commands
- Run all tests: `pnpm run test`
- Run specific test: `NODE_OPTIONS=--experimental-vm-modules jest scripts/example.test.js`

## Important Notes
- For this project, no need to build and test during development - user will handle testing

## Scripts
- Download post IDs: `pnpm run download-post-ids`
- Download posts: `pnpm run download-posts`
- Generate LLM summary: `pnpm run generate-llm-summary`

## Code Style Guidelines
- **Module System**: ES Modules (import/export)
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Error Handling**: Try/catch blocks with specific error messages
- **Testing**: Jest with expect assertions, descriptive test names
- **Formatting**: 4-space indentation, semicolons required
- **Comments**: Document complex logic, avoid obvious comments
- **File Structure**: Modular design with separate concerns (options, background, content)
- **Promises**: Async/await preferred over raw promises
- **Browser Extension**: Follow Chrome/Firefox extension best practices

## AI Provider Removal - Lessons Learned (2025-01-11)

### Task: Remove Ollama, Chrome Built-in AI, and OpenRouter providers from codebase

**Key Files Modified:**
- `background.js` - Removed message handlers and API request functions
- `src/summarization.js` - Removed provider-specific summarization methods and switch cases
- `src/options/options.html` - Removed UI sections for the removed providers
- `src/options/options.js` - Removed settings handling and test configurations
- `manifest.chrome.json` & `manifest.firefox.json` - Removed host permissions
- `src/chat-modal.js` - (In progress) Removing Chrome AI session management

**Critical Patterns for AI Provider Management:**
1. **Message Handling Structure**: Each provider has a dedicated case in `chrome.runtime.onMessage.addListener` in `background.js`
2. **Summarization Flow**: Providers have separate `summarizeUsing[Provider]` methods in `summarization.js`
3. **UI Structure**: Each provider has its own radio button and configuration section in `options.html`
4. **Settings Schema**: Provider configurations are stored in nested objects under `settings.[provider]`
5. **Manifest Permissions**: Each provider requires specific `optional_host_permissions` for API endpoints

**Systematic Removal Process:**
1. Remove message handlers from `background.js`
2. Remove API request handler functions
3. Remove switch cases from chat request router
4. Remove provider-specific summarization methods
5. Remove UI sections from options page
6. Remove settings handling from options.js
7. Remove test configurations
8. Remove manifest permissions
9. Clean up any provider-specific session management (Chrome AI case)

**Important Notes:**
- Default provider fallback should be updated when removing the previous default
- Error messages and help text should be updated to remove references to removed providers
- Rate limiting and provider-specific logic needs to be cleaned up
- Session management is provider-specific (Chrome AI had special session handling)

# Notes
The provider relative information is in ./AI_PROVIDER_INTEGRATION_GUIDE.md

## Remaining Supported Providers (After Cleanup)
- OpenAI
- Anthropic (Claude)
- Google Gemini
- DeepSeek
- LiteLLM (local proxy)

## Provider Architecture Understanding
Each AI provider integration follows a consistent pattern:
1. Background script handler for API requests
2. Summarization method in summarization.js
3. UI configuration section in options.html
4. Settings management in options.js
5. Manifest permissions for API endpoints
6. Test configuration support

## LiteLLM Integration Fix (2025-01-11)

### Issue: DeepSeek Authentication Error via LiteLLM Proxy
**Problem**: Extension was incorrectly adding API key to request body when calling LiteLLM proxy, causing authentication failures.

**Root Cause**: 
- `background.js:564` was adding `payload.api_key = apiKey` to request body
- LiteLLM proxy tried to use extension's proxy key to authenticate with DeepSeek
- Should only use Authorization header for proxy auth

**Fix Applied**:
- Removed API key from request payload in `handleLiteLLMRequest` function
- API key now only used in Authorization header: `Bearer sk-IstlPsekdjLRVkad5ZmhjA`
- LiteLLM proxy properly uses configured environment variables (DEEPSEEK_API_KEY, etc.)

**Key Learning**: 
- LiteLLM proxy authentication is different from direct provider calls
- Proxy handles provider authentication internally using environment variables
- Client should only authenticate with proxy, not pass through provider credentials

**System Knowledge**: Created `/Users/senaca/knowledge_base/litellm_proxy_setup.md` with detailed setup info

## Streaming Implementation (2025-01-11)

### Task: Add streaming support for LLM responses

**Key Features Added:**
- Streaming configuration toggle in settings UI
- Streaming support for OpenAI and Anthropic providers
- Real-time UI updates during streaming
- Fallback to non-streaming mode when disabled

**Implementation Details:**

**1. Settings Integration:**
- Added streaming toggle in `src/options/options.html` (checkbox control)
- Updated `src/options/options.js` to save/load streaming preference
- Setting stored as `streamingEnabled` boolean in chrome.storage

**2. Background Script Updates:**
- Modified `background.js` to handle streaming API requests
- Added `handleStreamingMessage()` function for processing streaming responses
- Updated OpenAI and Anthropic API handlers to support streaming mode
- Added streaming parameter to API payload (sets `stream: true`)

**3. Summarization Module:**
- Updated `src/summarization.js` to pass streaming setting to API calls
- Added `handleStreamingResponse()` method for processing streaming data
- Modified `summarizeUsingOpenAI()` and `summarizeUsingAnthropic()` to support streaming
- Real-time UI updates during streaming with progressive text display

**4. Streaming Flow:**
- When enabled: API requests include `streaming: true` parameter
- Background script returns streaming response objects
- UI updates progressively as chunks arrive
- Final summary displayed when stream completes

**5. UI/UX Improvements:**
- Progressive text display during streaming
- Smooth loading experience with real-time updates
- Loading spinner replaced with actual content as it arrives
- Maintains existing error handling for both streaming and non-streaming modes

**Provider Support:**
- ✅ OpenAI: Full streaming support with delta content
- ✅ Anthropic: Full streaming support with content blocks
- ✅ LiteLLM: Full streaming support with delta content (compatible with OpenAI format)
- ❌ Gemini: Not implemented (future enhancement)
- ❌ DeepSeek: Not implemented (future enhancement)

**Key Learning:**
- Streaming significantly improves user experience for long responses
- Real-time updates provide better feedback than loading spinners
- Proper error handling required for both streaming and non-streaming modes
- Background script modification needed to handle streaming responses correctly
- LiteLLM uses OpenAI-compatible streaming format, making implementation straightforward

## LiteLLM Streaming Support Added (2025-01-11)

### Enhancement: Extended streaming support to LiteLLM provider

**Changes Made:**
- Updated `background.js` handleLiteLLMRequest() to support streaming parameter
- Modified LITELLM_API_REQUEST message handler to use streaming when enabled
- Updated `summarization.js` summarizeUsingLiteLLM() method with streaming support
- Added LiteLLM streaming support to handleStreamingResponse() method

**Technical Details:**
- LiteLLM proxy supports the same streaming format as OpenAI (`stream: true`)
- Response format is OpenAI-compatible with delta content in chunks
- Maintains backward compatibility with non-streaming mode
- Proper error handling for both streaming and non-streaming requests

**Why LiteLLM Streaming is Important:**
- LiteLLM acts as a proxy to multiple providers (OpenAI, Anthropic, local models)
- Users can now get streaming responses regardless of the underlying model
- Consistent streaming experience across all supported providers through LiteLLM
- Enables streaming for local models that support it (like Ollama models)

## Important Reminders
- Always commit changes after fixes
- Document lessons learned in both project and system knowledge base
- Use "write down notes" reminder to ensure documentation
