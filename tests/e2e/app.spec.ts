import { test, expect } from "@playwright/test";

test("手机登录、退出清除会话", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path === "/api/auth/login"
      ? { accessToken: "e2e-token", refreshToken: "e2e-refresh" }
      : { items: [], total: 0, totalPages: 0 } });
  });
  await page.goto("/");
  await page.getByLabel("用户名或邮箱").fill("h5-test");
  await page.getByLabel("密码", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "看见市场的脉搏" }),
  ).toBeVisible();
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
