# 观澜 H5

个人 A 股看盘与研究应用。前端使用 React + TypeScript + Vite，适配 PC 和手机浏览器；后端复用旁边的 [tuanzi-server-base](../tuanzi-server-base)，工作分支 `feat/guanlan-stock-app`。2026-09-12 根据用户决定改用 H5，安卓工程及本次安装的专用工具链已删除。

## 启动

需要 Node.js 与 npm，无需 Java、Android SDK、Gradle 或模拟器。

```sh
npm install
cp .env.example .env
# 修改 GUANLAN_API_TARGET 为已启动的 NestJS 地址
npm run dev
```

电脑访问终端显示的地址；同一局域网手机访问 `http://电脑局域网IP:5173`，API 保持默认 `/api`，由 Vite 转发。不要在手机填电脑的 localhost。生产环境执行 `npm run build`，部署 `dist/`，使用 HTTPS，并将同源 `/api/` 反向代理到 NestJS。Vite 开发服务器不作为生产服务。

后端数据库初始化、原有账号/渠道配置和运行方式见 [部署说明](../tuanzi-server-base/docs/plans/2026-09-12-guanlan-runbook.md)。AI 使用本人启用的 Agent 和后台渠道，不在 H5 存放模型密钥。登录凭据使用当前标签页 sessionStorage；退出或切换服务器会清除会话并终止请求。

## 功能

- 指数、股票搜索、观察行情；日/周 K 线、分时、成交量与 MA/MACD/KDJ/RSI/BOLL。
- 新浪 B 信号选股：沪深主板非 ST 扫描、指定代码筛选、日期历史、强制刷新、勾选入池和 S 信号跟踪。原条件选股入口暂时停用。
- 大盘/个股复盘与聊天合并，支持新会话、续聊、历史分页和删除。
- 观察理由、价格/涨跌幅/指标预警、触发记录与已读状态。

行情、指标、筛选事实和会话均连接 NestJS。外部行情失败明确提示。预警检测在在线后端运行，H5 提供前台查看与历史记录；关闭网页后的推送尚未接入。财报/公告等结构化证据、自定义公式语言、交易复盘、下单与离线同步不在当前版本。

## 验证与设计

```sh
npm test
npm run build
npm run test:e2e
```

后端已完成 59 套件/660 项测试、构建、类型与 ESLint 检查；独立 MySQL 库完成 39 项 HTTP 贯通检查及备份恢复。真实行情已验证，真实付费模型尚未配置验证，本机 Agent 协议联调用可控模型服务。详细行情证据见 [数据源记录](../tuanzi-server-base/docs/plans/2026-09-12-market-live-evidence.md)。H5 验证见 [迁移记录](docs/h5-migration.md)。

[深色交互原型](prototype/index.html)保留为设计参考，包含演示数据；正式入口是 `src/main.tsx`。`server/` 为早期试写后端，仅留存参考，当前运行使用 NestJS。

## 访问线上接口与数据库

H5 → 线上 NestJS API → 线上 MySQL。若线上 NestJS 已连接数据库，前端只需 API 地址，不需要数据库账号。

```sh
cp .env.online.example .env.online.local
# 保持 VITE_API_URL=/api，将 VITE_PROXY_TARGET 改为目标服务 origin
npm run dev:online
# 打包使用同源 /api 的 H5（部署时还需配置服务器反向代理）
npm run build:online
```

前端直接跨域调用时，在线上 NestJS 的 `CORS_ORIGINS` 中加入当前 H5 的 origin（协议、域名和端口，不带路径）。本地端口以 Vite 实际输出为准，手机访问时还要使用手机看到的站点 origin。该后端已有 Bearer JWT 和 CORS 支持。生产反向代理需允许 SSE 长连接并关闭缓冲。

若希望本地 H5 通过 Vite 代理访问线上 API，设置 `VITE_API_URL=/api`，并把 `VITE_PROXY_TARGET` 设为线上 NestJS 的 origin（不含 `/api`）。Vite 的代理只在开发时生效；该配置构建的静态站点也需要配置同源 `/api` 反向代理。

登录页「服务地址」还可手动覆盖 API 地址。手动地址保存在当前浏览器中，并优先于构建默认值。切换服务会退出登录；登录令牌与 API 地址绑定，旧版本未绑定的令牌需重新登录一次。

若需 **本地 NestJS 连接线上数据库**，在 `tuanzi-server-base/.env.local` 配置既有的 `DB_HOST`、`DB_PORT`、`DB_USERNAME`、`DB_PASSWORD`、`DB_DATABASE`。云数据库若要求 TLS/CA 或网络白名单，需按实际实例要求补充连接参数。不要把数据库变量写进前端 `.env`，所有 `VITE_*` 都会进入浏览器构建。

线上服务还需部署 `feat/guanlan-stock-app` 的业务模块，并按后端部署说明执行新增表的 SQL；旧版仅有登录注册的线上服务还无法提供观澜接口。保持 `synchronize=false`。本机 `.env.online.local` 已沿用 `personal-homepage/.env.online` 的 `/api` 与 `VITE_PROXY_TARGET` 设置。线上代理目标优先于旧的 `GUANLAN_API_TARGET` 开发覆盖值。未修改线上数据库或执行线上迁移。
# guanlan

新浪选股由 `personal-homepage` 迁入，继续使用同一后端和账号即可读取旧历史与信号观察池。详见 [迁移说明](docs/sina-signals-migration.md)。
