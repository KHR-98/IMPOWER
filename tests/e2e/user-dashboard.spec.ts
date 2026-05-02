import { expect, test } from "@playwright/test";

test("allows signed user session into the dashboard", async ({ context, page, baseURL }) => {
  if (!baseURL) {
    throw new Error("Playwright baseURL is required for cookie setup.");
  }

  await context.addCookies([
    {
      name: "attendance_session",
      value:
        "eyJ1c2VybmFtZSI6ImtpbSIsImRpc3BsYXlOYW1lIjoi6rmA66-87IiYIiwicm9sZSI6InVzZXIiLCJkZXBhcnRtZW50SWQiOm51bGwsImRlcGFydG1lbnRDb2RlIjpudWxsLCJkZXBhcnRtZW50TmFtZSI6bnVsbCwiaXNzdWVkQXQiOiIyMDk5LTAxLTAxVDAwOjAwOjAwLjAwMFoifQ.j4ySsIPVJflVz8A26giiPTkFGwf45Ged0M6-tvnaFs4",
      url: baseURL,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "출석체크" })).toBeVisible();
});
