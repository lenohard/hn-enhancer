describe("SiteAdapter article images", () => {
  let SiteAdapter;

  beforeAll(async () => {
    global.window = {};
    await import("../src/adapters/site-adapter.js");
    SiteAdapter = global.window.SiteAdapter;
  });

  afterAll(() => {
    delete global.window;
  });

  test("filters avatar-like images", () => {
    const adapter = new SiteAdapter();
    const image = {
      className: "author-avatar",
      id: "",
      alt: "Author avatar",
      title: "",
      currentSrc: "https://example.com/avatar.jpg",
      src: "https://example.com/avatar.jpg",
      closest: () => ({}),
      getAttribute: () => null,
    };

    expect(adapter._isLikelyNonContentImage(image)).toBe(true);
  });

  test("keeps image placeholders in paragraph order", () => {
    const adapter = new SiteAdapter();
    const imageOne = {};
    const imageTwo = {};
    const paragraphOne = {
      contains: () => false,
      compareDocumentPosition: (image) =>
        image === imageOne || image === imageTwo ? 4 : 2,
    };
    const paragraphTwo = {
      contains: () => false,
      compareDocumentPosition: (image) => (image === imageTwo ? 4 : 2),
    };
    adapter.getPostBodyElement = () => ({});
    adapter.getParagraphElements = () => [paragraphOne, paragraphTwo];
    adapter._articleImageRefMap = new Map([
      ["I1", { ref: "I1", element: imageOne }],
      ["I2", { ref: "I2", element: imageTwo }],
    ]);

    expect(
      adapter.addImagePlaceholders("[post] Article:\n[P1] One\n[P2] Two")
    ).toBe("[post] Article:\n[P1] One\n[I1]\n[P2] Two\n[I2]");
  });

  test("labels visible-page screenshots separately from article images", () => {
    const adapter = new SiteAdapter();
    const content = adapter.buildVisionMessageContent(
      "Article context",
      ["https://example.com/article.jpg"],
      [{ ref: "S1", dataUrl: "data:image/jpeg;base64,abc" }]
    );

    expect(content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text", text: "Image [I1]" }),
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("Screenshot [S1]"),
        }),
        expect.objectContaining({
          type: "image_url",
          image_url: { url: "data:image/jpeg;base64,abc" },
        }),
      ])
    );
  });

  test("preserves image refs when preview excludes earlier images", () => {
    const adapter = new SiteAdapter();
    const content = adapter.buildVisionMessageContent(
      "Article context",
      [{ ref: "I2", url: "https://example.com/second.jpg" }]
    );

    expect(content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text", text: "Image [I2]" }),
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("labeled [I2]"),
        }),
      ])
    );
    expect(content).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text", text: "Image [I1]" }),
      ])
    );
  });

  test("does not duplicate visual instructions for an edited final prompt", () => {
    const adapter = new SiteAdapter();
    const finalText = "Edited request\n\n# Visual citation instructions\nCustom rules";
    const content = adapter.buildVisionMessageContent(
      finalText,
      [{ ref: "I2", url: "https://example.com/second.jpg" }],
      [],
      { includeInstructions: false }
    );

    expect(content[0]).toEqual({ type: "text", text: finalText });
    expect(content[0].text.match(/# Visual citation instructions/g)).toHaveLength(1);
  });
});
