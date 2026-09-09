## How to Use This Memo

This memo serves as a persistent record of the refactoring plan and progress. In each session:

1. **Start each session by reviewing this memo**
   - Check what's been completed
   - Identify the next task

2. **Update the memo after each task**
   - Mark completed tasks with [x]
   - Add any new insights or challenges
   - Document any design decisions

3. **Focus on one task at a time**
   - Complete a single logical unit of work
   - Test thoroughly before moving on
   - Update this memo before ending the session

4. **Maintain backward compatibility**
   - Ensure the extension works at each step
   - Don't break existing functionality

This approach allows for incremental progress across multiple sessions, even with context limitations.

## previous task summary

### 动态模型列表获取功能 (2025-06-18)

**目标:** 实现动态获取 AI 提供商模型列表的功能，首先支持 Google Gemini

**已完成:**
- [x] 在 Gemini 模型选择器旁添加"刷新"按钮
- [x] 在 background.js 中实现 `handleFetchGeminiModels` 函数
- [x] 在 options.js 中实现 `fetchGeminiModels` 函数
- [x] 添加模型缓存机制（24小时有效期）
- [x] 实现加载缓存模型的逻辑
- [x] 添加刷新按钮的状态管理和错误处理

**功能特点:**
- 使用 Gemini API 获取最新模型列表
- 只显示支持 `generateContent` 的模型
- 模型信息包含名称、显示名称、描述等
- 24小时缓存机制减少 API 调用
- 友好的用户界面和错误提示

**当前调试问题 (2025-06-18):**
- [x] 修复了Gemini模型列表请求的网络错误日志问题
- [x] 移除了不必要的调试日志

**下一步:**
- 测试动态模型列表功能在不同网络环境下的表现
- 考虑为其他AI提供商(OpenAI、Anthropic等)添加类似的动态模型列表功能

## current task plan and progress

### OpenCode Go model protocol routing (2026-09-09)

**已完成:**
- [x] Added a shared model mapping for provider, protocol, and endpoint metadata.
- [x] Automatically selects Responses, Messages, or Chat Completions from the selected model.
- [x] Unknown/new models default to `/v1/chat/completions`.
- [x] Applied the resolver in the background request path, Options page, and Hub model picker.
- [x] Preserved the stable OpenCode session ID for chat history from the previous fix.

**经验:** Keep protocol resolution server-side as well as in the UI; this prevents stale settings or direct requests from using the wrong endpoint. Keep the model map explicit and small, with a safe default for newly released models.

**验证:** JavaScript syntax, manifest JSON, mapping examples, and `git diff --check` pass. Full Jest/build validation still requires installing the missing `node_modules` dependencies.



