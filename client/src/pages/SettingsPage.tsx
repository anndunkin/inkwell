import { useState } from "react";
import { Plus, X, Settings, Trash2, ChevronUp, ChevronDown, Star } from "lucide-react";
import { ipc } from "@/lib/ipc";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmProvider";
import AutoField from "@/components/AutoField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useProjectTypes, useTemplates, parseStages, refreshAll } from "@/lib/data";
import { useTheme } from "@/components/ThemeProvider";
import type { MilestoneTemplate } from "@shared/schema";

function TypesCard() {
  const { toast } = useToast();
  const { data: items } = useProjectTypes();
  const [text, setText] = useState("");
  async function save(next: string[]) {
    await ipc().settings.set("projectTypes", JSON.stringify(next));
    await refreshAll();
  }
  async function add() {
    const t = text.trim();
    if (!t || items.some(i => i.toLowerCase() === t.toLowerCase())) return;
    await save([...items, t]);
    setText("");
    toast({ title: `Added "${t}"` });
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Project types</CardTitle>
        <CardDescription>Categories for your writing projects. Existing projects keep their type if you remove one.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" data-testid="types-list">
          {items.map(item => (
            <Badge key={item} variant="secondary" className="gap-1.5 pr-1 text-sm font-normal">
              {item}
              <button type="button" onClick={() => save(items.filter(i => i !== item))} className="rounded-sm hover:bg-destructive/20 hover:text-destructive p-0.5" aria-label={`Remove ${item}`}><X className="w-3 h-3" /></button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input placeholder="Add a type" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void add(); } }} data-testid="input-new-type" />
          <Button size="sm" className="gap-1.5" onClick={add} disabled={!text.trim()}><Plus className="w-4 h-4" /> Add</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TemplateEditor({ t, total }: { t: MilestoneTemplate; total: number }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const stages = parseStages(t);
  const [newStage, setNewStage] = useState("");

  async function save(data: { name?: string; stages?: string[]; isDefault?: boolean }) {
    try { await ipc().templates.update(t.id, data); await refreshAll(); }
    catch { toast({ title: "Could not save", description: "A template with that name may already exist.", variant: "destructive" }); await refreshAll(); }
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= stages.length) return;
    const next = [...stages];
    [next[i], next[j]] = [next[j], next[i]];
    void save({ stages: next });
  }
  async function remove() {
    const ok = await confirm({ title: `Delete template "${t.name}"?`, description: "Projects already created from it keep their own stages." });
    if (!ok) return;
    try { await ipc().templates.delete(t.id); await refreshAll(); toast({ title: "Template deleted" }); }
    catch { toast({ title: "Could not delete", description: "Keep at least one template.", variant: "destructive" }); }
  }

  return (
    <div className="rounded-lg border p-4" data-testid={`template-${t.id}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <AutoField value={t.name} required ariaLabel="Template name" testId={`input-template-name-${t.id}`} onSave={v => save({ name: v.trim() })} className="font-medium h-9" />
        </div>
        {t.isDefault
          ? <Badge className="gap-1 shrink-0"><Star className="w-3 h-3" /> Default</Badge>
          : <Button size="sm" variant="outline" className="shrink-0" onClick={() => save({ isDefault: true })} data-testid={`button-default-template-${t.id}`}>Make default</Button>}
        <Button size="icon" variant="outline" className="h-9 w-9 shrink-0 text-destructive" aria-label={`Delete ${t.name}`} disabled={total <= 1} onClick={remove} data-testid={`button-delete-template-${t.id}`}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <ol className="space-y-1.5 mb-3">
        {stages.map((s, i) => (
          <li key={`${s}-${i}`} className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <AutoField value={s} required ariaLabel={`Stage ${i + 1}`} className="h-8 text-sm" onSave={v => save({ stages: stages.map((x, k) => (k === i ? v.trim() : x)) })} />
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ChevronUp className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Move down" disabled={i === stages.length - 1} onClick={() => move(i, 1)}><ChevronDown className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Remove ${s}`} onClick={() => save({ stages: stages.filter((_, k) => k !== i) })}><X className="w-4 h-4" /></Button>
          </li>
        ))}
        {stages.length === 0 && <li className="text-sm text-muted-foreground">No stages yet.</li>}
      </ol>
      <div className="flex gap-2">
        <Input placeholder="Add a stage" value={newStage} className="h-8" onChange={e => setNewStage(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && newStage.trim()) { void save({ stages: [...stages, newStage.trim()] }); setNewStage(""); } }} />
        <Button size="sm" variant="outline" className="h-8" disabled={!newStage.trim()} onClick={() => { void save({ stages: [...stages, newStage.trim()] }); setNewStage(""); }}>Add</Button>
      </div>
    </div>
  );
}

function TemplatesCard() {
  const { toast } = useToast();
  const { data: templates = [] } = useTemplates();
  const [name, setName] = useState("");
  async function create() {
    const n = name.trim();
    if (!n) return;
    if (templates.some(t => t.name.toLowerCase() === n.toLowerCase())) { toast({ title: "That name is taken", variant: "destructive" }); return; }
    await ipc().templates.create({ name: n, stages: ["First Draft", "Final Review", "Submitted", "Published"] });
    await refreshAll();
    setName("");
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Stage templates</CardTitle>
        <CardDescription>
          Starting sequences for new projects. Each project gets its own copy, so changing a template never alters existing projects. Customize one project on its own page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {templates.map(t => <TemplateEditor key={t.id} t={t} total={templates.length} />)}
        <div className="flex gap-2">
          <Input placeholder="New template name" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void create(); }} data-testid="input-new-template" />
          <Button size="sm" className="gap-1.5" onClick={create} disabled={!name.trim()} data-testid="button-new-template"><Plus className="w-4 h-4" /> New template</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { theme, toggle } = useTheme();
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <Settings className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Settings</h1>
        </div>
        <p className="text-sm text-muted-foreground">Saved with your current file. Outlets now live on the Publications page.</p>
      </div>
      <div className="space-y-5">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Appearance</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-sm">Theme: {theme === "dark" ? "Dark" : "Light"}</span>
            <Button size="sm" variant="outline" onClick={toggle} data-testid="button-settings-theme">Switch to {theme === "dark" ? "light" : "dark"}</Button>
          </CardContent>
        </Card>
        <TypesCard />
        <TemplatesCard />
      </div>
    </div>
  );
}
