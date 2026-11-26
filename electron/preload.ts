import { contextBridge, ipcRenderer } from "electron";
import type {
  Idea,
  InsertIdea,
  Project,
  InsertProject,
  Deadline,
  InsertDeadline,
  PublicationHistory,
  InsertPublicationHistory,
  Milestone,
  InsertMilestone,
  PublicationNote,
  Publication,
  InsertPublication,
  MilestoneTemplate,
  MilestoneTemplateInput,
  PublishResult,
} from "../shared/schema";

export interface MigrationNotice {
  backupPath: string | null;
  fromVersion: number;
  toVersion: number;
  file: string;
}

export interface FileResult {
  success: boolean;
  path?: string;
}

export interface InkwellApi {
  ideas: {
    getAll: () => Promise<Idea[]>;
    promote: (id: number, opts?: { type?: string; publicationId?: number | null; templateId?: number | null }) => Promise<Project>;
    create: (data: InsertIdea) => Promise<Idea>;
    update: (id: number, data: Partial<InsertIdea>) => Promise<Idea>;
    delete: (id: number) => Promise<boolean>;
  };
  projects: {
    getAll: () => Promise<Project[]>;
    create: (data: InsertProject, templateId?: number | null) => Promise<Project>;
    applyTemplate: (projectId: number, templateId: number) => Promise<Milestone[]>;
    publish: (projectId: number, publishedDate: string) => Promise<PublishResult>;
    update: (id: number, data: Partial<InsertProject>) => Promise<Project>;
    delete: (id: number) => Promise<boolean>;
  };
  deadlines: {
    getAll: () => Promise<Deadline[]>;
    create: (data: InsertDeadline) => Promise<Deadline>;
    update: (id: number, data: Partial<InsertDeadline>) => Promise<Deadline>;
    delete: (id: number) => Promise<boolean>;
    spawnRecurring: (projectId: number) => Promise<Project | null>;
  };
  file: {
    currentPath: () => Promise<string | null>;
    isDirty: () => Promise<boolean>;
    newFile: () => Promise<FileResult>;
    open: () => Promise<FileResult>;
    save: () => Promise<FileResult>;
    saveAs: () => Promise<FileResult>;
    getRecentFiles: () => Promise<string[]>;
    takeMigrationNotice: () => Promise<MigrationNotice | null>;
  };
  milestones: {
    getAll: () => Promise<Milestone[]>;
    getForProject: (projectId: number) => Promise<Milestone[]>;
    create: (data: InsertMilestone) => Promise<Milestone>;
    update: (id: number, data: Partial<InsertMilestone>) => Promise<Milestone>;
    reorder: (projectId: number, orderedIds: number[]) => Promise<Milestone[]>;
    delete: (id: number) => Promise<boolean>;
  };
  publications: {
    getAll: () => Promise<Publication[]>;
    create: (data: Partial<InsertPublication> & { name: string }) => Promise<Publication>;
    update: (id: number, data: Partial<InsertPublication>) => Promise<Publication>;
    delete: (id: number) => Promise<boolean>;
  };
  templates: {
    getAll: () => Promise<MilestoneTemplate[]>;
    create: (data: MilestoneTemplateInput) => Promise<MilestoneTemplate>;
    update: (id: number, data: Partial<MilestoneTemplateInput>) => Promise<MilestoneTemplate>;
    delete: (id: number) => Promise<boolean>;
  };
  pubHistory: {
    getAll: () => Promise<PublicationHistory[]>;
    create: (data: InsertPublicationHistory) => Promise<PublicationHistory>;
    update: (id: number, data: Partial<InsertPublicationHistory>) => Promise<PublicationHistory>;
    delete: (id: number) => Promise<boolean>;
  };
  pubNotes: {
    getAll: () => Promise<PublicationNote[]>;
    upsert: (name: string, notes: string) => Promise<PublicationNote>;
  };
  settings: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
  };
  /** Subscribe to main-process "refresh" events (fired after file switches). */
  onRefresh: (callback: () => void) => () => void;
}

const api: InkwellApi = {
  ideas: {
    getAll: () => ipcRenderer.invoke("ideas:getAll"),
    promote: (id, opts) => ipcRenderer.invoke("ideas:promote", id, opts),
    create: (data) => ipcRenderer.invoke("ideas:create", data),
    update: (id, data) => ipcRenderer.invoke("ideas:update", id, data),
    delete: (id) => ipcRenderer.invoke("ideas:delete", id),
  },
  projects: {
    getAll: () => ipcRenderer.invoke("projects:getAll"),
    create: (data, templateId) => ipcRenderer.invoke("projects:create", data, templateId),
    applyTemplate: (projectId, templateId) => ipcRenderer.invoke("projects:applyTemplate", projectId, templateId),
    publish: (projectId, publishedDate) => ipcRenderer.invoke("projects:publish", projectId, publishedDate),
    update: (id, data) => ipcRenderer.invoke("projects:update", id, data),
    delete: (id) => ipcRenderer.invoke("projects:delete", id),
  },
  deadlines: {
    getAll: () => ipcRenderer.invoke("deadlines:getAll"),
    create: (data) => ipcRenderer.invoke("deadlines:create", data),
    update: (id, data) => ipcRenderer.invoke("deadlines:update", id, data),
    delete: (id) => ipcRenderer.invoke("deadlines:delete", id),
    spawnRecurring: (projectId) => ipcRenderer.invoke("deadlines:spawnRecurring", projectId),
  },
  file: {
    currentPath: () => ipcRenderer.invoke("file:currentPath"),
    isDirty: () => ipcRenderer.invoke("file:isDirty"),
    newFile: () => ipcRenderer.invoke("file:newFile"),
    open: () => ipcRenderer.invoke("file:open"),
    save: () => ipcRenderer.invoke("file:save"),
    saveAs: () => ipcRenderer.invoke("file:saveAs"),
    getRecentFiles: () => ipcRenderer.invoke("file:getRecentFiles"),
    takeMigrationNotice: () => ipcRenderer.invoke("file:takeMigrationNotice"),
  },
  milestones: {
    getAll: () => ipcRenderer.invoke("milestones:getAll"),
    getForProject: (projectId: number) => ipcRenderer.invoke("milestones:getForProject", projectId),
    create: (data: InsertMilestone) => ipcRenderer.invoke("milestones:create", data),
    update: (id: number, data: Partial<InsertMilestone>) => ipcRenderer.invoke("milestones:update", id, data),
    reorder: (projectId: number, orderedIds: number[]) => ipcRenderer.invoke("milestones:reorder", projectId, orderedIds),
    delete: (id: number) => ipcRenderer.invoke("milestones:delete", id),
  },
  publications: {
    getAll: () => ipcRenderer.invoke("publications:getAll"),
    create: (data) => ipcRenderer.invoke("publications:create", data),
    update: (id, data) => ipcRenderer.invoke("publications:update", id, data),
    delete: (id) => ipcRenderer.invoke("publications:delete", id),
  },
  templates: {
    getAll: () => ipcRenderer.invoke("templates:getAll"),
    create: (data) => ipcRenderer.invoke("templates:create", data),
    update: (id, data) => ipcRenderer.invoke("templates:update", id, data),
    delete: (id) => ipcRenderer.invoke("templates:delete", id),
  },
  pubHistory: {
    getAll: () => ipcRenderer.invoke("pubHistory:getAll"),
    create: (data) => ipcRenderer.invoke("pubHistory:create", data),
    update: (id, data) => ipcRenderer.invoke("pubHistory:update", id, data),
    delete: (id) => ipcRenderer.invoke("pubHistory:delete", id),
  },
  pubNotes: {
    getAll: () => ipcRenderer.invoke("pubNotes:getAll"),
    upsert: (name, notes) => ipcRenderer.invoke("pubNotes:upsert", name, notes),
  },
  settings: {
    get: (key) => ipcRenderer.invoke("settings:get", key),
    set: (key, value) => ipcRenderer.invoke("settings:set", key, value),
  },
  onRefresh: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("inkwell:refresh", listener);
    return () => ipcRenderer.removeListener("inkwell:refresh", listener);
  },
};

contextBridge.exposeInMainWorld("inkwell", api);
