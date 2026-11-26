import { existsSync, copyFileSync, rmSync } from "node:fs";
import { InkwellDB } from "./db";

/**
 * Electron-free file/session logic, extracted so it can be unit-tested without
 * launching the app. main.ts composes these with Electron dialogs and menus.
 */
export class FileSession {
  db: InkwellDB | null = null;
  currentPath: string | null = null;
  isDirty = false;

  /** Open (or create) a database file and make it the active session. */
  open(filePath: string): InkwellDB {
    const previousPath = this.currentPath;
    this.db?.close();
    this.db = null;
    try {
      this.db = new InkwellDB(filePath);
    } catch (err) {
      // e.g. an older file could not be backed up before upgrading: it is left
      // untouched, and the previously open file is restored.
      if (previousPath && previousPath !== filePath && existsSync(previousPath)) {
        try { this.db = new InkwellDB(previousPath); } catch { /* leave closed */ }
      }
      throw err;
    }
    this.currentPath = filePath;
    this.isDirty = false;
    return this.db;
  }

  /** Create a brand-new (empty) database file, replacing any existing file. */
  newFile(filePath: string): InkwellDB {
    this.db?.close();
    if (existsSync(filePath)) rmSync(filePath, { force: true });
    return this.open(filePath);
  }

  /** Mark the active DB as durable (clear dirty). Returns the saved path. */
  save(): string | null {
    if (!this.currentPath || !this.db) return null;
    this.db.sqlite.pragma("wal_checkpoint(TRUNCATE)");
    this.isDirty = false;
    return this.currentPath;
  }

  /** Copy the current DB to a new path and switch the active session to it. */
  saveAs(targetPath: string): string {
    if (this.db && this.currentPath) {
      this.db.sqlite.pragma("wal_checkpoint(TRUNCATE)");
      this.db.close();
      copyFileSync(this.currentPath, targetPath);
    }
    this.open(targetPath);
    return targetPath;
  }

  markDirty() {
    this.isDirty = true;
  }

  close() {
    this.db?.close();
    this.db = null;
  }
}
