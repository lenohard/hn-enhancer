/**
 * Full-height editor for the exact request used by the next post summary.
 */
class ExtractPanel {
  constructor(enhancer) {
    this.enhancer = enhancer;
    this.previouslyFocusedElement = null;
    this.refreshSequence = 0;
    this.currentPreview = null;
    this.userTextDirty = false;
    this.isApplied = false;
    this.onKeyDown = this.onKeyDown.bind(this);
    this.panel = this.createPanel();
    document.body.appendChild(this.panel);
    document.addEventListener("keydown", this.onKeyDown);
  }

  get isVisible() {
    return Boolean(
      this.panel?.isConnected && this.panel.style.display !== "none"
    );
  }

  ensureMounted() {
    if (!this.panel) this.panel = this.createPanel();
    if (!this.panel.isConnected) document.body.appendChild(this.panel);
  }

  createPanel() {
    const panel = document.createElement("div");
    panel.className = "hn-extract-panel";
    panel.style.display = "none";
    panel.setAttribute("role", "complementary");
    panel.setAttribute("aria-label", "AI request preview and editor");
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = `
      <div class="hn-extract-panel-header">
        <div>
          <h3 class="hn-extract-panel-title">Request Preview</h3>
          <div class="hn-extract-panel-subtitle">Edit what the next summary sends</div>
        </div>
        <button type="button" class="hn-extract-panel-close" title="Close" aria-label="Close">×</button>
      </div>
      <div class="hn-extract-panel-body">
        <div class="hn-extract-panel-meta"></div>
        <div class="hn-extract-panel-note"></div>

        <section class="hn-preview-section hn-preview-attachments" hidden>
          <div class="hn-preview-section-header">
            <strong>Visual attachments</strong>
            <span class="hn-preview-attachment-count"></span>
          </div>
          <div class="hn-extract-panel-screenshot" hidden>
            <div class="hn-extract-panel-visual-header">
              <label class="hn-preview-check">
                <input type="checkbox" data-preview-attachment="S1" checked>
                <span><strong>[S1] Full-page screenshot</strong><small>Include in request</small></span>
              </label>
              <button type="button" class="hn-preview-focus hn-preview-focus-screenshot">Focus source</button>
            </div>
            <button type="button" class="hn-preview-screenshot-zoom" aria-label="Enlarge full-page screenshot" aria-pressed="false" title="Click to enlarge">
              <img class="hn-extract-panel-screenshot-image" alt="Full webpage screenshot">
            </button>
          </div>
          <div class="hn-extract-panel-thumbs" hidden></div>
        </section>

        <label class="hn-preview-field">
          <span class="hn-preview-field-label"><strong>System message</strong><small>Editable</small></span>
          <textarea class="hn-preview-system" rows="5" spellcheck="false"></textarea>
        </label>
        <label class="hn-preview-field hn-preview-user-field">
          <span class="hn-preview-field-label"><strong>User message</strong><small>Editable · visual labels are represented above</small></span>
          <textarea class="hn-preview-user" rows="16" spellcheck="false"></textarea>
        </label>

        <div class="hn-preview-actions">
          <span class="hn-preview-apply-status" role="status">Not applied</span>
          <button type="button" class="hn-preview-apply">Apply to next summary</button>
        </div>
      </div>
    `;

    panel
      .querySelector(".hn-extract-panel-close")
      .addEventListener("click", () => this.hide());
    panel
      .querySelector(".hn-preview-focus-screenshot")
      .addEventListener("click", () => this._focusSource("S1"));
    panel
      .querySelector(".hn-preview-screenshot-zoom")
      .addEventListener("click", () => this._toggleScreenshotZoom());
    panel
      .querySelector(".hn-preview-apply")
      .addEventListener("click", () => this.applyToNextSummary());

    panel
      .querySelector(".hn-preview-system")
      .addEventListener("input", () => {
        this._markPending();
        this._updateMeta();
      });
    panel
      .querySelector(".hn-preview-user")
      .addEventListener("input", () => {
        this.userTextDirty = true;
        this._markPending();
        this._updateMeta();
      });
    panel
      .querySelector(".hn-preview-attachments")
      .addEventListener("change", (event) => {
        if (!event.target.matches("[data-preview-attachment]")) return;
        this._markPending();
        this._refreshGeneratedUserText();
        this._updateAttachmentCount();
        this._updateMeta();
      });

    return panel;
  }

  onKeyDown(event) {
    if (event.key === "Escape" && this.isVisible) {
      event.preventDefault();
      if (this.panel.classList.contains("is-screenshot-expanded")) {
        this._toggleScreenshotZoom(false);
        return;
      }
      this.hide();
    }
  }

  _setActive(active) {
    this.enhancer.hubPanel?.setExtractActive?.(active);
  }

  _focusSource(ref) {
    this.hide();
    requestAnimationFrame(() => {
      this.enhancer.summarization?._resolveAndScrollToRef(ref);
    });
  }

  _toggleScreenshotZoom(force) {
    const zoomButton = this.panel.querySelector(
      ".hn-preview-screenshot-zoom"
    );
    const expanded =
      typeof force === "boolean"
        ? force
        : !this.panel.classList.contains("is-screenshot-expanded");
    this.panel.classList.toggle("is-screenshot-expanded", expanded);
    zoomButton.setAttribute("aria-pressed", expanded ? "true" : "false");
    zoomButton.setAttribute(
      "aria-label",
      expanded ? "Close enlarged screenshot" : "Enlarge full-page screenshot"
    );
    zoomButton.title = expanded ? "Click or press Escape to close" : "Click to enlarge";
  }

  _markPending() {
    if (this.isApplied) {
      this.enhancer.summarization?.clearNextRequestPreviewOverride?.();
    }
    this.isApplied = false;
    const status = this.panel.querySelector(".hn-preview-apply-status");
    status.textContent = "Edits not applied";
    status.classList.remove("is-applied");
  }

  _getSelectedImageEntries() {
    if (!this.currentPreview) return [];
    const selectedRefs = new Set(
      [...this.panel.querySelectorAll('[data-preview-attachment^="I"]:checked')]
        .map((input) => input.dataset.previewAttachment)
    );
    return this.currentPreview.imageEntries.filter((entry) =>
      selectedRefs.has(entry.ref)
    );
  }

  _getSelectedScreenshot() {
    const checkbox = this.panel.querySelector(
      '[data-preview-attachment="S1"]'
    );
    return checkbox?.checked ? this.currentPreview?.screenshot || null : null;
  }

  _renderUserText(imageEntries, screenshot) {
    const selectedImageRefs = new Set(imageEntries.map((entry) => entry.ref));
    const baseText = String(this.currentPreview?.baseUserPrompt || "")
      .split("\n")
      .filter((line) => {
        const match = line.match(/^\s*\[(I\d+)\]\s*$/);
        return !match || selectedImageRefs.has(match[1]);
      })
      .join("\n");
    const content = this.enhancer.adapter?.buildVisionMessageContent
      ? this.enhancer.adapter.buildVisionMessageContent(
          baseText,
          imageEntries,
          screenshot ? [screenshot] : []
        )
      : baseText;
    if (!Array.isArray(content)) return String(content || "");
    return content.find((part) => part?.type === "text")?.text || "";
  }

  _refreshGeneratedUserText() {
    if (this.userTextDirty) return;
    this.panel.querySelector(".hn-preview-user").value = this._renderUserText(
      this._getSelectedImageEntries(),
      this._getSelectedScreenshot()
    );
  }

  _updateAttachmentCount() {
    const all = this.panel.querySelectorAll("[data-preview-attachment]").length;
    const selected = this.panel.querySelectorAll(
      "[data-preview-attachment]:checked"
    ).length;
    const count = this.panel.querySelector(".hn-preview-attachment-count");
    count.textContent = `${selected} of ${all} included`;
  }

  _updateMeta() {
    if (!this.currentPreview) return;
    const metaEl = this.panel.querySelector(".hn-extract-panel-meta");
    const chars = (
      this.panel.querySelector(".hn-preview-system").value.length +
      this.panel.querySelector(".hn-preview-user").value.length
    ).toLocaleString();
    const model = this.currentPreview.model || "Model not configured";
    metaEl.replaceChildren();

    const titleEl = document.createElement("span");
    titleEl.className = "hn-extract-panel-article-title";
    titleEl.textContent = `${this.currentPreview.provider} / ${model}`;
    titleEl.title = titleEl.textContent;

    const charsEl = document.createElement("span");
    charsEl.className = "hn-extract-panel-chars";
    charsEl.textContent = `${chars} text chars`;
    metaEl.append(titleEl, charsEl);
  }

  applyToNextSummary() {
    if (!this.currentPreview) return;
    const applied = this.enhancer.summarization?.setNextRequestPreviewOverride?.({
      pageUrl: window.location.href,
      provider: this.currentPreview.provider,
      model: this.currentPreview.model,
      systemPrompt: this.panel.querySelector(".hn-preview-system").value,
      userPrompt: this.panel.querySelector(".hn-preview-user").value,
      userPromptIsFinal: true,
      imageEntries: this._getSelectedImageEntries(),
      screenshot: this._getSelectedScreenshot(),
    });

    const status = this.panel.querySelector(".hn-preview-apply-status");
    if (applied) {
      this.isApplied = true;
      status.textContent = "Applied to next summary only";
      status.classList.add("is-applied");
    } else {
      status.textContent = "Could not apply this preview";
      status.classList.remove("is-applied");
    }
  }

  hide() {
    if (!this.panel) return;
    this.refreshSequence += 1;
    this.panel.style.display = "none";
    this.panel.setAttribute("aria-hidden", "true");
    this._toggleScreenshotZoom(false);
    this.panel
      .querySelector(".hn-extract-panel-screenshot-image")
      ?.removeAttribute("src");
    this.currentPreview = null;
    this.enhancer.screenshotCapture?.releaseActiveData();
    this._setActive(false);
    if (this.previouslyFocusedElement?.isConnected) {
      this.previouslyFocusedElement.focus({ preventScroll: true });
    }
    this.previouslyFocusedElement = null;
  }

  async show() {
    this.ensureMounted();
    if (!this.panel) return;
    this.previouslyFocusedElement = document.activeElement;
    this.panel.style.display = "flex";
    this.panel.setAttribute("aria-hidden", "false");
    this._setActive(true);
    await this.refresh();
    if (!this.isVisible) return;
    this.panel.querySelector(".hn-extract-panel-close")?.focus({
      preventScroll: true,
    });
  }

  toggle() {
    if (this.isVisible) this.hide();
    else this.show();
  }

  async refresh() {
    const sequence = ++this.refreshSequence;
    // Opening a fresh preview supersedes any previously applied request so
    // the visible state can never disagree with what will be sent next.
    this.enhancer.summarization?.clearNextRequestPreviewOverride?.();
    const metaEl = this.panel.querySelector(".hn-extract-panel-meta");
    const noteEl = this.panel.querySelector(".hn-extract-panel-note");
    const attachmentsEl = this.panel.querySelector(".hn-preview-attachments");
    const screenshotEl = this.panel.querySelector(
      ".hn-extract-panel-screenshot"
    );
    const screenshotImage = this.panel.querySelector(
      ".hn-extract-panel-screenshot-image"
    );
    const thumbsEl = this.panel.querySelector(".hn-extract-panel-thumbs");
    const systemEl = this.panel.querySelector(".hn-preview-system");
    const userEl = this.panel.querySelector(".hn-preview-user");
    const applyButton = this.panel.querySelector(".hn-preview-apply");
    const status = this.panel.querySelector(".hn-preview-apply-status");

    this.currentPreview = null;
    this.userTextDirty = false;
    this.isApplied = false;
    metaEl.textContent = "Preparing the exact request preview…";
    noteEl.replaceChildren();
    attachmentsEl.hidden = true;
    this._toggleScreenshotZoom(false);
    screenshotEl.hidden = true;
    screenshotImage.removeAttribute("src");
    thumbsEl.replaceChildren();
    thumbsEl.hidden = true;
    systemEl.value = "";
    userEl.value = "";
    systemEl.disabled = true;
    userEl.disabled = true;
    applyButton.disabled = true;
    status.textContent = "Not applied";
    status.classList.remove("is-applied");

    let preview = null;
    try {
      preview = await this.enhancer.summarization?.buildPostRequestPreview?.();
    } catch (error) {
      if (sequence !== this.refreshSequence) return;
      metaEl.textContent = `Could not prepare request preview: ${error.message}`;
      return;
    }
    if (sequence !== this.refreshSequence) return;
    if (!preview) {
      metaEl.textContent = "Request preview is not available on this page.";
      return;
    }

    this.currentPreview = {
      ...preview,
      imageEntries: Array.isArray(preview.imageEntries)
        ? preview.imageEntries
        : [],
    };

    (preview.notices || []).forEach((message) => {
      const note = document.createElement("div");
      note.className = "hn-extract-panel-note-inner";
      note.textContent = message;
      noteEl.appendChild(note);
    });

    if (preview.screenshot?.dataUrl) {
      screenshotImage.src = preview.screenshot.dataUrl;
      screenshotEl.hidden = false;
    }

    if (this.currentPreview.imageEntries.length > 0) {
      const imageElements = this.currentPreview.imageEntries.map((entry) => {
        const item = document.createElement("div");
        item.className = "hn-extract-panel-thumb-item";

        const includeLabel = document.createElement("label");
        includeLabel.className = "hn-preview-check hn-preview-thumb-check";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = true;
        checkbox.dataset.previewAttachment = entry.ref;
        const labelText = document.createElement("span");
        labelText.textContent = `[${entry.ref}] Include`;
        includeLabel.append(checkbox, labelText);

        const button = document.createElement("button");
        button.type = "button";
        button.className = "hn-extract-panel-thumb-button";
        button.title = `Focus source image [${entry.ref}]`;
        button.setAttribute("aria-label", `Focus source image ${entry.ref}`);
        const img = document.createElement("img");
        img.className = "hn-extract-panel-thumb";
        img.src = entry.url;
        img.alt = "";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        button.appendChild(img);
        button.addEventListener("click", () => this._focusSource(entry.ref));
        item.append(includeLabel, button);
        return item;
      });
      thumbsEl.append(...imageElements);
      thumbsEl.hidden = false;
    }

    const hasAttachments = Boolean(
      preview.screenshot?.dataUrl || this.currentPreview.imageEntries.length
    );
    attachmentsEl.hidden = !hasAttachments;
    systemEl.value = preview.systemPrompt || "";
    userEl.value = preview.userPrompt || "";
    systemEl.disabled = false;
    userEl.disabled = false;
    applyButton.disabled = !preview.model;
    status.textContent = preview.model
      ? "Review and apply before generating"
      : "Configure a model before applying";
    this._updateAttachmentCount();
    this._updateMeta();
  }
}

window.ExtractPanel = ExtractPanel;
