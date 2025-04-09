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
    // Don't send if no message or no AI session active
    if (!message || !this.aiSession) return;

    this.enhancer.logDebug(`User message to send: ${message}`);
    this._displayMessage(message, "user"); // Display user message immediately
    this.inputElement.value = ""; // Clear input
    this.inputElement.disabled = true; // Disable input while LLM responds
    this.sendButton.disabled = true;
    this.currentLlmMessageElement = null; // Reset streaming element holder

    await this._sendMessageToAI(message); // Send message to AI

    // Re-enable input only if AI session is still valid
    if (this.aiSession) {
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

      // Store context for later use when the user sends the first message
      this.currentChatContext = contextArray; // Store the gathered context

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
   * Sends a message to the AI session and handles the streamed response.
   * @param {string} message - The message text to send.
   * @private
   */
  async _sendMessageToAI(message) {
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
      try {
        const stream = this.aiSession.promptStreaming(message);
        for await (const chunk of stream) {
          this._displayMessage(chunk, "llm", true);
        }
        this.enhancer.logDebug("Chrome AI response stream finished.");
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
      "Sending message to AI:",
      message.substring(0, 100) + "..."
    ); // Log truncated message
    this.currentLlmMessageElement = null; // Reset stream target before sending

    try {
      // TODO: Implement conversation history management if needed by the API
      // For now, just send the single message. Background script might need adjustment.
      const requestPayload = {
        type: "HN_CHAT_REQUEST", // Define a new message type
        data: {
          provider: aiProvider,
          model: model,
          // apiKey: await this._getApiKeyForProvider(aiProvider), // Need a way to get API key securely
          prompt: message,
          // history: this._getConversationHistory(), // Optional: Send history
        },
      };

      // TODO: Handle potential streaming response from background script
      // For now, assume a single response object like { success: true, response: "..." } or { success: false, error: "..." }
      const response = await this.enhancer.apiClient.sendBackgroundMessage(
        requestPayload
      );

      if (response && response.success && response.response) {
        this._displayMessage(response.response, "llm", false); // Display full response
        this.enhancer.logDebug(`${aiProvider} response received.`);
        // Re-enable input
        this.inputElement.disabled = false;
        this.sendButton.disabled = false;
        this.inputElement.focus();
      } else {
        const errorMessage =
          response?.error || "Unknown error from background script.";
        console.error(`Error from ${aiProvider} via background:`, errorMessage);
        this._displayMessage(
          `Error communicating with ${aiProvider}: ${errorMessage}`,
          "system"
        );
        // Keep input disabled on error
      }
    } catch (error) {
      console.error(
        `Error sending message via background for ${aiProvider}:`,
        error
      );
      this._displayMessage(
        `Error communicating with ${aiProvider}: ${error.message}`,
        "system"
      );
      // Keep input disabled on error
    } finally {
      this.currentLlmMessageElement = null; // Ensure reset
      // Re-enable input if no error occurred (handled above for success case)
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
