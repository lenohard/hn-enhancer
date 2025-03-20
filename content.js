// 确保脚本直接注入，而非动态加载
(function() {
  console.log('初始化 HN Companion 扩展...');
  
  // 首先检查是否已经有 window.HNEnhancer
  if (typeof window.HNEnhancer === 'undefined') {
    console.log('等待 DOM 和脚本加载完成...');
    
    // 确保所有脚本正确加载后再初始化 HNEnhancer
    let checkInterval = setInterval(function() {
      if (typeof window.HNEnhancer !== 'undefined') {
        clearInterval(checkInterval);
        console.log('HNEnhancer 类已可用，初始化中...');
        
        try {
          window.hnEnhancer = new window.HNEnhancer();
          console.log('HN Companion 扩展已成功加载');
        } catch (e) {
          console.error('初始化 HNEnhancer 时出错:', e);
          console.error('错误详情:', e.stack);
        }
      } else {
        console.log('等待 HNEnhancer 类加载...');
      }
    }, 500); // 每500毫秒检查一次
    
    // 10秒后如果还未加载成功则停止检查
    setTimeout(function() {
      if (checkInterval) {
        clearInterval(checkInterval);
        console.error('无法加载 HNEnhancer 类，已超时');
      }
    }, 10000);
  } else {
    console.log('HNEnhancer 类已存在，初始化中...');
    try {
      window.hnEnhancer = new window.HNEnhancer();
      console.log('HN Companion 扩展已成功加载');
    } catch (e) {
      console.error('初始化 HNEnhancer 时出错:', e);
      console.error('错误详情:', e.stack);
    }
  }
})();

// 确保DOM加载完成后再执行
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM已加载完成，准备执行HN Companion');
  
  // 注入page-script.js以便与页面通信（用于Chrome内置AI功能）
  const pageScript = document.createElement('script');
  pageScript.src = chrome.runtime.getURL('src/page-script.js');
  document.head.appendChild(pageScript);
  
  // 注入所有必要的脚本，确保它们按顺序加载
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
  
  // 按顺序加载脚本
  function loadScriptsSequentially(index) {
    if (index >= scripts.length) return;
    
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(`src/${scripts[index]}`);
    script.onload = () => {
      console.log(`已加载脚本: ${scripts[index]}`);
      loadScriptsSequentially(index + 1);
      
      // 在最后一个脚本加载完成后初始化 HNEnhancer
      if (index === scripts.length - 1) {
        console.log('所有脚本已加载，尝试初始化 HNEnhancer');
        setTimeout(() => {
          if (typeof window.HNEnhancer !== 'undefined') {
            try {
              window.hnEnhancer = new window.HNEnhancer();
              console.log('HN Companion 扩展已成功加载');
            } catch (e) {
              console.error('初始化 HNEnhancer 失败:', e);
            }
          } else {
            console.error('无法初始化HNEnhancer，HNEnhancer类未定义');
          }
        }, 100); // 短暂延迟确保脚本完全执行
      }
    };
    script.onerror = (e) => {
      console.error(`加载脚本失败: ${scripts[index]}, 错误: ${e.message}`);
      loadScriptsSequentially(index + 1);
    };
    document.head.appendChild(script);
  }
  
  // 开始加载第一个脚本
  loadScriptsSequentially(0);
});
