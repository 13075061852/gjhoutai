# gjhoutai

广俊塑料科技后台管理系统原型，已迁移为 React 18 + TypeScript + Vite 项目。

## 项目定位

这是一个前端后台原型，用于沉淀广俊塑料科技的业务管理、数据分析、AI 助手和配置中心能力。项目运行依赖浏览器本地存储、IndexedDB、Cloudflare D1/R2 和第三方模型接口。

当前页面只保留以下模块，左侧导航为扁平的 6 项列表（无分类）：

- 物性分析
- 图谱分析
- 检测报告
- 办事记录
- 配置中心
- 主题设置

右侧保留 Gjun AI 聊天助手；仪表盘、权限管理以及订单、库存、客户、供应商、配方、生产、采购、人员等业务页面均已下线。

## 技术栈

- React 18
- TypeScript
- Vite（构建基路径为 `/gjhoutai/`）
- Node 20 自托管服务（`server/`，承载原 Cloudflare Worker 的 API 与静态资源）
- 本地 SQLite（原 D1）+ 本地文件系统对象存储（原 R2）
- 原有 CSS 样式体系迁移到 `src/styles/`
- 原有业务逻辑迁移到 `src/legacy/`，由 React 页面壳挂载运行

生产环境部署在 `https://www.kingpolymer.com/gjhoutai/`，迁移说明见
[香港服务器迁移记录](docs/deployment-hk-server.md)。

## 界面设计系统

全局视觉与动效由共享层统一约束，页面只描述自己的布局：

- `src/styles/foundation/base.css`：颜色、字号、间距、圆角、控件高度、`--elev-*` 层级阴影与暗色主题覆盖。
- `src/styles/foundation/motion.css`：动效令牌、关键帧与工具类（`.ui-stagger`、`.ui-skeleton`、`.ui-anim-*`），页面切换、对话框、卡片、进度条与交互反馈统一从这里取用。
- `src/styles/components/`：React 与旧页面共用的按钮、字段、工具栏、分页、对话框、下拉选择等基础控件。
- `src/styles/layout/`：外壳（侧边栏、顶栏、内容区）与全局断点。全局断点固定为 1200 / 980 / 720 / 480，页面可以在此基础上追加自己的断点。
- 多端策略：桌面（>1200）完整三栏；平板（721–980）固定 72px 图标导航轨，悬停显示名称气泡；平板与手机（≤980）聊天助手改为整屏覆盖；手机（≤720）侧边栏改为抽屉、对话框改为底部弹出面板、配置文件操作栏吸附底部；手机（≤480）进一步单列化。

约束：样式不得使用渐变函数，动效只使用 `transform` / `opacity`，并同时尊重 `prefers-reduced-motion` 与 `html[data-reduced-motion="1"]`，由 `npm run check:ui` 与 `npm test` 守护。

## 本地运行

安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

也可使用等效命令 `npm run dev:web`。

默认访问地址：

```text
http://127.0.0.1:5001/gjhoutai/
```

启动本地 Node API（可选，默认前端连线上服务）：

```bash
npm run build:server
npm run start:server
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
├─ server/
│  ├─ index.mjs          # Node HTTP 服务：API 转发 + 静态资源 + SPA 回退
│  ├─ worker.mjs         # esbuild 打包后的原 Worker 代码
│  └─ lib/
│     ├─ d1.mjs          # D1 -> 本地 SQLite 兼容层
│     ├─ r2.mjs          # R2 -> 本地文件系统兼容层
│     └─ static.mjs      # 静态资源服务
├─ deploy/
│  ├─ gjhoutai.service   # systemd 单元
│  ├─ nginx-gjhoutai.conf# nginx 反向代理片段
│  ├─ gjhoutai.env.example
│  └─ tools/             # D1 导入 / R2 下载等一次性迁移脚本
├─ worker/               # 原 Cloudflare Worker 源码（仍为唯一 API 实现来源）
├─ public/
│  └─ logo.webp
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
- `src/legacy/shell/navigation.ts`：侧边栏、页面切换和最近访问；不再控制旧 AI 浮层。
- `src/legacy/features/`：物性分析、图谱分析、抠图助手、配置中心、AI 聊天等业务功能。
- `src/styles/`：全局样式、布局样式、组件样式和页面样式。
- `public/logo.png`：静态 Logo 资源。
- `src/services/ai-analysis.ts`：服务端 AI 内核的客户端（发起分析 + 订阅 SSE 事件流）。
- `server/ai/`：服务端 AI 内核（pi SDK、内置 `pi-web-search@1.7.0`、业务只读工具、SSE 网关），有独立依赖锁文件；唯一的 AI 分析页面走服务端插件，旧助手入口、面板与聊天运行时已删除，已移除 Tavily 及其配置。详见 [docs/ai-pi-kernel.md](docs/ai-pi-kernel.md)。

## 数据来源

物性分析表、应用状态、用户与配置等数据保存在自托管服务器的 SQLite 中；导入
Excel 时，解析后的数据写入 SQLite，Excel 原文件备份写入 `data/objects` 目录
（原 R2 语义）。前端不再保存或使用阿里云 OSS 密钥。

- 生产接口：`https://www.kingpolymer.com/gjhoutai/api/*`
- 本地开发接口：由 `.env.development` 的 `VITE_STORAGE_API_BASE` 指定
- 构建产物基路径：`/gjhoutai/`（见 `vite.config.ts` 的 `base`）
- 旧的 Cloudflare Worker / D1 / R2 资源保留未删除，可作为回滚备份

配置中心默认 OSS 配置：

- Bucket：`gjhoutai`
- Endpoint：`oss-cn-shanghai.aliyuncs.com`
- JSON 路径：`测试数据.json`

本地开发地址为 `http://127.0.0.1:5001/gjhoutai/`。前端通过 `VITE_STORAGE_API_BASE`
访问后端 API（生产环境为同源 `/gjhoutai`），由后端负责鉴权、SQLite 和文件对象操作。

## 外部依赖和网络请求

- AI 分析统一请求服务端 pi 网关；配置检测、图谱分析和数据识别等专用功能仍使用各自的模型接口。
- 物性分析导入 Excel 时会运行时加载 SheetJS CDN。
- 图谱分析导入/导出压缩包时会运行时加载 JSZip CDN。
- 汇率估算会请求公开汇率接口。

## 本地存储

项目使用浏览器本地能力保存运行态数据：

- `localStorage`：主题、侧边栏状态、AI 配置、聊天记录、最近访问页面等。
- `IndexedDB`：图谱图片、抠图助手图片结果等较大二进制内容。

清理浏览器站点数据会重置这些本地状态。

## 唯一的 AI 工作区

侧栏只保留「AI 分析」，已删除旧 Gjun AI 的侧栏/顶部入口、常驻面板、启动逻辑、聊天运行时及专属样式。
新页面使用服务端 pi 内核，支持业务只读查询、原生联网搜索、流式回答、停止、新建与历史分析。
模型和搜索密钥由服务端持有；旧助手的浏览器聊天路径不再构建或加载。

历史本地数据未主动清空，但旧的面板开关不会被恢复。共用的项目技能注册表仍供其他模块使用，不再作为第二个聊天助手运行。
详细接口与当前限制见 [AI pi 内核](docs/ai-pi-kernel.md)。

## UI 规范与质量检查

公共 UI 变量位于 `src/styles/foundation/base.css`，跨页控件规范位于 `src/styles/components/design-system.css`，React 通用组件位于 `src/components/ui/`。

```bash
npm run check       # 锁文件、UI、Worker 类型、测试、前端构建
npm audit           # 已知依赖漏洞检查
```

已修复问题、部署注意事项及尚待验收范围见 [框架与安全检查记录](docs/architecture-and-security-review.md)。

## 开发约定

- 新的 React 代码优先放入 `src/pages/`、`src/components/`、`src/utils/` 和 `src/types/`。
- 迁移兼容层仍在 `src/legacy/`，后续可逐步替换为 React state 和组件。
- 样式继续沿用当前类名体系，统一从 `src/styles/styles.css` 进入。
- 涉及密钥、Cloudflare 存储、模型调用、文件导入和导出时，需要特别检查鉴权、上传大小限制和跨域配置。

### APIMart 图片与视频生成

配置中心的媒体生成已切换至 [APIMart 文档](https://docs.apib.ai/cn) 对应的服务，使用独立的 API Key，固定接口基地址为 `https://api.apimart.ai/v1`。当前适配 Seedream 4.5（2K/4K）与可灵 2.6（标准/专业模式，5/10 秒），支持参考图、异步任务进度和结果查询。

前端通过已登录的 Worker 路由 `/api/apimart/request` 请求平台。上线需同步更新前端与 Worker；本地开发需同时运行 `npm run dev:web` 和 `npm run dev:worker`。在配置中心填入新的 APIMart API Key 后保存，可先点击“查询额度”验证接入，无需提交生成任务。配置随现有配置中心机制保存到云端，导出时密钥脱敏。

旧 LiblibAI 密钥不会用于新平台，历史生成记录保留；旧平台未完成任务不再自动轮询。生成结果链接有有效期，请及时下载保存。
