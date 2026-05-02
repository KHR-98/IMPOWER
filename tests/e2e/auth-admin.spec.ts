import { expect, test } from "@playwright/test";

test.describe("auth and admin smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/dashboard", async (route) => {
      await route.abort();
    });
  });

  test("redirects unauthenticated admin access to login", async ({ page }) => {
    await page.goto("/admin");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("link", { name: "카카오로 로그인" })).toBeVisible();
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

  test("allows signed master session into the admin dashboard", async ({ context, page, baseURL }) => {
    if (!baseURL) {
      throw new Error("Playwright baseURL is required for cookie setup.");
    }

    await context.addCookies([
      {
        name: "attendance_session",
        value:
          "eyJ1c2VybmFtZSI6ImFkbWluIiwiZGlzcGxheU5hbWUiOiLtmITsnqXqtIDrpqzsnpAiLCJyb2xlIjoibWFzdGVyIiwiZGVwYXJ0bWVudElkIjpudWxsLCJkZXBhcnRtZW50Q29kZSI6bnVsbCwiZGVwYXJ0bWVudE5hbWUiOm51bGwsImlzc3VlZEF0IjoiMjA5OS0wMS0wMVQwMDowMDowMC4wMDBaIn0.ko3LGUUI_YSikz8szxZ5BAke8QA7DCiWYACmQBHYX50",
        url: baseURL,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto("/admin");

    await expect(page).toHaveURL(/\/admin(?:\?.*)?$/);
    await expect(page.getByText("관리자 대시보드")).toBeVisible();
  });
});
