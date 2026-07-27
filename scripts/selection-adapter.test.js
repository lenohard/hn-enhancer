describe("SelectionAdapter image scope", () => {
  let SelectionAdapter;
  let SubstackAdapter;

  beforeAll(async () => {
    global.window = {};
    await import("../src/adapters/site-adapter.js");
    global.SiteAdapter = global.window.SiteAdapter;
    await import("../src/adapters/selection-adapter.js");
    SelectionAdapter = global.window.SelectionAdapter;
    await import("../src/adapters/substack-adapter.js");
    SubstackAdapter = global.window.SubstackAdapter;
  });

  afterAll(() => {
    delete global.window;
    delete global.document;
    delete global.SiteAdapter;
  });

  test("does not fall back to whole-article images for an image-free selection", () => {
    const articleImage = {};
    const article = {
      querySelectorAll: () => [articleImage],
    };
    const range = {
      intersectsNode: () => false,
    };
    global.document = {
      querySelector: () => article,
      body: article,
    };
    global.window.getSelection = () => ({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
    });

    const adapter = new SelectionAdapter();
    let collectionCalls = 0;
    adapter._collectImageEntries = (root) => {
      collectionCalls += 1;
      return root === article
        ? [{ ref: "I1", url: "https://example.com/unrelated.jpg" }]
        : [];
    };

    expect(adapter.getArticleImageEntries(8)).toEqual([]);
    expect(collectionCalls).toBe(1);
  });

  test("keeps Substack selection images scoped to the selected range", () => {
    const articleImage = {};
    const article = {
      querySelectorAll: (selector) => selector === "img" ? [articleImage] : [],
    };
    const range = { intersectsNode: () => false };
    global.document = {
      querySelector: () => article,
      body: article,
    };

    const adapter = new SubstackAdapter();
    adapter._selectionRange = range;
    let collectionCalls = 0;
    adapter._collectImageEntries = (root) => {
      collectionCalls += 1;
      return root === article
        ? [{ ref: "I1", url: "https://example.com/unrelated.jpg" }]
        : [];
    };

    expect(adapter.getArticleImageEntries(8)).toEqual([]);
    expect(collectionCalls).toBe(1);
  });
});
