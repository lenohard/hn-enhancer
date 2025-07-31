# 通用网页内容AI对话功能设计文档

## 功能概述

扩展现有的 HN Enhancer 扩展，支持用户在任何网页上选择内容并与AI进行对话。这个功能将利用现有的AI提供商集成和聊天基础设施，为用户提供智能的网页内容分析和讨论能力。

## 产品目标

### 主要目标
- 让用户能够在任何网页上与AI讨论选中的内容
- 提供智能的上下文理解和相关回答
- 无缝集成到现有的扩展架构中
- 支持多种触发方式和交互模式

### 用户价值
- **学习辅助**: 对复杂内容进行解释和分析
- **内容理解**: 快速理解文章、论文、代码等
- **多语言支持**: 翻译和解释外语内容
- **深度分析**: 对选中内容进行批判性思考和讨论

## 功能设计

### 1. 触发机制

#### 1.1 文本选择触发
- **行为**: 用户选中文本后，显示浮动的聊天图标
- **条件**: 选中文本长度 > 10 字符
- **位置**: 选中文本附近的浮动按钮
- **样式**: 小型聊天气泡图标，半透明背景

#### 1.2 右键菜单触发
- **菜单项**: "与AI讨论选中内容"
- **显示条件**: 有文本被选中时
- **图标**: 聊天图标

#### 1.3 快捷键触发
- **快捷键**: `Ctrl+Shift+C` (Windows/Linux) / `Cmd+Shift+C` (Mac)
- **行为**: 
  - 如果有选中文本，直接打开对话
  - 如果没有选中文本，打开页面级对话

#### 1.4 页面级对话
- **触发**: 快捷键 `Ctrl+Shift+P` 或右键菜单"讨论整个页面"
- **内容**: 提取页面主要内容进行对话

### 2. 内容提取策略

#### 2.1 选中文本处理
```javascript
// 基础选中文本
const selectedText = window.getSelection().toString().trim();

// 扩展上下文（选中文本前后的段落）
const extendedContext = extractSurroundingContext(selectedText, 500);
```

#### 2.2 页面内容提取
```javascript
// 多策略内容提取
const strategies = [
    // 1. 语义化标签
    () => document.querySelector('article')?.textContent,
    () => document.querySelector('main')?.textContent,
    
    // 2. 常见内容选择器
    () => document.querySelector('.content, #content, .post-content')?.textContent,
    
    // 3. 启发式算法 - 找到最大文本块
    () => findLargestTextBlock(),
    
    // 4. 排除噪音内容
    () => excludeNavigationAndAds()
];
```

#### 2.3 内容智能截取
- **Token限制**: 根据选择的AI模型动态调整
- **优先级**: 选中文本 > 周围上下文 > 页面标题和元信息
- **压缩策略**: 对长内容进行智能摘要

### 3. 上下文构建

#### 3.1 上下文信息收集
```javascript
const context = {
    // 基础信息
    selectedText: selectedText,
    pageTitle: document.title,
    pageUrl: window.location.href,
    domain: window.location.hostname,
    
    // 页面元信息
    description: document.querySelector('meta[name="description"]')?.content,
    keywords: document.querySelector('meta[name="keywords"]')?.content,
    author: document.querySelector('meta[name="author"]')?.content,
    
    // 内容上下文
    surroundingText: extractSurroundingContext(selectedText),
    pageContent: extractMainContent(),
    
    // 内容类型识别
    contentType: identifyContentType(), // article, code, data, academic, etc.
    language: detectLanguage(selectedText)
};
```

#### 3.2 智能提示词生成
```javascript
function buildContextPrompt(context) {
    let prompt = `网页信息：
标题：${context.pageTitle}
URL：${context.pageUrl}
域名：${context.domain}`;

    if (context.selectedText) {
        prompt += `\n\n用户选中的内容：
"${context.selectedText}"`;
        
        if (context.surroundingText) {
            prompt += `\n\n选中内容的上下文：
${context.surroundingText}`;
        }
    }
    
    if (context.contentType) {
        prompt += `\n\n内容类型：${context.contentType}`;
    }
    
    prompt += `\n\n请基于以上信息回答用户的问题。如果用户没有具体问题，请对选中内容进行分析和解释。`;
    
    return prompt;
}
```

### 4. 用户界面设计

#### 4.1 浮动触发按钮
- **外观**: 圆形聊天图标，渐变背景
- **动画**: 淡入淡出，悬停放大效果
- **位置**: 选中文本右上角，避免遮挡内容
- **自动隐藏**: 3秒后自动淡出，鼠标悬停时保持显示

#### 4.2 聊天模态框扩展
- **标题栏**: 显示"网页内容对话 - [页面标题]"
- **上下文显示**: 可折叠的上下文信息面板
- **选中内容高亮**: 在对话中突出显示用户选中的原始内容
- **页面链接**: 提供返回原页面的快捷链接

#### 4.3 预设问题建议
根据内容类型提供智能建议：
- **文章类**: "总结要点", "分析观点", "相关问题"
- **代码类**: "解释代码", "优化建议", "潜在问题"
- **学术类**: "核心概念", "研究方法", "结论分析"
- **数据类**: "数据解读", "趋势分析", "异常发现"

### 5. 技术实现方案

#### 5.1 权限扩展
```json
// manifest.json 更新
{
    "permissions": [
        "contextMenus",
        "activeTab",
        "storage"
    ],
    "content_scripts": [{
        "matches": ["<all_urls>"],
        "js": ["content.js", "src/web-content-chat.js"],
        "css": ["src/web-content-styles.css"]
    }]
}
```

#### 5.2 新增模块

**src/web-content-chat.js**
- 负责网页内容的提取和处理
- 管理浮动按钮的显示和交互
- 与现有ChatModal集成

**src/content-extractor.js**
- 专门负责内容提取的工具类
- 实现多种提取策略
- 内容类型识别和语言检测

#### 5.3 现有模块扩展

**ChatModal (src/chat-modal.js)**
```javascript
// 新增方法
async openForWebContent(context) {
    this.currentContext = context;
    this.contextType = 'web-content';
    await this._initializeWebContentChat(context);
}

async _initializeWebContentChat(context) {
    // 构建系统提示
    const systemPrompt = this.buildWebContentSystemPrompt(context);
    
    // 初始化对话历史
    this.conversationHistory = [
        { role: 'system', content: systemPrompt }
    ];
    
    // 显示上下文信息
    this._displayWebContentContext(context);
}
```

**DomUtils (src/dom-utils.js)**
```javascript
// 新增通用内容提取方法
static extractWebPageContent() {
    // 实现多策略内容提取
}

static identifyContentType(content) {
    // 识别内容类型：article, code, academic, data, etc.
}

static detectLanguage(text) {
    // 简单的语言检测
}
```

### 6. 实现步骤

#### 阶段一：基础功能 (Week 1-2)
1. **权限和清单更新**
   - 更新manifest.json添加必要权限
   - 添加右键菜单支持

2. **内容提取核心**
   - 创建ContentExtractor类
   - 实现基础的文本选择和页面内容提取
   - 添加内容类型识别

3. **浮动按钮UI**
   - 创建选择文本后的浮动按钮
   - 添加基础样式和动画效果

#### 阶段二：聊天集成 (Week 3-4)
1. **ChatModal扩展**
   - 添加网页内容对话支持
   - 实现上下文构建和提示词生成
   - 集成现有AI提供商

2. **用户体验优化**
   - 添加预设问题建议
   - 优化对话界面显示
   - 实现上下文信息面板

#### 阶段三：高级功能 (Week 5-6)
1. **智能功能**
   - 实现内容智能截取
   - 添加多语言支持
   - 优化上下文相关性

2. **性能优化**
   - 实现内容缓存机制
   - 优化大页面的处理性能
   - 添加错误处理和降级方案

#### 阶段四：测试和优化 (Week 7-8)
1. **全面测试**
   - 在不同类型网站测试
   - 验证各种内容类型的处理
   - 性能和稳定性测试

2. **用户体验优化**
   - 根据测试反馈优化UI
   - 完善错误处理
   - 添加使用指南

### 7. 技术挑战和解决方案

#### 7.1 内容提取准确性
**挑战**: 不同网站的DOM结构差异巨大
**解决方案**: 
- 实现多种提取策略的fallback机制
- 使用启发式算法识别主要内容区域
- 提供用户手动调整的选项

#### 7.2 性能和内存管理
**挑战**: 大页面可能导致性能问题
**解决方案**:
- 实现内容分块处理
- 添加内容长度限制和智能截取
- 使用Web Workers处理大量文本

#### 7.3 跨站点兼容性
**挑战**: 某些网站可能有特殊的安全策略
**解决方案**:
- 实现优雅降级机制
- 添加网站特定的适配规则
- 提供用户反馈机制

#### 7.4 上下文相关性
**挑战**: 如何提供有意义的上下文而不超出token限制
**解决方案**:
- 实现智能上下文选择算法
- 根据AI模型动态调整上下文长度
- 提供上下文重要性评分机制

### 8. 成功指标

#### 8.1 功能指标
- 支持95%以上的主流网站
- 内容提取准确率 > 90%
- 响应时间 < 3秒

#### 8.2 用户体验指标
- 用户激活率 > 60%
- 平均对话轮数 > 3
- 用户满意度 > 4.5/5

#### 8.3 技术指标
- 内存使用 < 50MB
- CPU使用率 < 10%
- 错误率 < 1%

### 9. 风险评估

#### 9.1 技术风险
- **高风险**: 内容提取在复杂网站上可能失败
- **中风险**: 性能问题可能影响用户体验
- **低风险**: AI API调用失败

#### 9.2 用户体验风险
- **中风险**: 浮动按钮可能干扰正常浏览
- **中风险**: 上下文理解可能不准确
- **低风险**: 学习曲线可能较陡

#### 9.3 缓解策略
- 实现全面的错误处理和降级方案
- 提供用户自定义选项
- 建立用户反馈收集机制

### 10. 未来扩展

#### 10.1 高级功能
- **批量处理**: 支持多个选中区域的批量对话
- **内容标注**: 允许用户在页面上添加AI生成的注释
- **知识图谱**: 构建用户的个人知识网络

#### 10.2 集成功能
- **笔记系统**: 与用户的笔记应用集成
- **翻译功能**: 实时翻译和解释
- **学习路径**: 基于用户兴趣推荐相关内容

这个设计文档为通用网页内容AI对话功能提供了全面的规划，确保功能的可行性、用户体验和技术实现的平衡。
