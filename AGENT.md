# Hacker News Companion 扩展架构文档

## 项目概述

Hacker News Companion 是一个浏览器扩展，为 Hacker News 网站提供智能导航、AI 驱动的摘要和增强的用户交互功能。该扩展支持 Chrome 和 Firefox 浏览器，集成了多种 AI 提供商，包括 OpenAI、Anthropic、Google Gemini、DeepSeek、LiteLLM、Chrome 内置 AI 和本地 Ollama 模型。

## 开发环境

### 构建命令

- 开发构建: `pnpm run dev-build`
- 监视模式: `pnpm run dev`
- 发布构建: `pnpm run release-build`
- 构建 Tailwind: `pnpm run build:tailwind`
- 构建 Tailwind (监视): `pnpm run build:tailwind:watch`

### 测试命令

- 运行所有测试: `pnpm run test`
- 运行特定测试: `NODE_OPTIONS=--experimental-vm-modules jest scripts/example.test.js`

### 脚本命令

- 下载帖子 ID: `pnpm run download-post-ids`
- 下载帖子: `pnpm run download-posts`
- 生成 LLM 摘要: `pnpm run generate-llm-summary`

### 开发注意事项

- 在开发过程中无需构建和测试 - 用户会处理测试

## 代码风格指南

- **模块系统**: ES Modules (import/export)
- **命名规范**: 变量/函数使用 camelCase，类使用 PascalCase
- **错误处理**: 使用 try/catch 块，提供具体的错误消息
- **测试**: Jest 与 expect 断言，描述性测试名称
- **格式化**: 4 空格缩进，必须使用分号
- **注释**: 记录复杂逻辑，避免显而易见的注释
- **文件结构**: 模块化设计，分离关注点 (options, background, content)
- **Promise**: 优先使用 async/await 而非原始 promises
- **浏览器扩展**: 遵循 Chrome/Firefox 扩展最佳实践

## 核心功能

### 1. 智能键盘导航

- Vim 风格的快捷键 (`h`, `j`, `k`, `l`) 用于直观的移动
- 在同一作者的评论之间快速跳转
- 可折叠的评论线程
- 按 `?` 查看所有快捷键

### 2. AI 驱动的线程摘要

- 支持多种 AI 提供商
- 摘要整个线程或特定评论分支
- 支持多种语言
- 可配置的 token 限制和温度参数

### 3. 增强的评论导航

- 在同一作者的评论之间快速跳转
- 帖子作者和评论数量的视觉指示器
- 评论数量显示

### 4. 丰富的用户交互

- 悬停时显示用户资料预览
- 可调整大小的摘要面板
- 评论路径跟踪和导航
- 聊天功能，可与 AI 讨论评论和帖子

## 技术架构

### 扩展结构

```
hn-enhancer/
├── manifest.chrome.json          # Chrome 扩展清单
├── manifest.firefox.json         # Firefox 扩展清单
├── background.js                 # 后台脚本，处理 API 请求
├── content.js                    # 内容脚本入口点
├── options.html                  # 设置页面 HTML
├── src/
│   ├── hn-enhancer.js           # 主控制器类
│   ├── api-client.js            # API 通信客户端
│   ├── summarization.js         # AI 摘要功能
│   ├── chat-modal.js            # 聊天模态框
│   ├── summary-panel.js         # 摘要面板
│   ├── navigation.js            # 导航功能
│   ├── dom-utils.js             # DOM 操作工具
│   ├── hn-state.js              # 状态持久化
│   ├── author-tracking.js       # 作者跟踪功能
│   ├── ui-components.js         # UI 组件
│   ├── markdown-utils.js        # Markdown 处理工具
│   └── options/
│       ├── options.html         # 设置页面
│       ├── options.js           # 设置页面逻辑
│       └── options-styles.css   # 设置页面样式
└── images/                      # 扩展图标
```

## 核心模块详解

### 1. HNEnhancer (src/hn-enhancer.js)
**作用**: 主控制器类，协调所有功能并初始化组件

**关键功能**:
- 检测页面类型（首页 vs 评论页）
- 初始化所有子组件
- 设置键盘快捷键
- 管理评论导航和交互

**关键方法**:
- `constructor()`: 初始化所有组件
- `setupKeyBoardShortcuts()`: 设置键盘事件监听
- `initCommentsPageNavigation()`: 初始化评论页导航
- `initHomePageNavigation()`: 初始化首页导航

**依赖关系**:

- 依赖所有其他模块
- 作为中央协调器

### 2. ApiClient (src/api-client.js)

**作用**: 处理与后台脚本的通信

**关键功能**:

- 发送消息到后台脚本
- 获取用户信息
- 获取 HN 评论数据

**关键方法**:

- `sendBackgroundMessage(type, data)`: 发送后台消息
- `fetchUserInfo(username)`: 获取用户信息
- `fetchHNCommentsFromAPI(itemId)`: 获取评论数据

### 3. Summarization (src/summarization.js)

**作用**: 处理 AI 摘要功能

**关键功能**:

- 支持多种 AI 提供商（OpenAI、Anthropic、Gemini、DeepSeek、LiteLLM、Chrome AI、Ollama）
- 摘要评论线程
- 摘要整个帖子
- 可配置的参数（max_tokens、temperature）

**关键方法**:

- `summarizeThread(commentElement)`: 摘要评论线程
- `summarizeAllComments()`: 摘要所有评论
- `getAIProviderModel()`: 获取 AI 提供商配置
- `summarizeUsingOpenAI()`, `summarizeUsingAnthropic()` 等: 特定提供商的摘要方法

**配置参数**:

- `maxTokens`: 最大 token 数量（默认 100000）
- `temperature`: 温度参数（默认 0.7）

### 4. ChatModal (src/chat-modal.js)

**作用**: 提供与 AI 的聊天功能

**关键功能**:

- 评论级聊天
- 帖子级聊天
- 上下文切换（父评论、后代评论、子评论）
- 聊天历史持久化
- 评论引用和跳转

**关键方法**:

- `open(commentElement, postId)`: 打开评论聊天
- `openForPost(postId)`: 打开帖子聊天
- `_gatherContextAndInitiateChat()`: 收集上下文并初始化聊天
- `_sendMessageToAI()`: 发送消息到 AI

### 5. SummaryPanel (src/summary-panel.js)

**作用**: 可调整大小的摘要显示面板

**关键功能**:

- 显示摘要内容
- 可调整大小
- 响应式设计

**关键方法**:

- `toggle()`: 切换面板显示
- `updateContent()`: 更新面板内容
- `setupResizeHandlers()`: 设置调整大小处理器

### 6. Navigation (src/navigation.js)

**作用**: 处理导航功能

**关键功能**:

- 帖子导航（首页）
- 评论导航（评论页）
- 当前项目高亮

**关键方法**:

- `navigateToPost(direction)`: 导航到帖子
- `navigateToFirstComment()`: 导航到第一个评论
- `setCurrentComment()`: 设置当前评论

### 7. DomUtils (src/dom-utils.js)

**作用**: DOM 操作和数据提取工具

**关键功能**:

- 提取评论数据（ID、作者、文本）
- 计算评论统计
- 获取评论上下文和后代
- 格式化评论供 LLM 使用

**关键方法**:

- `getCommentId()`, `getCommentAuthor()`, `getCommentText()`: 提取评论信息
- `getCommentContext()`: 获取评论上下文
- `getDescendantComments()`: 获取后代评论
- `calculateCommentStatistics()`: 计算评论统计
- `formatCommentForLLM()`: 格式化评论供 LLM 使用

### 8. HNState (src/hn-state.js)

**作用**: 状态持久化管理

**关键功能**:

- 保存/获取最后查看的帖子
- 保存/获取聊天历史

**关键方法**:

- `saveLastSeenPostId()`, `getLastSeenPostId()`: 帖子状态管理
- `saveChatHistory()`, `getChatHistory()`: 聊天历史管理

### 9. AuthorTracking (src/author-tracking.js)

**作用**: 作者跟踪和导航

**关键功能**:

- 创建作者评论映射
- 在同一作者的评论之间导航
- 显示用户信息弹窗

**关键方法**:

- `createAuthorCommentsMap()`: 创建作者评论映射
- `navigateAuthorComments()`: 导航作者评论
- `setupUserHover()`: 设置用户悬停功能

### 10. UIComponents (src/ui-components.js)

**作用**: UI 组件创建和管理

**关键功能**:

- 创建帮助模态框
- 创建统计面板
- 注入摘要和聊天链接

**关键方法**:

- `createHelpModal()`: 创建帮助模态框
- `createStatisticsPanel()`: 创建统计面板
- `injectSummarizePostLink()`, `injectChatPostLink()`: 注入链接

### 11. MarkdownUtils (src/markdown-utils.js)

**作用**: Markdown 处理工具

**关键功能**:

- 将 Markdown 转换为 HTML
- 处理评论路径引用
- 清理锚标签

**关键方法**:

- `convertMarkdownToHTML()`: Markdown 到 HTML 转换
- `replacePathsWithCommentLinks()`: 替换路径为评论链接

## 后台脚本 (background.js)

**作用**: 处理跨域 API 请求和权限管理

**关键功能**:

- 处理各种 AI 提供商的 API 请求
- 管理 API 密钥和配置
- 处理 CORS 限制

**支持的 AI 提供商**:

- OpenAI (GPT-3.5, GPT-4)
- Anthropic (Claude 系列)
- Google Gemini
- DeepSeek
- LiteLLM
- Chrome 内置 AI
- Ollama (本地模型)

**关键处理器**:

- `handleOpenAIRequest()`: 处理 OpenAI 请求
- `handleAnthropicRequest()`: 处理 Anthropic 请求
- `handleGeminiRequest()`: 处理 Gemini 请求
- 等等...

## AI 提供商管理经验

### 提供商架构理解

每个 AI 提供商集成都遵循一致的模式：

1. 后台脚本中的 API 请求处理器
2. summarization.js 中的摘要方法
3. options.html 中的 UI 配置部分
4. options.js 中的设置管理
5. 清单文件中的 API 端点权限
6. 测试配置支持

### AI 提供商移除经验 (2025-01-11)
**任务**: 从代码库中移除 Ollama、Chrome 内置 AI 和 OpenRouter 提供商
**修改的关键文件**:
- [`background.js`](background.js) - 移除消息处理器和 API 请求函数
- [`src/summarization.js`](src/summarization.js) - 移除特定提供商的摘要方法和 switch cases
- [`src/options/options.html`](src/options/options.html) - 移除已移除提供商的 UI 部分
- [`src/options/options.js`](src/options/options.js) - 移除设置处理和测试配置
- [`manifest.chrome.json`](manifest.chrome.json) & [`manifest.firefox.json`](manifest.firefox.json) - 移除主机权限
- [`src/chat-modal.js`](src/chat-modal.js) - 移除 Chrome AI 会话管理

**系统化移除流程**:

1. 从 [`background.js`](background.js) 移除消息处理器
2. 移除 API 请求处理器函数
3. 从聊天请求路由器移除 switch cases
4. 移除特定提供商的摘要方法
5. 从选项页面移除 UI 部分
6. 从 [`options.js`](src/options/options.js) 移除设置处理
7. 移除测试配置
8. 移除清单权限
9. 清理任何特定提供商的会话管理 (Chrome AI 案例)

**重要注意事项**:

- 移除之前的默认提供商时应更新默认提供商回退
- 错误消息和帮助文本应更新以移除对已移除提供商的引用
- 需要清理速率限制和特定提供商的逻辑
- 会话管理是特定于提供商的 (Chrome AI 有特殊的会话处理)

### 流式实现 (2025-01-11)

**任务**: 为 LLM 响应添加流式支持
**添加的关键功能**:
- 设置 UI 中的流式配置切换
- OpenAI 和 Anthropic 提供商的流式支持
- 流式期间的实时 UI 更新
- 禁用时回退到非流式模式

**实现细节**:

**1. 设置集成**:

- 在 [`src/options/options.html`](src/options/options.html) 中添加流式切换 (复选框控件)
- 更新 [`src/options/options.js`](src/options/options.js) 以保存/加载流式偏好
- 设置存储为 chrome.storage 中的 `streamingEnabled` 布尔值

**2. 后台脚本更新**:

- 修改 [`background.js`](background.js) 以处理流式 API 请求
- 添加 `handleStreamingMessage()` 函数处理流式响应
- 更新 OpenAI 和 Anthropic API 处理器以支持流式模式
- 向 API 负载添加流式参数 (设置 `stream: true`)

**3. 摘要模块**:

- 更新 [`src/summarization.js`](src/summarization.js) 以将流式设置传递给 API 调用
- 添加 `handleStreamingResponse()` 方法处理流式数据
- 修改 `summarizeUsingOpenAI()` 和 `summarizeUsingAnthropic()` 以支持流式
- 流式期间的实时 UI 更新，渐进式文本显示

**4. 流式流程**:

- 启用时: API 请求包含 `streaming: true` 参数
- 后台脚本返回流式响应对象
- UI 随着块的到达逐步更新
- 流完成时显示最终摘要

**提供商支持**:

- ✅ OpenAI: 完整的流式支持，带有增量内容
- ✅ Anthropic: 完整的流式支持，带有内容块
- ✅ LiteLLM: 完整的流式支持，带有增量内容 (兼容 OpenAI 格式)
- ❌ Gemini: 未实现 (未来增强)
- ❌ DeepSeek: 未实现 (未来增强)

### 流式实现修复 (2025-07-14)

**问题**: 流式卡住或失败，出现 "Receiving end does not exist" 错误
**问题描述**: 启用流式时，摘要要么不出现，要么进程失败，后台控制台出现 `Could not establish connection` 错误。这是由扩展消息传递系统中的竞争条件引起的。

**根本原因分析**:

1. **错误的消息处理**: [`background.js`](background.js) 中的初始实现试图多次使用单个 `sendResponse` 回调发送每个流块，这是 Chrome 扩展 API 不允许的。
2. **竞争条件**: 内容脚本 ([`src/summarization.js`](src/summarization.js)) 一旦后台脚本发出流 "完成" 信号就拆除其消息监听器。然而，后台脚本同时发送最终数据块，这会失败，因为接收端的监听器不再存在。

**应用的修复**:

- **[`background.js`](background.js)**:
  - 修改 `handleStreamingMessage` 函数，使用 `chrome.tabs.sendMessage(tabId, ...)` 直接向发起请求的特定标签页发送流块。这需要将 `sender` 对象传递到函数中以获取 `tab.id`。
  - 这种更改通过针对特定接收器使通信更加健壮，防止在通用 `chrome.runtime.onMessage` 监听器过早关闭时消息丢失。
- **[`src/summarization.js`](src/summarization.js)**:
  - 完全重构 `handleStreamingResponse` 函数以使用 `Promise`。
  - 这种新方法确保消息监听器在整个流式过程中保持活跃。
  - `Promise` 只在后台脚本确认流完全完成 (`done: true`) 后解析，防止监听器过早移除。

**关键学习**:

- **Chrome 扩展消息传递**: 对于流式或多响应场景，单个 `onMessage` -> `sendResponse` 流程是不够的。后台脚本必须向内容脚本中的持久监听器发送多个消息。
- **目标消息传递**: 使用带有特定 `tabId` 的 `chrome.tabs.sendMessage` 比通用 `chrome.runtime.sendMessage` 更可靠用于后台到内容脚本通信。
- **异步控制流**: 管理像流式这样的异步操作需要仔细的控制流。在客户端使用 Promise 包装整个流式生命周期确保清理 (如移除监听器) 只在所有操作完全完成后发生。

### AI 提供商集成指南
HN Enhancer 扩展遵循模块化架构进行 AI 提供商集成：

**核心组件**:

1. **Background Script** (`background.js`)
   - 处理所有外部 API 调用（CORS 限制）
   - 包含提供商特定的请求处理器
   - 路由聊天请求到适当的提供商
   - 管理模型获取功能

2. **Summarization Module** (`src/summarization.js`)
   - 包含提供商特定的摘要方法
   - 处理 token 限制和文本处理
   - 管理 UI 更新和错误处理

3. **Options Page** (`src/options/options.html` + `src/options/options.js`)
   - 提供商配置的用户界面
   - API 密钥管理
   - 模型选择和测试

4. **Chat Modal** (`src/chat-modal.js`)
   - 处理对话式 AI 交互
   - 发送通用聊天请求，由后台脚本路由

## Caching Lessons Learned

### 1. Storage Mechanism
- **`chrome.storage.local`**: Ideal for larger amounts of data (like cached summaries or chat history) that need to persist across browser sessions. It's asynchronous and provides good performance for extensions.
- **`chrome.storage.sync`**: Useful for user settings that need to synchronize across different instances of the browser (e.g., across multiple devices). It has stricter size limits than `local` storage.

### 2. Context and Permissions
- **Content Scripts vs. Background Scripts**: Content scripts (which interact with web pages) do NOT have direct access to `chrome.storage` APIs. Only background scripts (service workers) have direct access.
- **Communication**: To store or retrieve data from content scripts, messages must be sent to the background script using `chrome.runtime.sendMessage`.

### 3. Designing Caching Keys
- **Specificity**: Keys must be unique enough to differentiate distinct pieces of cached data. For example, a summary of a full post should have a different key than a summary of a specific comment thread, even if they share the same `postId`.
- **Parameters in Keys**: Include relevant parameters in the key to ensure uniqueness (e.g., `postId`, `commentId`, `AIProvider`, `model`, `language`). This ensures that if any of these parameters change, a new summary is generated or retrieved from a different cache entry.

### 4. Cache Invalidation and Management
- **Expiration**: Implement a mechanism to expire old cache entries (e.g., based on timestamp) to prevent stale data and manage storage space.
- **Manual Clearing**: Provide UI options for users to manually clear the cache, giving them control over their stored data.
- **Cache Statistics**: Offer statistics (e.g., total entries, size, expired entries) to give users visibility into the cache's state.

### 5. Error Handling
- **Graceful Degradation**: If caching fails (e.g., storage error), the core functionality (summarization in this case) should still work. Don't let caching errors block the main user experience.

### 6. Performance Considerations
- **Asynchronous Operations**: All `chrome.storage` operations are asynchronous, so use `async/await` to handle them properly.
- **Minimize Reads/Writes**: While `chrome.storage` is optimized, frequent or large reads/writes can still impact performance. Cache data in memory for short-term use if appropriate.

### Example Keying Strategy for Summaries
- **Full Post Summary**: `summary_${postId}_post_${provider}_${model}_${language}`
- **Comment Thread Summary**: `summary_${postId}_${commentId}_${provider}_${model}_${language}`

This ensures that summaries for the entire post and for specific comments are stored and retrieved independently, even if they belong to the same post.

## Summarization Caching - Current Issue and Progress
### Issue Description
The current summarization caching implementation mixes summaries for entire posts with summaries for individual comment threads. This occurs because the `summarizeThread` function, intended for individual comment threads, was still using `getHNThread` which retrieves the entire post's content. As a result, the caching key generated (`postId` with a `null` `commentId` because `getCurrentCommentId` incorrectly determined it was a full post summary) was not unique for sub-thread summaries, leading to overwriting or incorrect retrieval.

### Problematic Code Location
- `src/summarization.js`: `summarizeThread` and `summarizeTextWithAI`
- `src/hn-state.js`: `getSummary` and `saveSummary` were functioning correctly but were provided with an ambiguous `commentId`.
