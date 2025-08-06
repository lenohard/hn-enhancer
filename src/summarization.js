/**
 * Handles AI summarization functionality for the Hacker News Companion extension
 */

// Constants and configurations
const SUMMARIZATION_CONFIG = {
  STATUS: {
    OK: "ok",
    TEXT_TOO_SHORT: "too_short",
    THREAD_TOO_SHALLOW: "too_shallow",
    THREAD_TOO_DEEP: "chrome_depth_limit",
  },
  LIMITS: {
    MIN_SENTENCE_LENGTH: 8,
    MIN_COMMENT_DEPTH: 3,
    TOKENS_PER_CHAR: 0.25,
    UPDATE_INTERVAL: 100, // ms
    MAX_SCORE: 1000,
    MAX_DOWNVOTES: 10,
  },
  LANGUAGE_NAMES: {
    en: "English",
    zh: "中文 (Chinese)",
    es: "Español (Spanish)",
    fr: "Français (French)",
    de: "Deutsch (German)",
    ja: "日本語 (Japanese)",
    ko: "한국어 (Korean)",
    ru: "Русский (Russian)",
    pt: "Português (Portuguese)",
    it: "Italiano (Italian)",
  },
  LANGUAGE_INSTRUCTIONS: {
    zh: "Please respond in Chinese (中文).",
    es: "Please respond in Spanish (Español).",
    fr: "Please respond in French (Français).",
    de: "Please respond in German (Deutsch).",
    ja: "Please respond in Japanese (日本語).",
    ko: "Please respond in Korean (한국어).",
    ru: "Please respond in Russian (Русский).",
    pt: "Please respond in Portuguese (Português).",
    it: "Please respond in Italian (Italiano).",
  },
};

class Summarization {
  constructor(enhancer) {
    this.enhancer = enhancer;
    this.SummarizeCheckStatus = SUMMARIZATION_CONFIG.STATUS;
  }

  /**
   * Summarizes a thread starting from a specific comment
   */
  async summarizeThread(comment) {
    try {
      const { hnItemId, targetCommentId } = this.extractCommentInfo(comment);
      if (!hnItemId || !targetCommentId) return;

      const { formattedComment, commentPathToIdMap } =
        this.prepareCommentData(comment);
      if (!formattedComment) return;

      const { aiProvider, model } = await this.getAIProviderModel();
      if (!aiProvider) {
        this.showConfigureAIMessage();
        return;
      }

      const author = comment.querySelector(".hnuser")?.textContent || "";
      const highlightedAuthor = `<span class="highlight-author">${author}</span>`;

      const checkResult = this.shouldSummarizeText(
        formattedComment,
        commentPathToIdMap.size,
        aiProvider
      );
      if (checkResult.status !== this.SummarizeCheckStatus.OK) {
        this.showSummarizationNotRecommended(
          checkResult.status,
          highlightedAuthor
        );
        return;
      }

      this.showLoadingMessage(
        "Thread Summary",
        `Analyzing discussion in ${highlightedAuthor} thread`,
        aiProvider,
        model
      );
      await this.summarizeTextWithAI(
        formattedComment,
        commentPathToIdMap,
        hnItemId,
        targetCommentId
      );
    } catch (error) {
      this.handleError("Error in thread summarization", error);
    }
  }

  /**
   * Summarizes all comments in the current post
   */
  async summarizeAllComments() {
    const itemId = this.enhancer.domUtils.getCurrentHNItemId();
    if (!itemId) {
      console.error(
        "Could not get item id of the current post to summarize all comments"
      );
      return;
    }

    try {
      if (!this.enhancer.summaryPanel.isVisible) {
        this.enhancer.summaryPanel.toggle();
      }

      const { aiProvider, model } = await this.getAIProviderModel();
      if (!aiProvider) {
        this.showConfigureAIMessage();
        return;
      }

      this.showLoadingMessage(
        "Post Summary",
        "Analyzing all threads in this post...",
        aiProvider,
        model
      );

      const { formattedComment, commentPathToIdMap } = await this.getHNThread(
        itemId
      );
      await this.summarizeTextWithAI(formattedComment, commentPathToIdMap);
    } catch (error) {
      this.handleError("Error preparing for summarization", error);
    }
  }

  /**
   * Extract comment information
   */
  extractCommentInfo(comment) {
    const itemLinkElement = comment
      .querySelector(".age")
      ?.getElementsByTagName("a")[0];
    if (!itemLinkElement) {
      console.error(
        "Could not find the item link element to get the item id for summarization"
      );
      return {};
    }

    const hnItemId = itemLinkElement.href.split("=")[1];
    const targetCommentId = this.enhancer.domUtils.getCommentId(comment);

    if (!targetCommentId) {
      console.error("Could not get targetCommentId for summarization");
      return {};
    }

    return { hnItemId, targetCommentId };
  }

  /**
   * Prepare comment data for summarization
   */
  prepareCommentData(comment) {
    const commentContext = this.enhancer.domUtils.getCommentContext(comment);
    const descendants = this.enhancer.domUtils.getDescendantComments(comment);
    const allComments = [...commentContext, ...descendants];

    if (!allComments.length) {
      console.error("Could not get the thread for summarization");
      return {};
    }

    const formattedComment = allComments
      .map((comment) =>
        this.enhancer.domUtils.formatCommentForLLM(
          comment,
          comment.path,
          comment.replies,
          comment.score,
          comment.downvotes,
          comment.isTarget
        )
      )
      .join("\n");

    const commentPathToIdMap = new Map();
    allComments.forEach((comment) => {
      commentPathToIdMap.set(comment.path, comment.id);
    });

    return { formattedComment, commentPathToIdMap };
  }

  /**
   * Show loading message
   */
  showLoadingMessage(title, metadata, aiProvider, model) {
    const modelInfo = aiProvider
      ? ` using <strong>${aiProvider} ${model || ""}</strong>`
      : "";
    this.enhancer.summaryPanel.updateContent({
      title,
      metadata,
      text: `<div>Generating summary${modelInfo}... This may take a few moments.<span class="loading-spinner"></span></div>`,
    });
  }

  /**
   * Show summarization not recommended message
   */
  showSummarizationNotRecommended(status, highlightedAuthor) {
    const messageTemplates = {
      title: "Summarization not recommended",
      metadata: {
        [this.SummarizeCheckStatus
          .TEXT_TOO_SHORT]: `Thread too brief to use the selected cloud AI`,
        [this.SummarizeCheckStatus
          .THREAD_TOO_SHALLOW]: `Thread not deep enough to use the selected cloud AI`,
        [this.SummarizeCheckStatus
          .THREAD_TOO_DEEP]: `Thread too deep for the selected AI`,
      },
      text: (status, highlightedAuthor) => {
        const baseMessage =
          status === this.SummarizeCheckStatus.THREAD_TOO_DEEP
            ? `This ${highlightedAuthor} thread is too long or deeply nested to be handled by certain AI providers.`
            : `This ${highlightedAuthor} thread is concise enough to read directly.`;

        return `${baseMessage}<br/><br/>However, if you still want to summarize this thread, you can <a href="#" id="options-page-link">configure another AI provider</a>.`;
      },
    };

    this.enhancer.summaryPanel.updateContent({
      title: messageTemplates.title,
      metadata: messageTemplates.metadata[status],
      text: messageTemplates.text(status, highlightedAuthor),
    });

    this.addOptionsLinkHandler();
  }

  /**
   * Add options link handler
   */
  addOptionsLinkHandler() {
    const optionsLink =
      this.enhancer.summaryPanel.panel.querySelector("#options-page-link");
    if (optionsLink) {
      optionsLink.addEventListener("click", (e) => {
        e.preventDefault();
        this.openOptionsPage();
      });
    }
  }

  /**
   * Checks if text should be summarized based on various criteria
   */
  shouldSummarizeText(formattedText, commentDepth, aiProvider) {
    const sentences = formattedText
      .split(/[.!?]+(?:\s+|$)/)
      .filter((sentence) => sentence.trim().length > 0);

    if (sentences.length <= SUMMARIZATION_CONFIG.LIMITS.MIN_SENTENCE_LENGTH) {
      return { status: this.SummarizeCheckStatus.TEXT_TOO_SHORT };
    }
    if (commentDepth <= SUMMARIZATION_CONFIG.LIMITS.MIN_COMMENT_DEPTH) {
      return { status: this.SummarizeCheckStatus.THREAD_TOO_SHALLOW };
    }

    return { status: this.SummarizeCheckStatus.OK };
  }

  /**
   * Gets AI provider and model from storage
   */
  async getAIProviderModel() {
    return await this.enhancer.apiClient.sendBackgroundMessage(
      "FETCH_AI_SETTINGS"
    );
  }

  /**
   * Saves a summary to cache with current context
   */
  async saveSummaryToCache(
    summary,
    commentPathToIdMap,
    duration,
    targetCommentId = null
  ) {
    try {
      const postId = this.enhancer.domUtils.getCurrentHNItemId();
      const { aiProvider, model, language } = await this.getAIProviderModel();

      if (postId && aiProvider && model && language && summary) {
        const metadata = {
          duration,
          commentCount: commentPathToIdMap?.size || 0,
          timestamp: Date.now(),
        };

        HNState.saveSummary(
          postId,
          targetCommentId,
          aiProvider,
          model,
          language,
          summary,
          metadata
        );

        this.enhancer.logInfo(
          `Saved summary to cache: ${postId}${
            targetCommentId ? `_${targetCommentId}` : "_post"
          } (provider=${aiProvider}, model=${model}, language=${language})`
        );

        if (targetCommentId) {
          this.updateCacheIndicatorsForComment(targetCommentId);
        } else {
          // Update post-level indicators when saving post summary
          this.updateCacheIndicatorsForPost();
        }
      }
    } catch (error) {
      console.error("Error saving summary to cache:", error);
    }
  }

  /**
   * Shows a message to configure AI provider
   */
  showConfigureAIMessage(targetElement = null) {
    const message = `To use the summarization feature, you need to configure an AI provider. <br/><br/>
      Please <a href="#" id="options-page-link">open the settings page</a> to select and configure your preferred AI provider (OpenAI, Anthropic, and others).`;

    const container = targetElement || this.enhancer.summaryPanel.panel;

    if (!container) {
      console.error(
        "Cannot show configure AI message: No target container found."
      );
      return;
    }

    if (targetElement) {
      targetElement.innerHTML = `<div class="chat-message chat-message-system"><strong>System:</strong> ${message}</div>`;
    } else {
      if (!this.enhancer.summaryPanel.isVisible) {
        this.enhancer.summaryPanel.toggle();
      }
      this.enhancer.summaryPanel.updateContent({
        title: "AI Provider Setup Required",
        metadata: "",
        text: message,
      });
    }

    const optionsLink = container.querySelector("#options-page-link");
    if (optionsLink) {
      optionsLink.removeEventListener("click", this._handleOptionsLinkClick);
      optionsLink.addEventListener(
        "click",
        this._handleOptionsLinkClick.bind(this)
      );
    }
  }

  /**
   * Handles the click event for the options page link
   */
  _handleOptionsLinkClick(e) {
    e.preventDefault();
    this.openOptionsPage();
  }

  /**
   * Opens the options page
   */
  openOptionsPage() {
    chrome.runtime
      .sendMessage({ type: "HN_SHOW_OPTIONS", data: {} })
      .catch((error) =>
        console.error("Error sending message to show options:", error)
      );
  }

  /**
   * Gets HN thread data for summarization
   */
  async getHNThread(itemId) {
    try {
      const commentsJson = await this.enhancer.apiClient.fetchHNCommentsFromAPI(
        itemId
      );
      const commentsInDOM = this.getCommentsFromDOM();
      const enhancedComments = this.enrichPostComments(
        commentsJson,
        commentsInDOM
      );

      const commentPathToIdMap = new Map();
      enhancedComments.forEach((comment, id) => {
        commentPathToIdMap.set(comment.path, id);
      });

      const formattedComment = [...enhancedComments.values()]
        .map(
          (comment) =>
            [
              `[${comment.path}]`,
              `(score: ${comment.score})`,
              `<replies: ${comment.replies}>`,
              `{downvotes: ${comment.downvotes}}`,
              `${comment.author}:`,
              comment.text,
            ].join(" ") + "\n"
        )
        .join("");

      return { formattedComment, commentPathToIdMap };
    } catch (error) {
      console.error(`Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gets comments from the DOM
   */
  getCommentsFromDOM() {
    const commentsInDOM = new Map();
    const commentRows = document.querySelectorAll(".comtr");

    let skippedComments = 0;
    commentRows.forEach((commentRow, index) => {
      const commentFlagged =
        commentRow.classList.contains("coll") ||
        commentRow.classList.contains("noshow");
      const commentTextDiv = commentRow.querySelector(".commtext");

      if (commentFlagged || !commentTextDiv) {
        skippedComments++;
        return;
      }

      const commentText = this.sanitizeCommentText(commentTextDiv);
      const downvotes = this.enhancer.domUtils.getDownvoteCount(commentTextDiv);
      const commentId = commentRow.getAttribute("id");

      commentsInDOM.set(Number(commentId), {
        position: index,
        text: commentText,
        downvotes: downvotes,
      });
    });

    this.enhancer.logDebug(
      `Comments from DOM:: Total: ${commentRows.length}. Skipped (flagged): ${skippedComments}. Remaining: ${commentsInDOM.size}`
    );

    return commentsInDOM;
  }

  /**
   * Sanitize comment text
   */
  sanitizeCommentText(commentTextDiv) {
    const tempDiv = commentTextDiv.cloneNode(true);

    // Remove unwanted HTML elements
    [...tempDiv.querySelectorAll("a, code, pre")].forEach((element) =>
      element.remove()
    );

    // Replace <p> tags with their text content
    tempDiv.querySelectorAll("p").forEach((p) => {
      p.replaceWith(p.textContent);
    });

    // Decode HTML entities
    const txt = document.createElement("textarea");
    txt.innerHTML = tempDiv.innerHTML;
    return txt.value.replace(/\n+/g, " ");
  }

  /**
   * Enriches post comments with additional metadata
   */
  enrichPostComments(commentsTree, commentsInDOM) {
    let flatComments = new Map();

    let apiComments = 0;
    let skippedComments = 0;

    const flattenCommentTree = (comment, parentId) => {
      apiComments++;

      if (comment.type === "story") {
        if (comment.children && comment.children.length > 0) {
          comment.children.forEach((child) => flattenCommentTree(child, null));
        }
        return;
      }

      const commentInDOM = commentsInDOM.get(comment.id);
      if (!commentInDOM) {
        skippedComments++;
        return;
      }

      flatComments.set(comment.id, {
        id: comment.id,
        author: comment.author,
        replies: comment.children?.length || 0,
        position: commentInDOM.position,
        text: commentInDOM.text,
        downvotes: commentInDOM.downvotes,
        parentId: parentId,
      });

      if (comment.children && comment.children.length > 0) {
        comment.children.forEach((child) =>
          flattenCommentTree(child, comment.id)
        );
      }
    };

    flattenCommentTree(commentsTree, null);

    this.enhancer.logDebug(
      `Comments from API:: Total: ${
        apiComments - 1
      }. Skipped: ${skippedComments}. Remaining: ${flatComments.size}`
    );

    // Sort by position and calculate paths and scores
    const enrichedComments = new Map(
      [...flatComments.entries()].sort((a, b) => a[1].position - b[1].position)
    );

    this.calculatePathsAndScores(enrichedComments);
    return enrichedComments;
  }

  /**
   * Calculate paths and scores for comments
   */
  calculatePathsAndScores(enrichedComments) {
    let topLevelCounter = 1;

    const calculatePath = (comment) => {
      if (!comment.parentId) {
        return String(topLevelCounter++);
      } else {
        const parentPath = enrichedComments.get(comment.parentId).path;
        const siblings = [...enrichedComments.values()].filter(
          (c) => c.parentId === comment.parentId
        );
        const positionInParent =
          siblings.findIndex((c) => c.id === comment.id) + 1;
        return `${parentPath}.${positionInParent}`;
      }
    };

    const calculateScore = (comment, totalCommentCount) => {
      const downvotes = comment.downvotes || 0;
      const defaultScore = Math.floor(
        SUMMARIZATION_CONFIG.LIMITS.MAX_SCORE -
          (comment.position * SUMMARIZATION_CONFIG.LIMITS.MAX_SCORE) /
            totalCommentCount
      );
      const penaltyPerDownvote =
        defaultScore / SUMMARIZATION_CONFIG.LIMITS.MAX_DOWNVOTES;
      const penalty = penaltyPerDownvote * downvotes;
      return Math.floor(Math.max(defaultScore - penalty, 0));
    };

    enrichedComments.forEach((comment) => {
      comment.path = calculatePath(comment);
      comment.score = calculateScore(comment, enrichedComments.size);
    });
  }

  /**
   * Summarizes text using the selected AI provider
   */
  async summarizeTextWithAI(
    formattedComment,
    commentPathToIdMap,
    hnItemId = null,
    targetCommentId = null
  ) {
    try {
      const data = await chrome.storage.sync.get("settings");
      const providerSelection = data.settings?.providerSelection;
      const streamingEnabled = data.settings?.streamingEnabled || false;

      if (!providerSelection) {
        this.showConfigureAIMessage();
        return;
      }

      // Check for cached summary first
      const postId = this.enhancer.domUtils.getCurrentHNItemId();
      const cachedSummary = await this.checkCachedSummary(
        postId,
        targetCommentId,
        providerSelection
      );

      if (cachedSummary) {
        await this.displayCachedSummary(cachedSummary, commentPathToIdMap);
        return;
      }

      // Remove unnecessary anchor tags
      formattedComment =
        this.enhancer.markdownUtils.stripAnchors(formattedComment);

      // Call appropriate AI provider
      await this.callAIProvider(
        providerSelection,
        formattedComment,
        commentPathToIdMap,
        streamingEnabled,
        targetCommentId,
        data.settings
      );
    } catch (error) {
      this.handleError("Error fetching settings", error);
    }
  }

  /**
   * Check for cached summary
   */
  async checkCachedSummary(postId, targetCommentId, providerSelection) {
    const { model, language } = await this.getAIProviderModel();

    this.enhancer.logDebug(
      `Looking for cached summary: postId=${postId}, commentId=${targetCommentId}, provider=${providerSelection}, model=${model}, language=${language}`
    );

    const cachedSummary = await HNState.getSummary(
      postId,
      targetCommentId,
      providerSelection,
      model,
      language
    );

    this.enhancer.logDebug(
      `Cache lookup result: ${cachedSummary ? "FOUND" : "NOT FOUND"}`
    );

    return cachedSummary;
  }

  /**
   * Display cached summary
   */
  async displayCachedSummary(cachedSummary, commentPathToIdMap) {
    this.enhancer.logInfo(`Using cached summary`);

    const cacheAge = Math.round(
      (Date.now() - cachedSummary.timestamp) / (1000 * 60)
    );
    const cacheIndicator = `<span class="cache-indicator">📋 Cached (${cacheAge}m ago)</span>`;

    await this.showSummaryInPanel(
      cachedSummary.summary,
      commentPathToIdMap,
      cachedSummary.metadata?.duration,
      cacheIndicator
    );
  }

  /**
   * Call appropriate AI provider
   */
  async callAIProvider(
    providerSelection,
    formattedComment,
    commentPathToIdMap,
    streamingEnabled,
    targetCommentId,
    settings
  ) {
    const model = settings?.[providerSelection]?.model;
    const apiKey = settings?.[providerSelection]?.apiKey;

    this.enhancer.logInfo(
      `Summarization - AI Provider: ${providerSelection}, Model: ${
        model || "none"
      }, Streaming: ${streamingEnabled}`
    );

    const providers = {
      openai: () =>
        this.summarizeUsingProvider(
          "OPENAI_API_REQUEST",
          formattedComment,
          model,
          apiKey,
          commentPathToIdMap,
          streamingEnabled,
          targetCommentId
        ),
      anthropic: () =>
        this.summarizeUsingProvider(
          "ANTHROPIC_API_REQUEST",
          formattedComment,
          model,
          apiKey,
          commentPathToIdMap,
          streamingEnabled,
          targetCommentId,
          true
        ),
      deepseek: () =>
        this.summarizeUsingProvider(
          "DEEPSEEK_API_REQUEST",
          formattedComment,
          model,
          apiKey,
          commentPathToIdMap,
          false,
          targetCommentId
        ),
      gemini: () =>
        this.summarizeUsingGemini(
          formattedComment,
          model,
          commentPathToIdMap,
          targetCommentId
        ),
      litellm: () =>
        this.summarizeUsingProvider(
          "LITELLM_API_REQUEST",
          formattedComment,
          model,
          apiKey,
          commentPathToIdMap,
          streamingEnabled,
          targetCommentId
        ),
      none: () =>
        this.showSummaryInPanel(formattedComment, commentPathToIdMap, 0),
    };

    const providerFunction = providers[providerSelection];
    if (providerFunction) {
      await providerFunction();
    } else {
      throw new Error(`Unknown provider: ${providerSelection}`);
    }
  }

  /**
   * Generic method for most AI providers
   */
  async summarizeUsingProvider(
    messageType,
    text,
    model,
    apiKey,
    commentPathToIdMap,
    streamingEnabled = false,
    targetCommentId = null,
    isAnthropic = false
  ) {
    // Validate required parameters
    const requiredParams =
      isAnthropic || messageType === "LITELLM_API_REQUEST"
        ? [text, model]
        : [text, model, apiKey];
    if (requiredParams.some((param) => !param)) {
      this.showError("Missing API configuration");
      return;
    }

    try {
      const { maxTokens, temperature } = await this.getAIProviderModel();
      const tokenLimitText = this.splitInputTextAtTokenLimit(text, maxTokens);
      const { systemPrompt, userPrompt } = await this.preparePrompts(
        tokenLimitText
      );

      const requestData = this.buildRequestData(
        messageType,
        systemPrompt,
        userPrompt,
        model,
        apiKey,
        maxTokens,
        temperature,
        streamingEnabled,
        isAnthropic
      );

      if (streamingEnabled && messageType !== "DEEPSEEK_API_REQUEST") {
        await this.handleStreamingResponse(
          messageType,
          requestData,
          commentPathToIdMap,
          targetCommentId
        );
      } else {
        const response = await this.enhancer.apiClient.sendBackgroundMessage(
          messageType,
          requestData
        );
        const summary = this.extractSummaryFromResponse(response, isAnthropic);

        await this.saveSummaryToCache(
          summary,
          commentPathToIdMap,
          response.duration,
          targetCommentId
        );
        await this.showSummaryInPanel(
          summary,
          commentPathToIdMap,
          response.duration
        );
      }
    } catch (error) {
      this.handleProviderError(error, messageType, model);
    }
  }

  /**
   * Prepare prompts for AI
   */
  async preparePrompts(text) {
    const systemPrompt = this.getSystemMessage();
    const postTitle = this.enhancer.domUtils.getHNPostTitle();
    const userPrompt = await this.getUserMessage(postTitle, text);
    return { systemPrompt, userPrompt };
  }

  /**
   * Build request data for AI provider
   */
  buildRequestData(
    messageType,
    systemPrompt,
    userPrompt,
    model,
    apiKey,
    maxTokens,
    temperature,
    streamingEnabled,
    isAnthropic
  ) {
    const baseData = {
      apiKey,
      model,
      max_tokens: maxTokens,
      temperature,
      streaming: streamingEnabled,
    };

    if (isAnthropic) {
      return {
        ...baseData,
        messages: [{ role: "user", content: userPrompt }],
        system: systemPrompt,
      };
    } else {
      return {
        ...baseData,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      };
    }
  }

  /**
   * Extract summary from API response
   */
  extractSummaryFromResponse(response, isAnthropic = false) {
    if (isAnthropic) {
      if (!response?.content?.[0]?.text) {
        throw new Error("No summary generated from API response");
      }
      return response.content[0].text;
    } else {
      if (!response?.choices?.[0]?.message?.content) {
        throw new Error("No summary generated from API response");
      }
      return response.choices[0].message.content;
    }
  }

  /**
   * Handle provider-specific errors
   */
  handleProviderError(error, messageType, model) {
    console.error(`Error in ${messageType} summarization:`, error);

    let errorMessage = `Error generating summary using ${
      messageType.split("_")[0]
    } model ${model}. `;

    if (error.message.includes("API key")) {
      errorMessage += "Please check your API key configuration.";
    } else if (error.message.includes("429")) {
      errorMessage += "Rate limit exceeded. Please try again later.";
    } else if (error.message.includes("current quota")) {
      errorMessage += "API quota exceeded. Please try again later.";
    } else if (
      error.message.includes("Connection refused") ||
      error.message.includes("ECONNREFUSED")
    ) {
      errorMessage += "Server is not running. Please check the connection.";
    } else if (error.message.includes("404")) {
      errorMessage +=
        "Model not found. Please check if the model is available.";
    } else {
      errorMessage += error.message + " Please try again later.";
    }

    this.showError(errorMessage);
  }

  /**
   * Summarizes text using Gemini (special handling)
   */
  async summarizeUsingGemini(
    text,
    model,
    commentPathToIdMap,
    targetCommentId = null
  ) {
    const data = await chrome.storage.sync.get("settings");
    const apiKey = data.settings?.gemini?.apiKey;

    if (!text || !model || !apiKey) {
      this.showError("Missing API configuration for Gemini");
      return;
    }

    try {
      const { maxTokens, temperature } = await this.getAIProviderModel();
      const tokenLimitText = this.splitInputTextAtTokenLimit(text, maxTokens);
      const { systemPrompt, userPrompt } = await this.preparePrompts(
        tokenLimitText
      );

      const response = await this.enhancer.apiClient.sendBackgroundMessage(
        "GEMINI_API_REQUEST",
        {
          apiKey,
          model,
          systemPrompt,
          userPrompt,
          max_tokens: maxTokens,
          temperature,
        }
      );

      if (!response) {
        throw new Error("No response from Gemini API");
      }

      let summary;
      if (response.choices?.[0]?.message?.content) {
        summary = response.choices[0].message.content;
      } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
        summary = response.candidates[0].content.parts[0].text;
      } else {
        throw new Error("Invalid response format from Gemini API");
      }

      await this.saveSummaryToCache(
        summary,
        commentPathToIdMap,
        response.duration,
        targetCommentId
      );
      await this.showSummaryInPanel(
        summary,
        commentPathToIdMap,
        response.duration
      );
    } catch (error) {
      this.handleProviderError(error, "GEMINI_API_REQUEST", model);
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    this.enhancer.summaryPanel.updateContent({
      title: "Error",
      text: message,
    });
  }

  /**
   * Handle general errors
   */
  handleError(context, error) {
    console.error(context, error);
    this.enhancer.summaryPanel.updateContent({
      title: "Error",
      metadata: "",
      text: `${context}: ${error.message}`,
    });
  }

  /**
   * Gets the system message for AI summarization
   */
  getSystemMessage() {
    return `You are an AI assistant specialized in analyzing and summarizing Hacker News discussions.
Your goal is to help users quickly understand the key discussions and insights from Hacker News threads without having to read through lengthy comment sections.

Follow these guidelines:

1. Discussion Structure Understanding:
   Comments are formatted as: [hierarchy_path] (score: X) <replies: Y> {downvotes: Z} Author: Comment
   - hierarchy_path: Shows the comment's position in the discussion tree
   - score: A normalized value between 1000 and 1, representing the comment's relative importance
   - replies: Number of direct responses to this comment
   - downvotes: Number of downvotes the comment received (exclude comments with 4+ downvotes)

2. Content Prioritization:
   - Focus on high-scoring comments as they represent valuable community insights
   - Pay attention to comments with many replies as they sparked discussion
   - Consider the combination of score, downvotes AND replies to gauge overall importance

3. Theme Identification:
   - Use top-level comments to identify main discussion themes
   - Group related comments into thematic clusters
   -

Track how each theme develops through reply chains

4. Quality Assessment:
   - Prioritize comments that exhibit a combination of high score, low downvotes, substantial replies, and depth of content
   - Actively identify and highlight expert explanations or in-depth analyses

Based on the above instructions, you should summarize the discussion. Your output should be well-structured, informative, and easily digestible for someone who hasn't read the original thread.

Your response should be formatted using markdown and should have the following structure:

# Overview
Brief summary of the overall discussion in 2-3 sentences.

# Main Themes & Key Insights
[Bulleted list of themes, ordered by community engagement]

# [Theme 1 title]
[Summarize key insights with hierarchy_paths for linking back to comments]

# Key Perspectives
[Present contrasting perspectives with hierarchy_paths and author attribution]

# Notable Side Discussions
[Interesting tangents that added value with hierarchy_paths]`;
  }

  /**
   * Splits input text at token limit
   */
  splitInputTextAtTokenLimit(text, tokenLimit) {
    if (
      text.length * SUMMARIZATION_CONFIG.LIMITS.TOKENS_PER_CHAR <
      tokenLimit
    ) {
      return text;
    }

    const lines = text.split("\n");
    let outputText = "";
    let currentTokenCount = 0;

    for (const line of lines) {
      const lineTokenCount =
        line.length * SUMMARIZATION_CONFIG.LIMITS.TOKENS_PER_CHAR;
      if (currentTokenCount + lineTokenCount >= tokenLimit) {
        break;
      }
      outputText += line + "\n";
      currentTokenCount += lineTokenCount;
    }

    return outputText;
  }

  /**
   * Gets the user message for AI summarization
   */
  async getUserMessage(title, text) {
    const { language } = await this.getAIProviderModel();

    let languageInstruction = "";
    if (language !== "en") {
      languageInstruction =
        SUMMARIZATION_CONFIG.LANGUAGE_INSTRUCTIONS[language] || "";
    }

    return `Provide a concise and insightful summary of the following Hacker News discussion, as per the guidelines you've been given.
The goal is to help someone quickly grasp the main discussion points and key perspectives without reading all comments.
Please focus on extracting the main themes, significant viewpoints, and high-quality contributions.
The post title and comments are separated by three dashed lines:
---
Post Title:
${title}
---
Comments:
${text}
---
${languageInstruction}`;
  }

  /**
   * Handles streaming responses from AI providers
   */
  async handleStreamingResponse(
    messageType,
    requestData,
    commentPathToIdMap,
    targetCommentId = null
  ) {
    let accumulatedText = "";
    let lastUpdateTime = 0;

    this.enhancer.summaryPanel.updateContent({
      title: "Thread Summary",
      text: `<div>Generating summary... <span class="loading-spinner"></span></div>`,
      metadata: "",
    });

    const streamingPromise = new Promise((resolve, reject) => {
      const messageListener = (message) => {
        if (message.type === `${messageType}_STREAM_CHUNK`) {
          const chunk = message.data;
          let content = "";

          if (
            messageType === "OPENAI_API_REQUEST" ||
            messageType === "LITELLM_API_REQUEST"
          ) {
            content = chunk.choices?.[0]?.delta?.content || "";
          } else if (messageType === "ANTHROPIC_API_REQUEST") {
            if (chunk.type === "content_block_delta") {
              content = chunk.delta?.text || "";
            }
          }

          if (content) {
            accumulatedText += content;
            const now = Date.now();
            if (
              now - lastUpdateTime >
              SUMMARIZATION_CONFIG.LIMITS.UPDATE_INTERVAL
            ) {
              this.updateStreamingUI(accumulatedText, commentPathToIdMap);
              lastUpdateTime = now;
            }
          }

          if (chunk.choices?.[0]?.finish_reason === "stop") {
            resolve();
          }
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);

      this.enhancer.apiClient
        .sendBackgroundMessage(messageType, requestData)
        .then((response) => {
          if (response && response.done) {
            resolve();
          } else if (response && !response.success) {
            reject(
              new Error(
                response.error || "Unknown error from background script"
              )
            );
          } else {
            resolve();
          }
        })
        .catch(reject)
        .finally(() => {
          chrome.runtime.onMessage.removeListener(messageListener);
        });
    });

    try {
      await streamingPromise;
    } catch (error) {
      console.error("Error during streaming:", error);
      this.enhancer.summaryPanel.updateContent({
        title: "Error",
        text: `Error generating streaming summary: ${error.message}`,
      });
      return;
    }

    this.updateStreamingUI(accumulatedText, commentPathToIdMap, true);
    await this.saveSummaryToCache(
      accumulatedText,
      commentPathToIdMap,
      0,
      targetCommentId
    );
    await this.showSummaryInPanel(accumulatedText, commentPathToIdMap, 0);
  }

  /**
   * Updates the UI with streaming content
   */
  updateStreamingUI(text, commentPathToIdMap, isFinal = false) {
    const summaryHtml = this.enhancer.markdownUtils.convertMarkdownToHTML(text);
    const formattedSummary =
      this.enhancer.markdownUtils.replacePathsWithCommentLinks(
        summaryHtml,
        commentPathToIdMap
      );

    this.enhancer.summaryPanel.updateContent({
      title: "Thread Summary",
      text: formattedSummary + (isFinal ? "" : "..."),
    });
  }

  /**
   * Shows the summary in the summary panel
   */
  async showSummaryInPanel(
    summary,
    commentPathToIdMap,
    duration,
    cacheIndicator = null
  ) {
    const summaryHtml =
      this.enhancer.markdownUtils.convertMarkdownToHTML(summary);
    const formattedSummary =
      this.enhancer.markdownUtils.replacePathsWithCommentLinks(
        summaryHtml,
        commentPathToIdMap
      );

    const { aiProvider, model, language } = await this.getAIProviderModel();
    if (aiProvider) {
      let metadataText = `Summarized using <strong>${aiProvider} ${
        model || ""
      }</strong> in <strong>${duration ?? "0"} secs</strong>`;

      if (language && language !== "en") {
        const languageName = this.getLanguageName(language);
        metadataText += ` in <strong>${languageName}</strong>`;
      }

      if (cacheIndicator) {
        metadataText += ` ${cacheIndicator}`;
      }

      this.enhancer.summaryPanel.updateContent({
        metadata: metadataText,
        text: formattedSummary,
      });
    } else {
      this.enhancer.summaryPanel.updateContent({
        text: formattedSummary,
      });
    }

    // Attach listeners to comment links
    document.querySelectorAll('[data-comment-link="true"]').forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const id = link.dataset.commentId;
        const comment = document.getElementById(id);
        if (comment) {
          this.enhancer.navigation.setCurrentComment(comment);
        } else {
          console.error("Failed to find DOM element for comment id:", id);
        }
      });
    });
  }

  /**
   * Gets the language name from language code
   */
  getLanguageName(language) {
    return SUMMARIZATION_CONFIG.LANGUAGE_NAMES[language] || language;
  }

  /**
   * Updates cache indicators for a specific comment
   */
  async updateCacheIndicatorsForComment(commentId) {
    try {
      const commentElement =
        this.enhancer.domUtils.findCommentElementById(commentId);
      if (commentElement) {
        const existingIndicators =
          commentElement.querySelector(".cache-indicators");
        if (existingIndicators) {
          existingIndicators.remove();
        }
        await this.enhancer.addCacheIndicators(commentElement);
      }
    } catch (error) {
      console.error("Error updating cache indicators:", error);
    }
  }

  /**
   * Updates cache indicators for the post
   */
  async updateCacheIndicatorsForPost() {
    try {
      const sublineElement = document.querySelector(".subtext .subline");
      if (sublineElement) {
        const existingIndicators =
          sublineElement.querySelector(".cache-indicators");
        if (existingIndicators) {
          existingIndicators.remove();
        }
        await this.enhancer.addCacheIndicators(); // Call without comment parameter for post-level
      }
    } catch (error) {
      console.error("Error updating post cache indicators:", error);
    }
  }
}

// Make the class available globally
window.Summarization = Summarization;
