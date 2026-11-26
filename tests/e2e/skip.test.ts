import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let app: ElectronApplication;
let page: Page;
let tmpDir: string;

test.beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "inkwell-e2e-skip-"));
  app = await electron.launch({
    args: ["."],
    env: { ...process.env, INKWELL_TEST_DB: path.join(tmpDir, "s.inkwell"), NODE_ENV: "production" },
  });
  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
});
test.afterAll(async () => { await app.close(); rmSync(tmpDir, { recursive: true, force: true }); });

test("skipping an occurrence asks first, schedules the next one and clears the old one", async () => {
  const projectId = await page.evaluate(async () => {
    const api = (window as any).inkwell;
    const p = await api.projects.create({ title: "Weekly column", type: "article", status: "active", isRecurring: true, recurringInterval: "weekly", createdAt: "" });
    await api.deadlines.create({ title: "Weekly column", dueDate: "2020-01-01", priority: "medium", status: "pending", projectId: p.id, notes: null, createdAt: "" });
    return p.id as number;
  });
  await page.reload();
  await page.goto(page.url().split("#")[0] + `#/projects/${projectId}`);
  await page.getByTestId("button-skip-occurrence").click();
  // Cancelling changes nothing.
  await page.getByTestId("confirm-cancel").click();
  await expect(page.getByTestId("button-skip-occurrence")).toBeVisible();
  await page.getByTestId("button-skip-occurrence").click();
  await page.getByTestId("confirm-accept").click();
  // Lands on the next occurrence's project page.
  await expect(page).toHaveURL(new RegExp(`#/projects/(?!${projectId}$)\\d+$`));
  await page.getByTestId("nav-schedule").click();
  await expect(page.locator('[data-testid^="schedule-row-"]')).toHaveCount(1);
  await expect(page.getByText("overdue")).toHaveCount(0);
  // The skipped deadline is kept and labelled.
  await page.getByTestId("checkbox-show-completed").check();
  await expect(page.locator('[data-testid^="schedule-row-"]').filter({ hasText: "Skipped" })).toHaveCount(1);
});
