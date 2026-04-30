# Foundation Refactor Implementation Plan

**Goal:** 梳理静态后台项目结构，拆分大文件，降低已发现安全风险，并补齐后续扩展文档。

**Architecture:** 保留静态页面运行方式，不引入构建工具。先把共享 JavaScript 核心和页面 CSS 拆成职责明确的文件，再通过原有入口顺序加载，避免大范围改写功能逻辑。

**Tech Stack:** HTML、CSS、原生 JavaScript、Tabler Icons、SheetJS。

---

## Task 1: 保护编码和工作区边界

**Files:**

- Create: `.editorconfig`
- Create: `.gitattributes`

**Steps:**

1. 固定 UTF-8、LF 和基础二进制文件规则。
2. 保留用户已有的 `.codex-chat-colors.png` 删除状态，不做恢复或覆盖。

## Task 2: 拆分 CSS 页面层

**Files:**

- Modify: `assets/css/pages.css`
- Create: `assets/css/pages/*.css`

**Steps:**

1. 将原 `pages.css` 按页面域拆分。
2. 让 `pages.css` 只保留聚合 `@import`。
3. 保持 `styles.css` 的入口语义不变。

## Task 3: 拆分 JavaScript 核心层

**Files:**

- Modify: `assets/js/app-state.js`
- Create: `assets/js/core/*.js`
- Modify: `index.html`

**Steps:**

1. 将 `refs`、`constants`、`state`、`utils` 从 `app-state.js` 拆出。
2. 保留 `app-state.js` 作为核心完整性检查。
3. 在 `index.html` 中按依赖顺序加载核心文件。

## Task 4: 安全加固

**Files:**

- Modify: `index.html`
- Modify: `assets/js/config.js`

**Steps:**

1. 固定 Tabler Icons 版本。
2. 更新 SheetJS CDN 地址。
3. 配置导出和复制时脱敏密钥。
4. 修正本地密钥存储提示文案。

## Task 5: 补齐文档

**Files:**

- Modify: `README.md`
- Create: `docs/architecture.md`
- Create: `docs/extension-guide.md`
- Create: `docs/security-audit.md`

**Steps:**

1. 更新项目结构说明。
2. 记录模块边界和启动顺序。
3. 给后续新增页面、样式、脚本和安全开发提供规范。
