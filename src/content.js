// Initialize the HNEnhancer. Note that we are loading this content script with the default run_at of 'document_idle'.
// So this script is injected only after the DOM is loaded and all other scripts have finished executing.
// This guarantees that the DOM of the main HN page is loaded by the time this script runs.

// 直接初始化 HNEnhancer，因为所有依赖已经在 manifest 中按顺序加载
try {
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
