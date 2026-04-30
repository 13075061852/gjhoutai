# 扩展指南

更新日期：2026-04-30

## 新增一个页面

1. 在 `index.html` 的侧边栏增加导航按钮：

```html
<button class="nav-item" type="button" data-page="new-page">
  <span class="nav-main">
    <span class="nav-icon"><i class="ti ti-box" aria-hidden="true"></i></span>
    <span class="nav-text">新页面</span>
  </span>
</button>
```

2. 如果页面只是业务占位页，在 `assets/js/core/app-constants.js` 的 `PAGE_DEFS` 增加 `new-page` 定义，并在 `business-pages.js` 中补渲染函数。
3. 如果页面是完整功能页，在 `index.html` 增加 `data-page-section="new-page"` 的 section。
4. 新增 `assets/js/new-page.js`，暴露 `App.newPage = { init }`。
5. 在 `assets/js/app.js` 中按依赖顺序调用 `App.newPage?.init()`。
6. 新增 `assets/css/pages/new-page.css`，并在 `assets/css/pages.css` 中引入。

## 新增共享常量或工具

- 页面名称、默认配置、存储 key：放入 `assets/js/core/app-constants.js`。
- 跨模块运行态：放入 `assets/js/core/runtime-state.js`。
- 通用纯函数：放入 `assets/js/core/utils.js`。
- DOM 引用：只有多个模块共同使用时才放入 `assets/js/core/dom-refs.js`。

## 编码与文件约定

- 新增文本文件必须使用 UTF-8。
- 新增文件默认 LF 换行。
- 中文文件名可以使用，但外部 URL 必须通过 `encodeURI` 或 `encodeURIComponent` 处理。
- 不要把大段页面 CSS 继续写入 `pages.css`，它只做聚合入口。

## 安全开发约定

- 渲染用户、模型、文件、OSS 或外部接口返回内容时，默认使用 `utils.escapeHtml()`。
- 能用 `textContent` 就不要用 `innerHTML`。
- 必须用模板字符串生成 HTML 时，所有动态字段都要转义。
- 导出或复制配置时不要包含密钥。当前 `config.js` 已对 API Key 和 OSS AccessKey 做脱敏。
- 浏览器端不得长期承担生产级密钥管理；后续真实上线应改为后端代理、短期 token 或 OSS 临时凭证。

## 推荐下一步

- 引入最小构建/检查工具，例如 ESLint、Prettier 和简单静态服务器。
- 给核心模块补轻量单元测试，至少覆盖 `utils`、配置脱敏、页面映射。
- 生产部署时增加 CSP、安全响应头和依赖锁定策略。
