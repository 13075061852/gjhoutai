# 项目架构说明

更新日期：2026-04-30

## 技术栈

- 运行方式：静态 HTML + CSS + 原生 JavaScript
- UI 图标：Tabler Icons Webfont，已固定版本
- Excel 解析：SheetJS standalone build
- 本地状态：`localStorage`、`IndexedDB`、运行时内存对象
- 构建工具：暂无
- 后端服务：暂无

## 启动顺序

`index.html` 是唯一页面入口，脚本按以下顺序加载：

1. `assets/js/core/app-namespace.js` 创建 `window.GJHApp`。
2. `assets/js/core/dom-refs.js` 收集全局 DOM 引用。
3. `assets/js/core/app-constants.js` 注册页面定义、存储键和默认配置。
4. `assets/js/core/runtime-state.js` 注册跨模块运行态状态。
5. `assets/js/core/utils.js` 注册通用工具。
6. `assets/js/app-state.js` 检查核心模块是否完整。
7. 功能脚本依次挂载到 `window.GJHApp`。
8. `assets/js/app.js` 调用各模块的 `init()`。

## JavaScript 分层

`assets/js/core/` 只放跨模块共享能力：

- `app-namespace.js`：应用命名空间。
- `dom-refs.js`：跨页面 DOM 引用。
- `app-constants.js`：常量、默认配置、页面定义。
- `runtime-state.js`：聊天等跨模块运行态。
- `utils.js`：HTML 转义、轻量 Markdown、JSON 读写、下载、复制。

页面功能脚本放在 `assets/js/` 根层，每个文件只负责一个业务域：

- `navigation.js`：导航、页面切换、最近访问。
- `config.js`：AI / OSS 配置、模型加载、连接测试。
- `chat.js`：AI 对话、流式响应、图片预览、技能动作。
- `property-analysis.js`：物性数据加载、Excel 导入、OSS 同步、表格检索。
- `spectrum-analysis.js`：图谱库、标签、详情、批量操作。
- `image-cutout.js`：图片抠图、裁剪和导出。
- `project-skills.js`：项目技能定义和执行记录。
- `ai-call-analysis.js`：调用日志、Token 和费用统计。

## CSS 分层

`assets/css/styles.css` 是样式入口，按基础层、布局层、页面层、响应式层加载。

`assets/css/pages.css` 只做聚合，具体页面样式拆到 `assets/css/pages/`：

- `dashboard-chat.css`：仪表盘、通用面板、聊天消息。
- `business-pages.css`：业务中心原型页。
- `property-analysis.css`：物性分析。
- `spectrum-analysis.css`：图谱分析。
- `image-cutout.css`：抠图助手。
- `config.css`：配置中心和 AI 侧栏。
- `theme-settings.css`：主题设置。
- `project-skills.css`：AI技能面板。
- `ai-call-analysis.css`：AI 调用分析。
- `theme-overrides.css`：明暗主题覆盖。

## 页面映射

页面切换依赖两个约定：

- 导航按钮使用 `data-page="<page-id>"`。
- 页面容器使用 `data-page-section="<page-id>"`。

业务占位页复用 `data-page-section="placeholder"`，页面文案来自 `App.constants.PAGE_DEFS`，业务内容由 `App.businessPages.render(pageId)` 生成；库存管理等业务页可在 `business-pages.js` 中提供定制原型内容。

## 扩展边界

- 新增共享能力先判断是否真的跨模块复用；否则放在具体功能脚本内。
- 新增页面不要继续扩大 `pages.css`，应新增页面 CSS 文件。
- 新增密钥、上传、模型调用能力必须先评估 `docs/security-audit.md` 中的剩余风险。
