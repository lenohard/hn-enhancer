/**
 * Captures webpage screenshots for vision-capable models.
 * Screenshot bytes stay in memory; only lightweight viewport metadata is
 * persisted with summaries so [S1] can return to the captured position.
 */
class ScreenshotCapture {
  constructor(enhancer) {
    this.enhancer = enhancer;
    this.activeScreenshot = null;
    this.recentFullPageScreenshot = null;
    this.fullPageCapturePromise = null;
    this.screenshotRefs = new Map();
  }

  async captureVisibleArea() {
    const root = document.documentElement;
    const metadata = {
      ref: "S1",
      pageUrl: window.location.href,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      capturedAt: Date.now(),
    };

    root.classList.add("hn-capturing-screenshot");
    try {
      // Give the browser a paint opportunity after hiding extension-owned UI.
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );
      const result = await this.enhancer.apiClient.sendBackgroundMessage(
        "CAPTURE_VISIBLE_TAB",
        {}
      );
      if (!result?.dataUrl || typeof result.dataUrl !== "string") {
        throw new Error("The browser did not return screenshot data");
      }

      const dataUrl = await this._normalizeScreenshot(result.dataUrl);

      this.activeScreenshot = {
        ...metadata,
        dataUrl,
      };
      this.screenshotRefs.set(metadata.ref, metadata);
      return this.activeScreenshot;
    } finally {
      root.classList.remove("hn-capturing-screenshot");
    }
  }

  async _captureVisibleTabData() {
    const result = await this.enhancer.apiClient.sendBackgroundMessage(
      "CAPTURE_VISIBLE_TAB",
      {}
    );
    if (!result?.dataUrl || typeof result.dataUrl !== "string") {
      throw new Error("The browser did not return screenshot data");
    }
    return result.dataUrl;
  }

  /**
   * Capture the complete document by scrolling one viewport at a time and
   * stitching the browser captures. The final JPEG is bounded to a 1600px
   * width / 16000px height so it remains practical for vision APIs.
   */
  async captureFullPage() {
    if (
      typeof Image === "undefined" ||
      typeof document === "undefined" ||
      typeof document.createElement !== "function"
    ) {
      return this.captureVisibleArea();
    }

    const scrollingElement = document.scrollingElement || document.documentElement;
    const currentPageHeight = Math.max(
      window.innerHeight,
      scrollingElement.scrollHeight,
      document.documentElement.scrollHeight,
      document.body?.scrollHeight || 0
    );
    const cached = this.recentFullPageScreenshot;
    if (
      cached &&
      Date.now() - cached.capturedAt < 60_000 &&
      cached.pageUrl === window.location.href &&
      cached.viewportWidth === window.innerWidth &&
      cached.viewportHeight === window.innerHeight &&
      cached.pageHeight === currentPageHeight
    ) {
      const reusedScreenshot = {
        ...cached,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        reusedAt: Date.now(),
      };
      this.activeScreenshot = reusedScreenshot;
      this.screenshotRefs.set("S1", this.getMetadata(reusedScreenshot));
      return reusedScreenshot;
    }

    if (this.fullPageCapturePromise) {
      return this.fullPageCapturePromise;
    }

    this.fullPageCapturePromise = this._captureFullPageImpl();
    try {
      const screenshot = await this.fullPageCapturePromise;
      this.recentFullPageScreenshot = screenshot;
      return screenshot;
    } finally {
      this.fullPageCapturePromise = null;
    }
  }

  _createCaptureMask() {
    if (!document.body?.appendChild) return null;
    const mask = document.createElement("div");
    mask.className = "hn-screenshot-capture-mask";
    mask.textContent = "Capturing full page…";
    mask.setAttribute("aria-hidden", "true");
    document.body.appendChild(mask);
    return mask;
  }

  async _captureFullPageImpl() {

    const root = document.documentElement;
    const scrollingElement = document.scrollingElement || root;
    const originalScrollX = window.scrollX;
    const originalScrollY = window.scrollY;
    const originalScrollBehavior = root.style.scrollBehavior;
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const pageHeight = Math.max(
      viewportHeight,
      scrollingElement.scrollHeight,
      root.scrollHeight,
      document.body?.scrollHeight || 0
    );
    const maxScrollY = Math.max(0, pageHeight - viewportHeight);
    const positions = [];
    for (let y = 0; y < pageHeight; y += viewportHeight) {
      positions.push(Math.min(y, maxScrollY));
    }
    if (!positions.includes(maxScrollY)) positions.push(maxScrollY);
    const uniquePositions = [...new Set(positions)];
    const captures = [];
    const captureMask = this._createCaptureMask();

    root.classList.add("hn-capturing-screenshot");
    root.style.scrollBehavior = "auto";
    try {
      for (let index = 0; index < uniquePositions.length; index += 1) {
        // Chromium limits captureVisibleTab to two calls per second. Keep the
        // mask visible while waiting so the page does not appear to crawl.
        if (index > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 520));
        }
        window.scrollTo({ left: 0, top: uniquePositions[index], behavior: "auto" });
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
        root.classList.add("hn-capturing-screenshot-frame");
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
        const dataUrl = await this._captureVisibleTabData();
        root.classList.remove("hn-capturing-screenshot-frame");
        captures.push({
          scrollY: window.scrollY,
          image: await this._loadImage(dataUrl),
        });
      }

      if (captures.length === 0) {
        throw new Error("No full-page screenshot segments were captured");
      }

      const deviceScale = captures[0].image.naturalWidth / viewportWidth;
      const sourceHeight = Math.max(1, Math.round(pageHeight * deviceScale));
      const outputScale = Math.min(
        1,
        1600 / captures[0].image.naturalWidth,
        16000 / sourceHeight
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(
        1,
        Math.round(captures[0].image.naturalWidth * outputScale)
      );
      canvas.height = Math.max(1, Math.round(sourceHeight * outputScale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Could not create screenshot canvas");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      captures.forEach(({ scrollY, image }) => {
        const destinationY = Math.round(scrollY * deviceScale * outputScale);
        const destinationHeight = Math.min(
          Math.round(image.naturalHeight * outputScale),
          canvas.height - destinationY
        );
        if (destinationHeight <= 0) return;
        const sourceHeightForDraw = destinationHeight / outputScale;
        context.drawImage(
          image,
          0,
          0,
          image.naturalWidth,
          sourceHeightForDraw,
          0,
          destinationY,
          canvas.width,
          destinationHeight
        );
      });

      const metadata = {
        ref: "S1",
        pageUrl: window.location.href,
        scrollX: originalScrollX,
        scrollY: originalScrollY,
        viewportWidth,
        viewportHeight,
        pageHeight,
        fullPage: true,
        segmentCount: captures.length,
        capturedAt: Date.now(),
      };
      this.activeScreenshot = {
        ...metadata,
        dataUrl: canvas.toDataURL("image/jpeg", 0.72),
      };
      this.screenshotRefs.set(metadata.ref, metadata);
      return this.activeScreenshot;
    } finally {
      root.classList.remove("hn-capturing-screenshot-frame");
      window.scrollTo({
        left: originalScrollX,
        top: originalScrollY,
        behavior: "auto",
      });
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );
      root.style.scrollBehavior = originalScrollBehavior;
      root.classList.remove("hn-capturing-screenshot");
      captureMask?.remove();
    }
  }

  async _loadImage(dataUrl) {
    const image = new Image();
    image.src = dataUrl;
    if (typeof image.decode === "function") {
      await image.decode();
    } else {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
    }
    return image;
  }

  /**
   * Retina captures can be several megapixels and some gateways reject them
   * with a generic 400. Keep the longest edge at 1600px and recompress once;
   * this is also the exact image shown by ExtractPanel.
   */
  async _normalizeScreenshot(dataUrl) {
    if (
      typeof Image === "undefined" ||
      typeof document === "undefined" ||
      typeof document.createElement !== "function"
    ) {
      return dataUrl;
    }

    try {
      const image = await this._loadImage(dataUrl);

      const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
      const scale = Math.min(1, 1600 / Math.max(1, longestEdge));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return dataUrl;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.72);
    } catch (error) {
      console.warn("Could not normalize captured screenshot:", error);
      return dataUrl;
    }
  }

  getMetadata(screenshot = this.activeScreenshot) {
    if (!screenshot) return null;
    const { dataUrl: _dataUrl, ...metadata } = screenshot;
    return metadata;
  }

  releaseActiveData() {
    this.activeScreenshot = null;
  }

  restoreRefs(savedEntries) {
    if (!Array.isArray(savedEntries)) return;
    savedEntries.forEach((entry) => {
      if (entry?.ref && Number.isFinite(Number(entry.scrollY))) {
        this.screenshotRefs.set(entry.ref.toUpperCase(), {
          ...entry,
          ref: entry.ref.toUpperCase(),
        });
      }
    });
  }

  resolveRef(ref) {
    const metadata = this.screenshotRefs.get(String(ref).toUpperCase());
    if (!metadata) return false;
    if (metadata.pageUrl && metadata.pageUrl !== window.location.href) {
      return false;
    }

    window.scrollTo({
      left: Number(metadata.scrollX) || 0,
      top: Number(metadata.scrollY) || 0,
      behavior: "smooth",
    });
    document.documentElement.classList.add("hn-screenshot-focus");
    window.setTimeout(() => {
      document.documentElement.classList.remove("hn-screenshot-focus");
    }, 900);
    return true;
  }
}

window.ScreenshotCapture = ScreenshotCapture;
