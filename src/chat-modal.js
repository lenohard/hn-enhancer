/**
 * Represents the Chat Modal UI and logic.
 */
class ChatModal {
  /**
   * Creates a new ChatModal instance.
   * @param {HNEnhancer} enhancerInstance - Reference to the main HNEnhancer instance.
   */
  constructor(enhancerInstance) {
    this.enhancer = enhancerInstance;
    this.modalElement = null;
    this.conversationArea = null;
    this.inputElement = null;
    this.sendButton = null;
    this.closeButton = null;
    this.targetCommentElement = null; // The comment the chat was initiated from
    this.currentPostId = null; // The ID of the post the comment belongs to
    this.aiSession = null; // To hold the Chrome AI session
    this.currentLlmMessageElement = null; // To hold the element for the currently streaming LLM response
    this.conversationHistory = []; // To store the full chat history { role, content }
    this.currentContextType = 'parents'; // Default context type: 'parents', 'descendants', 'children'
    this.contextSelectorContainer = null; // Container for context radio buttons
    this.commentPathToIdMap = new Map(); // 存储评论路径到ID的映射，用于点击跳转
    this.isPostChat = false; // Flag to indicate if this is a post-level chat
    this.isVisible = false; // 跟踪模态框是否可见

    this._createModalElement();
    this._addEventListeners();
  }

  /**
   * Creates the DOM structure for the modal and appends it to the body.
   * @private
   */
  _createModalElement() {
    if (document.getElementById("hn-enhancer-chat-modal")) {
      this.modalElement = document.getElementById("hn-enhancer-chat-modal");
      // Ensure references to internal elements are updated if modal already exists
      this.conversationArea = this.modalElement.querySelector(
        ".chat-conversation-area"
      );
      this.inputElement = this.modalElement.querySelector(".chat-input");
      this.sendButton = this.modalElement.querySelector(".chat-send-button");
      this.closeButton = this.modalElement.querySelector(".chat-close-button");
      this.contextSelectorContainer = this.modalElement.querySelector(".chat-context-selector"); // Get reference if exists
      return; // Avoid creating duplicates
    }

    this.modalElement = document.createElement("div");
    this.modalElement.id = "hn-enhancer-chat-modal";
    this.modalElement.className = "hn-enhancer-modal"; // Re-use some styling
    this.modalElement.style.display = "none"; // Hidden by default

    const modalContent = document.createElement("div");
    modalContent.className = "modal-content chat-modal-content";

    // Header
    const header = document.createElement("div");
    header.className = "modal-header";
    const title = document.createElement("h2");
    title.textContent = "Chat about Comment";
    this.closeButton = document.createElement("button");
    this.closeButton.textContent = "×";
    this.closeButton.className = "modal-close-button chat-close-button";
    header.appendChild(title);
    header.appendChild(this.closeButton);

    // Context Selector Area
    this.contextSelectorContainer = document.createElement("div");
    this.contextSelectorContainer.className = "chat-context-selector";
    this.contextSelectorContainer.innerHTML = `
      <label>Context:</label>
      <input type="radio" id="context-parents" name="chatContext" value="parents" checked>
      <label for="context-parents">Parents</label>
      <input type="radio" id="context-descendants" name="chatContext" value="descendants">
      <label for="context-descendants">Descendants</label>
      <input type="radio" id="context-children" name="chatContext" value="children">
      <label for="context-children">Children</label>
    `;

    // Conversation Area
    this.conversationArea = document.createElement("div");
    this.conversationArea.className = "chat-conversation-area";
    this.conversationArea.textContent = "Loading context..."; // Placeholder

    // Input Area
    const inputArea = document.createElement("div");
    inputArea.className = "chat-input-area";
    this.inputElement = document.createElement("textarea");
    this.inputElement.className = "chat-input";
    this.inputElement.placeholder = "Type your message...";
    this.sendButton = document.createElement("button");
    this.sendButton.textContent = "Send";
    this.sendButton.className = "chat-send-button";
    inputArea.appendChild(this.inputElement);
    inputArea.appendChild(this.sendButton);

    // Assemble
    modalContent.appendChild(header);
    modalContent.appendChild(this.contextSelectorContainer); // Add context selector
    modalContent.appendChild(this.conversationArea);
    modalContent.appendChild(inputArea);
    this.modalElement.appendChild(modalContent);

    document.body.appendChild(this.modalElement);
    this.enhancer.logDebug("Chat modal element created and appended.");
  }

  /**
   * Adds event listeners for modal interactions (close, send, etc.).
   * @private
   */
  _addEventListeners() {
    if (!this.modalElement) return;

    // Close button
    this.closeButton.addEventListener("click", () => this.hide());

    // Close on Escape key
    this.modalElement.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.hide();
      }
    });

    // Close on clicking outside the modal content (optional)
    this.modalElement.addEventListener("click", (e) => {
      if (e.target === this.modalElement) {
        this.hide();
      }
    });

    // Send button (placeholder)
    this.sendButton.addEventListener("click", () => this._handleSendMessage());

    // Send on Enter in textarea (optional, might need Shift+Enter for newline)
    this.inputElement.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault(); // Prevent newline
        this._handleSendMessage();
      }
    });

    // Context selector radio buttons
    const contextRadios = this.contextSelectorContainer.querySelectorAll('input[name="chatContext"]');
    contextRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.checked) {
                this._switchContext(e.target.value); // Call switch context method
            }
        });
    });
  }

  /**
   * Opens the chat modal for a specific comment.
   * @param {HTMLElement} commentElement - The specific comment element (.athing.comtr) to chat about.
   * @param {string} postId - The ID of the parent post.
   */
  open(commentElement, postId) {
    if (!this.modalElement) {
      this.enhancer.logDebug("Modal element not found, cannot open.");
      return;
    }
    if (!postId) {
        console.error("ChatModal.open called without a postId.");
        // Optionally display an error to the user
        return;
    }

    // 如果模态框已经可见且是相同的评论，则直接返回
    if (this.isVisible && this.targetCommentElement === commentElement) {
      this.enhancer.logDebug("Chat modal already open for this comment.");
      return;
    }

    this.isPostChat = false; // This is a comment-level chat
    this.targetCommentElement = commentElement;
    this.currentPostId = postId; // Store the post ID
    const commentId = this.enhancer.domUtils.getCommentId(commentElement);
    this.enhancer.logInfo(`Opening chat for post ${postId}, comment ID: ${commentId}`);

    // Reset state (partially, history might be loaded)
    this.conversationArea.innerHTML = "<p><em>Gathering context...</em></p>"; // Clear previous chat
    this.inputElement.value = "";
    this.inputElement.disabled = true; // Disable input until context/history is loaded
    this.sendButton.disabled = true;
    // DO NOT clear conversationHistory here, it will be loaded or set in _gatherContext...
    // this.conversationHistory = [];

    // Ensure 'parents' option is visible for comment-level chat
    const parentsRadio = this.contextSelectorContainer.querySelector('#context-parents');
    const parentsLabel = this.contextSelectorContainer.querySelector('label[for="context-parents"]');

    if (parentsRadio && parentsLabel) {
      parentsRadio.style.display = '';
      parentsLabel.style.display = '';
    }

    this.show(); // 显示模态框
    // Don't focus input yet, wait for load

    // Trigger context/history loading and potential chat initiation
    this._gatherContextAndInitiateChat(); // Default context type is used initially
  }

  /**
   * Opens the chat modal for the entire post.
   * @param {string} postId - The ID of the post to chat about.
   */
  openForPost(postId) {
    if (!this.modalElement) {
      this.enhancer.logDebug("Modal element not found, cannot open.");
      return;
    }
    if (!postId) {
      console.error("ChatModal.openForPost called without a postId.");
      return;
    }

    // 如果模态框已经可见且是帖子级聊天，则直接返回或隐藏
    if (this.isVisible && this.isPostChat) {
      this.enhancer.logDebug("Post chat modal already open, toggling visibility.");
      this.hide();
      return;
    }

    this.isPostChat = true; // This is a post-level chat
    this.targetCommentElement = null; // No specific comment
    this.currentPostId = postId;
    this.enhancer.logInfo(`Opening chat for entire post ${postId}`);

    // Update modal title
    const titleElement = this.modalElement.querySelector(".modal-header h2");
    if (titleElement) {
      titleElement.textContent = "Chat about Post";
    }

    // Reset state (Clearing area is handled by _gatherPostContextAndInitiateChat)
    // this.conversationArea.innerHTML = "<p><em>Gathering post context...</em></p>"; // Removed this line
    this.inputElement.value = "";
    this.inputElement.disabled = true;
    this.sendButton.disabled = true;

    // Update context selector UI - hide 'parents' option for post chat
    const parentsRadio = this.contextSelectorContainer.querySelector('#context-parents');
    const parentsLabel = this.contextSelectorContainer.querySelector('label[for="context-parents"]');

    if (parentsRadio && parentsLabel) {
      parentsRadio.style.display = 'none';
      parentsLabel.style.display = 'none';

      // Select descendants by default if parents was selected
      if (parentsRadio.checked) {
        const descendantsRadio = this.contextSelectorContainer.querySelector('#context-descendants');
        if (descendantsRadio) {
          descendantsRadio.checked = true;
        }
      }
    }

    this.show(); // 显示模态框

    // Trigger context gathering for post
    this._gatherPostContextAndInitiateChat();
  }

  /**
   * 完全关闭聊天模态框，重置所有状态
   */
  close() {
    if (!this.modalElement) return;
    this.hide(); // 隐藏模态框
    this.targetCommentElement = null; // Clear target comment

    // Reset modal title if it was changed
    const titleElement = this.modalElement.querySelector(".modal-header h2");
    if (titleElement) {
      titleElement.textContent = "Chat about Comment";
    }

    // Show 'parents' option again if it was hidden
    if (this.isPostChat) {
      const parentsRadio = this.contextSelectorContainer.querySelector('#context-parents');
      const parentsLabel = this.contextSelectorContainer.querySelector('label[for="context-parents"]');

      if (parentsRadio && parentsLabel) {
        parentsRadio.style.display = '';
        parentsLabel.style.display = '';
      }
    }

    this.isPostChat = false; // Reset post chat flag
    this.enhancer.logDebug("Chat modal closed.");
  }

  /**
   * 隐藏聊天模态框，但保留状态
   */
  hide() {
    if (!this.modalElement) return;
    this.modalElement.style.display = "none";
    this.isVisible = false;
    this.enhancer.logDebug("Chat modal hidden.");
  }

  /**
   * 显示聊天模态框
   */
  show() {
    if (!this.modalElement) return;
    this.modalElement.style.display = "flex";
    this.isVisible = true;
    this.enhancer.logDebug("Chat modal shown.");
  }

  /**
   * Handles sending a message (placeholder).
   * @private
   */
  async _handleSendMessage() {
    const message = this.inputElement.value.trim();
    this.enhancer.logDebug("Send button clicked. Message:", message); // <-- 添加日志

    // Don't send if message is empty. Check for AI session later based on provider.
    if (!message) {
        this.enhancer.logDebug("Empty message, not sending.");
        return;
    }

    // Check for Chrome AI session specifically if that's the provider
    if (this.currentAiProvider === 'chrome-ai' && !this.aiSession) {
        this.enhancer.logDebug("Chrome AI selected but no active session, not sending.");
        this._displayMessage("Error: Chrome AI session is not active. Please try reopening the chat.", "system");
        return;
    }


    this.enhancer.logDebug(`User message to send: ${message}`);
    this._displayMessage(message, "user"); // Display user message immediately
    this.inputElement.value = ""; // Clear input
    this.inputElement.disabled = true; // Disable input while LLM responds
    this.sendButton.disabled = true;
    this.currentLlmMessageElement = null; // Reset streaming element holder

    // Add user message to history
    this.conversationHistory.push({ role: "user", content: message });
    this.enhancer.logDebug("Added user message to history:", this.conversationHistory);

    // Send the entire history to the AI
    await this._sendMessageToAI(this.conversationHistory);

    // Re-enable input only if AI session is still valid (for Chrome AI) or if not Chrome AI
    // Note: Input re-enabling is now handled within _sendMessageToAI for non-streaming providers
    // and after the stream for Chrome AI. This block might need further adjustment
    // depending on the final flow in _sendMessageToAI.
    // Let's keep the original re-enable logic for Chrome AI for now.
    if (this.currentAiProvider === 'chrome-ai' && this.aiSession) {
      this.inputElement.disabled = false;
      this.sendButton.disabled = false;
      this.inputElement.focus();
    }
  }

  /**
   * Displays a message in the conversation area.
   * @param {string} text - The message text.
   * @param {'user' | 'llm' | 'system'} sender - Who sent the message.
   * @private
   */
  _displayMessage(text, sender, isStreaming = false) {
    // Find and remove the specific "Gathering context..." message element if it exists
    const gatheringMsgElement = Array.from(this.conversationArea.querySelectorAll(".chat-message-system"))
                                     .find(el => el.textContent.includes("Gathering context..."));
    if (gatheringMsgElement) {
        gatheringMsgElement.remove();
    }

    // Clear any remaining initial placeholder like "Loading context..."
    const initialPlaceholder = this.conversationArea.querySelector("p > em");
    if (initialPlaceholder) {
        initialPlaceholder.remove();
    }

    // If streaming and it's an LLM message, update the existing element
    if (sender === "llm" && isStreaming && this.currentLlmMessageElement) {
      // 处理LLM回复中的评论引用
      const processedText = this.enhancer.markdownUtils.replacePathsWithCommentLinks(
        this.enhancer.markdownUtils.convertMarkdownToHTML(text),
        this.commentPathToIdMap
      );

      // Append text, rendering markdown for the new chunk
      this.currentLlmMessageElement.innerHTML += processedText;

      // 为新添加的评论链接添加点击事件
      this._addCommentLinkHandlers(this.currentLlmMessageElement);
    } else {
      // Otherwise, create a new message element
      const messageElement = document.createElement("div");
      messageElement.classList.add("chat-message", `chat-message-${sender}`);

      const senderElement = document.createElement("strong");
      senderElement.textContent =
        sender === "user" ? "You: " : sender === "llm" ? "LLM: " : "System: ";

      const textElement = document.createElement("span");

      // 根据发送者类型处理文本
      if (sender === "llm") {
        // 处理LLM回复中的评论引用
        textElement.innerHTML = this.enhancer.markdownUtils.replacePathsWithCommentLinks(
          this.enhancer.markdownUtils.convertMarkdownToHTML(text),
          this.commentPathToIdMap
        );
      } else {
        // 普通Markdown渲染
        textElement.innerHTML = this.enhancer.markdownUtils.convertMarkdownToHTML(text);
      }

      messageElement.appendChild(senderElement);
      messageElement.appendChild(textElement);
      this.conversationArea.appendChild(messageElement);

      // If it's the start of an LLM stream, store the text element reference
      if (sender === "llm" && isStreaming) {
        this.currentLlmMessageElement = textElement;
      } else {
        this.currentLlmMessageElement = null; // Reset if not streaming LLM
      }

      // 为LLM消息中的评论链接添加点击事件
      if (sender === "llm") {
        this._addCommentLinkHandlers(textElement);
      }
    }

    // Scroll to bottom
    this.conversationArea.scrollTop = this.conversationArea.scrollHeight;
  }

  /**
   * 为评论链接添加点击事件处理器
   * @param {HTMLElement} container - 包含评论链接的容器元素
   * @private
   */
  _addCommentLinkHandlers(container) {
    const commentLinks = container.querySelectorAll('[data-comment-link="true"]');
    commentLinks.forEach(link => {
      // 移除现有的事件监听器（如果有）
      const newLink = link.cloneNode(true);
      link.parentNode.replaceChild(newLink, link);

      newLink.addEventListener("click", (e) => {
        e.preventDefault();
        const id = newLink.dataset.commentId;
        const comment = document.getElementById(id);
        if (comment) {
          // 使用navigation模块跳转到评论
          this.enhancer.navigation.setCurrentComment(comment);
          // 可选：关闭聊天模态框
          // this.close();
        } else {
          console.error("Failed to find DOM element for comment id:", id);
        }
      });
    });
  }

  /**
   * Gathers context based on the selected type and initiates the chat.
   * @param {string} [contextType=this.currentContextType] - The type of context to gather ('parents', 'descendants', 'children'). Defaults to the current selection.
   * @private
   */
  async _gatherContextAndInitiateChat(contextType = this.currentContextType) {
    if (!this.targetCommentElement) return;
    this.aiSession = null; // Reset session on open/switch
    this.currentLlmMessageElement = null;
    this.currentContextType = contextType; // Update current context type state
    this.currentAiProvider = null; // Reset provider for this session/context
    this.currentModel = null; // Reset model for this session/context
    this.conversationHistory = []; // Clear history before loading/gathering
    this.commentPathToIdMap = new Map(); // 重置评论路径到ID的映射
    this.conversationArea.innerHTML = ""; // Clear display area FIRST

    const commentId = this.enhancer.domUtils.getCommentId(this.targetCommentElement);
    const postId = this.currentPostId; // Use stored postId

    if (!postId || !commentId) {
        console.error("Missing postId or commentId in _gatherContextAndInitiateChat");
        this._displayMessage("Error: Cannot initiate chat due to missing identifiers.", "system");
        return;
    }

    this.enhancer.logDebug(`Initiating chat for post ${postId}, comment ${commentId}, context: ${contextType}`);

    try {
        // --- Try Loading History First ---
        const loadedHistory = await this.enhancer.hnState.getChatHistory(postId, commentId, contextType);

        if (loadedHistory && loadedHistory.length > 0) {
            this.enhancer.logInfo(`Loaded existing chat history for ${postId}/${commentId}/${contextType}`);
            this.conversationHistory = loadedHistory;

            // 从系统消息中提取评论路径到ID的映射
            const systemMessage = this.conversationHistory.find(msg => msg.role === 'system');
            if (systemMessage) {
                this._extractCommentPathsFromSystemMessage(systemMessage.content);
            }

            // Render loaded history with simplified system message
            this.conversationHistory.forEach(message => {
                if (message.role === 'system') {
                    // Extract and display simplified system message
                    const contextInfo = this._extractContextInfoFromSystemMessage(message.content);
                    // 显示指令部分和评论统计信息
                    const displayText = contextInfo.promptText
                        ? `${contextInfo.promptText}\n\n[包含 ${contextInfo.commentCount} 条评论，共 ${contextInfo.charCount} 字符]`
                        : `Loaded previous chat with ${contextInfo.contextType} context: ${contextInfo.commentCount} comments (${contextInfo.charCount} chars).`;

                    this._displayMessage(displayText, "system");
                } else {
                    // Display user and assistant messages normally
                    this._displayMessage(message.content, message.role === 'assistant' ? 'llm' : message.role);
                }
            });

            // Determine AI provider from settings (needed for sending new messages)
            const { aiProvider, model } = await this.enhancer.summarization.getAIProviderModel();
            this.currentAiProvider = aiProvider;
            this.currentModel = model;

            if (!aiProvider) {
                this.enhancer.logInfo("Chat: AI provider not configured (history loaded).");
                this.enhancer.summarization.showConfigureAIMessage(this.conversationArea);
                // Don't disable input, user might want to see history anyway
            } else {
                 this.enhancer.logInfo(`Chat: Using AI Provider: ${aiProvider}, Model: ${model || "default"} (history loaded)`);
                 // If Chrome AI, try to create session (needed for sending new messages)
                 if (aiProvider === 'chrome-ai') {
                     await this._initializeChromeAISessionIfNeeded(); // Separate helper
                 }
                 // Enable input
                 this.inputElement.disabled = false;
                 this.sendButton.disabled = false;
                 this.inputElement.focus();
            }
            return; // History loaded, skip context gathering
        }

        // --- No History Found - Gather Context ---
        this.enhancer.logDebug(`No history found for ${postId}/${commentId}/${contextType}. Gathering context...`);
        // this._displayMessage(`Gathering ${contextType} context...`, "system"); // Show gathering status

        let contextArray = [];
        const targetCommentId = this.enhancer.domUtils.getCommentId(this.targetCommentElement);
        const targetAuthor = this.enhancer.domUtils.getCommentAuthor(this.targetCommentElement);
      const targetText = this.enhancer.domUtils.getCommentText(this.targetCommentElement);
      const targetCommentData = { id: targetCommentId, author: targetAuthor, text: targetText };

      // Call the appropriate function based on contextType to get enhanced context data
      switch (contextType) {
          case 'parents':
              // getCommentContext now returns enhanced objects with path, score, etc.
              contextArray = this.enhancer.domUtils.getCommentContext(this.targetCommentElement);
              break;
          case 'descendants':
              // Get target comment with metadata
              const targetPath = "1"; // Root of descendants tree
              const targetScore = 1000; // Highest score for the target
              const targetReplies = this.enhancer.domUtils.getDirectChildComments(this.targetCommentElement).length;
              const targetDownvotes = this.enhancer.domUtils.getDownvoteCount(
                this.targetCommentElement.querySelector(".commtext")
              ) || 0;

              // Create enhanced target comment object
              const enhancedTarget = {
                id: targetCommentId,
                author: targetAuthor,
                text: targetText,
                path: targetPath,
                score: targetScore,
                replies: targetReplies,
                downvotes: targetDownvotes,
                isTarget: true
              };

              // Get enhanced descendants
              const descendants = this.enhancer.domUtils.getDescendantComments(this.targetCommentElement);

              // Combine target with descendants
              if (targetCommentId && targetAuthor !== null) {
                  contextArray = [enhancedTarget, ...descendants];
              } else {
                  contextArray = descendants;
              }

              // 构建路径到ID的映射
              this.commentPathToIdMap = new Map();
              contextArray.forEach(comment => {
                  this.commentPathToIdMap.set(comment.path, comment.id);
              });
              break;
          case 'children':
              // Get target comment with metadata (similar to descendants case)
              const targetPathForChildren = "1"; // Root of children tree
              const targetScoreForChildren = 1000; // Highest score for the target
              const targetRepliesForChildren = this.enhancer.domUtils.getDirectChildComments(this.targetCommentElement).length;
              const targetDownvotesForChildren = this.enhancer.domUtils.getDownvoteCount(
                this.targetCommentElement.querySelector(".commtext")
              ) || 0;

              // Create enhanced target comment object
              const enhancedTargetForChildren = {
                id: targetCommentId,
                author: targetAuthor,
                text: targetText,
                path: targetPathForChildren,
                score: targetScoreForChildren,
                replies: targetRepliesForChildren,
                downvotes: targetDownvotesForChildren,
                isTarget: true
              };

              // Get enhanced direct children
              const childrenData = this.enhancer.domUtils.getDirectChildCommentsWithMetadata(this.targetCommentElement);

              // Combine target with children
              if (targetCommentId && targetAuthor !== null) {
                  contextArray = [enhancedTargetForChildren, ...childrenData];
              } else {
                  contextArray = childrenData;
              }

              // 构建路径到ID的映射
              this.commentPathToIdMap = new Map();
              contextArray.forEach(comment => {
                  this.commentPathToIdMap.set(comment.path, comment.id);
              });
              break;
          default:
              console.error("Invalid context type:", contextType);
              this._displayMessage(`Error: Invalid context type selected: ${contextType}.`, "system");
              return;
      }


      if (!contextArray || contextArray.length === 0) {
        this._displayMessage(
          `Error: Could not gather ${contextType} context.`,
          "system"
        );
        return;
      }
      this.enhancer.logDebug(
        `Context gathered for ${commentId}:`,
        contextArray
      );

      // --- Determine AI Provider ---
      const { aiProvider, model } =
        await this.enhancer.summarization.getAIProviderModel(); // Reuse summarization's method
      this.currentAiProvider = aiProvider;
      this.currentModel = model;

      if (!aiProvider) {
        this.enhancer.logInfo("Chat: AI provider not configured.");
        this.enhancer.summarization.showConfigureAIMessage(
          this.conversationArea
        ); // Reuse message display, passing target element
        return;
      }

      this.enhancer.logInfo(
        `Chat: Using AI Provider: ${aiProvider}, Model: ${model || "default"}`
      );

      // --- Prepare Initial System Prompt based on Context Type ---
      let systemPromptIntro = "";

      switch (contextType) {
          case 'parents':
              systemPromptIntro = `下面提供了一系列 HN 评论，这些评论来自同一个帖子下的一个讨论分支，按时间顺序从最顶层的父评论到用户发起聊天的目标评论排列。`;
              break;
          case 'descendants':
              systemPromptIntro = `下面提供了用户发起聊天的目标评论以及它的所有后代评论（回复）。`;
              break;
          case 'children':
              systemPromptIntro = `下面提供了用户发起聊天的目标评论以及它的所有直接子评论（直接回复）。`;
              break;
      }

      // 获取帖子标题
      const postTitle = this.enhancer.domUtils.getHNPostTitle() || "未知标题";

      const systemPrompt = `你是一个 Hacker News (HN) 助手。正在讨论的帖子标题是: "${postTitle}"

${systemPromptIntro}
每个评论都使用以下格式呈现，包含了评论的层级结构和元数据：

[层级路径] (score: 分数) <replies: 回复数> {downvotes: 踩数} 作者名: 评论内容

其中：
- 层级路径：如 [1], [1.2], [1.2.3] 表示评论在树中的位置
- 分数：表示评论的重要性分数（1000为最高）
- 回复数：表示该评论的直接回复数量
- 踩数：表示评论收到的负面评价数量

当你需要引用特定评论时，请使用其层级路径，格式为 [1.2.3]。这样用户就可以点击这些引用直接跳转到对应的评论。例如：
- "正如 [1.2] 中提到的..."
- "我同意 [2.1] 的观点，但是..."
- "根据 [1] 和 [3.2] 的讨论..."

请确保在你的回复中使用这种格式引用评论，这样用户就可以轻松地查看原始评论内容。
`;
      // Format context using the enhanced metadata from our context gathering functions
      const contextString = contextArray
            .map(comment => {
              return this.enhancer.domUtils.formatCommentForLLM(
                comment,
                comment.path,
                comment.replies,
                comment.score,
                comment.downvotes,
                comment.isTarget
              );
            })
            .join("\n\n");

      // 构建路径到ID的映射（如果之前没有构建）
      if (this.commentPathToIdMap.size === 0) {
          this.commentPathToIdMap = new Map();
          contextArray.forEach(comment => {
              this.commentPathToIdMap.set(comment.path, comment.id);
          });
      }

      // Add the system prompt and context as the first message(s) in the history
      // Option 1: Single system message (preferred if APIs handle it well)
      // this.conversationHistory.push({ role: "system", content: `${systemPrompt}\n\n评论上下文:\n${contextString}` });
      // Option 2: System prompt + context as first user message (more compatible?)
      // Let's stick to sending a 'system' message and let background adapt if needed.
      // IMPORTANT: Use 'system' role for the initial prompt/context.
      const initialSystemMessage = { role: "system", content: `${systemPrompt}\n\n评论上下文:\n${contextString}` };
      this.conversationHistory.push(initialSystemMessage);
      this.enhancer.logDebug("Initialized conversation history with system prompt and context.");

      // Do NOT save initial history here - only save after first AI response
      // Just store it in memory until then

      // Display context loaded message with prompt text and context statistics
      const totalChars = contextArray.reduce((sum, c) => sum + (c.text?.length || 0), 0);
      // 从系统消息中提取指令部分
      const promptText = initialSystemMessage.content.substring(0, initialSystemMessage.content.indexOf("评论上下文:")).trim();
      this._displayMessage(
          `${promptText}\n\n[已加载 ${contextType} 上下文: ${contextArray.length} 条评论 (${totalChars} 字符)。请输入您的消息。]`,
          "system"
      );

      // --- Prepare Chat based on Provider (but don't send initial message) ---
      if (aiProvider === "chrome-ai") {
        // Check availability specifically for chrome-ai
        if (
          this.enhancer.isChomeAiAvailable !==
          HNEnhancer.CHROME_AI_AVAILABLE.YES
        ) {
          try {
            const availability = await window.ai.canCreateTextSession();
            this.enhancer.isChomeAiAvailable = availability;
            this.enhancer.logDebug(
              `Chrome AI availability check: ${availability}`
            );
          } catch (err) {
            console.error("Error checking AI availability:", err);
            this.enhancer.isChomeAiAvailable =
              HNEnhancer.CHROME_AI_AVAILABLE.NO;
          }
        }

        if (
          this.enhancer.isChomeAiAvailable ===
          HNEnhancer.CHROME_AI_AVAILABLE.YES
        ) {
           await this._initializeChromeAISessionIfNeeded(); // Use helper
        } else {
          this.enhancer.logDebug("Chrome AI selected but not available/ready.");
          this._displayMessage(
            "Chrome Built-in AI is selected but not available or ready. Cannot start chat.",
            "system"
          );
          // Optionally suggest changing settings
        }
      } else {
        // Handle other providers (OpenAI, Ollama, Anthropic, etc.) via background script
        this.enhancer.logDebug(
          `Ready for user input for provider: ${aiProvider}`
        );
        // Do NOT send initial prompt automatically
        // await this._sendMessageToAI(initialPrompt);
      }

      // Enable input now that context is loaded and AI provider is determined (or session created for Chrome AI)
      this.inputElement.disabled = false;
      this.sendButton.disabled = false;
      this.inputElement.focus();

    } catch (error) {
      console.error("Error gathering context or initializing chat:", error);
      // Still enable input even if context loading failed, user might want to ask general questions
      this.inputElement.disabled = false;
      this.sendButton.disabled = false;
      this._displayMessage(
        "Error preparing chat. Please check console.",
        "system"
      );
    }
  }

  /**
   * Sends the conversation history to the AI and handles the response.
   * @param {Array<object>} conversationHistory - The full conversation history.
   * @private
   */
  async _sendMessageToAI(conversationHistory) {
    // Use the stored provider for the current chat session
    const aiProvider = this.currentAiProvider;
    const model = this.currentModel;

    if (!aiProvider) {
      this._displayMessage(
        "Error: AI provider not determined for this session.",
        "system"
      );
      return;
    }

    // --- Chrome Built-in AI ---
    if (aiProvider === "chrome-ai") {
      if (!this.aiSession) {
        this._displayMessage(
          "Error: Chrome AI session not available.",
          "system"
        );
        // Attempt to recreate session? For now, just error out.
        this.inputElement.disabled = true;
        this.sendButton.disabled = true;
        return;
      }
      this.enhancer.logDebug("Sending message to Chrome AI...");
      this.currentLlmMessageElement = null; // Reset stream target
      let fullResponse = ""; // Accumulate response for history
      try {
        // Chrome AI's promptStreaming expects the latest user message.
        // We need to adapt the history for it if we want multi-turn,
        // but its API is designed for single prompts or requires manual history management.
        // For simplicity, let's send only the *last* user message from the history.
        // This means Chrome AI won't have multi-turn context via this method.
        const lastUserMessage = conversationHistory.filter(m => m.role === 'user').pop()?.content || "";
        if (!lastUserMessage) {
            throw new Error("No user message found in history to send to Chrome AI.");
        }

        this.enhancer.logDebug("Sending last user message to Chrome AI:", lastUserMessage);
        const stream = this.aiSession.promptStreaming(lastUserMessage);
        for await (const chunk of stream) {
          this._displayMessage(chunk, "llm", true);
          fullResponse += chunk; // Accumulate the response
        }
        this.enhancer.logDebug("Chrome AI response stream finished.");
        // Add accumulated response to history
        this.conversationHistory.push({ role: "assistant", content: fullResponse });
        this.enhancer.logDebug("Added Chrome AI response to history.");

        // --- Save History (Chrome AI) - Only save after getting a response ---
        await this.enhancer.hnState.saveChatHistory(
            this.currentPostId,
            this.enhancer.domUtils.getCommentId(this.targetCommentElement),
            this.currentContextType,
            this.conversationHistory
        );
        this.enhancer.logDebug("Saved history after Chrome AI response.");

        // Re-enable input after successful stream completion for Chrome AI
        this.inputElement.disabled = false;
        this.sendButton.disabled = false;
        this.inputElement.focus();

      } catch (error) {
        console.error("Error during Chrome AI interaction:", error);
        this._displayMessage(
          `Error communicating with Chrome AI: ${error.message}`,
          "system"
        );
        this.aiSession = null; // Invalidate session on error
        this.inputElement.disabled = true;
        this.sendButton.disabled = true;
      } finally {
        this.currentLlmMessageElement = null;
      }
      return; // Handled Chrome AI case
    }

    // --- Other AI Providers (via Background Script) ---
    this.enhancer.logDebug(
      `Sending message via background for ${aiProvider}...`
    );
    this.currentLlmMessageElement = null; // Reset stream target

    // Disable input while waiting
    this.inputElement.disabled = true;
    this.sendButton.disabled = true;

    this.enhancer.logDebug(
      `Sending conversation history to background for ${aiProvider}...`
    );
    this.currentLlmMessageElement = null; // Reset stream target before sending

    try {
      // Send the entire conversation history
      const requestPayload = {
        type: "HN_CHAT_REQUEST",
        data: {
          provider: aiProvider,
          model: model,
          messages: conversationHistory, // Send the full history
        },
      };

      // Log the exact messages being sent
      this.enhancer.logDebug("Sending conversation history to background:", JSON.stringify(conversationHistory, null, 2));
      this.enhancer.logDebug("Sending HN_CHAT_REQUEST to background with payload:", requestPayload);

      // Assume a single response object like { success: true, data: "..." } or { success: false, error: "..." }
      // Note: sendBackgroundMessage now returns response.data directly if successful
      const responseText = await this.enhancer.apiClient.sendBackgroundMessage(
          requestPayload.type, // Pass type and data separately
          requestPayload.data
      );

      // sendBackgroundMessage throws on error or unsuccessful response, so we assume success here
      this._displayMessage(responseText, "llm", false); // Display full response
      // Add LLM response to history
      this.conversationHistory.push({ role: "assistant", content: responseText });
      this.enhancer.logDebug(`Added ${aiProvider} response to history:`, this.conversationHistory);

      // --- Save History (Background Provider) - Only save after getting a response ---
      await this.enhancer.hnState.saveChatHistory(
          this.currentPostId,
          this.enhancer.domUtils.getCommentId(this.targetCommentElement),
          this.currentContextType,
          this.conversationHistory
      );
      this.enhancer.logDebug(`Saved history after ${aiProvider} response.`);

      // Re-enable input
      this.inputElement.disabled = false;
      this.sendButton.disabled = false;
      this.inputElement.focus();

    } catch (error) {
      // Error handling is mostly within sendBackgroundMessage, but keep this catch
      console.error(
        `Error sending message via background for ${aiProvider}:`,
        error
      );
      // Display the error message from the caught error
      this._displayMessage(
        `Error communicating with ${aiProvider}: ${error.message}`,
        "system"
      );
      // Keep input disabled on error (already handled by the flow)
    } finally {
      this.currentLlmMessageElement = null; // Ensure reset
      // Re-enable input only if no error occurred (handled in the try block)
      // If an error occurred, input remains disabled.
    }
  }

  /**
   * Switches the chat context type, clears the conversation, and re-initiates the chat.
   * @param {string} newContextType - The new context type ('parents', 'descendants', 'children').
   * @private
   */
  async _switchContext(newContextType) {
      if (newContextType === this.currentContextType) {
          this.enhancer.logDebug(`Context type already set to ${newContextType}, no change needed.`);
          return; // No change needed
      }

      this.enhancer.logInfo(`Switching chat context to: ${newContextType}`);

      // For post chat, 'parents' is not applicable
      if (this.isPostChat && newContextType === 'parents') {
          this.enhancer.logDebug(`'parents' context not applicable for post chat, using 'descendants' instead.`);
          newContextType = 'descendants';
      }

      // 1. Update state (will be updated again in _gatherContextAndInitiateChat, but good practice)
      this.currentContextType = newContextType;

      // 2. Clear conversation area and history
      this.conversationArea.innerHTML = ""; // Clear visually
      this.conversationHistory = []; // Clear internal history
      this.currentLlmMessageElement = null; // Reset stream element

      // 3. Disable input while loading new context
      this.inputElement.disabled = true;
      this.sendButton.disabled = true;

      // 4. Re-gather context and initiate chat with the new type
      if (this.isPostChat) {
          await this._gatherPostContextAndInitiateChat(newContextType);
      } else {
          await this._gatherContextAndInitiateChat(newContextType);
      }
  }

  /**
   * Extracts context information from a system message.
   * @param {string} systemMessage - The system message content.
   * @returns {object} Object containing contextType, commentCount, charCount, and promptText.
   * @private
   */
  _extractContextInfoFromSystemMessage(systemMessage) {
      // Default values
      const result = {
          contextType: "unknown",
          commentCount: 0,
          charCount: 0,
          promptText: "" // 存储指令部分文本
      };

      try {
          // 提取指令部分（从开头到"评论上下文:"或"帖子上下文:"之前）
          let promptEndIndex = systemMessage.indexOf("评论上下文:");
          if (promptEndIndex < 0) {
              promptEndIndex = systemMessage.indexOf("帖子上下文:");
          }

          if (promptEndIndex > 0) {
              result.promptText = systemMessage.substring(0, promptEndIndex).trim();
          }

          // 确定上下文类型
          if (systemMessage.includes("父评论")) {
              result.contextType = "parents";
          } else if (systemMessage.includes("后代评论")) {
              result.contextType = "descendants";
          } else if (systemMessage.includes("直接子评论")) {
              result.contextType = "children";
          } else if (systemMessage.includes("帖子上下文")) {
              result.contextType = "post";
          }

          // 计算评论数量
          const commentPattern = /\[\d+(?:\.\d+)*\] \(score:/g;
          const matches = systemMessage.match(commentPattern);
          result.commentCount = matches ? matches.length : 0;

          // 计算评论部分的字符数
          if (promptEndIndex > 0) {
              const contextPart = systemMessage.substring(promptEndIndex);
              result.charCount = contextPart.length;
          } else {
              result.charCount = systemMessage.length;
          }
      } catch (error) {
          console.error("Error extracting context info from system message:", error);
      }

      return result;
  }

  /**
   * Gathers context for the entire post and initiates the chat.
   * @param {string} [contextType='descendants'] - The type of context to gather ('descendants', 'children').
   *                                              For post chat, 'parents' is not applicable.
   * @private
   */
  async _gatherPostContextAndInitiateChat(contextType = 'descendants') {
    if (!this.currentPostId) {
      console.error("Missing postId in _gatherPostContextAndInitiateChat");
      this._displayMessage("Error: Cannot initiate chat due to missing post ID.", "system");
      return;
    }

    // For post chat, only 'descendants' and 'children' make sense
    if (contextType === 'parents') {
      contextType = 'descendants'; // Default to descendants if parents is selected
    }

    this.aiSession = null; // Reset session on open/switch
    this.currentLlmMessageElement = null;
    this.currentContextType = contextType; // Update current context type state
    this.currentAiProvider = null; // Reset provider for this session/context
    this.currentModel = null; // Reset model for this session/context
    this.conversationHistory = []; // Clear history before loading/gathering
    this.commentPathToIdMap = new Map(); // 重置评论路径到ID的映射
    this.conversationArea.innerHTML = ""; // Clear display area FIRST

    this.enhancer.logDebug(`Initiating post chat for post ${this.currentPostId}, context: ${contextType}`);

    try {
      // --- Try Loading History First ---
      const loadedHistory = await this.enhancer.hnState.getChatHistory(this.currentPostId, 'post', contextType);

      if (loadedHistory && loadedHistory.length > 0) {
        this.enhancer.logInfo(`Loaded existing post chat history for ${this.currentPostId}/${contextType}`);
        this.conversationHistory = loadedHistory;

        // 从系统消息中提取评论路径到ID的映射
        const systemMessage = this.conversationHistory.find(msg => msg.role === 'system');
        if (systemMessage) {
          this._extractCommentPathsFromSystemMessage(systemMessage.content);
        }

        // Render loaded history with simplified system message
        this.conversationHistory.forEach(message => {
          if (message.role === 'system') {
            // Extract and display simplified system message
            const contextInfo = this._extractContextInfoFromSystemMessage(message.content);
            // 显示指令部分和评论统计信息
            const displayText = contextInfo.promptText
              ? `${contextInfo.promptText}\n\n[包含 ${contextInfo.commentCount} 条评论，共 ${contextInfo.charCount} 字符]`
              : `Loaded previous chat with ${contextInfo.contextType} context: ${contextInfo.commentCount} comments (${contextInfo.charCount} chars).`;

            this._displayMessage(displayText, "system");
          } else {
            // Display user and assistant messages normally
            this._displayMessage(message.content, message.role === 'assistant' ? 'llm' : message.role);
          }
        });

        // Determine AI provider from settings (needed for sending new messages)
        const { aiProvider, model } = await this.enhancer.summarization.getAIProviderModel();
        this.currentAiProvider = aiProvider;
        this.currentModel = model;

        if (!aiProvider) {
          this.enhancer.logInfo("Chat: AI provider not configured (history loaded).");
          this.enhancer.summarization.showConfigureAIMessage(this.conversationArea);
        } else {
          this.enhancer.logInfo(`Chat: Using AI Provider: ${aiProvider}, Model: ${model || "default"} (history loaded)`);
          // If Chrome AI, try to create session (needed for sending new messages)
          if (aiProvider === 'chrome-ai') {
            await this._initializeChromeAISessionIfNeeded();
          }
          // Enable input
          this.inputElement.disabled = false;
          this.sendButton.disabled = false;
          this.inputElement.focus();
        }
        return; // History loaded, skip context gathering
      }

      // --- No History Found - Gather Context ---
      this.enhancer.logDebug(`No history found for post ${this.currentPostId}/${contextType}. Gathering context...`);

      // Get post title and text
      const postTitle = this.enhancer.domUtils.getHNPostTitle() || "未知标题";
      const postText = this._getPostText(); // Get post text content if available

      // Get comments based on context type
      let contextArray = [];

      // Call the appropriate function based on contextType
      if (contextType === 'descendants') {
        // Get all comments in the post
        const allComments = document.querySelectorAll("tr.athing.comtr");
        let commentIndex = 0;

        allComments.forEach(commentElement => {
          const commentId = this.enhancer.domUtils.getCommentId(commentElement);
          const author = this.enhancer.domUtils.getCommentAuthor(commentElement);
          const text = this.enhancer.domUtils.getCommentText(commentElement);
          const indentLevel = this.enhancer.domUtils.getCommentIndentLevel(commentElement) || 0;

          if (commentId && author !== null) {
            // Calculate path based on indentation and position
            const path = indentLevel === 0 ? `${++commentIndex}` : `${Math.ceil(commentIndex/2)}.${indentLevel}`;

            // Get metadata
            const downvotes = this.enhancer.domUtils.getDownvoteCount(commentElement.querySelector(".commtext")) || 0;
            const directChildren = this.enhancer.domUtils.getDirectChildComments(commentElement);
            const replyCount = directChildren.length;

            // Calculate score
            const score = this.enhancer.domUtils.calculateCommentScore(commentIndex, allComments.length, downvotes);

            // Add to context array
            contextArray.push({
              id: commentId,
              author,
              text,
              path,
              score,
              replies: replyCount,
              downvotes,
              isTarget: false
            });

            // Add to path-to-id mapping
            this.commentPathToIdMap.set(path, commentId);
          }
        });
      } else if (contextType === 'children') {
        // Get only top-level comments
        const topLevelComments = Array.from(document.querySelectorAll("tr.athing.comtr"))
          .filter(comment => this.enhancer.domUtils.getCommentIndentLevel(comment) === 0);

        topLevelComments.forEach((commentElement, index) => {
          const commentId = this.enhancer.domUtils.getCommentId(commentElement);
          const author = this.enhancer.domUtils.getCommentAuthor(commentElement);
          const text = this.enhancer.domUtils.getCommentText(commentElement);

          if (commentId && author !== null) {
            // For top-level comments, path is just the index
            const path = `${index + 1}`;

            // Get metadata
            const downvotes = this.enhancer.domUtils.getDownvoteCount(commentElement.querySelector(".commtext")) || 0;
            const directChildren = this.enhancer.domUtils.getDirectChildComments(commentElement);
            const replyCount = directChildren.length;

            // Calculate score
            const score = this.enhancer.domUtils.calculateCommentScore(index, topLevelComments.length, downvotes);

            // Add to context array
            contextArray.push({
              id: commentId,
              author,
              text,
              path,
              score,
              replies: replyCount,
              downvotes,
              isTarget: false
            });

            // Add to path-to-id mapping
            this.commentPathToIdMap.set(path, commentId);
          }
        });
      }

      if (!contextArray || contextArray.length === 0) {
        this._displayMessage(
          `Error: Could not gather ${contextType} context for post.`,
          "system"
        );
        return;
      }

      this.enhancer.logDebug(
        `Context gathered for post ${this.currentPostId}:`,
        contextArray
      );

      // --- Determine AI Provider ---
      const { aiProvider, model } = await this.enhancer.summarization.getAIProviderModel();
      this.currentAiProvider = aiProvider;
      this.currentModel = model;

      if (!aiProvider) {
        this.enhancer.logInfo("Chat: AI provider not configured.");
        this.enhancer.summarization.showConfigureAIMessage(this.conversationArea);
        return;
      }

      this.enhancer.logInfo(
        `Chat: Using AI Provider: ${aiProvider}, Model: ${model || "default"}`
      );

      // --- Prepare Initial System Prompt based on Context Type ---
      let systemPromptIntro = "";

      if (contextType === 'descendants') {
        systemPromptIntro = `你是一个 Hacker News (HN) 帖子助手。下面提供了整个帖子的所有评论。`;
      } else if (contextType === 'children') {
        systemPromptIntro = `你是一个 Hacker News (HN) 帖子助手。下面提供了帖子的所有顶级评论（直接回复帖子的评论）。`;
      }

      const systemPrompt = `你是一个 Hacker News (HN) 帖子助手。正在讨论的帖子标题是: "${postTitle}"
${postText ? `\n帖子内容:\n${postText}\n` : ''}
${systemPromptIntro}
每个评论都使用以下格式呈现，包含了评论的层级结构和元数据：

[层级路径] (score: 分数) <replies: 回复数> {downvotes: 踩数} 作者名: 评论内容

其中：
- 层级路径：如 [1], [1.2], [1.2.3] 表示评论在树中的位置
- 分数：表示评论的重要性分数（1000为最高）
- 回复数：表示该评论的直接回复数量
- 踩数：表示评论收到的负面评价数量

当你需要引用特定评论时，请使用其层级路径，格式为 [1.2.3]。这样用户就可以点击这些引用直接跳转到对应的评论。例如：
- "正如 [1.2] 中提到的..."
- "我同意 [2.1] 的观点，但是..."
- "根据 [1] 和 [3.2] 的讨论..."

请确保在你的回复中使用这种格式引用评论，这样用户就可以轻松地查看原始评论内容。
`;

      // Format context using the enhanced metadata
      const contextString = contextArray
        .map(comment => {
          return this.enhancer.domUtils.formatCommentForLLM(
            comment,
            comment.path,
            comment.replies,
            comment.score,
            comment.downvotes,
            comment.isTarget
          );
        })
        .join("\n\n");

      // Add the system prompt and context as the first message in the history
      const initialSystemMessage = { role: "system", content: `${systemPrompt}\n\n帖子上下文:\n${contextString}` };
      this.conversationHistory.push(initialSystemMessage);
      this.enhancer.logDebug("Initialized conversation history with system prompt and post context.");

      // Display context loaded message with prompt text and context statistics
      const totalChars = contextArray.reduce((sum, c) => sum + (c.text?.length || 0), 0);
      // 从系统消息中提取指令部分
      const promptText = initialSystemMessage.content.substring(0, initialSystemMessage.content.indexOf("帖子上下文:")).trim();
      this._displayMessage(
        `${promptText}\n\n[已加载 ${contextType} 上下文: ${contextArray.length} 条评论 (${totalChars} 字符)。请输入您的消息。]`,
        "system"
      );

      // --- Prepare Chat based on Provider (but don't send initial message) ---
      if (aiProvider === "chrome-ai") {
        if (this.enhancer.isChomeAiAvailable !== HNEnhancer.CHROME_AI_AVAILABLE.YES) {
          try {
            const availability = await window.ai.canCreateTextSession();
            this.enhancer.isChomeAiAvailable = availability;
            this.enhancer.logDebug(`Chrome AI availability check: ${availability}`);
          } catch (err) {
            console.error("Error checking AI availability:", err);
            this.enhancer.isChomeAiAvailable = HNEnhancer.CHROME_AI_AVAILABLE.NO;
          }
        }

        if (this.enhancer.isChomeAiAvailable === HNEnhancer.CHROME_AI_AVAILABLE.YES) {
          await this._initializeChromeAISessionIfNeeded();
        } else {
          this.enhancer.logDebug("Chrome AI selected but not available/ready.");
          this._displayMessage(
            "Chrome Built-in AI is selected but not available or ready. Cannot start chat.",
            "system"
          );
        }
      } else {
        this.enhancer.logDebug(`Ready for user input for provider: ${aiProvider}`);
      }

      // Enable input now that context is loaded
      this.inputElement.disabled = false;
      this.sendButton.disabled = false;
      this.inputElement.focus();

    } catch (error) {
      console.error("Error gathering post context or initializing chat:", error);
      this.inputElement.disabled = false;
      this.sendButton.disabled = false;
      this._displayMessage(
        "Error preparing chat. Please check console.",
        "system"
      );
    }
  }

  /**
   * Gets the text content of the post if available.
   * @returns {string|null} The post text content or null if not found.
   * @private
   */
  _getPostText() {
    // Try to find the post text content in the DOM
    // HN posts can have text content in various formats

    // First try to find it in the standard location
    const postText = document.querySelector(".toptext");
    if (postText) {
      return postText.innerText.trim();
    }

    // If not found in standard location, try alternative locations
    // Some posts might have content in an iframe or other format
    const postIframe = document.querySelector("td.default iframe");
    if (postIframe) {
      try {
        return postIframe.contentDocument.body.innerText.trim();
      } catch (e) {
        // Cross-origin restrictions might prevent access
        return "帖子内容无法访问（可能在iframe中）";
      }
    }

    // If no text content found, return null
    return null;
  }

  /**
   * 从系统消息中提取评论路径到ID的映射
   * @param {string} systemMessage - 系统消息内容
   * @private
   */
  _extractCommentPathsFromSystemMessage(systemMessage) {
      try {
          // 重置映射
          this.commentPathToIdMap = new Map();

          // 查找所有评论路径和ID
          const commentLines = systemMessage.split('\n\n');
          const pathIdRegex = /\[(\d+(?:\.\d+)*)\].*?(\d+):/;

          commentLines.forEach(line => {
              const match = line.match(pathIdRegex);
              if (match && match.length >= 3) {
                  const path = match[1];
                  const id = match[2];
                  this.commentPathToIdMap.set(path, id);
              }
          });

          this.enhancer.logDebug(`从系统消息中提取了 ${this.commentPathToIdMap.size} 个评论路径到ID的映射`);
      } catch (error) {
          console.error("从系统消息中提取评论路径到ID的映射时出错:", error);
      }
  }

  /**
   * Initializes the Chrome AI session if needed and available.
   * Displays messages related to session creation or unavailability.
   * @private
   */
  async _initializeChromeAISessionIfNeeded() {
      if (this.enhancer.isChomeAiAvailable !== HNEnhancer.CHROME_AI_AVAILABLE.YES) {
          // Re-check availability if not already confirmed as YES
          try {
              const availability = await window.ai.canCreateTextSession();
              this.enhancer.isChomeAiAvailable = availability;
              this.enhancer.logDebug(`Chrome AI availability re-check: ${availability}`);
          } catch (err) {
              console.error("Error re-checking AI availability:", err);
              this.enhancer.isChomeAiAvailable = HNEnhancer.CHROME_AI_AVAILABLE.NO;
          }
      }

      if (this.enhancer.isChomeAiAvailable === HNEnhancer.CHROME_AI_AVAILABLE.YES) {
          if (!this.aiSession) { // Only create if session doesn't exist
              this._displayMessage("Initializing Chrome AI session...", "system");
              try {
                  this.aiSession = await window.ai.createTextSession(); // Default options
                  this.enhancer.logDebug("Chrome AI session created.");
              } catch (aiError) {
                  console.error("Error creating Chrome AI session:", aiError);
                  this._displayMessage(`Error initializing Chrome AI session: ${aiError.message}.`, "system");
                  this.aiSession = null; // Ensure session is null on error
              }
          } else {
              this.enhancer.logDebug("Chrome AI session already exists.");
          }
      } else {
          this.enhancer.logDebug("Chrome AI selected but not available/ready.");
          this._displayMessage("Chrome Built-in AI is selected but not available or ready.", "system");
          // Optionally suggest changing settings
      }
  }
}

// Make it available globally if not using modules
window.ChatModal = ChatModal;
