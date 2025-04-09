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
    // this.aiSession = null; // Chrome AI session not used for standard providers
    this.currentLlmMessageElement = null; // To hold the element for the currently streaming LLM response
    this.conversationHistory = []; // To store the chat history { role: 'system' | 'user' | 'assistant', content: string }

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
    // Make async
    const message = this.inputElement.value.trim();
    // Don't send if no message or no AI provider determined
    if (!message || !this.currentAiProvider) {
        this.enhancer.logDebug("Send message aborted: No message or AI provider not set.");
        // Optionally display a system message if provider is missing
        if (!this.currentAiProvider) {
            this._displayMessage("Cannot send message: AI provider not configured or found.", "system");
        }
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

    await this._sendMessageToAI(); // Send the message (reads history internally)

    // Re-enable input after AI responds (or fails) - _sendMessageToAI handles enabling on success/failure now
    // Input enabling logic moved inside _sendMessageToAI's try/catch/finally
    /*
    // Original re-enabling logic (now moved):
      this.inputElement.disabled = false;
      this.sendButton.disabled = false;
      this.inputElement.focus();
    */
  }

  /**
   * Displays a message in the conversation area.
   * @param {string} text - The message text.
   * @param {'user' | 'assistant' | 'system'} sender - Who sent the message ('assistant' used internally for LLM).
   * @private
   */
  _displayMessage(text, sender, isStreaming = false) {
    // Clear initial "Loading..." or "Gathering context..." message if it's the first non-system message
    const initialMessage = this.conversationArea.querySelector("p > em");
    if (initialMessage && sender !== "system") {
      initialMessage.remove();
    }
    // Also clear "Gathering context..." if it exists and we are showing the first real message
    const gatheringMsg = this.conversationArea.querySelector(
      ".chat-message-system"
    );
    if (
      gatheringMsg &&
      gatheringMsg.textContent.includes("Gathering context") &&
      sender !== "system"
    ) {
      if (this.conversationArea.children.length <= 1) {
        // Only remove if it's the only message
        this.conversationArea.innerHTML = "";
      }
    }

    // If streaming and it's an assistant (LLM) message, update the existing element
    if (sender === "assistant" && isStreaming && this.currentLlmMessageElement) {
      // Append text, rendering markdown for the new chunk
      // Note: Simple markdown rendering might not perfectly handle partial tags across chunks.
      this.currentLlmMessageElement.innerHTML +=
        this.enhancer.markdownUtils.renderSimpleMarkdown(text);
    } else {
      // Otherwise, create a new message element
      const messageElement = document.createElement("div");
      messageElement.classList.add("chat-message", `chat-message-${sender}`);

      const senderElement = document.createElement("strong");
      // Display "LLM:" for assistant role for UI consistency
      senderElement.textContent =
        sender === "user" ? "You: " : sender === "assistant" ? "LLM: " : "System: ";

      const textElement = document.createElement("span");
      // Render markdown for the complete initial text
      textElement.innerHTML =
        this.enhancer.markdownUtils.convertMarkdownToHTML(text);

      messageElement.appendChild(senderElement);
      messageElement.appendChild(textElement);
      this.conversationArea.appendChild(messageElement);

      // If it's the start of an assistant (LLM) stream, store the text element reference
      if (sender === "assistant" && isStreaming) {
        this.currentLlmMessageElement = textElement;
      } else {
        this.currentLlmMessageElement = null; // Reset if not streaming assistant
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
    // Reset state for a new chat session
    // this.aiSession = null; // Not used
    this.currentLlmMessageElement = null;
    this.currentAiProvider = null;
    this.currentModel = null;
    this.conversationHistory = []; // Reset history for new chat

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
      let { aiProvider, model } =
        await this.enhancer.summarization.getAIProviderModel(); // Reuse summarization's method

      // --- Disallow Chrome AI for Chat ---
      if (aiProvider === "chrome-ai") {
          this.enhancer.logInfo("Chat: Chrome AI is not supported for chat. Please configure another provider.");
          this._displayMessage("Chat functionality requires a configured provider other than Chrome AI. Please configure one in the options page.", "system");
          // Clear the provider so subsequent logic treats it as unconfigured
          aiProvider = null;
          model = null;
      }
      // --- End Disallow Chrome AI ---

      this.currentAiProvider = aiProvider;
      this.currentModel = model;

      if (!aiProvider) {
        // This block will now also catch the case where Chrome AI was selected
        this.enhancer.logInfo("Chat: AI provider not configured or Chrome AI selected.");
        // Display a generic message or the specific Chrome AI message if that was the case
        if (!this.conversationArea.querySelector('.chat-message-system:last-child')?.textContent.includes("Chrome AI")) {
            this.enhancer.summarization.showConfigureAIMessage(
              this.conversationArea
            ); // Reuse message display, passing target element
        }
        return;
      }

      this.enhancer.logInfo(
        `Chat: Using AI Provider: ${aiProvider}, Model: ${model || "default"}`
        ); // Reuse message display, passing target element
        return;
      }

      this.enhancer.logInfo(
        `Chat: Using AI Provider: ${aiProvider}, Model: ${model || "default"}`
      );

      // --- Construct System Prompt with Context ---
      let contextPrompt =
        "You are a helpful assistant discussing a Hacker News comment thread.\n\n" +
        "=== Start of Context ===\n";
      contextArray.forEach((comment) => {
        contextPrompt += `--- Comment by ${comment.author} (ID: ${comment.id}) ---\n`;
        contextPrompt += `${comment.text}\n\n`;
      });
      contextPrompt += "=== End of Context ===\n\n" +
                       `The user wants to discuss the last comment in the context (ID: ${commentId}). Please respond to their questions about it.`;

      // Add the system prompt to the history
      this.conversationHistory.push({ role: "system", content: contextPrompt });

      // Display status message
      this._displayMessage(
        `Context loaded (${contextArray.length} comments) for ${aiProvider}. Ask your question below.`,
        "system"
      );

      // Enable input now that context is ready and provider is determined
      if (aiProvider) { // Only enable if a provider is configured
        this.inputElement.disabled = false;
        this.sendButton.disabled = false;
        this.inputElement.focus();
      }
    } catch (error) {
      console.error("Error gathering context or initializing chat:", error);
      this._displayMessage(
        "Error preparing chat. Please check console.",
        "system"
      );
    }
  }

  /**
   * Sends the current conversation history to the AI and handles the response.
   * Reads history from `this.conversationHistory`.
   * @private
   */
  async _sendMessageToAI() { // Removed message parameter
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

    this.enhancer.logDebug(
      `Sending message via background for ${aiProvider}...`
    );
    this.currentLlmMessageElement = null; // Reset stream target

    // Disable input while waiting
    this.inputElement.disabled = true;
    this.sendButton.disabled = true;

    this.enhancer.logDebug(
        `Sending history (${this.conversationHistory.length} messages) to AI via background...`
    );
    this.currentLlmMessageElement = null; // Reset stream target before sending

    try {
      // Send the entire conversation history
      const requestPayload = {
        type: "HN_CHAT_REQUEST",
        data: {
          provider: aiProvider,
          model: model,
          messages: this.conversationHistory, // Send the history array
        },
      };

      // Assume a single response object: { success: true, response: "..." } or { success: false, error: "..." }
      const response = await this.enhancer.apiClient.sendBackgroundMessage(
        requestPayload.type, // Pass type and data separately
        requestPayload.data
      );

      if (response && response.success && response.response) {
        const aiResponseText = response.response;
        this._displayMessage(aiResponseText, "assistant", false); // Display full response using 'assistant' role
        // Add AI response to history
        this.conversationHistory.push({ role: "assistant", content: aiResponseText });
        this.enhancer.logDebug(`${aiProvider} response received and added to history.`);
        // Re-enable input on success
        this.inputElement.disabled = false;
        this.sendButton.disabled = false;
        this.inputElement.focus();
      } else {
        const errorMessage =
          response?.error || "Unknown error receiving response from background script.";
        console.error(`Error from ${aiProvider} via background:`, errorMessage);
        this._displayMessage(
          `Error from ${aiProvider}: ${errorMessage}`,
          "system"
        // Input remains disabled on error
      }
    } catch (error) {
      console.error(
        `Error sending message or processing response for ${aiProvider}:`,
        error
      );
      this._displayMessage(
        `Failed to get response: ${error.message}`,
        "system"
      );
      // Keep input disabled on error
    } finally {
      this.currentLlmMessageElement = null; // Ensure stream target is reset
      // Input enabling/disabling is now handled within the try/catch block based on success/failure
    }
  }

  // TODO: Implement helper to securely get API key if needed by background script
  // async _getApiKeyForProvider(provider) { ... }

  // TODO: Implement helper to get conversation history if needed
  // _getConversationHistory() { ... }
}

// Make it available globally if not using modules
window.ChatModal = ChatModal;
