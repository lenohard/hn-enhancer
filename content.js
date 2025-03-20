// 动态加载所有必要的脚本
(function() {
  const scripts = [
    'hn-state.js',
    'api-client.js',
    'markdown-utils.js',
    'dom-utils.js',
    'summary-panel.js',
    'navigation.js',
    'summarization.js',
    'author-tracking.js',
    'ui-components.js',
    'hn-enhancer.js'
  ];

  // 创建并附加脚本到页面
  let loadedScripts = 0;
  const totalScripts = scripts.length;

  // 按顺序加载脚本
  function loadNextScript(index) {
    if (index >= totalScripts) {
      console.log('所有脚本已加载，初始化 HNEnhancer');
      // 所有脚本加载完成后初始化
      document.hnEnhancer = new HNEnhancer();
      console.log('HN Companion 扩展已成功加载');
      return;
    }

    const scriptElement = document.createElement('script');
    scriptElement.src = chrome.runtime.getURL(`src/${scripts[index]}`);
    scriptElement.onload = () => {
      console.log(`已加载脚本: ${scripts[index]}`);
      loadedScripts++;
      // 加载下一个脚本
      loadNextScript(index + 1);
    };
    scriptElement.onerror = (e) => {
      console.error(`加载脚本失败: ${scripts[index]}, 错误: ${e.message}`);
      // 尝试加载下一个脚本
      loadNextScript(index + 1);
    };
    document.head.appendChild(scriptElement);
  }

  // 开始加载第一个脚本
  loadNextScript(0);
})();

// 确保DOM加载完成后再执行
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM已加载完成，准备执行HN Companion');
});
