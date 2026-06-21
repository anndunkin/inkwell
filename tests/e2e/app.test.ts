import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let app: ElectronApplication;
let page: Page;
let tmpDir: string;
let dbPath: string;

test.beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "inkwell-e2e-"));
  dbPath = path.join(tmpDir, "e2e.inkwell");
  app = await electron.launch({
    args: ["."],
    env: { ...process.env, INKWELL_TEST_DB: dbPath, NODE_ENV: "production" },
  });
  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => {
  await app.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

test("app launches and shows Dashboard", async () => {
  await expect(page.getByText("writing workspace")).toBeVisible();
  await expect(page.getByTestId("file-status-bar")).toBeVisible();
});

test("create an idea and see it on the Ideas page", async () => {
  await page.getByTestId("nav-ideas").click();
  await page.getByTestId("button-new-idea").click();
  await page.getByTestId("input-idea-title").fill("Solar policy explainer");
  await page.getByTestId("button-save-idea").click();
  await expect(page.getByText("Solar policy explainer")).toBeVisible();
});

test("edit and delete an idea", async () => {
  // Idea card id is dynamic; locate the edit button within the visible card.
  const card = page.locator('[data-testid^="idea-card-"]').filter({ hasText: "Solar policy explainer" }).first();
  await card.hover();
  await card.locator('[data-testid^="button-edit-idea-"]').click();
  await page.getByTestId("input-idea-title").fill("Solar policy (revised)");
  await page.getByTestId("button-save-idea").click();
  await expect(page.getByText("Solar policy (revised)")).toBeVisible();

  const revised = page.locator('[data-testid^="idea-card-"]').filter({ hasText: "Solar policy (revised)" }).first();
  await revised.hover();
  await revised.locator('[data-testid^="button-delete-idea-"]').click();
  await expect(page.getByText("Solar policy (revised)")).toHaveCount(0);
});

test("create a project and see it on the kanban", async () => {
  await page.getByTestId("nav-projects").click();
  await page.getByTestId("button-new-project").click();
  await page.getByTestId("input-project-title").fill("Energy whitepaper");
  await page.getByTestId("button-save-project").click();
  await expect(page.getByText("Energy whitepaper")).toBeVisible();
});

test("create a deadline and see it listed", async () => {
  await page.getByTestId("nav-deadlines").click();
  await page.getByTestId("button-new-deadline").click();
  await page.getByTestId("input-deadline-title").fill("Final manuscript");
  await page.getByTestId("input-deadline-date").fill("2026-12-31");
  await page.getByTestId("button-save-deadline").click();
  await expect(page.getByText("Final manuscript")).toBeVisible();
});

test("add notes to a publication card and persist them", async () => {
  // Navigate via the hash router directly so a lingering dialog overlay from a
  // prior test cannot intercept a sidebar click.
  await page.evaluate(() => { window.location.hash = "#/publications"; });
  const toggle = page.getByTestId("button-toggle-pub-notes-The Atlantic");
  await toggle.click();
  const textarea = page.getByTestId("textarea-pub-notes-The Atlantic");
  await textarea.fill("Editor: jane@example.com — 1200 word max");
  // Blur to trigger auto-save.
  await textarea.blur();
  // Confirm it persisted through the IPC layer.
  await expect.poll(async () =>
    page.evaluate(async () => {
      const notes = await window.inkwell.pubNotes.getAll();
      return notes.find((n) => n.publicationName === "The Atlantic")?.notes ?? "";
    })
  ).toBe("Editor: jane@example.com — 1200 word max");
});

test("title bar reflects the active file", async () => {
  const title = await app.evaluate(async ({ BrowserWindow }) => {
    return BrowserWindow.getAllWindows()[0]?.getTitle() ?? "";
  });
  expect(title).toContain("Inkwell");
  expect(title).toContain("e2e.inkwell");
});

test("file API exposes current path and recent files via IPC", async () => {
  const currentPath = await page.evaluate(() => window.inkwell.file.currentPath());
  expect(currentPath).toContain("e2e.inkwell");

  const recent = await page.evaluate(() => window.inkwell.file.getRecentFiles());
  expect(Array.isArray(recent)).toBe(true);
});
