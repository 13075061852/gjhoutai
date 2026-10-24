# 迁移到香港服务器（www.kingpolymer.com/gjhoutai）

本项目已从 Cloudflare Workers + D1 + R2 迁移到香港服务器自托管，前端与 API
同源部署在 `https://www.kingpolymer.com/gjhoutai/`。

## 目标架构

| 原组件 | 迁移后 |
| --- | --- |
| Cloudflare Worker（`worker/index.ts`） | Node 20 HTTP 服务（`server/index.mjs`，原 Worker 代码零改动） |
| D1（SQLite） | 本地 SQLite（`better-sqlite3`，`server/lib/d1.mjs` 兼容层） |
| R2 对象存储 | 本地文件系统（`server/lib/r2.mjs` 兼容层，按 key 的 sha1 存放） |
| Cloudflare Pages 静态托管 | Node 静态服务 + nginx 反向代理（`server/lib/static.mjs`） |

API 路由、鉴权、权限、审计与限流逻辑保持不变；`worker/index.ts` 只被重新打包，
没有为迁移修改业务代码。

## 服务器现状

| 项目 | 值 |
| --- | --- |
| 服务器 | 香港服务器 `154.9.24.172` |
| 对外地址 | `https://www.kingpolymer.com/gjhoutai/` |
| 代码目录 | `/var/www/gjhoutai/app` |
| 数据目录 | `/var/lib/gjhoutai/data`（`gjhoutai.sqlite` + `objects/`） |
| 环境变量 | `/etc/gjhoutai/gjhoutai.env` |
| 运行用户 | `gjhoutai` |
| systemd 单元 | `gjhoutai.service`（监听 `127.0.0.1:8788`，开机自启） |
| nginx | `/etc/nginx/snippets/gjhoutai.conf`（包含在 kingpolymer.com 的 443 server 块内） |

## 数据迁移结果

| 数据 | 数量 |
| --- | --- |
| 用户 / 会话 | 3 / 55 |
| 应用状态 `app_state` | 44 |
| 审计日志 `audit_logs` | 23708 |
| 数据识别记录 | 23 |
| 检测报告 | 107 |
| 物性数据 | 1（`测试数据.xlsx`，约 500 KB） |
| R2 对象 | 507（约 113 MB：图谱 318、检测报告 107、物性备份 57、识别图片 23、头像 1、抠图 1） |

迁移后验证通过的接口：登录 / 会话、用户列表、应用状态读写、物性数据、
数据识别历史与图片、检测报告列表与 PDF、图谱/抠图图片、头像上传下载、
物性备份上传，均返回正确内容类型。

## 关于配置中心密钥

Cloudflare 的 `CONFIG_ENCRYPTION_KEY` 属于只写 Secret，无法读取。迁移时服务器
使用了一个新的随机密钥，因此原有 `shared_config` 密文无法直接解密：

- 旧密文仍保留在数据库中，并额外备份到 `/etc/gjhoutai/legacy-shared-config.json`。
- 如果拿到旧 `CONFIG_ENCRYPTION_KEY`，把它写入 `/etc/gjhoutai/gjhoutai.env`
  的 `CONFIG_ENCRYPTION_KEY` 并重启服务即可解密恢复。
- 否则只需在「配置中心」重新填写一次 AI / OSS 等 API 密钥即可。

## 构建与发布

```bash
# 1. 构建 Worker 兼容包与前端
npm run build:server     # worker/index.ts -> server/worker.mjs
npm run build            # 前端产物 -> dist/（base=/gjhoutai/）

# 2. 组装并上传部署包（deploy/ 目录内含 systemd、nginx、环境变量模板）
# 3. 服务器上替换 /var/www/gjhoutai/app/dist 与 /var/www/gjhoutai/app/server
# 4. systemctl restart gjhoutai
```

`deploy/tools/import-d1.mjs` 与 `deploy/tools/download-r2.mjs` 分别用于一次性
数据迁移，不再需要时可以删除。

### 全站加载与图片缓存

- `npm run build` 自动生成文本资源的 `.br` / `.gz`，发布时须一起上传。Node 静态服务按 `Accept-Encoding` 选择预压缩资源；带 hash 的资源保持一年强缓存，其他静态文件支持 ETag 校验。
- Node API 对成功的 JSON 响应启用 Brotli/gzip；物性、状态、报告列表与图片仅在鉴权和权限校验完成后使用 `private, no-cache` / ETag。配置密钥、用户管理和登录接口仍不缓存；AI SSE 不经过压缩适配器。
- `/api/state?key=...&key=...` 一次读取最多 32 个状态，保留原有用户键隔离；前端启动同步和图谱元数据读取使用此接口。旧接口兼容保留。
- 图片运行时依赖 `sharp@0.35.2`（Node >= 20.9），服务器可在现有 runtime package 上执行 `npm install --save-exact --omit=dev sharp@0.35.2`，不要替换生产的其他依赖或环境文件。
- 已鉴权的业务图片请求声明 `Accept: image/webp` 时使用**全分辨率无损 WebP**。仅在体积变小时采用；动画、异常或过大图片回退原格式，不损坏原图。原图下载/导出用 `format=original`，不作转码。
- 衍生缓存位于 `$DATA_DIR/image-cache`，以源内容哈希隔离版本，转换并发最多 2；缓存失效、编码器失败不会阻塞图片可用性。定期在生成时清理，约 256MB 上限；不公开目录、不绕过鉴权。
- 图谱保持视口懒加载和 IndexedDB 缓存，图片网络请求/导出并发限制为 4。导航意图预加载仅加载安全的页面模块，不自动执行其初始化；省流量和 2G 环境跳过，存在求值副作用的业务模块不预加载。
- 首次部署后可运行 `node deploy/tools/warm-image-cache.mjs /var/lib/gjhoutai/data` 预热现有图片；新图片按需生成。此命令只写衍生缓存，不修改数据库、原图或元数据。
- 回归：`npm run check` 和 `node --test server/lib/performance.node-test.mjs`。

## 运维

```bash
systemctl status gjhoutai
journalctl -u gjhoutai -f
curl https://www.kingpolymer.com/gjhoutai/api/health
```

> 旧的 Cloudflare Worker、D1 与 R2 资源在迁移过程中保持原样，未做删除，可作为
> 回滚与二次核对的备份。
