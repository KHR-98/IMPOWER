import { expect, test } from "@playwright/test";

const adminUsername = process.env.PLAYWRIGHT_ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? "demo1234";

async function login(page: import("@playwright/test").Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("아이디").fill(username);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
}

test.describe("auth and admin smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/dashboard", async (route) => {
      await route.abort();
    });
  });

  test("redirects unauthenticated admin access to login", async ({ page }) => {
    await page.goto("/admin");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "로그인" })).toBeVisible();
  });

  test("clears invalid session cookie when visiting admin", async ({ context, page, baseURL }) => {
    if (!baseURL) {
      throw new Error("Playwright baseURL is required for cookie setup.");
    }

    const target = new URL(baseURL);

    await context.addCookies([
      {
        name: "attendance_session",
        value: "invalid.token.value",
        domain: target.hostname,
        path: "/",
      },
    ]);

    await page.goto("/admin");

    await expect(page).toHaveURL(/\/login$/);
    const cookies = await context.cookies();
    expect(cookies.find((cookie) => cookie.name === "attendance_session")).toBeFalsy();
  });

  test("allows admin login into the admin dashboard", async ({ page }) => {
    await login(page, adminUsername, adminPassword);

    await expect(page).toHaveURL(/\/admin(?:\?.*)?$/);
    await expect(page.getByText("관리자 대시보드")).toBeVisible();
  });
});
