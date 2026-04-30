# gjhoutai

广俊塑料科技后台管理系统原型。

## 项目定位

这是一个静态前端后台原型，用于沉淀广俊塑料科技的业务管理、数据分析、AI 助手和配置中心能力。当前没有构建工具和后端服务，直接打开 `index.html` 即可运行。

当前页面主要包含：

- 业务导航、仪表盘和业务中心占位页
- 配置中心、主题设置、权限管理和审计日志占位
- 物性分析、图谱分析、抠图助手
- 右侧 Gjun AI 聊天、项目技能面板、AI 调用分析面板

## 目录结构

```text
.
├─ index.html
├─ logo.png
├─ README.md
├─ .editorconfig
├─ .gitattributes
├─ docs
│  ├─ architecture.md
│  ├─ extension-guide.md
│  ├─ security-audit.md
│  └─ plans/
└─ assets
   ├─ css
   │  ├─ styles.css
   │  ├─ base.css
   │  ├─ sidebar.css
   │  ├─ layout.css
   │  ├─ responsive.css
   │  ├─ pages.css
   │  └─ pages/
   │     ├─ dashboard-chat.css
   │     ├─ business-pages.css
   │     ├─ property-analysis.css
   │     ├─ spectrum-analysis.css
   │     ├─ image-cutout.css
   │     ├─ config.css
   │     ├─ theme-settings.css
   │     ├─ project-skills.css
   │     ├─ ai-call-analysis.css
   │     └─ theme-overrides.css
   └─ js
      ├─ core/
      │  ├─ app-namespace.js
      │  ├─ dom-refs.js
      │  ├─ app-constants.js
      │  ├─ runtime-state.js
      │  └─ utils.js
      ├─ app-state.js
      ├─ app.js
      ├─ navigation.js
      ├─ config.js
      ├─ chat.js
      └─ 功能模块脚本
```

## 文件职责

- `index.html`：页面骨架、外部资源和脚本加载顺序。
- `assets/css/styles.css`：全局样式入口。
- `assets/css/pages.css`：页面样式聚合入口，只负责 `@import` 页面级 CSS。
- `assets/js/core/`：应用命名空间、DOM 引用、常量、运行态状态和通用工具。
- `assets/js/app-state.js`：核心加载完整性检查，保留旧入口语义。
- `assets/js/app.js`：启动入口，按顺序初始化功能模块。
- `docs/architecture.md`：结构和模块边界说明。
- `docs/extension-guide.md`：新增页面、模块、样式和安全约定。
- `docs/security-audit.md`：安全检查结果和后续加固清单。

## 编码约定

- 项目文件统一按 UTF-8 读写。
- 新增文本文件默认使用 LF 换行。
- `.editorconfig` 和 `.gitattributes` 已固定基础编码与换行策略。
- 如遇中文乱码，先确认文件编码，不要直接覆盖原内容。

## 本地使用

直接用浏览器打开 `index.html` 即可查看。

如果使用 VS Code Live Server，当前仓库配置端口为 `5501`。

## 扩展原则

- 新页面先补 `index.html` 页面结构和 `data-page` / `data-page-section` 映射。
- 页面样式放到 `assets/css/pages/<feature>.css`，再由 `pages.css` 引入。
- 业务逻辑优先新增独立 JS 文件，再由 `app.js` 统一初始化。
- 共享 DOM、常量、状态和工具优先放入 `assets/js/core/`。
- 涉及密钥、OSS、模型调用和文件导入的功能，先阅读 `docs/security-audit.md`。
