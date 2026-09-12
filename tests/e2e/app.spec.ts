import { test, expect } from "@playwright/test";

test("手机登录、策略保存失败保留草稿、退出清除会话", async ({ page }) => {
  let failSave = true;
  const strategies: unknown[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let data: unknown = { items: [], total: 0, totalPages: 0 };
    if (path === "/api/auth/login")
      data = { accessToken: "e2e-token", refreshToken: "e2e-refresh" };
    if (path === "/api/stock-strategies" && method === "POST") {
      if (failSave)
        return route.fulfill({
          status: 409,
          json: { message: "策略名称已存在" },
        });
      const body = route.request().postDataJSON();
      data = { ...body, id: "strategy-one", version: 1 };
      strategies.push(data);
    }
    if (path === "/api/stock-strategies" && method === "GET")
      data = { items: strategies, total: strategies.length, totalPages: 1 };
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  await page.getByLabel("用户名或邮箱").fill("h5-test");
  await page.getByLabel("密码", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "看见市场的脉搏" }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "选股" })
    .click();
  await page.getByRole("button", { name: "＋ 策略", exact: true }).click();
  await page.getByLabel("策略名称").fill("我的MACD策略");
  await page.getByRole("button", { name: "保存策略", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("策略名称已存在");
  await expect(page.getByLabel("策略名称")).toHaveValue("我的MACD策略");
  failSave = false;
  await page.getByRole("button", { name: "保存策略", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "我的MACD策略", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/h5-screening-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "账户设置" }).click();
  await page.getByRole("button", { name: "退出登录 / 切换服务" }).click();
  await expect(
    page.getByRole("button", { name: "登录", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("guanlan.tokens")),
  ).toBeNull();
});

test("无法连接时给出错误且不进入演示行情", async ({ page }) => {
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({ status: 503, json: { message: "服务暂不可用" } }),
  );
  await page.goto("/");
  await page.getByLabel("用户名或邮箱").fill("test");
  await page.getByLabel("密码", { exact: true }).fill("bad");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("服务暂不可用");
  await expect(page.getByRole("navigation")).toHaveCount(0);
});
