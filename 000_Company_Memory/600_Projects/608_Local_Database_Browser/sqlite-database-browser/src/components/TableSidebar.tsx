import { Search, SlidersHorizontal, TableProperties } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { DatabaseSource, ProfileFilters, Table } from "../lib/types";
import { cn, formatTableName, sortTablesForDisplay } from "../lib/utils";

const FILTERS_HEIGHT_MIN = 180;
const FILTERS_HEIGHT_DEFAULT = 300;
const FILTERS_HEIGHT_MAX = 520;

interface TableSidebarProps {
  databases: DatabaseSource[];
  activeDatabase: string;
  onDatabaseSelect: (databaseKey: string) => void;
  tables: Table[];
  activeTable: string;
  onTableSelect: (tableName: string) => void;
  facets: Record<string, string[]>;
  filters: ProfileFilters;
  onFilterChange: (key: keyof ProfileFilters, value: string) => void;
  onResetFilters: () => void;
}

export function TableSidebar({
  databases,
  activeDatabase,
  onDatabaseSelect,
  tables,
  activeTable,
  onTableSelect,
  facets,
  filters,
  onFilterChange,
  onResetFilters
}: TableSidebarProps) {
  const [search, setSearch] = useState("");
  const [filtersHeight, setFiltersHeight] = useState(() => {
    const savedHeight = typeof window !== "undefined"
      ? window.localStorage.getItem("pulseos-db-browser-filters-height")
      : null;
    const parsedHeight = savedHeight ? Number(savedHeight) : NaN;
    return Number.isFinite(parsedHeight) ? parsedHeight : FILTERS_HEIGHT_DEFAULT;
  });
  const splitResizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const filteredTables = useMemo(
    () =>
      sortTablesForDisplay(tables).filter((table) =>
        formatTableName(table.name).toLowerCase().includes(search.toLowerCase())
      ),
    [search, tables]
  );

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const resizePresets = [
    { label: "More filters", height: 420 },
    { label: "Balanced", height: FILTERS_HEIGHT_DEFAULT },
    { label: "More tables", height: 220 }
  ] as const;

  useEffect(() => {
    localStorage.setItem("pulseos-db-browser-filters-height", String(Math.round(filtersHeight)));
  }, [filtersHeight]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = splitResizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const delta = event.clientY - resizeState.startY;
      setFiltersHeight(Math.max(FILTERS_HEIGHT_MIN, Math.min(FILTERS_HEIGHT_MAX, resizeState.startHeight + delta)));
    };

    const stopResizing = () => {
      if (!splitResizeStateRef.current) {
        return;
      }

      splitResizeStateRef.current = null;
      document.body.classList.remove("is-sidebar-split-resizing");
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      document.body.classList.remove("is-sidebar-split-resizing");
    };
  }, []);

  const startSplitResizing = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    splitResizeStateRef.current = {
      startY: event.clientY,
      startHeight: filtersHeight
    };
    document.body.classList.add("is-sidebar-split-resizing");
  };

  const applyFiltersHeight = (nextHeight: number) => {
    setFiltersHeight(Math.max(FILTERS_HEIGHT_MIN, Math.min(FILTERS_HEIGHT_MAX, nextHeight)));
  };

  return (
    <aside className="panel-surface flex h-full flex-col overflow-hidden rounded-[28px]">
      <div className="border-b border-border/70 px-4 py-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Control rail</div>
        <h2 className="mt-2 text-sm font-semibold tracking-tight">Sources, filters, and tables</h2>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <section className="border-b border-border/70 px-4 py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Database</div>
          <div className="space-y-2">
            {databases.map((database) => (
              <button
                className={cn(
                  "focused-ring w-full rounded-xl border px-3 py-2 text-left text-xs transition",
                  activeDatabase === database.key
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/70 bg-background/45 text-muted-foreground hover:text-foreground"
                )}
                key={database.key}
                onClick={() => onDatabaseSelect(database.key)}
                type="button"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{database.label}</span>
                  <span className="rounded-full bg-background/60 px-2 py-0.5 text-[10px] tabular-nums">
                    {database.tableCount} tables
                  </span>
                </span>
                <span className="mt-1 block truncate text-[10px] opacity-75">{database.path}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="relative flex min-h-0 flex-col border-b border-border/70" style={{ height: `${filtersHeight}px` }}>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center rounded-full border border-border/70 bg-background/[0.6] p-0.5 text-[10px] font-semibold text-muted-foreground">
                {resizePresets.map((preset) => (
                  <button
                    className={cn(
                      "rounded-full px-2 py-1 transition",
                      Math.abs(filtersHeight - preset.height) <= 18 ? "bg-primary/10 text-primary" : "hover:text-foreground"
                    )}
                    key={preset.label}
                    onClick={() => applyFiltersHeight(preset.height)}
                    type="button"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              {activeFilterCount > 0 ? (
                <button
                  className="focused-ring rounded-full border border-border/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground transition hover:border-primary/30 hover:text-primary"
                  onClick={onResetFilters}
                  type="button"
                >
                  Clear {activeFilterCount}
                </button>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 space-y-3 overflow-y-auto px-4 pb-4">
            {Object.keys(facets).length > 0 ? (
              Object.entries(facets).map(([key, options]) => (
                <label className="block" key={key}>
                  <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {key.replace(/_/g, " ")}
                  </span>
                  <select
                    className="input-shell focused-ring w-full rounded-xl px-3 py-2 text-xs"
                    onChange={(event) => onFilterChange(key as keyof ProfileFilters, event.target.value)}
                    value={filters[key as keyof ProfileFilters] || ""}
                  >
                    <option value="">All</option>
                    {options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border/80 px-3 py-3 text-xs leading-5 text-muted-foreground">
                This table does not expose filter facets yet.
              </div>
            )}
          </div>
          <span
            aria-hidden="true"
            className="absolute inset-x-8 bottom-0 z-10 h-4 translate-y-1/2 cursor-row-resize rounded-full sidebar-split-handle"
            onPointerDown={startSplitResizing}
          />
        </section>

        <section className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-3 border-b border-border/70 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <TableProperties className="h-3.5 w-3.5" />
                Tables
              </div>
              <div className="inline-flex items-center rounded-full border border-border/70 bg-background/[0.6] p-0.5 text-[10px] font-semibold text-muted-foreground">
                {resizePresets.map((preset) => (
                  <button
                    className={cn(
                      "rounded-full px-2 py-1 transition",
                      Math.abs(filtersHeight - preset.height) <= 18 ? "bg-primary/10 text-primary" : "hover:text-foreground"
                    )}
                    key={`tables-${preset.label}`}
                    onClick={() => applyFiltersHeight(preset.height)}
                    type="button"
                  >
                    {preset.label === "More tables" ? "Expand" : preset.label === "More filters" ? "Shorten" : "Balanced"}
                  </button>
                ))}
              </div>
            </div>

            <label className="input-shell focused-ring flex items-center gap-2 rounded-xl px-3 py-2 text-xs">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find table..."
                value={search}
              />
            </label>
          </div>

          <div className="min-h-0 overflow-y-auto px-2 py-2">
            <div className="space-y-0.5">
              {filteredTables.map((table) => (
                <button
                  className={cn(
                    "focused-ring flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                    activeTable === table.name
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  )}
                  key={table.name}
                  onClick={() => onTableSelect(table.name)}
                  type="button"
                >
                  <span className="min-w-0 truncate">{formatTableName(table.name)}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                      activeTable === table.name ? "bg-primary/15 text-primary" : "bg-background/60 text-muted-foreground"
                    )}
                  >
                    {table.rowCount.toLocaleString()}
                  </span>
                </button>
              ))}

              {filteredTables.length === 0 ? (
                <div className="px-2.5 py-3 text-xs text-muted-foreground">No tables match that search.</div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
}
