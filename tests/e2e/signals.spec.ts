import { test, expect, type Page } from "@playwright/test";

const hit = { code: "600519", market: "sh", name: "贵州茅台" };
const run = { id: "scan-one", queryDate: "2026-09-11", status: "running", checked: 1, total: 3, found: 0, failedCodes: [], createdAt: "2026-09-11T07:00:00Z", updatedAt: "2026-09-11T07:00:00Z" };
const daily = (date = "2026-09-11") => ({ date, items: [hit], found: 1, checked: 3, total: 3, failedCodes: [], scannedAt: run.updatedAt });
async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("用户名或邮箱").fill("signals-test");
  await page.getByLabel("密码", { exact: true }).fill("password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("navigation").getByRole("button", { name: "选股" }).click();
}

test("服务故障明确报错，入池失败保留选择，切日期丢弃旧结果", async ({ page }) => {
  let failAdd = true;
  let releaseOld!: () => void;
  let oldStarted!: () => void;
  const oldReady = new Promise<void>((resolve) => { oldStarted = resolve; });
  const oldRelease = new Promise<void>((resolve) => { releaseOld = resolve; });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data: unknown = { items: [], total: 0, totalPages: 0 };
    if (path.endsWith("auth/login")) data = { accessToken: "test", refreshToken: "refresh" };
    if (path === "/api/stock-signals/dates") data = [];
    if (path === "/api/stock-signals") {
      const date = url.searchParams.get("date")!;
      if (date === "2026-09-10") {
        oldStarted(); await oldRelease;
        return route.fulfill({ json: { ...daily(date), items: [{ ...hit, name: "过期股票" }] } }).catch(() => {});
      }
      if (date !== "2026-09-09") return route.fulfill({ status: 503, json: { message: "新浪信号服务暂不可用" } });
      data = daily(date);
    }
    if (path === "/api/stock-watchlist" && route.request().method() === "POST") {
      if (failAdd) return route.fulfill({ status: 503, json: { message: "入池暂不可用" } });
      data = { items: [], added: [], invalid: [], duplicated: [], overflow: [hit.code] };
    }
    await route.fulfill({ json: data });
  });
  await login(page);
  await expect(page.getByRole("alert")).toContainText("新浪信号服务暂不可用");
  await expect(page.getByText(/还没有扫描数据/)).toHaveCount(0);
  await page.getByLabel("查询日期").fill("2026-09-10");
  await oldReady;
  await page.getByLabel("查询日期").fill("2026-09-09");
  await expect(page.getByLabel("选择 贵州茅台")).toBeVisible();
  releaseOld();
  await page.getByLabel("选择 贵州茅台").check();
  await page.getByRole("button", { name: "加入信号观察池" }).click();
  await expect(page.getByRole("alert")).toContainText("入池暂不可用");
  await expect(page.getByLabel("选择 贵州茅台")).toBeChecked();
  failAdd = false;
  await page.getByRole("button", { name: "重试加载观察池" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "加入信号观察池" }).click();
  await expect(page.getByRole("status")).toContainText("超过 100 只上限，未入池：600519");
  await expect(page.getByText("过期股票")).toHaveCount(0);
  await expect(page.getByLabel("查询日期")).toHaveValue("2026-09-09");
});

test("命中缓存、空结果、周末回退、指定代码校验及扫描失败", async ({ page }) => {
  let fail = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = { items: [] };
    if (path.endsWith("auth/login")) data = { accessToken: "test", refreshToken: "refresh" };
    if (path === "/api/stock-signals/dates") data = [];
    if (path === "/api/stock-signals") data = { ...daily(), items: [], found: 0 };
    if (path === "/api/stock-signals/scans") data = fail ? { run } : { run: { ...run, status: "done" }, cached: true };
    if (path.endsWith("scans/scan-one")) data = { run: { ...run, status: "failed" } };
    await route.fulfill({ json: data });
  });
  await login(page);
  await page.getByLabel("查询日期").fill("2026-09-12");
  await expect(page.getByLabel("查询日期")).toHaveValue("2026-09-11");
  await expect(page.getByText("周末没有交易数据，已回溯到 2026-09-11")).toBeVisible();
  await page.getByRole("button", { name: "扫描沪深主板非 ST", exact: true }).click();
  await expect(page.getByText("本次查询没有出现 B（1）信号。")).toBeVisible();
  await page.getByLabel("扫描范围").selectOption("codes");
  await page.getByRole("button", { name: "筛选指定代码", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("请输入 1～500 个股票代码");
  await page.getByLabel("扫描范围").selectOption("full");
  fail = true;
  await page.getByRole("button", { name: "强制刷新", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("扫描任务失败");
  await expect(page.getByRole("progressbar")).toHaveCount(0);
});

for (const width of [393, 1440]) {
  test(`${width}px 新浪扫描、指定代码、入池及 S 信号闭环`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let cached = false;
    let polled = 0;
    let pool: Array<typeof hit & { id: string; status: string; entrySignalDate: string; triggeredSignalDate: string | null }> = [];
    const scans: unknown[] = [];
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();
      let data: unknown = { items: [], total: 0, totalPages: 0 };
      if (path.endsWith("auth/login")) data = { accessToken: "test", refreshToken: "refresh" };
      if (path === "/api/stock-signals/dates") data = [{ ...daily(), date: "2026-09-10" }];
      if (path === "/api/stock-signals") {
        if (!cached) return route.fulfill({ status: 404, json: { message: "还没有扫描数据" } });
        data = daily(url.searchParams.get("date")!);
      }
      if (path === "/api/stock-signals/scans") {
        const body = route.request().postDataJSON();
        scans.push(body);
        data = body.codes ? { result: { date: body.date, items: [hit], requested: 2, cachedCount: 1, fetchedCount: 0, failed: [], invalid: ["bad"] } } : { run };
      }
      if (path.endsWith("scans/scan-one")) {
        polled++;
        cached = polled > 1;
        data = cached ? { run: { ...run, status: "done", checked: 3, found: 1 }, items: [hit] } : { run };
      }
      if (path === "/api/stock-watchlist") {
        if (method === "POST") {
          expect(route.request().postDataJSON()).toEqual({ items: [{ ...hit, entrySignalDate: "2026-09-11" }] });
          pool = [{ ...hit, id: "pool-one", status: "watching", entrySignalDate: "2026-09-11", triggeredSignalDate: null }];
          data = { added: [hit.code], invalid: [], duplicated: [], overflow: [], items: pool };
        } else data = { items: pool };
      }
      if (path.endsWith("stock-watchlist/check")) {
        pool = pool.map((item) => ({ ...item, status: "triggered", triggeredSignalDate: "2026-09-12" }));
        data = { checked: 1, triggered: 1, items: pool };
      }
      if (method === "DELETE") { pool = []; return route.fulfill({ status: 204 }); }
      await route.fulfill({ json: data });
    });
    await login(page);
    await expect(page.getByRole("heading", { name: "新浪 B 信号选股" })).toBeVisible();
    await expect(page.getByRole("button", { name: "＋ 策略" })).toHaveCount(0);
    await page.getByLabel("查询日期").fill("2026-09-11");
    await expect(page.getByText(/还没有扫描数据/)).toBeVisible();
    await page.getByRole("button", { name: "扫描沪深主板非 ST", exact: true }).click();
    await expect(page.getByRole("progressbar")).toBeVisible();
    await expect(page.getByLabel("选择 贵州茅台")).toBeVisible();
    await page.getByLabel("选择 贵州茅台").check();
    await page.getByRole("button", { name: "加入信号观察池" }).click();
    await expect(page.getByText("入池 1 只", { exact: true })).toBeVisible();
    await page.getByRole("group", { name: "信号视图" }).getByRole("button", { name: /信号观察池/ }).click();
    await page.getByRole("button", { name: "立即检查", exact: true }).click();
    await expect(page.getByText("S · 2026-09-12", { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/sina-pool-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "移除 贵州茅台" }).click();
    await expect(page.getByText("信号观察池为空")).toBeVisible();
    await page.getByRole("button", { name: "B 信号结果", exact: true }).click();
    await page.getByLabel("扫描范围").selectOption("codes");
    await page.getByLabel("指定主板股票代码", { exact: true }).fill("sh600519，bad");
    await page.getByRole("button", { name: "筛选指定代码", exact: true }).click();
    await expect(page.getByText("已忽略无效代码：bad")).toBeVisible();
    await page.getByRole("button", { name: "强制刷新", exact: true }).click();
    await expect.poll(() => scans.length).toBe(3);
    expect(scans[2]).toEqual({ date: "2026-09-11", codes: ["sh600519", "bad"], refresh: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/sina-results-${width}.png`, fullPage: true });
  });
}
