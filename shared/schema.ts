import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Writing Ideas
export const ideas = sqliteTable("ideas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("general"), // article, book, essay, blog, speech, report, other
  status: text("status").notNull().default("new"), // new, developing, parked, published
  tags: text("tags").notNull().default("[]"), // JSON array
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(""),
});

export const insertIdeaSchema = createInsertSchema(ideas).omit({ id: true });
export type InsertIdea = z.infer<typeof insertIdeaSchema>;
export type Idea = typeof ideas.$inferSelect;

// Writing Projects
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull().default("article"), // article, book, essay, blog, speech, report, other
  status: text("status").notNull().default("active"), // active, on-hold, completed, cancelled
  ideaId: integer("idea_id"), // optional link to an idea
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(""),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

// Deadlines
export const deadlines = sqliteTable("deadlines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  projectId: integer("project_id"), // optional link to project
  dueDate: text("due_date").notNull(), // ISO date string YYYY-MM-DD
  priority: text("priority").notNull().default("medium"), // low, medium, high, critical
  status: text("status").notNull().default("pending"), // pending, completed, missed
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(""),
});

export const insertDeadlineSchema = createInsertSchema(deadlines).omit({ id: true });
export type InsertDeadline = z.infer<typeof insertDeadlineSchema>;
export type Deadline = typeof deadlines.$inferSelect;
