import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Save, FolderOpen, FilePlus, Circle } from "lucide-react";
import { ipc } from "@/lib/ipc";
import { useToast } from "@/hooks/use-toast";

/**
 * Top-of-layout bar showing the active .inkwell file path and a dirty
 * indicator, plus quick New/Open/Save actions that mirror the native menu.
 */
export default function FileStatusBar() {
  const [path, setPath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const refreshStatus = useCallback(async () => {
    const api = ipc();
    const [p, d] = await Promise.all([api.file.currentPath(), api.file.isDirty()]);
    setPath(p);
    setDirty(d);
  }, []);

  useEffect(() => {
    void refreshStatus();
    // Re-check status whenever a mutation likely changed dirty state.
    const interval = window.setInterval(() => void refreshStatus(), 1000);
    const unsubscribe = ipc().onRefresh(() => {
      void refreshStatus();
      void queryClient.invalidateQueries();
    });
    return () => {
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [refreshStatus, queryClient]);

  const handleNew = async () => {
    const res = await ipc().file.newFile();
    if (res.success) {
      await queryClient.invalidateQueries();
      await refreshStatus();
      toast({ title: "New file created" });
    }
  };

  const handleOpen = async () => {
    const res = await ipc().file.open();
    if (res.success) {
      await queryClient.invalidateQueries();
      await refreshStatus();
      toast({ title: "File opened" });
    }
  };

  const handleSave = async () => {
    const res = await ipc().file.save();
    if (res.success) {
      await refreshStatus();
      toast({ title: "Saved" });
    }
  };

  const filename = path ? path.split(/[\\/]/).pop() : "Untitled";

  return (
    <div
      data-testid="file-status-bar"
      className="flex items-center justify-between gap-3 px-4 py-1.5 border-b border-border bg-muted/40 text-xs"
    >
      <div className="flex items-center gap-2 min-w-0" data-testid="file-status-path" title={path ?? "No file"}>
        <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="truncate text-muted-foreground">{path ?? "No file open"}</span>
        <span className="font-medium text-foreground truncate">{filename}</span>
        {dirty && (
          <span data-testid="dirty-indicator" className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <Circle className="w-2 h-2 fill-current" />
            Unsaved
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={handleNew} data-testid="button-file-new" title="New File" className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
          <FilePlus className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleOpen} data-testid="button-file-open" title="Open File" className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
          <FolderOpen className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleSave} data-testid="button-file-save" title="Save" className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
          <Save className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
