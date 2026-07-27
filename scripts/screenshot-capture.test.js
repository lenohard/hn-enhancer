import { jest } from "@jest/globals";

describe("ScreenshotCapture", () => {
  let ScreenshotCapture;
  let classNames;
  let scrollTo;

  beforeAll(async () => {
    classNames = new Set();
    scrollTo = jest.fn();
    global.window = {
      location: { href: "https://example.com/article" },
      scrollX: 12,
      scrollY: 340,
      innerWidth: 1200,
      innerHeight: 800,
      scrollTo,
      setTimeout: (callback) => callback(),
    };
    global.document = {
      documentElement: {
        classList: {
          add: (name) => classNames.add(name),
          remove: (name) => classNames.delete(name),
        },
      },
    };
    global.requestAnimationFrame = (callback) => callback();
    await import("../src/screenshot-capture.js");
    ScreenshotCapture = global.window.ScreenshotCapture;
  });

  afterAll(() => {
    delete global.window;
    delete global.document;
    delete global.requestAnimationFrame;
  });

  test("keeps image bytes out of persisted screenshot metadata", async () => {
    const capture = new ScreenshotCapture({
      apiClient: {
        sendBackgroundMessage: jest.fn().mockResolvedValue({
          dataUrl: "data:image/jpeg;base64,abc",
        }),
      },
    });

    const screenshot = await capture.captureVisibleArea();
    const metadata = capture.getMetadata(screenshot);

    expect(screenshot.dataUrl).toBe("data:image/jpeg;base64,abc");
    expect(metadata).toMatchObject({ ref: "S1", scrollY: 340 });
    expect(metadata).not.toHaveProperty("dataUrl");
    expect(classNames.has("hn-capturing-screenshot")).toBe(false);

    expect(capture.resolveRef("S1")).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({
      left: 12,
      top: 340,
      behavior: "smooth",
    });
  });

  test("falls back to a visible capture when image stitching is unavailable", async () => {
    const sendBackgroundMessage = jest.fn().mockResolvedValue({
      dataUrl: "data:image/jpeg;base64,fallback",
    });
    const capture = new ScreenshotCapture({
      apiClient: { sendBackgroundMessage },
    });

    const screenshot = await capture.captureFullPage();

    expect(screenshot.dataUrl).toBe("data:image/jpeg;base64,fallback");
    expect(screenshot.fullPage).toBeUndefined();
    expect(sendBackgroundMessage).toHaveBeenCalledTimes(1);
  });

  test("captures and stitches the full document, then restores scroll position", async () => {
    const originalImage = global.Image;
    const originalCreateElement = global.document.createElement;
    const originalBody = global.document.body;
    const originalScrollingElement = global.document.scrollingElement;
    const originalScrollTo = global.window.scrollTo;
    const root = global.document.documentElement;
    root.style = { scrollBehavior: "smooth" };
    root.scrollHeight = 1500;
    global.document.body = { scrollHeight: 1500 };
    global.document.scrollingElement = root;

    const drawImage = jest.fn();
    global.document.createElement = jest.fn(() => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: "",
        fillRect: jest.fn(),
        drawImage,
      }),
      toDataURL: () => "data:image/jpeg;base64,stitched",
    }));
    global.Image = class MockImage {
      naturalWidth = 1200;
      naturalHeight = 800;
      async decode() {}
    };
    global.window.scrollTo = jest.fn(({ left, top }) => {
      global.window.scrollX = left;
      global.window.scrollY = top;
    });

    try {
      const sendBackgroundMessage = jest.fn().mockResolvedValue({
        dataUrl: "data:image/jpeg;base64,segment",
      });
      const capture = new ScreenshotCapture({
        apiClient: { sendBackgroundMessage },
      });

      const screenshot = await capture.captureFullPage();

      expect(screenshot).toMatchObject({
        dataUrl: "data:image/jpeg;base64,stitched",
        fullPage: true,
        pageHeight: 1500,
        segmentCount: 2,
      });
      expect(sendBackgroundMessage).toHaveBeenCalledTimes(2);
      expect(drawImage).toHaveBeenCalledTimes(2);
      expect(global.window.scrollTo).toHaveBeenLastCalledWith({
        left: 12,
        top: 340,
        behavior: "auto",
      });
      expect(root.style.scrollBehavior).toBe("smooth");
      expect(classNames.has("hn-capturing-screenshot")).toBe(false);

      global.window.scrollY = 520;
      const reusedScreenshot = await capture.captureFullPage();
      expect(reusedScreenshot).toMatchObject({
        dataUrl: "data:image/jpeg;base64,stitched",
        scrollY: 520,
      });
      expect(reusedScreenshot.reusedAt).toEqual(expect.any(Number));
      expect(sendBackgroundMessage).toHaveBeenCalledTimes(2);
    } finally {
      global.Image = originalImage;
      global.document.createElement = originalCreateElement;
      global.document.body = originalBody;
      global.document.scrollingElement = originalScrollingElement;
      global.window.scrollTo = originalScrollTo;
      global.window.scrollX = 12;
      global.window.scrollY = 340;
      delete root.style;
      delete root.scrollHeight;
    }
  });
});
