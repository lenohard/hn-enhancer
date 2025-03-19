// Initialize the HNEnhancer. Note that we are loading this content script with the default run_at of 'document_idle'.
// So this script is injected only after the DOM is loaded and all other scripts have finished executing.
// This guarantees that the DOM of the main HN page is loaded by the time this script runs.

// 使用动态导入加载模块
(async function() {
  try {
    // 动态导入所有需要的模块
    const [
      { default: HNState },
      { default: ApiClient },
      { default: MarkdownUtils },
      { default: DomUtils },
      { default: SummaryPanel },
      { default: Navigation },
      { default: Summarization },
      { default: AuthorTracking },
      { default: UIComponents },
      { default: HNEnhancer }
    ] = await Promise.all([
      import(chrome.runtime.getURL('hn-state.js')),
      import(chrome.runtime.getURL('api-client.js')),
      import(chrome.runtime.getURL('markdown-utils.js')),
      import(chrome.runtime.getURL('dom-utils.js')),
      import(chrome.runtime.getURL('summary-panel.js')),
      import(chrome.runtime.getURL('navigation.js')),
      import(chrome.runtime.getURL('summarization.js')),
      import(chrome.runtime.getURL('author-tracking.js')),
      import(chrome.runtime.getURL('ui-components.js')),
      import(chrome.runtime.getURL('hn-enhancer.js'))
    ]);

    // 初始化 HNEnhancer
    document.hnEnhancer = new HNEnhancer();
    console.log('HN Companion 扩展已成功加载');
  } catch (error) {
    console.error('加载 HN Companion 扩展时出错:', error);
  }
})();
