# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 身份定义

- **角色**: 前端工程师（React/TypeScript 方向），同时要知道隔壁 NestJS 后端的接口边界
- **技术栈**: React 19 + TypeScript ~5.8（strict）+ Vite 6，图标 lucide-react；测试 Vitest 3 + Playwright
- **项目描述**: 「观澜」个人 A 股看盘与研究 H5——手机浏览器优先，行情/选股/观察预警/AI 复盘四入口，所有数据来自外部 NestJS 服务

## 项目结构

本仓库**只有前端**。后端在独立仓库 `../tuanzi-server-base`（NestJS + TypeORM + MySQL，工作分支 `feat/guanlan-stock-app`），不要在这里改它。

- `src/H5App.tsx` — **整个应用主体**（~1800 行，单文件，无路由，内部按四个 Tab 组织）。改 UI 基本就是改它
- `src/api.ts` — `ApiClient`：JWT 登录/单次刷新/会话 epoch 取消/SSE 流式解析。**所有后端请求必须走它**，见「核心架构」
- `src/StockChart.tsx` — K 线/分时/指标图表组件（canvas 手绘，消费 `stock-market/bars`）
- `src/domain.ts` — 早期试写的纯函数（筛选/预警/记账），**仅被 `tests/domain.test.ts` 引用**，UI 不用它
- `server/` — 早期试写后端（node .mjs + python），**仅留存参考，不运行不扩展**
- `prototype/` — 已批准的深色设计稿 HTML，**只读设计参考**，正式入口是 `src/main.tsx`
- `src/demo.json` — 原型演示数据，**正式代码不消费它**，别拿它当失败兜底

## 可执行命令

```sh
npm run dev            # 本地开发，/api 由 Vite 代理到 GUANLAN_API_TARGET（默认 127.0.0.1:3017）
npm run dev:online     # 连线上后端：需 .env.online.local（VITE_API_URL + VITE_PROXY_TARGET）
npm test               # vitest run，只跑 tests/*.test.ts（14 项）
npm run test:e2e       # Playwright，自动起 5175 端口的 dev server，全程 mock /api
npm run build          # tsc -b && vite build，类型检查 + 产物一起过
npm run build:online   # 线上模式构建，缺 VITE_API_URL 会直接报错（vite.config.ts 里写死的）
```

- live E2E（`tests/e2e/live.spec.ts`）默认 skip，需 `GUANLAN_LIVE_LOGIN_FILE` 指向本机受保护凭据文件 + 独立测试后端；**凭据绝不入仓库**
- 没有 lint/format 配置文件，别自作主张加 prettier/eslint 改动全仓库格式

## 环境特殊规范：双仓库 + 双模式部署

这是本项目最容易踩坑的地方，规矩如下：

**密钥与配置边界**
- 所有 `VITE_*` 变量都会打进浏览器构建产物——**模型密钥、数据库账号一律禁止出现在本仓库任何 .env 里**；模型密钥只配在 NestJS 的渠道管理
- `.env*` 除 `.env.example` / `.env.*.example` 外全部 gitignore，新加 env 文件前先确认不会被提交

**API 地址三态**（`src/api.ts` 的 `normalize` 强制约束）
1. `/api` 同源代理（开发走 Vite proxy，生产走反向代理）——**默认且推荐**
2. `https://` 绝对地址——允许，用于直连线上
3. `http://` 只允许 localhost/127.0.0.1/[::1]——其他一律抛错

**会话与地址绑定**
- 登录令牌存 `sessionStorage`（`guanlan.tokens`）且与 baseUrl 绑定；切换服务地址 = 自动登出 + abort 所有在途请求
- 手动覆盖地址存 `localStorage`（`guanlan.api`），优先于构建默认值

**生产部署硬要求**：HTTPS + 同源 `/api` 反代到 NestJS + **反代必须允许 SSE 长连接并关闭缓冲**；Vite dev server 禁止当生产服务用。

## 核心架构：ApiClient 会话模型

所有网络层复杂度都收敛在 `src/api.ts`，新增请求前必须理解这三条链：

```
登录/注册 → save(tokens, epoch)                    # epoch 快照
请求 → run() 建 AbortController + 记 epoch
     → 401 且非 auth/* → refresh() 单飞刷新一次 → 重发
     → 每一步 assertSession(epoch)                  # epoch 变了 = 会话已废，抛错
SSE → stream() 手动解析 event:/data: 块，\n\n 分帧
     → 必须收到 message_end 才算完成，否则抛「对话连接中断」
logout() → epoch++ + abort 全部 controller + 清 sessionStorage
```

**为什么有 epoch**：防止「登出后迟到的登录响应复活会话」这类竞态（`tests/api.test.ts` 有对应用例）。在 ApiClient 里加新方法时，必须沿用 `run()`/`assertSession()` 模式，别绕过。

**H5App.tsx 消费的后端资源**（全部经 ApiClient，baseURL 前缀 `/api`）：
`stock-market/{indices,quotes,bars,search}`、`stock-screening/runs`、`stock-strategies(+templates)`、`stock-research/{watchlist,alerts,alert-events,conversations(+/messages)}`。接口字段定义看 H5App.tsx 顶部的 type 声明；后端权威设计在 `../tuanzi-server-base/docs/plans/`。

**铁律：行情/AI 失败就明确报错，禁止静默降级到演示数据**（`tests/e2e/app.spec.ts` 第二条用例专门守这个）。

## 编码规范

从现有代码观察到的实际约定：

- **语言**: UI 文案、错误消息、注释一律中文（`throw new Error("登录已过期，请重新登录")`）
- **类型**: strict TS；接口数据在 H5App.tsx 顶部集中声明 `type`，可选字段用 `?`，禁止 `any`
- **风格不统一是有意的**: `H5App.tsx`/`api.ts`/`main.tsx` 用双引号 + 分号；`StockChart.tsx`/`domain.ts`/`server/` 用单引号紧凑风格——**改哪个文件就跟随哪个文件的现有风格，不要跨文件统一格式**
- **日期**: 「今天」必须用 `Asia/Shanghai` 时区算（H5App.tsx 的 `today()`），别用 `new Date().toISOString()` 这种 UTC 货
- **数字展示**: 统一走 `number()`/`format()` 这类 helper，`null/NaN` 显示 `—`
- **数字精度**: 涉及金额用 `Math.round(x*100)/100`（见 domain.ts），别引入浮点直接比较
- **导入**: 禁止 `allowImportingTsExtensions` 之外的奇技淫巧；`import.meta.env.VITE_API_URL` 是唯一前端环境变量入口

## 三层边界模型

### ✅ 必须执行
- 改完代码跑 `npm test && npm run build`；涉及浏览器行为的再跑 `npm run test:e2e`
- 新增 API 调用一律走 `ApiClient`（自动获得鉴权/刷新/取消/epoch 校验）
- 后端接口字段变更 → 同步改 H5App.tsx 顶部 type 声明 + 相关测试 mock
- 新增错误路径必须有用户可读的中文提示，且失败不丢用户已填数据（如策略草稿，见 e2e 用例）

### ⚠️ 需先询问
- 改 `api.ts` 的会话/刷新/SSE 语义（牵一发动全身，有专门测试守着）
- 动 `../tuanzi-server-base` 的任何文件（那是另一个仓库，分支 `feat/guanlan-stock-app`）
- 新增 npm 依赖（当前依赖极少，是有意保持的）
- 修改 `server/`、`prototype/`、`src/demo.json`（历史留存物）
- 调整 `vite.config.ts` 的代理三态优先级（`VITE_PROXY_TARGET` > `GUANLAN_API_TARGET` > 默认 3017）

### ❌ 禁止操作
- 把任何密钥/数据库凭据写进 `VITE_*` 或本仓库 .env 文件
- 行情或 AI 接口失败时回退到 `demo.json` 或任何演示数据
- 在 ApiClient 之外直接 `fetch` 后端接口
- 拿 `npm run dev` 的 Vite server 当生产服务
- 改动 `docs/technical-proposal.md` 的安卓历史方案当现行方案执行（已作废，现行方案是 `docs/h5-migration.md` + 根 README）
- 用户没明确要求时执行 git commit / push / 分支操作

## 测试要求

| 层 | 框架 | 范围 | 运行 |
|---|---|---|---|
| 单元 | Vitest | `tests/*.test.ts`：ApiClient 会话/SSE（重点）、domain 纯函数、legacy server | `npm test` |
| E2E（mock） | Playwright | `tests/e2e/app.spec.ts`：登录、策略 409 保草稿、退出清会话、393px 不横向滚动 | `npm run test:e2e` |
| E2E（live） | Playwright | `tests/e2e/live.spec.ts`：真实 Nest/MySQL 全链路，需 `GUANLAN_LIVE_LOGIN_FILE`，默认 skip | 手动 |

- E2E 一律用 `page.route("**/api/**")` mock，不依赖真实后端；baseURL 固定 `127.0.0.1:5175`
- 手机视口 393×851 是验收基线，UI 改动后注意不能出现横向滚动（有现成断言模式可抄）
- 改 ApiClient 前先读 `tests/api.test.ts` 的既有用例（登录刷新竞态、SSE 分帧、message_end 强制）

## 文档体系与同步

- **现行事实源**: 根 `README.md`（启动/部署/边界）+ `docs/h5-migration.md`（当前架构与验证记录）——改架构或验证结论时同步这两份
- **需求源**: `docs/product-scope.md`（验收意图表）
- **已归档勿当现行**: `docs/technical-proposal.md`、`docs/delivery-plan.md`、`docs/technical-evidence.md`（原生安卓方案，2026-09-12 起作废）
- 后端部署/SQL/渠道配置看 `../tuanzi-server-base/docs/plans/2026-09-12-guanlan-runbook.md`，本仓库不复制其内容

---
**版本**: v1.0
**最后更新**: 2026-09-12
**维护者**: 观澜项目（个人项目）
