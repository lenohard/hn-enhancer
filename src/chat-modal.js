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
    this.aiSession = null; // To hold the Chrome AI session
    this.currentLlmMessageElement = null; // To hold the element for the currently streaming LLM response
    this.conversationHistory = []; // To store the full chat history { role, content }
    this.currentContextType = 'parents'; // Default context type: 'parents', 'descendants', 'children'
    this.contextSelectorContainer = null; // Container for context radio buttons

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
    this.closeButton.addEventListener("click", () => this.close());

    // Close on Escape key
    this.modalElement.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.close();
      }
    });

    // Close on clicking outside the modal content (optional)
    this.modalElement.addEventListener("click", (e) => {
      if (e.target === this.modalElement) {
        this.close();
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
  }

  /**
   * Opens the chat modal.
   * @param {HTMLElement} commentElement - The specific comment element (.athing.comtr) to chat about.
   */
  open(commentElement) {
    if (!this.modalElement) {
      this.enhancer.logDebug("Modal element not found, cannot open.");
      return;
    }
    this.targetCommentElement = commentElement;
    const commentId = this.enhancer.domUtils.getCommentId(commentElement);
    this.enhancer.logInfo(`Opening chat for comment ID: ${commentId}`);

    // Reset state
    this.conversationArea.innerHTML = "<p><em>Gathering context...</em></p>"; // Clear previous chat
    this.inputElement.value = "";
    this.inputElement.disabled = true; // Disable input until context is loaded
    this.sendButton.disabled = true;
    this.conversationHistory = []; // Clear history for new chat

    this.modalElement.style.display = "flex"; // Show the modal
    this.inputElement.focus(); // Focus the input field

    // TODO: Trigger context gathering and initial LLM prompt here
    this._gatherContextAndInitiateChat();
  }

  /**
   * Closes the chat modal.
   */
  close() {
    if (!this.modalElement) return;
    this.modalElement.style.display = "none";
    this.targetCommentElement = null; // Clear target comment
    this.enhancer.logDebug("Chat modal closed.");
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
      // Append text, rendering markdown for the new chunk
      // Note: Simple markdown rendering might not perfectly handle partial tags across chunks.
      this.currentLlmMessageElement.innerHTML +=
        this.enhancer.markdownUtils.renderSimpleMarkdown(text);
    } else {
      // Otherwise, create a new message element
      const messageElement = document.createElement("div");
      messageElement.classList.add("chat-message", `chat-message-${sender}`);

      const senderElement = document.createElement("strong");
      senderElement.textContent =
        sender === "user" ? "You: " : sender === "llm" ? "LLM: " : "System: ";

      const textElement = document.createElement("span");
      // Render markdown for the complete initial text
      textElement.innerHTML =
        this.enhancer.markdownUtils.convertMarkdownToHTML(text);

      messageElement.appendChild(senderElement);
      messageElement.appendChild(textElement);
      this.conversationArea.appendChild(messageElement);

      // If it's the start of an LLM stream, store the text element reference
      if (sender === "llm" && isStreaming) {
        this.currentLlmMessageElement = textElement;
      } else {
        this.currentLlmMessageElement = null; // Reset if not streaming LLM
      }
    }

    // Scroll to bottom
    this.conversationArea.scrollTop = this.conversationArea.scrollHeight;
  }

  /**
   * Gathers context (parent comments) and initiates the chat (placeholder).
   * @private
   */
  async _gatherContextAndInitiateChat() {
    if (!this.targetCommentElement) return;
    this.aiSession = null; // Reset session on open
    this.currentLlmMessageElement = null;
    this.currentAiProvider = null; // Store the provider for this session
    this.currentModel = null; // Store the model for this session

    const commentId = this.enhancer.domUtils.getCommentId(
      this.targetCommentElement
    );
    this.enhancer.logDebug(`Gathering context for comment ${commentId}...`);
    // Clear previous messages and show gathering status
    this.conversationArea.innerHTML = "";
    this._displayMessage("Gathering context...", "system");

    try {
      const contextArray = this.enhancer.domUtils.getCommentContext(
        this.targetCommentElement
      );

      if (!contextArray || contextArray.length === 0) {
        this._displayMessage(
          "Error: Could not gather comment context.",
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

      // --- Prepare Initial System Prompt ---
      const systemPrompt = `你是一个 Hacker News (HN) 评论助手。下面提供了一系列 HN
评论，这些评论来自同一个帖子下的一个讨论分支。评论按时间顺序排列，从最顶层的父评论开始，一直到用户发起聊天的目标评论。
每个评论都包含了作者和内容。

评论上下文结构如下：
评论 1 (作者: [作者名]):
[评论内容]
-------
评论 2 (作者: [作者名]):
[评论内容]
-------
...

`;

      // Format context into a single string
      const contextString = contextArray
            .map(
              (c, index) =>
                `评论 ${index + 1} (作者: ${c.author}):\n${c.text}\n-------`
            )
            .join("\n\n");

      // Add the system prompt and context as the first message(s) in the history
      // Option 1: Single system message (preferred if APIs handle it well)
      // this.conversationHistory.push({ role: "system", content: `${systemPrompt}\n\n评论上下文:\n${contextString}` });
      // Option 2: System prompt + context as first user message (more compatible?)
      // Let's stick to sending a 'system' message and let background adapt if needed.
      this.conversationHistory.push({ role: "system", content: `${systemPrompt}\n\n评论上下文:\n${contextString}` });
      this.enhancer.logDebug("Initialized conversation history with system prompt and context.");


      // Display context loaded message and enable input
      const totalChars = contextArray.reduce((sum, c) => sum + c.text.length, 0);
      this._displayMessage(
          `Context loaded: ${contextArray.length} comments (${totalChars} chars). Ready for your message.`,
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
          this._displayMessage("Initializing Chrome AI session...", "system");
          try {
            this.aiSession = await window.ai.createTextSession(); // Default options
            this.enhancer.logDebug("Chrome AI session created, ready for user input.");
            // Do NOT send initial prompt automatically
            // await this._sendMessageToAI(initialPrompt);
          } catch (aiError) {
            console.error("Error creating Chrome AI session:", aiError);
            this._displayMessage(
              `Error initializing Chrome AI session: ${aiError.message}.`,
              "system"
            );
            this.aiSession = null;
          }
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
      // Re-enable input
      this.inputElement.disabled = false;
      this.sendButton.disabled = false;
      this.inputElement.focus();

    } catch (error) {
      // Error handling was moved inside sendBackgroundMessage, but keep this catch for other potential errors
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

  // TODO: Implement helper to securely get API key if needed by background script
  // async _getApiKeyForProvider(provider) { ... }

  // TODO: Implement helper to get conversation history if needed
  // _getConversationHistory() { ... }
}

// Make it available globally if not using modules
window.ChatModal = ChatModal;
