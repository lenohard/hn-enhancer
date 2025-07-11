# META
Remember to commit the changes in proper time.
Remember to written down the lession you leanrn, and the valuable information  you find from each task into a markdonw file, 
and add them into ./CLAUDE.md which is the memory file for you accross different sessions, beacuse your context is cleared in a new session
So remember to written down whaterver you think is important.

## Build Commands
- Development build: `pnpm run dev-build`
- Watch mode: `pnpm run dev`
- Release build: `pnpm run release-build`
- Build Tailwind: `pnpm run build:tailwind`
- Build Tailwind (watch): `pnpm run build:tailwind:watch`

## Test Commands
- Run all tests: `pnpm run test`
- Run specific test: `NODE_OPTIONS=--experimental-vm-modules jest scripts/example.test.js`

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
