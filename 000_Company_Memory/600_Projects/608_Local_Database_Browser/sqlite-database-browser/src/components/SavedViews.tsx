import { Bookmark, BookmarkCheck, Check, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ProfileFieldKey, ProfileFilters } from "../lib/types";
import { cn } from "../lib/utils";

export interface SavedView {
  id: string;
  name: string;
  databaseKey: string;
  tableName: string;
  filters: ProfileFilters;
  visibleFields: ProfileFieldKey[];
  createdAt: string;
}

interface SavedViewsProps {
  views: SavedView[];
  activeViewId: string | null;
  onApplyView: (view: SavedView) => void;
  onDeleteView: (id: string) => void;
  onRenameView: (id: string, name: string) => void;
  onResetView: () => void;
  isViewDirty: boolean;
  onUpdateView: (id: string) => void;
  onCreateView: () => void;
  defaultViewId: string | null;
  onSetDefaultView: (id: string | null) => void;
}

export function SavedViews({
  views,
  activeViewId,
  onApplyView,
  onDeleteView,
  onRenameView,
  onResetView,
  isViewDirty,
  onUpdateView,
  onCreateView,
  defaultViewId,
  onSetDefaultView,
}: SavedViewsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) setTimeout(() => inputRef.current?.focus(), 40);
  }, [editingId]);

  return (
    <section className="px-3 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        <BookmarkCheck className="h-3 w-3" />
        Saved Views
        <div className="ml-auto flex items-center gap-0.5">
          {activeViewId !== null && (
            <button
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
                defaultViewId === activeViewId 
                  ? "text-primary bg-primary/10" 
                  : "text-muted-foreground hover:bg-background/80 hover:text-foreground"
              )}
              onClick={() => onSetDefaultView(defaultViewId === activeViewId ? null : activeViewId)}
              title={defaultViewId === activeViewId ? "Remove default view" : "Set current as default view"}
              type="button"
            >
              <Bookmark className={cn("h-3.5 w-3.5", defaultViewId === activeViewId ? "fill-primary/20" : "")} />
            </button>
          )}
          <button
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
              isViewDirty && activeViewId !== null
                ? "text-primary hover:bg-primary/10"
                : "text-muted-foreground/40 cursor-not-allowed"
            )}
            disabled={!isViewDirty || activeViewId === null}
            onClick={() => { if (isViewDirty && activeViewId !== null) onUpdateView(activeViewId); }}
            title={isViewDirty && activeViewId !== null ? "Save changes to current view" : "No unsaved changes"}
            type="button"
          >
            <Save className="h-3.5 w-3.5" />
          </button>
          <button
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background/80 hover:text-foreground transition-colors"
            onClick={onCreateView}
            title="Create new view"
            type="button"
          >
            <Plus className="h-4 w-4" />
          </button>
          <span className="ml-1 rounded-full bg-background/60 px-2 py-0.5 tabular-nums text-muted-foreground">
            {views.length}
          </span>
        </div>
      </div>
      
      <div className="space-y-0.5">
        <button
          className={cn(
            "group/view flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition",
            activeViewId === null
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-transparent text-foreground hover:border-border/50 hover:bg-background/50"
          )}
          onClick={onResetView}
          type="button"
        >
          <span className="flex-1 text-left truncate text-[13px] font-semibold">
            {activeViewId === null ? <Check className="inline h-3 w-3 mr-0.5 align-[-1px]" /> : null}
            Default View
          </span>
          {defaultViewId === null && <span title="System default"><Bookmark className="h-3 w-3 text-primary fill-primary/20" /></span>}
          {defaultViewId !== null && (
            <button
              className="opacity-0 group-hover/view:opacity-100 text-muted-foreground hover:text-primary transition-opacity"
              onClick={(e) => { e.stopPropagation(); onSetDefaultView(null); }}
              title="Restore as default view"
            >
              <Bookmark className="h-3 w-3" />
            </button>
          )}
        </button>

        {views.map((view) => {
          const isActive = view.id === activeViewId;
          const isEditing = editingId === view.id;
          const activeFilterCount = Object.values(view.filters).filter(Boolean).length;

          return (
            <div
              className={cn(
                "group/view relative flex flex-col gap-2 rounded-xl border px-3 py-2 transition",
                isActive
                  ? "border-primary/40 bg-primary/10"
                  : "border-transparent hover:border-border/50 hover:bg-background/50"
              )}
              key={view.id}
            >
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <input
                    className="input-shell focused-ring flex-1 rounded-lg px-2 py-1.5 text-[13px] text-foreground"
                    onBlur={() => {
                      if (draftName.trim()) onRenameView(view.id, draftName.trim());
                      setEditingId(null);
                    }}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && draftName.trim()) {
                        onRenameView(view.id, draftName.trim());
                        setEditingId(null);
                      }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    ref={inputRef}
                    value={draftName}
                  />
                ) : (
                  <button
                    className="flex min-w-0 flex-1 flex-col items-start text-left"
                    onClick={() => onApplyView(view)}
                    type="button"
                  >
                    <span
                      className={cn(
                        "truncate text-[13px] font-semibold",
                        isActive ? "text-primary" : "text-foreground"
                      )}
                    >
                      {isActive ? <Check className="inline h-3 w-3 mr-0.5 align-[-1px]" /> : null}
                      {view.name}
                    </span>
                    <span className="mt-0.5 text-[11px] text-muted-foreground">
                      {view.tableName}
                      {activeFilterCount > 0 ? ` · ${activeFilterCount} filter${activeFilterCount > 1 ? "s" : ""}` : ""}
                      {" · "}
                      {view.visibleFields.length} cols
                    </span>
                  </button>
                )}

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/view:opacity-100">
                  {!isEditing ? (
                    <div className="flex items-center gap-1">
                      {defaultViewId === view.id ? (
                        <span title="Default view"><Bookmark className="h-3 w-3 text-primary fill-primary/20" /></span>
                      ) : (
                        <button
                          className="focused-ring hidden h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background/80 hover:text-primary group-hover/view:flex"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSetDefaultView(view.id);
                          }}
                          title="Set as default view"
                          type="button"
                        >
                          <Bookmark className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        className="focused-ring flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                        onClick={() => { setEditingId(view.id); setDraftName(view.name); }}
                        title="Rename view"
                        type="button"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  ) : null}
                  <button
                    className="focused-ring flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                    onClick={() => onDeleteView(view.id)}
                    title="Delete view"
                    type="button"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Save view button / inline form ──
interface SaveViewButtonProps {
  databaseKey: string;
  tableName: string;
  filters: ProfileFilters;
  visibleFields: ProfileFieldKey[];
  onSave: (view: SavedView) => void;
}

export function SaveViewButton({
  databaseKey,
  tableName,
  filters,
  visibleFields,
  onSave,
}: SaveViewButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(`${tableName} view`);
      setSaved(false);
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 50);
    }
  }, [open, tableName]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const view: SavedView = {
      id: `view-${Date.now()}`,
      name: trimmed,
      databaseKey,
      tableName,
      filters: { ...filters },
      visibleFields: [...visibleFields],
      createdAt: new Date().toISOString(),
    };
    onSave(view);
    setSaved(true);
    setTimeout(() => setOpen(false), 600);
  };

  if (!open) {
    return (
      <button
        className="focused-ring panel-muted flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        onClick={() => setOpen(true)}
        title="Save current filters and column layout as a view"
        type="button"
      >
        <Bookmark className="h-3.5 w-3.5" />
        Save current view
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-3 py-1.5">
      <input
        className="w-36 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") setOpen(false);
        }}
        onChange={(e) => setName(e.target.value)}
        placeholder="View name…"
        ref={inputRef}
        value={name}
      />
      <button
        className={cn(
          "focused-ring flex h-6 w-6 items-center justify-center rounded-lg transition",
          saved ? "text-emerald-400" : "text-primary hover:bg-primary/10"
        )}
        onClick={handleSave}
        type="button"
      >
        {saved ? <Check className="h-3.5 w-3.5" /> : <BookmarkCheck className="h-3.5 w-3.5" />}
      </button>
      <button
        className="focused-ring flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(false)}
        type="button"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
