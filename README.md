# gjhoutai

广俊塑料科技后台管理系统原型。

## 项目说明

这是一个以静态页面为基础的后台界面项目，目前已经从单一的 `index.html` 拆分为更清晰的结构，便于后续扩展、维护和逐步接入真实业务功能。

当前页面主要包含：

- 左侧业务导航
- 中间主内容区
- 右侧 AI 聊天区
- OpenRouter AI 配置中心

## 目录结构

```text
.
├─ index.html
├─ logo.png
├─ README.md
└─ assets
   ├─ css
   │  ├─ base.css
   │  ├─ layout.css
   │  ├─ pages.css
   │  ├─ responsive.css
   │  ├─ sidebar.css
   │  └─ styles.css
   └─ js
      ├─ app-state.js
      ├─ app.js
      ├─ chat.js
      ├─ config.js
      └─ navigation.js
```

## 文件职责

- `index.html`：页面骨架和资源引用入口。
- `assets/css/styles.css`：样式汇总入口，通过 `@import` 引入各 CSS 分层文件。
- `assets/css/base.css`：全局变量、基础重置、通用按钮和基础排版。
- `assets/css/sidebar.css`：侧边栏相关样式。
- `assets/css/layout.css`：整体布局、顶部栏、主内容区。
- `assets/css/pages.css`：页面内容、AI 配置中心、占位页、聊天面板等样式。
- `assets/css/responsive.css`：响应式适配与折叠态样式。
- `assets/js/app-state.js`：共享 DOM 引用、常量、状态和通用工具。
- `assets/js/navigation.js`：侧边栏折叠、页面切换、导航状态恢复。
- `assets/js/config.js`：AI 配置表单、预览、保存、导入、导出、模型检测。
- `assets/js/chat.js`：聊天消息渲染、发送、历史记录读写。
- `assets/js/app.js`：启动入口，只负责按顺序初始化模块。

## 编码约定

- 项目文件统一使用 UTF-8 编码读写，避免中文乱码。
- 新增 CSS 和 JS 时，优先按职责继续拆分，不要把所有逻辑堆回单文件。
- 页面上的新增功能建议先落到独立模块，再由 `app.js` 统一启动。

## 本地使用

当前项目是静态页面结构，直接用浏览器打开 `index.html` 即可查看。

如果后续接入接口、构建工具或服务端渲染，再补充对应的启动说明。

## 后续扩展建议

- 新页面优先在 `index.html` 中补结构，再按功能拆分脚本。
- 公共样式优先放入 `base.css` 或 `layout.css`。
- 页面专属样式放入 `pages.css`。
- 业务逻辑按模块拆分到 `assets/js/` 下的新文件中。

