import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let app: ElectronApplication;
let page: Page;
let tmpDir: string;

test.beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "inkwell-e2e-complete-"));
  app = await electron.launch({
    args: ["."],
    env: { ...process.env, INKWELL_TEST_DB: path.join(tmpDir, "c.inkwell"), NODE_ENV: "production" },
  });
  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
});
test.afterAll(async () => { await app.close(); rmSync(tmpDir, { recursive: true, force: true }); });

test("items completed on Today, including recurring ones, are no longer open on Schedule", async () => {
  await page.evaluate(async () => {
    const api = (window as any).inkwell;
    await api.deadlines.create({ title: "Loose overdue", dueDate: "2020-01-01", priority: "medium", status: "pending", projectId: null, notes: null, createdAt: "" });
    const p = await api.projects.create({ title: "Overdue project", type: "article", status: "active", createdAt: "" });
    await api.deadlines.create({ title: "Project overdue", dueDate: "2020-01-02", priority: "medium", status: "pending", projectId: p.id, notes: null, createdAt: "" });
    const r = await api.projects.create({ title: "Recurring no interval", type: "article", status: "active", isRecurring: true, recurringInterval: null, createdAt: "" });
    await api.deadlines.create({ title: "Recurring overdue", dueDate: "2020-01-04", priority: "medium", status: "pending", projectId: r.id, notes: null, createdAt: "" });
    const r2 = await api.projects.create({ title: "Recurring weekly", type: "article", status: "active", isRecurring: true, recurringInterval: "weekly", createdAt: "" });
    await api.deadlines.create({ title: "Recurring weekly dl", dueDate: "2020-01-05", priority: "medium", status: "pending", projectId: r2.id, notes: null, createdAt: "" });
    await api.milestones.create({ projectId: p.id, name: "Draft", status: "not_started", dueDate: "2020-01-03", completedAt: null, notes: null, sortOrder: 0, createdAt: "" });
  });
  await page.getByTestId("nav-today").click();
  await page.reload();
  await page.getByTestId("nav-today").click();
  const rows = page.locator('[data-testid^="button-complete-"]');
  await expect(rows).toHaveCount(5);
  for (let i = 0; i < 10 && await rows.count() > 0; i++) {
        await rows.first().click(); await page.waitForTimeout(500);
  }

  await page.getByTestId("nav-schedule").click();
  // Only the next occurrence spawned for the weekly recurring project remains, and it is not overdue.
  await expect(page.locator('[data-testid^="schedule-row-"]')).toHaveCount(1);
  await expect(page.getByText("overdue")).toHaveCount(0);
  await expect(page.getByRole("paragraph").filter({ hasText: "Recurring weekly" })).toBeVisible();
});
