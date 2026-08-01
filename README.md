# gjhoutai

广俊塑料科技后台管理系统原型，已迁移为 React 18 + TypeScript + Vite 项目。

## 项目定位

这是一个前端后台原型，用于沉淀广俊塑料科技的业务管理、数据分析、AI 助手和配置中心能力。项目运行依赖浏览器本地存储、IndexedDB、Cloudflare D1/R2 和第三方模型接口。

当前页面主要包含：

- 业务导航、仪表盘、库存管理和业务中心页面
- 配置中心、主题设置、权限管理和审计日志
- 物性分析、图谱分析、抠图助手
- 右侧 Gjun AI 聊天、AI 技能面板、AI 调用分析

## 技术栈

- React 18
- TypeScript
- Vite
- 原有 CSS 样式体系迁移到 `src/styles/`
- 原有业务逻辑迁移到 `src/legacy/`，由 React 页面壳挂载运行

## 本地运行

安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

默认访问地址：

```text
http://127.0.0.1:5001
```

生产构建：

```bash
npm run build
```

本地预览构建结果：

```bash
npm run preview
```

## 目录结构

```text
.
├─ index.html
├─ package.json
├─ package-lock.json
├─ vite.config.ts
├─ tsconfig.json
├─ tsconfig.app.json
├─ tsconfig.node.json
├─ public/
│  └─ logo.png
└─ src/
   ├─ main.tsx
   ├─ App.tsx
   ├─ pages/
   │  └─ LegacyShell.tsx
   ├─ utils/
   │  └─ themeBootstrap.ts
   ├─ types/
   │  └─ global.d.ts
   ├─ styles/
   │  ├─ styles.css
   │  ├─ pages.css
   │  ├─ foundation/
   │  ├─ components/
   │  ├─ layout/
   │  └─ pages/
   └─ legacy/
      ├─ bootstrap.ts
      ├─ legacyMarkup.ts
      ├─ bootstrap/
      ├─ core/
      ├─ components/
      ├─ shell/
      └─ features/
```

## 文件职责

- `index.html`：Vite 应用入口，只挂载 `#root` 和 `src/main.tsx`。
- `src/main.tsx`：React 入口。
- `src/App.tsx`：应用根组件，负责初始化主题状态并在 DOM 挂载后启动 legacy 功能模块。
- `src/pages/LegacyShell.tsx`：承载迁移后的页面骨架。
- `src/legacy/legacyMarkup.ts`：由原 `index.html` 页面结构迁移而来。
- `src/legacy/bootstrap.ts`：按依赖顺序加载原功能模块并执行初始化。
- `src/legacy/core/`：应用命名空间、常量、运行态状态、DOM 引用和通用工具。
- `src/legacy/components/`：自定义下拉、搜索框、确认弹窗等共享组件。
- `src/legacy/shell/navigation.ts`：侧边栏、页面切换、最近访问和 AI 面板布局控制。
- `src/legacy/features/`：物性分析、图谱分析、抠图助手、配置中心、AI 聊天等业务功能。
- `src/styles/`：全局样式、布局样式、组件样式和页面样式。
- `public/logo.png`：静态 Logo 资源。

## 数据来源

物性分析表从 Cloudflare Worker 读取 D1 中的结构化数据；导入 Excel 时，解析后的数据写入 D1，Excel 原文件备份写入 R2。前端不再保存或使用阿里云 OSS 密钥。

配置中心默认 OSS 配置：

- Bucket：`gjhoutai`
- Endpoint：`oss-cn-shanghai.aliyuncs.com`
- JSON 路径：`测试数据.json`

本地开发地址为 `http://127.0.0.1:5001`。前端通过 `VITE_STORAGE_API_BASE` 访问 Cloudflare Worker，由 Worker 负责鉴权、D1 和 R2 操作。

## 外部依赖和网络请求

- 配置中心和 Gjun AI 会根据本地配置请求 DeepSeek、SiliconFlow 或 LM Studio 兼容接口。
- 物性分析导入 Excel 时会运行时加载 SheetJS CDN。
- 图谱分析导入/导出压缩包时会运行时加载 JSZip CDN。
- 汇率估算会请求公开汇率接口。

## 本地存储

项目使用浏览器本地能力保存运行态数据：

- `localStorage`：主题、侧边栏状态、AI 配置、聊天记录、最近访问页面等。
- `IndexedDB`：图谱图片、抠图助手图片结果等较大二进制内容。

清理浏览器站点数据会重置这些本地状态。

## Gjun AI Agent Runtime

聊天请求由版本化 Agent Runtime V2 统一协调：

- 普通问候直接调用一次聊天模型，不经过项目规划或页面清单读取。
- 单工具、联网搜索、图片分析和图片生成走注册表中的确定性工具。
- 多工具任务先规划，再按依赖顺序执行；执行步骤会在同一条助手消息中持续更新，不展示隐藏思维链。
- 读取类工具可自动执行；创建、删除等写操作会先展示目标、参数、影响和有效期，用户确认后才执行。
- 用户取消会中止活动请求；超时与取消分开记录。已经启动的外部写入若无法回滚，会标记为结果未知并要求对账。
- 每次运行以版本化记录保存到本地运行存储，支持确认重放、幂等键和审计结果。

API 凭据仍只从现有本地配置路径读取；模型回答只接收脱敏后的工具证据，不会收到处理器、确认令牌、密钥或原始图片数据。

## 开发约定

- 新的 React 代码优先放入 `src/pages/`、`src/components/`、`src/utils/` 和 `src/types/`。
- 迁移兼容层仍在 `src/legacy/`，后续可逐步替换为 React state 和组件。
- 样式继续沿用当前类名体系，统一从 `src/styles/styles.css` 进入。
- 涉及密钥、Cloudflare 存储、模型调用、文件导入和导出时，需要特别检查鉴权、上传大小限制和跨域配置。
