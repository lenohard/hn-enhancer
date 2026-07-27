describe("MarkdownUtils", () => {
  let MarkdownUtils;

  beforeAll(async () => {
    global.window = {};
    await import("../src/markdown-utils.js");
    MarkdownUtils = global.window.MarkdownUtils;
  });

  afterAll(() => {
    delete global.window;
  });

  test("removes completed and streaming think blocks", () => {
    expect(
      MarkdownUtils.stripThinkingContent(
        "<think>private reasoning</think>\n\nPublic answer"
      )
    ).toBe("Public answer");
    expect(
      MarkdownUtils.stripThinkingContent("<think>private reasoning")
    ).toBe("");
  });

  test("renders GitHub-style pipe tables", () => {
    const html = MarkdownUtils.convertMarkdownToHTML(
      "| Resource | Context |\n| --- | :---: |\n| **NOAA** | Forecast [P2] |"
    );

    expect(html).toContain('<table class="hn-markdown-table">');
    expect(html).toContain("<th class=\"hn-table-align-left\">Resource</th>");
    expect(html).toContain("<strong>NOAA</strong>");
    expect(html).toContain("Forecast [P2]");
  });

  test("tokenizes screenshot references as clickable source refs", () => {
    const { text, tokens } = MarkdownUtils.tokenizeParagraphRefs(
      "The visible chart shows a spike [S1]."
    );
    const html = MarkdownUtils.restoreParagraphRefTokens(text, tokens);

    expect(html).toContain('class="hn-summary-ref"');
    expect(html).toContain('data-ref="S1"');
  });
});
