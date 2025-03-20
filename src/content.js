// Initialize the HNEnhancer. Note that we are loading this content script with the default run_at of 'document_idle'.
// So this script is injected only after the DOM is loaded and all other scripts have finished executing.
// This guarantees that the DOM of the main HN page is loaded by the time this script runs.

// 加载所有必要的脚本
(async function() {
  const scripts = [
    'src/hn-state.js',
    'src/api-client.js',
    'src/markdown-utils.js',
    'src/dom-utils.js',
    'src/summary-panel.js',
    'src/navigation.js',
    'src/summarization.js',
    'src/author-tracking.js',
    'src/ui-components.js',
    'src/hn-enhancer.js'
  ];

  try {
    // 按顺序加载所有脚本
    for (const script of scripts) {
      await loadScript(script);
      console.log(`已加载脚本: ${script}`);
    }

    // 初始化 HNEnhancer
    document.hnEnhancer = new HNEnhancer();
    console.log('HN Companion 扩展已成功加载');

    // 添加调试信息，检查是否成功初始化
    console.log('HNEnhancer 实例:', document.hnEnhancer);
    console.log('是否为主页:', document.hnEnhancer.isHomePage);
    console.log('是否为评论页:', document.hnEnhancer.isCommentsPage);
  } catch (error) {
    console.error('加载 HN Companion 扩展时出错:', error);
    console.error('错误详情:', error.stack);
  }
})();

// 动态加载脚本的辅助函数
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(src);
    script.onload = () => resolve();
    script.onerror = (e) => reject(new Error(`加载脚本失败: ${src}, 错误: ${e.message}`));
    document.head.appendChild(script);
  });
}
