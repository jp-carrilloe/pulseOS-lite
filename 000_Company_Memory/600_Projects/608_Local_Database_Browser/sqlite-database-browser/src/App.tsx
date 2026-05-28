import {
  Database,
  LayoutPanelLeft,
  PanelLeftClose,
  Moon,
  RefreshCw,
  Search,
  Sparkles,
  Sun
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { FieldPicker } from "./components/FieldPicker";
import { ProfileDrawer } from "./components/ProfileDrawer";
import { ProfileTable } from "./components/ProfileTable";
import { TableSidebar } from "./components/TableSidebar";
import { fetchDatabases, fetchFields, fetchProfiles, fetchTables, updateCell } from "./lib/api";
import type {
  DatabaseSource,
  FieldResponse,
  ProfileField,
  ProfileFieldKey,
  ProfileFilters,
  SigmaProfile,
  SortDirection,
  Table
} from "./lib/types";
import { cn, formatTableName } from "./lib/utils";

const VISIBLE_FIELDS_STORAGE_KEY = "pulseos-db-browser-visible-fields";
const COLUMN_WIDTHS_STORAGE_KEY = "pulseos-db-browser-column-widths";
const SIDEBAR_WIDTH_STORAGE_KEY = "pulseos-db-browser-sidebar-width";
const ROW_HEIGHT_STORAGE_KEY = "pulseos-db-browser-row-height";

const DEFAULT_FILTERS: ProfileFilters = {};

type ColumnWidths = Partial<Record<ProfileFieldKey, number>>;

function getDefaultColumnWidth(field: ProfileField) {
  if (
    field.key === "venture_description" ||
    field.key === "semantic_summary" ||
    field.key === "notes"
  ) {
    return 360;
  }

  if (field.key === "linkedin_url" || field.key === "company_url") {
    return 260;
  }

  if (field.key === "name" || field.key === "venture_name") {
    return 220;
  }

  if (
    field.key === "research_status" ||
    field.key === "profile_completion_status" ||
    field.key === "match_status" ||
    field.key === "profile_completion_percentage" ||
    field.key === "confidence_score" ||
    field.key === "stage" ||
    field.key === "region" ||
    field.key === "city" ||
    field.key === "category"
  ) {
    return 160;
  }

  if (field.key === "last_researched_at" || field.key === "capital_raised_millions") {
    return 170;
  }

  return 190;
}

function buildColumnWidths(fields: ProfileField[], savedWidths?: ColumnWidths | null) {
  const nextWidths: ColumnWidths = {};

  for (const field of fields) {
    const savedWidth = savedWidths?.[field.key];
    nextWidths[field.key] = typeof savedWidth === "number" ? savedWidth : getDefaultColumnWidth(field);
  }

  return nextWidths;
}

function App() {
  const [fieldData, setFieldData] = useState<FieldResponse>({ fields: [], facets: {} });
  const [visibleFields, setVisibleFields] = useState<ProfileFieldKey[]>([]);
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>({});
  const [profiles, setProfiles] = useState<SigmaProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<SigmaProfile | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ProfileFilters>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState("id");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [databaseSources, setDatabaseSources] = useState<DatabaseSource[]>([]);
  const [activeDatabase, setActiveDatabase] = useState("crm");
  const [tables, setTables] = useState<Table[]>([]);
  const [activeTable, setActiveTable] = useState("Companies");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [rowHeight, setRowHeight] = useState(() => {
    const savedHeight = typeof window !== "undefined" ? window.localStorage.getItem(ROW_HEIGHT_STORAGE_KEY) : null;
    const parsedHeight = savedHeight ? Number(savedHeight) : NaN;
    return Number.isFinite(parsedHeight) ? parsedHeight : 92;
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const savedWidth = typeof window !== "undefined" ? window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) : null;
    const parsedWidth = savedWidth ? Number(savedWidth) : NaN;
    return Number.isFinite(parsedWidth) ? parsedWidth : 320;
  });
  const sidebarResizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const loadTables = async (databaseKey = activeDatabase) => {
    const data = await fetchTables(databaseKey);
    setTables(data);
    if ((!activeTable || !data.some((table) => table.name === activeTable)) && data.length > 0) {
      setActiveTable(data[0].name);
    }
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(sidebarWidth)));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem(ROW_HEIGHT_STORAGE_KEY, String(Math.round(rowHeight)));
  }, [rowHeight]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = sidebarResizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const delta = event.clientX - resizeState.startX;
      setSidebarWidth(Math.max(280, Math.min(520, resizeState.startWidth + delta)));
    };

    const stopResizing = () => {
      if (!sidebarResizeStateRef.current) {
        return;
      }

      sidebarResizeStateRef.current = null;
      document.body.classList.remove("is-sidebar-width-resizing");
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      document.body.classList.remove("is-sidebar-width-resizing");
    };
  }, []);

  useEffect(() => {
    fetchDatabases()
      .then(setDatabaseSources)
      .catch((requestError: Error) => setError(requestError.message));
  }, []);

  useEffect(() => {
    setFilters(DEFAULT_FILTERS);
    setQuery("");
    setSelectedProfile(null);
    setProfiles([]);
    setTotal(0);
    void loadTables(activeDatabase);
  }, [activeDatabase]);

  useEffect(() => {
    const loadFields = async () => {
      const data = await fetchFields(activeDatabase, activeTable);
      setFieldData(data);

      const storageScope = `${activeDatabase}-${activeTable}`;
      const savedVisibleFields = localStorage.getItem(`${VISIBLE_FIELDS_STORAGE_KEY}-${storageScope}`);
      const restoredVisibleFields = savedVisibleFields
        ? (JSON.parse(savedVisibleFields) as ProfileFieldKey[]).filter((fieldKey) =>
            data.fields.some((field) => field.key === fieldKey)
          )
        : [];
      const nextVisibleFields =
        restoredVisibleFields.length > 0 ? restoredVisibleFields : data.fields.map((field) => field.key);

      setVisibleFields(nextVisibleFields);

      const savedColumnWidths = localStorage.getItem(`${COLUMN_WIDTHS_STORAGE_KEY}-${storageScope}`);
      const parsedWidths = savedColumnWidths ? (JSON.parse(savedColumnWidths) as ColumnWidths) : null;
      setColumnWidths(buildColumnWidths(data.fields, parsedWidths));
    };

    if (activeTable) {
      loadFields();
    }
  }, [activeDatabase, activeTable]);

  useEffect(() => {
    localStorage.setItem(`${VISIBLE_FIELDS_STORAGE_KEY}-${activeDatabase}-${activeTable}`, JSON.stringify(visibleFields));
  }, [activeDatabase, visibleFields, activeTable]);

  useEffect(() => {
    if (fieldData.fields.length > 0) {
      localStorage.setItem(`${COLUMN_WIDTHS_STORAGE_KEY}-${activeDatabase}-${activeTable}`, JSON.stringify(columnWidths));
    }
  }, [activeDatabase, activeTable, columnWidths, fieldData.fields.length]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError("");

    const timeout = window.setTimeout(() => {
      fetchProfiles({
        query,
        filters,
        sortBy,
        sortDirection,
        page: 1,
        pageSize: 100,
        databaseKey: activeDatabase,
        tableName: activeTable
      })
        .then((response) => {
          if (ignore) return;
          setProfiles(response.profiles);
          setTotal(response.total);
          void loadTables(activeDatabase);
        })
        .catch((requestError: Error) => {
          if (ignore) return;
          setError(requestError.message);
        })
        .finally(() => {
          if (!ignore) setLoading(false);
        });
    }, 250);

    return () => {
      ignore = true;
      window.clearTimeout(timeout);
    };
  }, [query, filters, sortBy, sortDirection, activeDatabase, activeTable]);

  const handleSort = (fieldKey: string) => {
    if (sortBy === fieldKey) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }

    setSortBy(fieldKey);
    setSortDirection("asc");
  };

  const updateFilter = (key: keyof ProfileFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const visibleFieldCount = visibleFields.length;
  const activeTableLabel = formatTableName(activeTable);
  const activeDatabaseSource = databaseSources.find((source) => source.key === activeDatabase);
  const selectedProfileIndex = selectedProfile ? profiles.findIndex((profile) => profile.id === selectedProfile.id) : -1;
  const activeTableCount = tables.find((table) => table.name === activeTable)?.rowCount ?? total;

  const stats = useMemo(
    () => [
      { label: "Records", value: activeTableCount.toLocaleString() },
      { label: "Visible fields", value: String(visibleFieldCount) },
      { label: "Active filters", value: String(activeFilterCount) }
    ],
    [activeFilterCount, activeTableCount, visibleFieldCount]
  );

  const goToPreviousProfile = () => {
    if (selectedProfileIndex > 0) {
      setSelectedProfile(profiles[selectedProfileIndex - 1]);
    }
  };

  const goToNextProfile = () => {
    if (selectedProfileIndex >= 0 && selectedProfileIndex < profiles.length - 1) {
      setSelectedProfile(profiles[selectedProfileIndex + 1]);
    }
  };

  const handleCellUpdate = async (rowId: string | number, field: string, value: unknown) => {
    const updated = await updateCell({
      databaseKey: activeDatabase,
      tableName: activeTable,
      rowId,
      field,
      value
    });

    setProfiles((current) =>
      current.map((profile) => (String(profile.id) === String(rowId) ? { ...profile, ...updated } : profile))
    );

    setSelectedProfile((current) =>
      current && String(current.id) === String(rowId) ? { ...current, ...updated } : current
    );
  };

  const startSidebarResizing = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    sidebarResizeStateRef.current = {
      startX: event.clientX,
      startWidth: sidebarWidth
    };
    document.body.classList.add("is-sidebar-width-resizing");
  };

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className="app-shell relative isolate h-screen overflow-hidden">
        <div className="ambient ambient-a" />
        <div className="ambient ambient-b" />
        <div className="ambient-grid" />

        <aside
          className="fixed inset-y-0 left-0 z-20 hidden p-3 lg:block"
          style={{ width: `${sidebarWidth}px` }}
        >
          <TableSidebar
            activeDatabase={activeDatabase}
            activeTable={activeTable}
            databases={databaseSources}
            facets={fieldData.facets}
            filters={filters}
            onDatabaseSelect={setActiveDatabase}
            onFilterChange={updateFilter}
            onResetFilters={resetFilters}
            onTableSelect={setActiveTable}
            tables={tables}
          />
          <span
            aria-hidden="true"
            className="absolute inset-y-6 right-0 z-30 w-4 translate-x-1/2 cursor-col-resize rounded-full sidebar-resize-handle"
            onPointerDown={startSidebarResizing}
          />
        </aside>

        <div
          className="relative z-10 flex h-full flex-col lg:pl-[calc(var(--sidebar-width)+12px)]"
          style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
        >
          <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-visible p-3">
            <header className="panel-surface relative z-40 overflow-visible rounded-[26px] px-5 py-4">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
                      <Sparkles className="h-3.5 w-3.5" />
                      PulseOS Local Database Browser
                    </div>
                    <div className="space-y-1">
                      <h1 className="font-identity text-2xl font-bold tracking-[-0.04em] md:text-4xl">
                        Screen CRM and research-agent tables from persistent storage.
                      </h1>
                      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                        Switch between local SQLite sources, inspect every table, search across columns, filter small-cardinality fields, and edit cells with primary keys.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    {stats.map((stat) => (
                      <div className="panel-muted rounded-2xl px-3 py-2.5" key={stat.label}>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {stat.label}
                        </div>
                        <div className="mt-1 text-xl font-semibold tracking-tight text-foreground">{stat.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                  <label className="input-shell flex flex-1 items-center gap-3 rounded-2xl px-4 py-3">
                    <Search className="h-4.5 w-4.5 text-primary" />
                    <input
                      className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={`Search across ${activeTableLabel}...`}
                      value={query}
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="panel-muted flex items-center gap-2 rounded-2xl px-3 py-2 text-xs">
                      <PanelLeftClose className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Sidebar</span>
                      <span className="font-semibold text-foreground">{Math.round(sidebarWidth)}px</span>
                    </div>

                    <div className="panel-muted flex items-center gap-2 rounded-2xl px-3 py-2 text-xs">
                      <LayoutPanelLeft className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Table</span>
                      <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                        {activeTableLabel}
                      </span>
                    </div>

                    <span
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium",
                        loading
                          ? "bg-primary/10 text-primary"
                          : error
                            ? "bg-red-500/10 text-red-400"
                            : "bg-emerald-500/10 text-emerald-400"
                      )}
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                      {loading ? "Refreshing" : error ? "Connection error" : "Live browser"}
                    </span>

                    <button
                      className="icon-button focused-ring h-11 w-11 rounded-2xl"
                      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                      type="button"
                    >
                      {theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
                    </button>

                    <FieldPicker fields={fieldData.fields} onChange={setVisibleFields} visibleFields={visibleFields} />
                  </div>
                </div>
              </div>
            </header>

            <section className="relative z-0 min-h-0 flex-1 overflow-hidden">
              <div className="flex h-full flex-col gap-4">
                <div className="panel-surface rounded-[24px] px-4 py-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Database className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          Current source
                        </div>
                        <div className="mt-1 text-base font-semibold tracking-tight">
                          {total.toLocaleString()} records in {activeDatabaseSource?.label || activeDatabase} / {activeTableLabel}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full border border-border/70 bg-background/60 px-3 py-1.5">
                        {activeDatabaseSource?.path || "Persistent SQLite"}
                      </span>
                      <span className="rounded-full border border-border/70 bg-background/60 px-3 py-1.5">Direct local DB view</span>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden">
                  <ProfileTable
                    activeTable={activeTable}
                    columnWidths={columnWidths}
                    fields={fieldData.fields}
                    onColumnWidthsChange={setColumnWidths}
                    onCellUpdate={handleCellUpdate}
                    onProfileSelect={setSelectedProfile}
                    onRowHeightChange={setRowHeight}
                    onSort={handleSort}
                    profiles={profiles}
                    rowHeight={rowHeight}
                    sortBy={sortBy}
                    sortDirection={sortDirection}
                    visibleFields={visibleFields}
                  />
                </div>
              </div>
            </section>
          </main>
        </div>

        <ProfileDrawer
          currentIndex={selectedProfileIndex >= 0 ? selectedProfileIndex : undefined}
          hasNext={selectedProfileIndex >= 0 && selectedProfileIndex < profiles.length - 1}
          hasPrevious={selectedProfileIndex > 0}
          onClose={() => setSelectedProfile(null)}
          onNext={goToNextProfile}
          onPrevious={goToPreviousProfile}
          profile={selectedProfile}
          totalCount={selectedProfile ? profiles.length : undefined}
        />
      </div>
    </div>
  );
}

export default App;
