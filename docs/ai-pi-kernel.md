# AI 分析服务（pi 内核，服务端运行）

> 当前源码范围以 [current-project-scope.md](current-project-scope.md) 和 [ai-project-permissions.md](ai-project-permissions.md) 为准。下文历史 CRUD 上线记录不是当前实施指南：AI 业务写入已撤销，本地进一步删除了 business-actions/write-tools 实现与旧接口；相关历史命令和发布清单不能再使用。数据库迁移历史保留，不删除业务数据。

新「AI 分析」页使用**服务端 pi 内核**：模型密钥、系统提示、数据取数、工具执行在服务器完成，
浏览器负责「发问题 → 订阅事件流 → 渲染」。旧 Gjun AI 入口、常驻面板、启动代码、聊天模块与专属样式已删除，只保留一个「AI 分析」入口；独立图谱/识别功能不属于聊天助手。

- 线上入口：`https://www.kingpolymer.com/gjhoutai/api/ai/*`
- 服务：`gjhoutai-ai.service`（Node 22 + `@earendil-works/pi-coding-agent`，监听 `127.0.0.1:8790`）
- 代码：`server/ai/*.mjs`、`search-extension.ts`、独立 `package.json` / `package-lock.json`（运行时目录 `/var/www/gjhoutai/ai`）

## 架构

```
浏览器（React）
  │  POST /api/ai/runs            发起一次分析
  │  GET  /api/ai/runs/:id/events 订阅 SSE 事件流
  ▼
nginx  location ^~ /gjhoutai/api/ai/  →  127.0.0.1:8790（关闭缓冲）
  ▼
gjhoutai-ai.service（Node 22）
  ├─ 鉴权：gjh_session Cookie → sha256 → sessions 表（只读）
  ├─ pi 会话：每个「用户+会话」一个 AgentSession，系统提示 + 业务工具
  ├─ 查询工具：只读查询生产库（node:sqlite，readOnly 连接）
  ├─ 写入工具：只向主服务准备预览，不直接写库；浏览器确认后由主服务事务落库
  └─ 模型：OpenAI 兼容端点（models.json，密钥用 ${ENV} 插值，不落盘）
  ▼
DeepSeek / apimart / 其他 OpenAI 兼容服务
```

数据库与对象存储始终在服务端：浏览器拿到的只有文本增量、工具调用状态和用量。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/ai/health` | 健康检查（含模型就绪状态、活跃运行数），无需登录 |
| POST | `/api/ai/search` | 共用搜索适配接口，body `{ query, urls? }`，执行同一 pi-web-search 工具，必须登录 |
| POST | `/api/ai/runs` | 发起分析，body `{ prompt, threadId?, attachments?: [{ id }] }`，返回 `{ run: { id, ... } }` |
| POST | `/api/ai/uploads` | 上传单个附件（原始 body + `x-file-name` 头），返回 `{ attachment: { id, name, type, size, kind, url } }`，必须登录 |
| GET | `/api/ai/uploads/:id` | 回读自己上传的附件（图片预览/文件下载），按用户归属校验 |
| GET | `/api/ai/runs/:id/events?from=0` | SSE 事件流，`from` 用于断线续传 |
| POST | `/api/ai/runs/:id/abort` | 停止运行 |
| GET | `/api/ai/runs/:id` | 运行状态（状态、用量） |
| GET | `/api/ai/threads` | 当前用户的会话列表（进程内） |

## 附件、图片与文件

- 上传：前端把文件 POST 到 `/api/ai/uploads`（原始 body，`x-file-name` 用 `encodeURIComponent`，该 location 需 `client_max_body_size 10m`）。只接受 ≤ 8 MB/个、≤ 4 个/次，存到 `AI_UPLOAD_DIR`（默认 `<AI_AGENT_DIR>/uploads`，必须位于 systemd `ReadWritePaths` 内），进程内记录归属并按 TTL 清理。
- 图片（png/jpeg/webp/gif/bmp/avif）→ 读成 pi `ImageContent` 交给模型视觉输入。**前提**：`models.json` 里该模型声明 `input: ["text","image"]`（由 `AI_MODEL_INPUT` 生成，默认 `text,image`）；不声明时内核会把图片换成“图片已省略”，模型只能看到占位文本。
- 文本类（txt/csv/tsv/json/md/log/xml…）→ 服务端读出内容（≤ 60k 字符）拼进提问，提示词要求直接使用，不得声称“读不到附件”。
- 其它二进制（xlsx/pdf/docx…）→ 只传文件名与大小，要求如实说明无法解析，并引导到页面打开或转 CSV。
- 输出侧：工具返回 `imageUrl`/`openUrl`，模型用 Markdown 图片/链接引用；前端把图片渲染成可点开的预览，把平台文件链接渲染成带图标的文件卡片。只能引用工具真实返回的地址。
- 图片名称：结构化图谱使用服务器返回的完整原登记名称及日期，不依赖模型写alt；其他Markdown图片的替代文字由前端 `aiMarkdown.ts` 显式显示在图片上方。若紧邻已有完整同名标题/段落则不重复；空alt回退Markdown title，再缺失则显示“图片（未提供名称）”，不从URL猜测。旧保存消息也可补显示已有替代文字；原登记名称不代表图谱类型已核验，误标/视觉依据按下节说明。

### 事件协议

每个事件形如 `id: <seq>` + `data: { seq, at, type, ... }`：

| type | 载荷 | 前端用法 |
| --- | --- | --- |
| `start` | `runId`, `threadKey` | 建立气泡 |
| `text` | `delta` | 追加到回答（流式正文） |
| `thinking` | `delta` | 可选：思考过程 |
| `tool_start` | `toolCallId`, `name`, `args` | 显示「正在读取…」 |
| `tool_end` | `toolCallId`, `name`, `isError`, `result`, `proposal?`, `spectrumGallery?` | 收起状态，可展开结果；结构化图谱绕过摘要截断保存并展示 |
| `usage` | `usage` | 显示 token 用量 |
| `status` | `status`, `attempt?`, `message?`, `images?`, `files?` | retrying / compacting / timeout / attachments（附件读取） |
| `done` | `status`, `error?`, `usage?` | 收尾，关闭流 |

`status` 为 `completed` / `failed` / `aborted`。前端用 `src/services/ai-analysis.ts` 消费这些事件。

## 业务查询与受控写入工具

| 工具 | 作用 |
| --- | --- |
| `data_overview` | 物性/打版表更新时间、行数、字段、分表清单，识别记录与检测报告数量，图谱库概览（总数/类型/分类/标签/日期范围） |
| `query_property_rows` | 按型号/批号/关键字查询物性打版主表 |
| `query_sheet_rows` | 查询指定分表（测试板、PBT阻燃、无卤、尼龙、原料、竞品…），支持 merged/raw |
| `list_inspection_reports` | 检测报告元信息列表 |
| `list_spectrum_records` | 「图谱分析」图谱库元信息：编号/标题/登记类型（FTIR・TGA・DSC）/分类/日期/标签/备注/是否有图；类型未做图像核验 |
| `read_spectrum_image` | 按查询返回的精确id读取真实谱图图片，作为 pi ImageContent 送入当前模型；分析坐标轴而非盲信登记类型 |
| `list_office_records` | 「办事记录」送样/配色记录：项目、日期、类型、明细表列与数据行，可按类型/项目/日期区间/关键字过滤 |
| `list_ash_records` | 「办事记录」灰份检测记录：客户/名称、日期、批号、每个坩埚的杯重/料重/残重/灰份含量 |
| `query_report_ranges` | 物性分析页生成报告用的型号指标判定范围（型号 + 指标 + 上下限） |

图谱库与「图谱分析」页面同一份数据：`app_state` 全局键 `gjh-spectrum-user-images-v2`（记录）+ `gjh-spectrum-edits-v2`（手工编辑覆盖）。`list_spectrum_records` 只返回元信息，明确 `registeredType` / `typeSource: stored_metadata` / `typeVerified: false` / `imageProvided: false`；图片URL让浏览器显示图片，不代表模型看过像素。未调用工具时不得断言平台没有某张谱图。

### 三类图谱完整展示（程序规则，不交给模型自由挑选）

- 默认按型号查询时，DSC、TGA、FTIR各有可用图片就各选一张，固定按此顺序展示。先在**全量匹配集**选图，再截断records列表；两张FTIR不能占掉较旧DSC的名额。每类型取最近日期，同日优先常规图而不是灰份图；跳过无图及重复id。缺类型明确提示“未找到可用图片”，不拿重复类型补位。类型仍是登记分类，不是已完成视觉核验。
- `data.mjs` 拆出不截断的 `matchSpectrumRecords`，关键字比较容忍型号空格/连字符；品牌+型号可跨标题/分类字段匹配。`buildSpectrumListing` 绑定当前user问题，避免宽泛4830查询把4830-BKX/4830NCB混进明确4830BKF请求；只有用户实际指定某单一类型时才缩小展示范围，不能让模型擅自传的type过滤漏掉其他两类。
- `list_spectrum_records` 在文本前部及details返回 `spectrumGallery`（scopeKey/query/entries/requestedTypes/missingTypes），runtime原样放入tool_end，独立于2000字工具摘要。`src/utils/aiSpectrumGallery.ts` 验证、按查询精确度选择作用域、生成可见图名与日期和固定图片位。`ai-analysis.ts` 独立于模型Markdown渲染并保存到历史；即使模型只输出文字、漏DSC或重复FTIR也展示完整三类。
- 当结构化图库接管时，`aiMarkdown.ts` 去掉同平台图谱的重复图片及其完全相同的紧邻图名，保留分析正文、外链图像和代码示例；不覆盖其他数据类型。多型号分别成组。旧历史无结构化数据时不编造补图，需要重新查询。
- 此版本还需发布AI `data.mjs`（新增未截断查询导出）、`spectrum-tools.mjs` / `tools.mjs` / `runtime.mjs` / `prompt.mjs` 与前端，不能只同步前端。

### 图谱误标与视觉核验

- 不能把数据库登记的 `DSC`、标题或文件名当作图像识别。曾出现登记/标题为DSC、真实图片却为TGA/DTG的记录；旧助手仅收到元信息和URL，因此复述了错误登记。
- 分析/展示前调用 `read_spectrum_image`（`server/ai/spectrum-tools.mjs`）。服务端只向固定loopback8788的既有 `/api/blob/spectrum/:id?format=original` 发GET，携带当前用户Cookie并复用主服务的登录/读取权限，不接URL、路径或任意对象键，不直接读生产文件。拒绝不存在/重复id、401/403、HTML、MIME伪装、空文件、超过6MB（含无Content-Length的流）；禁止重定向、20秒超时、支持取消；每个run最多3次HTTP图片读取。
- 工具返回真实base64 `ImageContent` 与记录id、原登记、字节数、SHA256依据。`imageProvided: true` 只代表提供图片，**不是**类型已验证；图谱判断要由当前模型按真实坐标轴作出。没有可用视觉输入时返回错误与“未核验”说明，不自动切换模型，不调用第二个付费识别服务。SDK transport回归验证实际请求携带data:image/png而非仅URL。
- TGA是质量（%、mg）随温度/时间变化，DTG是其失重速率；负峰/上下两图不代表DSC。DSC需热流（mW、W/g）依据；FTIR需波数及吸收/透过率依据；质量+热流可为TG-DSC联用，不能将DTG当热流。
- 找某型号的TGA/DSC先按型号查询全登记类型，避免按错误登记过滤漏图；看不清/不支持图片/读取失败时必须标注“登记类型，尚未核验图像”。冲突时同时说明登记类型与图像依据，不自动改库，用户要求更正才准备确认卡片。
- `runtime.mjs` 按会话模型实际 `input` 声明绑定 `supportsImages`，每轮重置图片读取预算；health附带 `model.input`。管理员仍须保证模型/端点确实支持该声明，不能靠把文本模型配置为text,image来获得视觉能力。此功能不改变现有模型、密钥或环境配置。
- 本地回归：`npm run test:ai-spectrum`（也纳入 `npm run check`）。发布需要AI的新增 `spectrum-tools.mjs` 与 `tools.mjs` / `runtime.mjs` / `prompt.mjs`，及前端工具中文名称；**仅同步前端不会生效**。无需更新主服务/数据/依赖，重启AI前仍检查activeRuns=0；旧浏览器历史回答不会自动重写，发布后重新提问验证。

设计约束：

- **只暴露页面上真实存在的数据**：侧边栏只有七个页面（物性分析、图谱分析、检测报告、AI 分析、办事记录、配置中心、主题设置），工具集也只覆盖这七个页面里的业务数据。legacy 包里遗留的订单/库存/供应商/客户/配方/人员档案/权限管理/AI 调用日志等页面在当前版本不可达，**不接工具、不写进提示词**，避免模型编造不存在的模块。
- **工具与页面一一对应**：新增页面数据时，同时加工具 + 在 `prompt.mjs` 的「平台页面与可查数据」登记，保持模型认知与实际页面一致。

- **读写分离**：AI 的 `node:sqlite` 仍只读，systemd 不新增数据库写权限；新增 `prepare_business_change` 只使用绑定到用户/会话的登录态请求主服务 `/api/business-actions/prepare`。模型没有 commit 工具；浏览器确认才调用 `/api/business-actions/:id/commit`。
- **无文件/命令工具**：`noTools: 'builtin'` 关掉 read/bash/edit/write，只允许业务工具与内置搜索插件工具，
  模型拿不到文件系统或 shell。
- **不接受任意 SQL**：工具只暴露结构化参数，避免注入与慢查询。
- **口径在代码里**：过滤/截断（默认 30 条，上限 200）由 `data.mjs` 决定，不是让模型自由发挥。

新增工具：在 `server/ai/tools.mjs` 增加一项（typebox 参数 + `execute`），
只读数据访问写在 `server/ai/data.mjs`，然后同步 `src/services/ai-analysis.ts` 的 `AI_TOOL_LABELS`。

## 业务增删改查（Node 主服务）

- 数据集：`ash_records`、`office_records`、`spectrum_records`、`property_rows`、`report_ranges`、`inspection_reports`。新增/修改/删除均先显示待确认卡片，取消不落库，确认后真实写入同一份页面数据。物性行更新 merged 分表与对应 currentView，保留 raw 导入快照；报告/图谱支持元信息编辑，新建需本轮真实图片/PDF附件；不编辑 PDF 正文或生成图片像素。
- 接口归属 **主业务服务 8788**，不是 AI 服务 8790：POST `/api/business-actions/prepare`，GET `/api/business-actions/:id?threadId=...`，POST `/api/business-actions/:id/commit` / `cancel`（body `{threadId}`）。nginx 原 API 路由可用，不需放宽 AI systemd 写权限。
- 主实现 `server/lib/business-actions.mjs`，迁移 `0011_ai_business_actions.sql`（主服务启动也幂等建表）。每个预览 15 分钟有效，最多 50 条；权限在 prepare/commit 两次检查，绑定真实登录用户与 threadId；按来源白名单防跨站请求。
- 事务内检查原集合内容指纹；旧预览遇到并发变更返回409，不覆盖他人数据。数据、审计、确认状态同一 SQLite immediate 事务；重复点击幂等。before 快照保留在 `ai_business_actions.plan_json`，删除不销毁原图/PDF文件，便于管理员恢复。
- 新图/PDF先复制到新的唯一对象键，确认前不挂业务记录；取消仅清理本次暂存对象。不能接受任意URL/文件路径/SQL/存储键，附件归属继续由AI上传接口校验。
- 成功后前端仅回读受影响数据，更新本地缓存及已加载页面，不把旧 localStorage 回写覆盖新记录。不能操作账号、权限、密钥；配置中心/主题不是本工具的数据集。
- 需要同时发布主服务 `index.mjs` + `lib/business-actions.mjs`，AI 的 `tools.mjs` / `write-tools.mjs` / `runtime.mjs` / `service.mjs` / `prompt.mjs` / `data.mjs`，以及前端；只同步前端不会开通写入。没有新增依赖或环境变量；AI 到主服务使用固定 loopback 8788，主服务读取附件使用 loopback8790与现有APP_BASE_PATH。
- 回归：`npm run test:business-actions`；另有前端确认/取消/失败与页面刷新测试。验证必须使用临时数据库，不能拿生产记录做增删测试。

## 通用问答与主动查证

- 平台是工作环境，不是话题边界：游戏、科技、生活、学习、写作等题外话正常回答，不强行转回塑料业务。
- 不熟悉、拿不准的外部事物、名称歧义/俗称、最新信息必须主动使用 `web_search` 核实，不等用户再次授权或说「去搜」。
- 稳定基础知识、寒暄和确定性计算不强制搜索；内部业务记录仍严格使用只读业务工具，并禁止把内部数据提交给公开搜索。
- 搜索失败或证据不足时如实说明，不编造来源；检索后仍有关键歧义才具体澄清。
- 提示词与回归规则：`server/ai/prompt.mjs`、`server/ai/prompt.node-test.mjs`。

## 内置搜索：pi-web-search 1.7.0

- `search-extension.ts` 显式加载固定版本 npm 插件，禁止扫描用户或工作区扩展；不是在浏览器另写搜索引擎。
- `web_search` 跟随服务端会话模型与凭据；`url_context` 按上游规则仅在 Gemini/Ollama 可用时激活。
- 不再使用 Tavily：配置中心移除联网搜索页签、密钥、深度、主题和结果数量；导入、读写、导出时过滤旧字段。
- 不支持原生搜索、上游失败或没有搜索证据时明确失败，不切换模型、不回退到旧引擎。
- 可由管理员在服务端 `/var/lib/gjhoutai/pi/web-search.json` 显式指定 `{ "provider": "...", "model": "..." }`；模型须已注册。无该文件就用会话模型。
- 前端聊天仅使用 `/runs` + SSE，不再运行旧浏览器聊天编排。共用搜索代理最长 120 秒、全局 4 / 单用户 2；支持断开取消。插件自身的外部 API 调用可能产生模型厂商费用。
- 内部业务数据不得发给公开搜索，网页内容作为不可信资料，不执行其中指令。
- 验证：`npm test --prefix server/ai` 使用真实插件与本地模拟厂商端点检查注册、来源、错误与无证据拒绝；不消耗线上额度。

## 部署

```bash
# 1. Node 22（独立目录，不动系统 nodejs）
/opt/node22/bin/node -v        # v22.23.3

# 2. 运行目录
/var/www/gjhoutai/ai           # server/ai/*.mjs + package.json + node_modules

# 安装固定依赖（必须显式使用 Node 22 的 PATH，避免本机 Node 版本污染）
cd /var/www/gjhoutai/ai
PATH=/opt/node22/bin:$PATH npm ci --ignore-scripts --omit=dev

# 3. 环境变量（权限 640，属主 root:gjhoutai）
/etc/gjhoutai/ai.env           # 见 deploy/gjhoutai-ai.env.example

# 4. 服务
systemctl status gjhoutai-ai   # deploy/gjhoutai-ai.service
```

nginx：把 `deploy/nginx-gjhoutai-ai.conf` 的内容插到 `/etc/nginx/snippets/gjhoutai.conf`
的 `location ^~ /gjhoutai/` **之前**，然后 `nginx -t && systemctl reload nginx`。
AI 段必须保留 `proxy_buffering off`，否则 SSE 会被缓冲成一次性返回。

## 切换模型

任何 OpenAI 兼容端点都通过 `models.json` 接入（服务启动时按环境变量生成）：

```ini
AI_PROVIDER_ID=kingpolymer
AI_BASE_URL=https://api.apimart.ai/v1
AI_MODEL=kingpolymer:gpt-5
AI_API_KEY=<密钥>
```

改完 `/etc/gjhoutai/ai.env` 后 `systemctl restart gjhoutai-ai`，
用 `curl https://www.kingpolymer.com/gjhoutai/api/ai/health` 确认 `model.ready`。

密钥只存在于 `/etc/gjhoutai/ai.env`（和进程环境）：
`models.json` 里写的是 `${AI_API_KEY}` 插值，前端与静态资源都拿不到。

## 运维与限制

- 并发：全局 4 个运行、单用户 2 个，单次最长 5 分钟（超出自动中止）。
- 会话：目前是**进程内**会话（重启即清空），按「用户 + threadId」复用上下文。
- 运行日志：`journalctl -u gjhoutai-ai -f`。
- 用量：`done` 事件带 token 统计；自定义端点没有价目表，`cost` 为 0。
- 未做：会话落盘（服务重启后服务端上下文清空，浏览器历史仍在）、审计日志不可篡改强化、二进制Office/PDF正文解析。写操作预览和图片输入见上文；图片识别准确性仍依赖已配置模型的真实视觉能力与原图清晰度。

## 前端接入

页面通过 `src/services/ai-analysis.ts` 使用服务端内核，不再接触模型、密钥或数据查询：

```ts
const run = await aiAnalysis.start(question, { threadId: '默认' });
await aiAnalysis.stream(run.id, (event) => {
  if (event.type === 'text') appendAnswer(event.delta);
  if (event.type === 'tool_start') showStatus(aiAnalysis.toolLabel(event.name));
  if (event.type === 'done') finish(event.status);
});
```

新增工具时同步 `AI_TOOL_LABELS`，界面就会显示对应中文说明。

## 页面：AI 分析

- 入口：侧栏「研究与检测」→ AI 分析（`data-page="ai-analysis"`）。
- 文件：`src/legacy/features/ai-analysis.ts`、`src/styles/pages/ai-analysis.css`；
  页面骨架在 `src/legacy/legacyMarkup.ts` 的 `AI_ANALYSIS_MARKUP`。
- 会话存在浏览器 `localStorage: gjh-ai-analysis-sessions-v1`（最多 20 条，每条最多 40 轮），
  `threadId` 就是会话 id，服务端按「用户 + threadId」复用上下文。
- 交互：快捷问题填入输入栏、停止、新建、历史抽屉/单条删除确认；`Enter` 发送、`Shift+Enter` 换行。
- 调用汇总与 AI 标题同一行；执行中展开轻量轨迹，结束后收起。同名搜索工具的并行调用合并为**一行**展示（汇总仍显示次数，如「已完成 2 次联网搜索」），该行的关键词用「、」合并；其他业务工具重复调用仍各自成行以保留参数与结果。
- 工具按 toolCallId 匹配并行结果；停止或断流不会把未结束的工具标成成功。重试、整理上下文仅作为单一阶段提示，不展示重复红色错误。
- 流式正文由 `src/utils/aiStreamDom.ts` 增量更新 DOM，保留展开状态、表格和代码滚动位置；仅新内容淡入，尊重减少动态效果设置。
- `src/utils/aiMarkdown.ts` 统一正文/表格/代码/引用样式；完成后可复制回答或代码。工具前说明放进执行轨迹的「处理过程」，不混入正文。
- 权限：系统管理员、研发部、测试部、生产部、生产部主管可见（`departmentPageAccess`）。
