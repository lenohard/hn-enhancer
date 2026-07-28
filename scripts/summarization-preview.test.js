describe("Summarization request preview override", () => {
  let Summarization;

  beforeAll(async () => {
    global.window = {
      location: { href: "https://example.com/article" },
    };
    await import("../src/summarization.js");
    Summarization = global.window.Summarization;
  });

  afterAll(() => {
    delete global.window;
  });

  test("is scoped to the current provider and model and consumed once", () => {
    const summarization = new Summarization({});
    const override = {
      pageUrl: "https://example.com/article",
      provider: "openai-router",
      model: "vision-model",
      systemPrompt: "Edited system",
      userPrompt: "Edited user",
      imageEntries: [{ ref: "I2", url: "https://example.com/second.jpg" }],
    };

    expect(summarization.setNextRequestPreviewOverride(override)).toBe(true);
    expect(
      summarization._consumeRequestPreviewOverride(
        "openai-router",
        "text-model",
        null,
        true
      )
    ).toBeNull();
    expect(
      summarization._consumeRequestPreviewOverride(
        "openai-router",
        "vision-model",
        null,
        true
      )
    ).toMatchObject(override);
    expect(
      summarization._consumeRequestPreviewOverride(
        "openai-router",
        "vision-model",
        null,
        true
      )
    ).toBeNull();
  });

  test("does not apply a post preview to comment-level summaries", () => {
    const summarization = new Summarization({});
    summarization.setNextRequestPreviewOverride({
      pageUrl: "https://example.com/article",
      provider: "openai-router",
      model: "vision-model",
      imageEntries: [],
    });

    expect(
      summarization._consumeRequestPreviewOverride(
        "openai-router",
        "vision-model",
        "comment-42",
        false
      )
    ).toBeNull();
    expect(
      summarization._consumeRequestPreviewOverride(
        "openai-router",
        "vision-model",
        null,
        true
      )
    ).not.toBeNull();
  });

  test("builds title-only context when article body is disabled", () => {
    const summarization = new Summarization({
      adapter: { getPostTitle: () => "Example article" },
    });

    expect(summarization._getPostTitleOnlyContext()).toBe(
      "[post] Example article:\n[Article body not attached]"
    );
  });

  test("falls back to getPostText when DOM paragraph extraction is empty", async () => {
    const summarization = new Summarization({
      adapter: {
        getPostTitle: () => "Action queue",
        getPostBodyElement: () => ({ querySelectorAll: () => [] }),
        getParagraphElements: () => [],
        supportsParagraphJump: () => true,
        getPostText: () =>
          "Action queue is a list of actions.\n\nSims perform them in order.",
      },
    });

    const { formattedComment } = await summarization._getPostBodyOnly();

    expect(formattedComment).toContain("[post] Action queue:");
    expect(formattedComment).toContain("[P1] Action queue is a list of actions.");
    expect(formattedComment).toContain(
      "[P2] Sims perform them in order."
    );
  });
});
