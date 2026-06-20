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
  publication: text("publication"), // target publication outlet
  isRecurring: integer("is_recurring", { mode: "boolean" }).notNull().default(false),
  recurringInterval: text("recurring_interval"), // weekly, biweekly, monthly, quarterly, annual
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(""),
});

// Publication history — each time a piece was submitted/published to an outlet
export const publicationHistory = sqliteTable("publication_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  publication: text("publication").notNull(),
  projectId: integer("project_id"), // optional link to a project
  projectTitle: text("project_title").notNull().default(""), // snapshot title in case project is deleted
  publishedDate: text("published_date").notNull(), // YYYY-MM-DD
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(""),
});

export const insertPublicationHistorySchema = createInsertSchema(publicationHistory).omit({ id: true });
export type InsertPublicationHistory = z.infer<typeof insertPublicationHistorySchema>;
export type PublicationHistory = typeof publicationHistory.$inferSelect;

// User-editable settings stored as JSON strings
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

// Project Milestones
export const milestones = sqliteTable("milestones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  name: text("name").notNull(), // e.g. "First Draft", "With Editor"
  status: text("status").notNull().default("pending"), // pending, in-progress, complete
  dueDate: text("due_date"), // YYYY-MM-DD, optional
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(""),
});

export const insertMilestoneSchema = createInsertSchema(milestones).omit({ id: true });
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;
export type Milestone = typeof milestones.$inferSelect;

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
