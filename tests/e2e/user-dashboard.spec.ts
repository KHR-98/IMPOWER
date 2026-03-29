import { expect, test } from "@playwright/test";

const userUsername = process.env.PLAYWRIGHT_USER_USERNAME ?? "kim";
const userPassword = process.env.PLAYWRIGHT_USER_PASSWORD ?? "demo1234";

test("allows user login into the dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("아이디").fill(userUsername);
  await page.getByLabel("비밀번호").fill(userPassword);
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "출석체크" })).toBeVisible();
});
