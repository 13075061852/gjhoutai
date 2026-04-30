# 安全检查报告

更新日期：2026-04-30

## 范围

本次检查覆盖：

- `index.html`
- `assets/js/`
- `assets/css/`
- 现有 Markdown 文档
- 外部 CDN 依赖加载方式

当前项目没有 `package.json`，因此无法执行 `npm audit`。依赖风险以页面中直接引用的 CDN 资源为准。

## 已修复

### 中风险：CDN 使用 `@latest`

- 位置：`index.html`
- 问题：Tabler Icons 使用 `@latest`，每次访问可能拉取不同版本，存在不可复现和供应链风险。
- 处理：固定到 `@tabler/icons-webfont@3.41.1` 的 `dist/tabler-icons.min.css`。

### 中风险：旧版 Excel 解析依赖

- 位置：`index.html`
- 问题：页面直接引用 `xlsx@0.18.5`，后续维护和漏洞响应不明确。
- 处理：改为 SheetJS 官方 CDN 的 `xlsx-0.20.3` standalone build。

### 中风险：配置复制/导出暴露密钥

- 位置：`assets/js/config.js`
- 问题：复制或导出配置会包含 OpenRouter API Key、OSS AccessKey ID 和 OSS AccessKey Secret。
- 处理：新增配置脱敏逻辑，导出和复制时使用 `__REDACTED__` 占位；导入脱敏配置时不会把占位符当作真实密钥写回。

### 低风险：密钥存储文案误导

- 位置：`index.html`、`assets/js/config.js`
- 问题：界面显示“私密存储，安全加密”，但当前实现是浏览器本地存储，不是加密密钥仓库。
- 处理：改为“仅保存在本机浏览器”，避免误导使用者。

## 仍需后续处理

### 高风险：浏览器端保存和使用生产密钥

- 位置：`assets/js/config.js`、`assets/js/property-analysis.js`
- 风险：OpenRouter API Key 和 OSS AccessKey 当前仍会在浏览器端用于请求；任何有本机浏览器访问权限的人都可能读取本地配置。
- 建议：生产环境改为后端代理模型调用；OSS 上传改为后端签发短期凭证或预签名 URL。

### 高风险：前端直传 OSS 使用长期 AccessKey

- 位置：`assets/js/property-analysis.js`
- 风险：即使表单签名策略设置了过期时间，长期 AccessKey Secret 仍在浏览器端参与签名。
- 建议：使用 STS 临时凭证、后端签名，或仅允许受控服务端上传。

### 中风险：大量 `innerHTML` 模板渲染

- 位置：多个功能脚本
- 现状：多数动态字段已经通过 `utils.escapeHtml()` 转义。
- 风险：后续新增模板时容易漏转义。
- 建议：新增页面优先使用 `textContent` 和 DOM API；必须模板渲染时在代码评审里检查每个动态字段。

### 中风险：缺少生产安全头

- 位置：部署层
- 风险：静态文件本身无法设置 HSTS、CSP、X-Frame-Options 等响应头。
- 建议：上线时在 Nginx、CDN、对象存储网关或后端服务中配置 CSP、HSTS、Referrer-Policy、X-Content-Type-Options。

### 低风险：缺少依赖锁和自动化扫描

- 位置：仓库根目录
- 风险：CDN 依赖不进入常规依赖审计流程。
- 建议：后续引入 `package.json` 后，把依赖纳入锁文件和定期扫描。

## 安全基线

- 不提交 `.env` 或真实密钥。
- 配置文件、导出文件、日志默认不包含密钥。
- 外部资源固定版本。
- 用户输入、接口返回、模型输出渲染前必须转义。
- 生产密钥不应长期存在浏览器端。
