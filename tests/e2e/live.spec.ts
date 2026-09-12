import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const credentialsPath = process.env.GUANLAN_LIVE_LOGIN_FILE;
test("真实 Nest/MySQL 手机行情、策略与 AI 历史闭环", async ({ page }) => {
  test.skip(!credentialsPath, "需要隔离测试后端和 GUANLAN_LIVE_LOGIN_FILE");
  test.setTimeout(150000);
  const login = JSON.parse(readFileSync(credentialsPath!, "utf8"));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByLabel("用户名或邮箱").fill(login.username);
  await page.getByLabel("密码", { exact: true }).fill(login.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "看见市场的脉搏" }),
  ).toBeVisible();
  await expect(page.getByText("上证指数", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page
    .getByRole("button", { name: /贵州茅台/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".stock-chart-source").first()).toContainText(
    "来源：",
    { timeout: 30000 },
  );
  await expect(
    page.getByRole("slider", { name: "选择行情日期" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "KDJ", exact: true }).click();
  await page.getByRole("button", { name: "放大行情图" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/h5-live-chart.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "关闭行情详情" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "选股" })
    .click();
  await expect(
    page.getByRole("heading", { name: "MACD 金叉", exact: true }),
  ).toBeVisible();
  const title = "H5联调 " + Date.now();
  await page.getByRole("button", { name: "＋ 策略", exact: true }).click();
  await page.getByLabel("策略名称").fill(title);
  await page.getByLabel("条件 1 指标").selectOption("RSI");
  await page.getByLabel("阈值", { exact: true }).fill("100");
  await page.getByRole("button", { name: "保存策略", exact: true }).click();
  const card = page
    .locator(".strategy-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "执行筛选" }).click();
  await expect(page.getByText("已完成", { exact: true })).toBeVisible({
    timeout: 60000,
  });
  const candidate = page.getByRole("checkbox").first();
  await expect(candidate).toBeEnabled();
  await candidate.check();
  await page.getByRole("button", { name: "交给 AI 复盘" }).click();
  await expect(page.getByText("已选筛选候选", { exact: true })).toBeVisible();
  await page.getByLabel("标题（可选）").fill(title);
  await page.getByRole("button", { name: "创建复盘会话" }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByLabel("继续提问").fill("比较这些候选的指标事实");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(
    page.locator(".messages").getByText("测试回复", { exact: true }),
  ).toHaveCount(1, { timeout: 30000 });
  await expect(page.getByRole("button", { name: "停止生成" })).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "AI 复盘" })
    .click();
  await page.locator(".history-row").filter({ hasText: title }).click();
  await expect(
    page
      .locator(".messages")
      .getByText("比较这些候选的指标事实", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("继续提问").fill("继续说明数据局限");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(
    page.locator(".messages").getByText("测试回复", { exact: true }),
  ).toHaveCount(2, { timeout: 30000 });
  await expect(page.getByRole("button", { name: "停止生成" })).toHaveCount(0);
  await page.screenshot({
    path: "test-results/h5-live-chat.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "删除会话 " + title, exact: true })
    .click();
  await expect(
    page.locator(".history-row").filter({ hasText: title }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "选股" })
    .click();
  await page
    .locator(".strategy-card")
    .filter({ hasText: title })
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await expect(
    page.locator(".strategy-card").filter({ hasText: title }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "观察" })
    .click();
  await expect(page.getByRole("heading", { name: "我的观察池" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("真实观察理由与提醒规则新增、停用和删除", async ({ page }) => {
  test.skip(!credentialsPath, "需要隔离测试后端和 GUANLAN_LIVE_LOGIN_FILE");
  const login = JSON.parse(readFileSync(credentialsPath!, "utf8"));
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByLabel("用户名或邮箱").fill(login.username);
  await page.getByLabel("密码", { exact: true }).fill(login.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "观察" })
    .click();
  const watchForm = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "加入观察池" }) });
  await watchForm.getByLabel("股票代码").fill("601318");
  await watchForm.getByLabel("股票名称").fill("中国平安");
  const reason = "H5观察联调 " + Date.now();
  await watchForm.getByLabel("观察理由").fill(reason);
  await watchForm
    .getByRole("button", { name: "加入观察", exact: true })
    .click();
  const watch = page.locator(".watch-row").filter({ hasText: reason });
  await expect(watch).toBeVisible();
  await watch.getByRole("button", { name: "设置提醒" }).click();
  await expect(page.locator("#alert-form").getByLabel("股票代码")).toHaveValue(
    "601318",
  );
  await page.locator("#alert-form").getByLabel("阈值").fill("999999");
  await page.getByRole("button", { name: "创建提醒" }).click();
  const alert = page
    .locator(".alert-row")
    .filter({ hasText: "601318 · price" })
    .filter({ hasText: "999999" });
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: "已开启 · 停用" }).click();
  await expect(
    alert.getByRole("button", { name: "已停用 · 开启" }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "观察" })
    .click();
  await expect(watch).toBeVisible();
  await expect(
    alert.getByRole("button", { name: "已停用 · 开启" }),
  ).toBeVisible();
  await alert.getByRole("button", { name: "删除", exact: true }).click();
  await expect(alert).toHaveCount(0);
  await watch.getByRole("button", { name: "移除" }).click();
  await expect(watch).toHaveCount(0);
});
