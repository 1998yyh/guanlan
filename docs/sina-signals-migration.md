# 新浪信号选股迁移

2026-09-12，按用户要求将 `personal-homepage` 的新浪 UPBS 选股迁入观澜「选股」。原条件选股入口暂停，原实现保留，不扩展其逻辑。

## 功能与数据

- 支持查询日期、沪深主板非 ST 全市场异步扫描、指定代码同步扫描（最多 500 个）、缓存读取、强制刷新、进度轮询、历史结果与复制代码。
- B 信号为新浪 UPBS 返回的 `value=1`。前端不重新计算指标；主板/ST 校验、数据抓取与缓存沿用已有后端。
- 从 B 结果勾选批量加入信号观察池，入池依据是结果的信号日期。池子按登录账号隔离，上限 100 只，入池响应分别提示新增、重复、无效、超限。
- S 信号为同源返回的 `value=0`。池内股票出 S 后持续标红，直到手动移除；保留手动检查与后端既有定时检查。
- 「选股」中的信号观察池与「观察」中的研究理由、预警使用不同接口和数据。迁移不自动合并两者。
- 默认日期按上海时区计算，周末回退周五。其他休市日以数据源返回为准。旧请求在切日期或卸载时失效；离开页面不会停止后端扫描。

## 接口与组件

`src/signals/SignalScreening.tsx` 组合结果、查询表单和信号观察池；扫描状态与池操作分别位于 `useSignalScan.ts`、`useSignalPool.ts`，类型与原项目后端契约一致。

所有请求走观澜的 `ApiClient` 和当前登录会话：

- `POST stock-signals/scans`、`GET stock-signals/scans/:id`
- `GET stock-signals?date=YYYY-MM-DD`、`GET stock-signals/dates`
- `GET/POST stock-watchlist`、`DELETE stock-watchlist/:id`、`POST stock-watchlist/check`

`ApiError` 保留 HTTP 状态码，用于区分未扫描（404）与其他服务错误；会话、刷新和 SSE 语义不变。

继续连接同一个 NestJS 实例、同一个账号即可看到既有历史与信号观察池，无数据库搬迁。未改动后端、部署配置或生产数据。

## 原项目清理

`personal-homepage` 删除 `/stock-signals` 路由、更多工具入口、股票日报中的 B 信号入口、选股页、观察池面板及专用 API/类型/旧首页卡片。股票日报保留。旧 URL 由原项目既有通配路由回到首页。

## 验证范围

自动化用 mock API 验证 393px 与 1440px 扫描到出池的流程、失败保留选择、日期切换竞态、空结果、缓存、周末回退和扫描失败。通用响应式检查覆盖 320/375/393/768/1024/1440px。

运行 `npm test`、`npm run build`、`npm run test:e2e`；原项目运行 `pnpm build`、`pnpm lint`、`node --test tests/*.test.mjs`。原条件选股的真实后端链路测试显式暂停，待恢复该入口后再启用；本次不运行真实新浪扫描或修改真实观察池。
