# AGENT.md

## 1. 开工前必须先做

1. 查看当前工作区状态，确认已有未提交改动，不要覆盖用户改过的文件。
2. 阅读本文件和相关 docs，先理解页面结构、组件库、脚本加载顺序，再动代码。
3. 定位需求属于哪一层：页面结构、页面样式、共享组件、业务逻辑、核心工具或安全配置。
4. 如果是 UI 问题，先找对应 HTML 结构、CSS 选择器覆盖链、动态渲染函数和组件初始化时机。
5. 如果是删除、清空、上传、配置、密钥、模型调用、OSS 或文件导入相关需求，先检查安全约束。
6. 修改前尽量缩小范围，只改和需求直接相关的文件。
7. 修改后至少做静态语法检查；不需要 AI 主动启动浏览器验收，用户会自行验收。

## 2. 项目定位

- 这是广俊塑料科技后台管理系统原型。
- 当前是静态前端应用：`index.html` + CSS + 原生 JavaScript。
- 没有构建工具、没有后端服务、没有 `package.json`。
- 运行方式通常是直接打开 `index.html`，或使用 VS Code Live Server，当前配置端口为 `5501`。
- 除非用户明确要求，不要为了验收主动启动浏览器、截图或执行可视化回归。
- 本地数据主要使用 `localStorage`、`IndexedDB` 和运行时内存。
- 不要引入框架、打包器、状态管理库或大型依赖，除非用户明确要求。

## 3. 重要全局约束

- 全局应用命名空间是 `window.GJHApp`。
- 兼容公开入口是 `window.App`，部分组件会同时挂到 `GJHApp` 和 `App`。
- 文件统一按 UTF-8 处理；新增文本文件默认 LF 换行。
- 项目中有中文内容，遇到乱码先检查编码，不要直接重写整文件。
- 不要把大段业务逻辑写进 `index.html`。
- 不要把页面 CSS 堆到 `assets/css/pages.css`；它只做页面样式聚合。
- 不要恢复旧的根目录脚本路径。当前 JS 已按 `bootstrap/`、`core/`、`components/`、`shell/`、`features/` 分层。
- 不要覆盖用户已有未提交改动；遇到同文件改动时先读上下文再补丁。

## 4. 启动顺序

脚本加载顺序很重要。`index.html` 里应保持以下依赖关系：

1. `assets/js/core/app-namespace.js`
2. `assets/js/core/dom-refs.js`
3. `assets/js/core/app-constants.js`
4. `assets/js/core/runtime-state.js`
5. `assets/js/core/utils.js`
6. `assets/js/bootstrap/app-state.js`
7. `assets/js/core/animation-manager.js`
8. `assets/js/components/*.js`
9. `assets/js/features/*.js`
10. `assets/js/bootstrap/app.js`

新增组件脚本要在依赖它的 feature 脚本之前引入。新增 feature 脚本后，还要在 `assets/js/bootstrap/app.js` 调用对应 `init()`。

## 5. CSS 分层

- `assets/css/styles.css`：全局样式入口，只写 `@import`。
- `assets/css/foundation/`：变量、基础规则、图标桥接。
- `assets/css/components/components.css`：跨页面组件库样式。
- `assets/css/layout/`：应用壳、侧边栏、内容区、响应式。
- `assets/css/pages.css`：页面样式聚合入口。
- `assets/css/pages/`：具体页面样式。

页面样式只能补业务差异，例如列宽、状态色、局部布局。通用按钮、表格、下拉、确认弹窗等应优先放在组件层。

## 6. JS 分层

- `assets/js/core/`：命名空间、DOM 引用、常量、运行态、工具、动画管理。
- `assets/js/bootstrap/`：启动检查和初始化。
- `assets/js/components/`：跨页面 UI 组件脚本。
- `assets/js/shell/`：导航、页面切换、最近访问。
- `assets/js/features/`：具体业务功能。

功能模块通常是 IIFE，从 `window.GJHApp` 读取依赖，并暴露 `App.<module> = { init, ... }`。不要让 feature 直接修改不相关模块的内部状态；需要跨模块能力时，先看是否已有公开 API。

## 7. 已存在的组件库

项目已经有组件库，不要重复造同类结构。

### 自定义下拉

- 脚本：`assets/js/components/custom-select.js`
- 样式：`assets/css/components/components.css`
- 用法：写原生 `<select>`，组件会增强为 `span.custom-select`。
- 动态渲染、`innerHTML`、`outerHTML` 后必须调用：

```js
App.customSelects?.enhanceAll?.(container);
```

- 页面 CSS 不要用宽泛选择器误伤 `span.custom-select` 或 `.custom-select-*`。

### 二次确认弹窗

- 脚本：`assets/js/components/confirm-dialog.js`
- 样式：`assets/css/components/components.css`
- 删除、清空、移除等破坏性操作必须使用：

```js
const confirmed = await App.confirmDialog?.confirmDelete?.({
  title: '删除材料',
  message: '确认删除材料？删除后无法恢复。',
});
if (!confirmed) return;
```

- 不要再使用 `window.confirm()`。
- 事件处理器需要等待确认时，改成 `async`。

### 表格组件

- `.ui-table-wrap`：表格滚动容器。
- `.ui-table`：基础表格。
- `.ui-table--sticky-header`：固定表头。
- `.ui-table--fixed`：固定列布局。
- `.ui-table--compact` / `.ui-table--comfortable`：密度变体。

内部滚动依赖父级高度链路。涉及 flex 布局时，父级通常需要 `min-height:0`，滚动层需要 `overflow:auto`。

## 8. 页面映射规则

页面切换依赖两个 `data-*`：

- 导航按钮：`data-page="<page-id>"`
- 页面容器：`data-page-section="<page-id>"`

业务类页面很多复用 `data-page-section="placeholder"`，实际内容由 `App.businessPages.render(pageId)` 生成；页面定义在 `assets/js/core/app-constants.js` 的 `PAGE_DEFS`。

新增完整页面时通常要改：

1. `index.html`：增加导航和页面 section。
2. `assets/js/core/app-constants.js`：增加页面定义。
3. `assets/js/features/<feature>.js`：实现业务逻辑。
4. `assets/js/bootstrap/app.js`：调用 `init()`。
5. `assets/css/pages/<feature>.css`：页面样式。
6. `assets/css/pages.css`：引入页面样式。

如果只是业务中心内的新原型页，优先扩展 `business-pages.js` 的渲染映射。

## 9. 主要业务模块

- `assets/js/features/business-pages.js`：业务中心、配方管理、库存管理、生产计划、订单等。
- `assets/js/features/property-analysis.js`：物性分析、Excel 导入、OSS 同步。
- `assets/js/features/spectrum-analysis.js`：图谱库、标签、详情、选择、删除、导入导出。
- `assets/js/features/image-cutout.js`：图片抠图、裁剪和导出。
- `assets/js/features/config.js`：AI / OSS 配置、模型加载、连接测试、配置脱敏。
- `assets/js/features/ai-call-analysis.js`：AI 调用日志、Token、费用统计。
- `assets/js/features/project-skills.js`：项目技能注册、路由、执行记录。
- `assets/js/features/agent-butler.js`：当前页面上下文组织。
- `assets/js/features/chat.js`：AI 聊天、流式响应、图片输入、技能动作。
- `assets/js/shell/navigation.js`：导航、页面切换、顶部最近访问。

## 10. 渲染与安全约束

- 渲染用户输入、模型输出、接口返回、文件内容、OSS 数据时默认不可信。
- 模板字符串生成 HTML 时，动态字段必须用 `utils.escapeHtml()`。
- 能用 `textContent` 和 DOM API 时，不要用 `innerHTML`。
- 导出或复制配置时不能泄露 API Key、OSS AccessKey 等密钥。
- 不要声称浏览器本地存储是加密保险箱；当前只是本机浏览器保存。
- 生产级密钥不应长期存浏览器端；相关需求先读 `docs/security-audit.md`。
- 上传、分享、发送、删除、清空等有外部影响或破坏性动作，要有明确用户确认。

## 11. UI 修改注意事项

- 后台工具页面应保持信息密度、清晰层次和可扫描性，不要做营销页式大 hero。
- 卡片只用于重复项、面板或模态框；不要层层套卡片。
- 表格、工具栏、分页、筛选器要保持稳定尺寸，避免动态内容导致跳动。
- 下拉、按钮、表格、确认弹窗优先复用组件库。
- 页面级 CSS 覆盖组件时，选择器必须精确。例如避免 `.head > div > span` 这类规则影响 `span.custom-select`。
- 需要滚动的表格区域，不要被后续规则写成 `overflow-y:hidden`。
- 修改响应式布局时同步检查桌面和移动视口。

## 12. 常见坑

- 动态刷新后，下拉样式丢失：忘了调用 `App.customSelects.enhanceAll(container)`。
- 表格内部不滚动：父级 flex 高度链路断了，或滚动层被后续 CSS 覆盖为 `overflow-y:hidden`。
- 删除动作绕过二次确认：直接调用删除函数，没走 `App.confirmDialog.confirmDelete()`。
- 页面切换不显示：`data-page`、`data-page-section` 或 `PAGE_DEFS` 映射不一致。
- 新 feature 不运行：脚本引入顺序错误，或没有在 `bootstrap/app.js` 调用 `init()`。
- 中文显示异常：文件编码或换行被工具改坏。
- XSS 风险：模板字符串里动态字段漏了 `utils.escapeHtml()`。

## 13. 修改后检查清单

- `git status --short`：确认只改了必要文件。
- `node --check <changed-js-file>`：检查改过的 JS。
- 搜索是否残留不该用的 API，例如 `window.confirm`。
- 如果改了脚本加载，检查 `index.html` 顺序。
- 如果改了动态渲染，检查组件增强和事件绑定是否仍然有效。
- 如果改了 UI，不要主动做浏览器验收；完成代码修改和静态检查后，说明建议用户验收的页面和关键操作。
- 如果改了安全相关逻辑，更新或对照 `docs/security-audit.md`。

常用检查示例：

```powershell
node --check assets\js\features\business-pages.js
node --check assets\js\features\spectrum-analysis.js
node --check assets\js\features\chat.js
Select-String -Path assets\js\**\*.js -Pattern "window.confirm"
```
