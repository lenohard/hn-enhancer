(function() {
  console.log("初始化 HN Companion 扩展...");

  if (window.hnEnhancer) {
    console.log("HN Companion 已初始化，跳过重复加载");
    return;
  }

  function initEnhancer() {
    if (window.hnEnhancer) {
      return;
    }
    if (typeof window.HNEnhancer === "undefined") {
      return false;
    }

    try {
      window.hnEnhancer = new window.HNEnhancer();
      console.log("HN Companion 扩展已成功加载");
      return true;
    } catch (e) {
      console.error("初始化 HNEnhancer 时出错:", e);
      console.error("错误详情:", e.stack);
      return false;
    }
  }

  if (!initEnhancer()) {
    let checkInterval = setInterval(function() {
      if (initEnhancer()) {
        clearInterval(checkInterval);
      }
    }, 200);

    setTimeout(function() {
      if (checkInterval) {
        clearInterval(checkInterval);
        if (!window.hnEnhancer) {
          console.error("无法加载 HNEnhancer 类，已超时");
        }
      }
    }, 10000);
  }
})();

document.addEventListener("DOMContentLoaded", () => {
  if (document.querySelector('script[data-hn-page-script="true"]')) {
    return;
  }

  const pageScript = document.createElement("script");
  pageScript.src = chrome.runtime.getURL("src/page-script.js");
  pageScript.dataset.hnPageScript = "true";
  document.head.appendChild(pageScript);
});
