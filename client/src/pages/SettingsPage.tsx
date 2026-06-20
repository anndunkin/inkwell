import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ipc } from "@/lib/ipc";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function parseList(json: string | null | undefined, fallback: string[]): string[] {
  if (!json) return fallback;
  try { return JSON.parse(json) as string[]; } catch { return fallback; }
}

const DEFAULT_PROJECT_TYPES = ["article", "book", "essay", "blog", "speech", "report", "policy", "white paper", "other"];
const DEFAULT_PUBLICATIONS = ["The Atlantic", "Foreign Affairs", "Politico", "The Hill", "Energy Monitor", "Utility Dive", "other"];

function EditableList({
  title,
  description,
  settingKey,
  defaultItems,
}: {
  title: string;
  description: string;
  settingKey: string;
  defaultItems: string[];
}) {
  const { toast } = useToast();
  const [newItem, setNewItem] = useState("");

  const { data: raw } = useQuery<string | null>({
    queryKey: [`/api/settings/${settingKey}`],
    queryFn: () => ipc().settings.get(settingKey),
  });

  const items = parseList(raw, defaultItems);

  const saveMutation = useMutation({
    mutationFn: (updated: string[]) => ipc().settings.set(settingKey, JSON.stringify(updated)),
    onSuccess: () => {
      // refetchType: 'all' forces active and inactive queries to re-fetch
      // immediately, overriding the staleTime: Infinity default in queryClient.
      // This ensures ProjectsPage and PublicationsPage pick up the new list
      // without needing to re-mount.
      queryClient.invalidateQueries(
        { queryKey: [`/api/settings/${settingKey}`] },
        { cancelRefetch: false }
      );
      queryClient.refetchQueries({ queryKey: [`/api/settings/${settingKey}`] });
    },
  });

  function addItem() {
    const trimmed = newItem.trim();
    if (!trimmed || items.includes(trimmed)) return;
    saveMutation.mutate([...items, trimmed], {
      onSuccess: () => toast({ title: `Added "${trimmed}"` }),
    });
    setNewItem("");
  }

  function removeItem(item: string) {
    saveMutation.mutate(items.filter(i => i !== item), {
      onSuccess: () => toast({ title: `Removed "${item}"` }),
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); addItem(); }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="text-sm">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 min-h-[2.5rem]">
          {items.map(item => (
            <Badge key={item} variant="secondary" className="gap-1.5 pr-1 text-sm font-normal">
              {item}
              <button
                onClick={() => removeItem(item)}
                className="ml-0.5 rounded-sm hover:bg-destructive/20 hover:text-destructive p-0.5 transition-colors"
                aria-label={`Remove ${item}`}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground italic">No items yet. Add one below.</p>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder={`Add new ${title.toLowerCase().replace(" list", "")}…`}
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
          />
          <Button
            size="sm"
            onClick={addItem}
            disabled={!newItem.trim() || items.includes(newItem.trim()) || saveMutation.isPending}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <Settings className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          These lists are saved with your current file and travel with it when you share or archive it.
        </p>
      </div>

      <div className="space-y-5">
        <EditableList
          title="Publications"
          description="Outlets or venues where your projects may be published. Appears as a dropdown when creating or editing a project."
          settingKey="publications"
          defaultItems={DEFAULT_PUBLICATIONS}
        />
        <EditableList
          title="Project Types"
          description="Categories for classifying your writing projects."
          settingKey="projectTypes"
          defaultItems={DEFAULT_PROJECT_TYPES}
        />
      </div>
    </div>
  );
}
