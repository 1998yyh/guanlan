import { test, expect } from "@playwright/test";

for (const width of [320, 375, 393, 768, 1024, 1440]) {
  test(`${width}px 两端导航、表单和行情详情可用`, async ({ page }) => {
    await page.setViewportSize({ width, height: 851 });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data: unknown = { items: [], total: 0, totalPages: 0 };
      if (path.endsWith("auth/login")) data = { accessToken: "test", refreshToken: "refresh" };
      if (path.endsWith("stock-signals/dates")) data = [];
      if (path.endsWith("stock-signals")) return route.fulfill({ status: 404, json: { message: "尚未扫描" } });
      if (path.endsWith("indices") || path.endsWith("search")) data = {
        items: [{ code: "000001", name: "上证指数", price: 3456.78, change: 1.23 }],
      };
      if (path.endsWith("bars")) data = {
        items: [{ time: "2026-09-11", open: 10, high: 12, low: 9, close: 11, volume: 1000, complete: true }],
        indicators: [], source: "测试行情", fetchedAt: "2026-09-11T07:00:00Z",
      };
      await route.fulfill({ json: data });
    });
    const fits = async () => expect(await page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth,
    )).toBe(true);
    await page.goto("/");
    await fits();
    await page.getByLabel("用户名或邮箱").fill("responsive");
    await page.getByLabel("密码", { exact: true }).fill("password");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    const nav = page.getByRole("navigation");
    await expect(nav).toBeVisible();
    const bounds = await nav.boundingBox();
    if (width >= 1024) expect(bounds!.y).toBeLessThan(150);
    else expect(bounds!.y).toBeGreaterThan(700);
    await page.getByLabel("搜索股票").fill("000001");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await page.getByRole("button", { name: "上证指数" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("img")).toBeVisible();
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const chart = await dialog.getByRole("img").boundingBox();
    expect(chart!.width / chart!.height).toBeCloseTo(400 / 466, 2);
    await page.getByRole("button", { name: "关闭行情详情" }).click();
    for (const name of ["选股", "观察", "AI 复盘", "看盘"]) {
      await nav.getByRole("button", { name }).click();
      if (name === "选股") {
        await expect(page.getByRole("heading", { name: "新浪 B 信号选股" })).toBeVisible();
        await page.getByLabel("扫描范围").selectOption("codes");
        await page.getByLabel("指定主板股票代码", { exact: true }).fill("600519");
      }
      await fits();
      await expect(nav.getByRole("button", { name })).toHaveAttribute("aria-current", "page");
    }
    await page.screenshot({ path: `test-results/responsive-${width}.png`, fullPage: true });
  });
}
