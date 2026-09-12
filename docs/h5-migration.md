# H5 实施记录

2026-09-12 用户确认改用 H5。本记录与根 README 为当前方案，旧文档中的 Kotlin/Compose、APK、离线同步、原生通知设想不再适用。

## 当前架构

React + TypeScript + Vite → 同源 /api → 既有 NestJS/JWT/Agent → MySQL。

四个主入口：看盘、选股、观察、AI 复盘。复盘涵盖大盘与个股，不做交易日记。H5 用服务端指标、选股快照和证据驱动对话；不另实现指标算法。SSE 接收增量回复，历史消息和策略存服务端。

## 迁移范围

1. 删除 android-native、.toolchain、本次生成的 ~/.gradle、/tmp/guanlan-gradle，测得共 8,272,288 KiB（7.89 GiB）；移除 Capacitor 依赖与构建入口。
2. 保留 NestJS feat/guanlan-stock-app、已批准的深色原型、现有 H5 Node 依赖。
3. 替换 React 试写界面，连接 NestJS 实际接口，接入浏览器登录会话、单次刷新与取消机制。
4. 手机浏览器适配与主流程验证，部署静态 dist + HTTPS API 代理。

## 边界

H5 不要求 Android 工具链。关闭网页后的通知需另接推送渠道，当前只提供前台展示与历史记录。市场源可用性和真实模型效果依赖实际服务配置，连接失败显示错误，不补演示行情。当前部署为单实例任务执行器。

## 验证

- `npm test`：14 项通过，其中 5 项为新 H5 API 会话与 SSE 测试，另 9 项为原有领域/试写服务测试。
- `npm run build`：TypeScript 与 Vite 生产构建通过；产物约 285 KB（未压缩，不含 Node 依赖）。
- `npm run test:e2e`：默认两项浏览器隔离测试验证登录失败、策略保存失败保留草稿、成功保存、退出清理及 393px 手机宽度；需要独立后端的两项测试默认跳过。
- 配置 `GUANLAN_LIVE_LOGIN_FILE` 后，额外两项实际 Nest/MySQL 浏览器测试通过：真实指数与腾讯 K 线、图表指标切换缩放、保存 RSI 策略/真实筛选/候选证据会话/SSE 回复/刷新续聊/删除；观察理由/提醒新增停用/刷新恢复/删除。测试凭据只保存在本机受保护的临时文件，不写入仓库。
- AI 联调使用真实 Agent/LangGraph 与本机模型协议测试服务，回复为“测试回复”；未验证真实付费模型效果。
- 修复浏览器 fetch 绑定问题和 SSE 在首个 message_end 过早关闭导致历史未持久化的问题。现在等待后端结束完整流后再拉取已保存消息。
- 已核对删除目标不存在。H5 项目含现有 Node 依赖约 133 MiB，后端依赖另计；没有安装新的安卓工具。

实际后端浏览器测试命令（Vite /api 必须代理到对应隔离测试实例）：

```sh
GUANLAN_LIVE_LOGIN_FILE=/path/to/local-test-login.json npm run test:e2e
```

测试登录文件字段为 username/password/baseURL，仅接受本机测试账号。截图由 Playwright 写入 test-results/，不作为正式行情或投资结论。

## 新浪选股迁入（2026-09-12）

选股入口改为新浪 UPBS B 信号扫描及信号观察池，原条件选股暂停。PC 使用顶部导航，移动端使用底部导航，两端支持完整选股流程。原条件选股的历史验证记录仅代表当时版本，现行范围与验证见 [新浪迁移说明](sina-signals-migration.md)。
