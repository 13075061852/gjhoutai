# AI 三项目只读与受控启停

## 权限

仅 `system_admin` 可调用服务器项目工具；普通业务查询仍按原逻辑运行。

| 项目 | 服务 | 读取 | 确认后启动/关闭 | 编辑/部署/重启 |
| --- | --- | --- | --- | --- |
| `https://www.kingpolymer.com/` | kingpolymer.service | 允许 | 允许 | 禁止 |
| `/web/` | guangjun.service | 允许 | 允许 | 禁止 |
| `/gjhoutai/` | gjhoutai.service（含独立AI受保护） | 允许 | 禁止 | 禁止 |

其他域名和node-admin不在权限范围内。AI没有shell、任意systemctl、sudo或任意路径读取工具。

## 结构

- 模型工具：`list_server_projects`、`read_server_project`、`prepare_project_lifecycle`。
- 只读范围：实时systemd状态、项目源码/文档目录清单（最多300条）、允许的UTF-8文件（最大64KiB）。不是整个服务器的进程清单，也没有接通根站/官网的业务数据库。
- Python窄代理：`/usr/local/lib/gjhoutai-projects/project-bridge.py`，服务`gjhoutai-projects.service`，Unix socket `/run/gjhoutai-projects/control.sock`，root:gjhoutai 660。代理独立运行，模型进程仍是无sudo的gjhoutai用户。
- 代理仅固定三个项目和两个服务的start/stop，使用参数数组调用systemctl，没有shell解释。源码读取禁止依赖/构建/数据目录、隐藏路径、凭据相关名称、已知硬编码秘密模式及符号链接；以目录描述符和NOFOLLOW逐级打开，防止祖先目录替换逃逸。内容始终是不可信资料，不能作为模型新指令。秘密模式检测不是通用DLP保证，不应把真实密钥硬编码进项目源码。
- 项目读取根目录在代理里固定，发布目录迁移后需显式更新代理；不会随用户/模型传入的绝对路径改变。

## 启停确认

1. 模型只能准备操作，不执行。固定服务状态被记录用于冲突检查。
2. 返回独立`tool_end.projectAction`；前端验证、展示影响范围、提供确认和取消按钮。聊天文字中的“确认”不触发提交。
3. 浏览器POST `/api/ai/project-actions/:id/confirm` 或`cancel`，带Cookie、可信Origin和会话id；服务端重新校验管理员身份、操作所有者、会话归属、5分钟期限及当前服务状态。
4. 执行前将状态设为executing，并按项目互斥；完成结果幂等返回。失败/超时记unknown，不自动重试，先查询实际状态。
5. root代理将实际启停请求、操作者id、actionId及退出码写入journald。不允许重启，也不能关闭自身后台或AI进程。

确认记录只在AI进程内存中；服务重启后旧卡片失效，需重新准备。AI网关的模型工具没有确认接口、没有执行任意HTTP的能力。

## 撤销原业务写入能力

`businessToolsFor`不再注册`prepare_business_change`。主服务`createBusinessActions`默认`readOnly=true`，已认证的业务操作POST（包括历史proposal commit）返回403。历史卡片在前端仅提示权限已关闭，不再提供提交按钮。

普通人工业务页面的增删改接口未改。旧写入库保留以便历史数据和回归测试，fixture测试显式`readOnly:false`，不代表生产可写。

## 部署与验收（2026-10-21）

发布了前端、AI tools/runtime/prompt/service、新增project-access/project-tools、主服务business-actions，以及上述独立窄代理。主后台因撤销旧业务写入入口重启；AI在activeRuns=0后重启。根站、官网、node-admin的PID未变，数据库/原env/nginx/模型配置/依赖未改。

- 本地：46项相关前端测试、13项业务动作fixture、54项AI测试及类型检查通过；之后仅增加读取竞态加固/文字输出约束，并重跑14项相关Node测试及现场构建。
- 服务器：3项Python白名单/秘密路径/符号链接/固定命令fixture通过，5项项目确认测试通过；103个实际发布文件匹配最终包。最终代理以gjhoutai用户执行读取成功，对gjhoutai关闭、其他项目访问、restart、路径逃逸均拒绝。
- 真实配置模型验收：独立运行时使用生产相同模型deepseek:deepseek-chat、真实管理员身份和实际工具，模型确实调用list_server_projects并正确回答三条路径/运行状态/权限。没有假造模型响应；这是服务器运行时验收，不是浏览器端点击停站验收。未为测试关闭/启动现有站点，启停实际命令只在mock fixture中验证。
- 业务app_state/property_data/inspection_reports/users前后内容指纹相同；公网首页/入口及AI静态资源匹配，两health正常。

回滚备份：`/var/backups/gjhoutai/project-access-20261021171106/`；前端旧目录`/var/www/gjhoutai/app/dist.bak-20261021171106`。回滚需停止AI、还原备份四个AI文件和business-actions、还原dist，移除新project-access/project-tools，再禁用删除窄代理服务及其本任务安装文件，daemon-reload后启动主/AI。回滚会恢复旧AI写入能力，需管理员明确授权，不应把已批准的只读策略静默撤销。
