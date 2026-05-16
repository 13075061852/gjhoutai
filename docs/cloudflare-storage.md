# Cloudflare D1 + R2 存储接入

当前接入把“结构化状态”和“二进制文件”分开：

- D1：图谱库元数据、图谱编辑记录、抠图会话状态，以及聊天记录、主题、导航状态、分析页设置等非敏感 JSON 状态
- R2：图谱图片、抠图后的 PNG 结果

## 本地开发

1. 创建资源：

```bash
npx wrangler d1 create gjhoutai
npx wrangler r2 bucket create gjhoutai-files
```

2. 将 D1 返回的 `database_id` 填入 `wrangler.jsonc`
3. 初始化数据库：

```bash
npx wrangler d1 migrations apply gjhoutai --local
```

4. 启动 Worker 与前端：

```bash
npm run dev:worker
npm run dev
```

当前项目的 `.env.development` 已直接指向线上 Worker，因此本地前端开发也会读写你的 Cloudflare 数据：

```text
VITE_STORAGE_API_BASE=https://gjhoutai-storage.1308715689.workers.dev
```

如果你以后想完全离线联调，再删除该环境变量并启动 `npm run dev:worker`，让 Vite 通过 `/api` 代理到 `http://127.0.0.1:8787`。

## 生产部署

```bash
npx wrangler d1 migrations apply gjhoutai --remote
npx wrangler deploy
npm run build
```

部署后，前端默认通过 `.env.production` 指向已创建的 Worker：

```text
VITE_STORAGE_API_BASE=https://gjhoutai-storage.1308715689.workers.dev
```

如果后续你把前端也部署到同一个域名下，可以改回同源 `/api/*`。

## 当前迁移范围

- 已迁移到云端：图谱库上传图片、图谱元数据、抠图结果、抠图会话状态、聊天记录、AI 调用日志、主题、导航状态、分析页设置
- 仍保留本地：前端运行时缓存与临时 UI 状态
- 暂不迁移：AI/API 密钥等敏感配置
