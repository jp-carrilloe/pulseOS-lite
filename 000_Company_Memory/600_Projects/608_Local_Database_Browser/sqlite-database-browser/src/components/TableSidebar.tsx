import { Check, Database, Plus, Search, SlidersHorizontal, TableProperties, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { registerDatabase } from "../lib/api";
import type { DatabaseSource, ProfileFilters, Table } from "../lib/types";
import { cn, formatTableName, sortTablesForDisplay } from "../lib/utils";

const CUSTOM_DATABASES_KEY = "pulseos-db-browser-custom-databases";

interface CustomDatabase {
  key: string;
  label: string;
  path: string;
  description: string;
}

function loadCustomDatabases(): CustomDatabase[] {
  try {
    const raw = localStorage.getItem(CUSTOM_DATABASES_KEY);
    return raw ? (JSON.parse(raw) as CustomDatabase[]) : [];
  } catch {
    return [];
  }
}

function saveCustomDatabases(databases: CustomDatabase[]) {
  localStorage.setItem(CUSTOM_DATABASES_KEY, JSON.stringify(databases));
}

interface TableSidebarProps {
  databases: DatabaseSource[];
  activeDatabase: string;
  onDatabaseSelect: (databaseKey: string) => void;
  facets: Record<string, string[]>;
  filters: ProfileFilters;
  onFilterChange: (key: keyof ProfileFilters, filter: import("../lib/types").AdvancedFilter | null) => void;
  onResetFilters: () => void;
  onDatabasesChange?: (databases: DatabaseSource[]) => void;
  children?: ReactNode;
}

export function TableSidebar({
  databases,
  activeDatabase,
  onDatabaseSelect,
  facets,
  filters,
  onFilterChange,
  onResetFilters,
  children,
}: TableSidebarProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [addPath, setAddPath] = useState("");
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState(false);
  const [customDatabases, setCustomDatabases] = useState<CustomDatabase[]>(loadCustomDatabases);
  const labelInputRef = useRef<HTMLInputElement>(null);

  const hasFacets = Object.keys(facets).length > 0;
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  useEffect(() => {
    customDatabases.forEach((database) => {
      void registerDatabase(database);
    });
  }, [customDatabases]);

  // Merge server databases with custom ones
  const allDatabases: DatabaseSource[] = [
    ...databases,
    ...customDatabases
      .filter((custom) => !databases.some((db) => db.key === custom.key))
      .map((custom) => ({
        key: custom.key,
        label: custom.label,
        description: custom.description || "Custom database",
        path: custom.path,
        exists: true,
        tableCount: 0,
      })),
  ];

  useEffect(() => {
    if (showAddForm) {
      setTimeout(() => labelInputRef.current?.focus(), 60);
    } else {
      setAddLabel("");
      setAddPath("");
      setAddError("");
      setAddSuccess(false);
    }
  }, [showAddForm]);

  const handleAddDatabase = async () => {
    const trimmedLabel = addLabel.trim();
    const trimmedPath = addPath.trim();

    if (!trimmedLabel) {
      setAddError("Name is required.");
      return;
    }
    if (!trimmedPath) {
      setAddError("Path is required.");
      return;
    }

    const key = `custom-${trimmedLabel.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
    const newDb: CustomDatabase = {
      key,
      label: trimmedLabel,
      path: trimmedPath,
      description: "Custom database",
    };

    const next = [...customDatabases, newDb];
    try {
      await registerDatabase(newDb);
      setCustomDatabases(next);
      saveCustomDatabases(next);
      setAddSuccess(true);
      setTimeout(() => {
        setShowAddForm(false);
        onDatabaseSelect(key);
      }, 700);
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "Database registration failed.");
    }
  };

  const removeCustomDatabase = (key: string) => {
    const next = customDatabases.filter((db) => db.key !== key);
    setCustomDatabases(next);
    saveCustomDatabases(next);
    if (activeDatabase === key && databases.length > 0) {
      onDatabaseSelect(databases[0].key);
    }
  };

  return (
    <aside className="panel-surface flex h-full flex-col overflow-hidden rounded-[28px]">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2 px-4 py-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Navigator
          </div>
          <h2 className="mt-0.5 text-sm font-bold tracking-tight text-foreground">
            Databases & Tables
          </h2>
        </div>
        <button
          className={cn(
            "focused-ring flex h-8 w-8 items-center justify-center rounded-xl border transition",
            showAddForm
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/70 bg-background/45 text-muted-foreground hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
          )}
          onClick={() => setShowAddForm((v) => !v)}
          title={showAddForm ? "Cancel" : "Add custom database"}
          type="button"
        >
          {showAddForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* ── Add Database form ── */}
      {showAddForm ? (
        <div className="mx-3 mb-3 rounded-2xl border border-border/70 bg-background/50 px-4 py-4">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Database className="h-3.5 w-3.5" />
            Add Database
          </div>
          <div className="space-y-2.5">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Name
              </label>
              <input
                className="input-shell focused-ring w-full rounded-xl px-3 py-2 text-xs text-foreground"
                onChange={(e) => setAddLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddDatabase();
                  if (e.key === "Escape") setShowAddForm(false);
                }}
                placeholder="e.g. Sales Pipeline"
                ref={labelInputRef}
                type="text"
                value={addLabel}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                SQLite path
              </label>
              <input
                className="input-shell focused-ring w-full rounded-xl px-3 py-2 font-mono text-xs text-foreground"
                onChange={(e) => setAddPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddDatabase();
                  if (e.key === "Escape") setShowAddForm(false);
                }}
                placeholder="~/.pulseos/my-db.sqlite"
                type="text"
                value={addPath}
              />
            </div>
            {addError ? (
              <p className="text-[11px] text-destructive">{addError}</p>
            ) : null}
            <button
              className={cn(
                "focused-ring flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition",
                addSuccess
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
              )}
              onClick={handleAddDatabase}
              type="button"
            >
              {addSuccess ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Added
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" /> Add
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

        {/* ── Database switcher ── */}
        <section className="px-3 py-3">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Source
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="input-shell focused-ring w-full rounded-xl px-3 py-2 text-xs font-semibold"
              onChange={(e) => onDatabaseSelect(e.target.value)}
              value={activeDatabase}
            >
              {allDatabases.map((database) => (
                <option key={database.key} value={database.key}>
                  {database.label}
                </option>
              ))}
            </select>
            {customDatabases.some((c) => c.key === activeDatabase) ? (
              <button
                className="focused-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-destructive/40 bg-destructive/10 text-destructive transition hover:bg-destructive/20"
                onClick={() => removeCustomDatabase(activeDatabase)}
                title="Remove custom database"
                type="button"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <div className="mt-2 px-1 text-[10px] text-muted-foreground truncate">
            {allDatabases.find((db) => db.key === activeDatabase)?.description}
          </div>
        </section>





        {/* Saved views slot */}
        {children}
      </div>
    </aside>
  );
}
