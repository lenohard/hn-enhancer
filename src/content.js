// Initialize the HNEnhancer
// This script runs after the DOM is loaded and all other scripts have finished executing
// This guarantees that the DOM of the main HN page is loaded by the time this script runs.

document.addEventListener('DOMContentLoaded', () => {
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
});
