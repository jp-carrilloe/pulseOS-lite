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
import { FilterBar } from "./components/FilterBar";
import { ProfileDrawer } from "./components/ProfileDrawer";
import { ProfileTable } from "./components/ProfileTable";
import {
  SaveViewButton,
  SavedViews,
} from "./components/SavedViews";
import type { SavedView } from "./components/SavedViews";
import { TableSidebar } from "./components/TableSidebar";
import { fetchDatabases, fetchFields, fetchProfiles, fetchTables, updateCell, fetchSavedViews, saveViews } from "./lib/api";
import type {
  DatabaseSource,
  FieldResponse,
  ProfileField,
  ProfileFieldKey,
  ProfileFilters,
  SigmaProfile,
  SortDirection,
  Table,
  AdvancedFilter
} from "./lib/types";
import { cn, formatTableName } from "./lib/utils";

const VISIBLE_FIELDS_STORAGE_KEY = "pulseos-db-browser-visible-fields-v2";
const COLUMN_WIDTHS_STORAGE_KEY = "pulseos-db-browser-column-widths";
const SIDEBAR_WIDTH_STORAGE_KEY = "pulseos-db-browser-sidebar-width";
const ROW_HEIGHT_STORAGE_KEY = "pulseos-db-browser-row-height";
const DEFAULT_VIEW_STORAGE_KEY = "sigma-table-default-view";
const TABLE_ORDER_STORAGE_KEY = "pulseos-db-browser-table-order";

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
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [defaultViewId, setDefaultViewId] = useState<string | null>(null);
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

  const [tableOrder, setTableOrder] = useState<Record<string, string[]>>(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(TABLE_ORDER_STORAGE_KEY) : null;
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem(TABLE_ORDER_STORAGE_KEY, JSON.stringify(tableOrder));
  }, [tableOrder]);

  const orderedTables = useMemo(() => {
    const order = tableOrder[activeDatabase] || [];
    return [...tables].sort((a, b) => {
      const idxA = order.indexOf(a.name);
      const idxB = order.indexOf(b.name);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });
  }, [tables, tableOrder, activeDatabase]);

  const handleTabDragStart = (e: React.DragEvent, tableName: string) => {
    e.dataTransfer.setData("text/plain", tableName);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleTabDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleTabDrop = (e: React.DragEvent, targetTableName: string) => {
    e.preventDefault();
    const sourceTableName = e.dataTransfer.getData("text/plain");
    if (sourceTableName === targetTableName || !sourceTableName) return;

    setTableOrder(prev => {
      const order = prev[activeDatabase] || orderedTables.map(t => t.name);
      const sourceIdx = order.indexOf(sourceTableName);
      const targetIdx = order.indexOf(targetTableName);
      
      if (sourceIdx === -1 || targetIdx === -1) return prev;
      
      const newOrder = [...order];
      newOrder.splice(sourceIdx, 1);
      newOrder.splice(targetIdx, 0, sourceTableName);
      
      return {
        ...prev,
        [activeDatabase]: newOrder
      };
    });
  };

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
        restoredVisibleFields.length > 0
          ? restoredVisibleFields
          : data.fields.filter((field) => field.defaultVisible).map((field) => field.key);

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
    fetchSavedViews().then((views) => {
      if (Array.isArray(views) && views.length > 0) {
        setSavedViews(views);
      }
    });
  }, []);

  useEffect(() => {
    const savedDefault = localStorage.getItem(`${DEFAULT_VIEW_STORAGE_KEY}-${activeDatabase}-${activeTable}`);
    setDefaultViewId(savedDefault || null);
    
    // If no view is active, and we have a default view, load it
    if (!activeViewId && savedDefault) {
      const defView = savedViews.find(v => v.id === savedDefault);
      if (defView) {
        setActiveViewId(defView.id);
        setFilters(defView.filters);
        setVisibleFields(defView.visibleFields);
      }
    }
  }, [activeDatabase, activeTable, savedViews]);

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

  const handleHideColumn = (fieldKey: ProfileFieldKey) => {
    setVisibleFields((prev) => prev.filter((key) => key !== fieldKey));
  };

  const handleMoveColumn = (fieldKey: ProfileFieldKey, direction: "left" | "right") => {
    setVisibleFields(prev => {
      const idx = prev.indexOf(fieldKey);
      if (idx === -1) return prev;
      if (direction === "left" && idx === 0) return prev;
      if (direction === "right" && idx === prev.length - 1) return prev;
      
      const next = [...prev];
      const targetIdx = direction === "left" ? idx - 1 : idx + 1;
      
      const temp = next[idx];
      next[idx] = next[targetIdx];
      next[targetIdx] = temp;
      
      return next;
    });
  };

  const handleReorderColumn = (sourceKey: ProfileFieldKey, targetKey: ProfileFieldKey) => {
    setVisibleFields((prev) => {
      const sourceIdx = prev.indexOf(sourceKey);
      const targetIdx = prev.indexOf(targetKey);
      if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) return prev;

      const next = [...prev];
      // Remove source
      next.splice(sourceIdx, 1);
      // Re-insert at target
      next.splice(targetIdx, 0, sourceKey);
      return next;
    });
  };

  const handleSort = (fieldKey: ProfileFieldKey, forceDirection?: "asc" | "desc") => {
    if (forceDirection) {
      setSortBy(fieldKey);
      setSortDirection(forceDirection);
    } else {
      if (sortBy === fieldKey) {
        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(fieldKey);
        setSortDirection("asc");
      }
    }
  };

  const updateFilter = (key: keyof ProfileFilters, filter: AdvancedFilter | null) => {
    setFilters((current) => {
      const next = { ...current };
      if (!filter) {
        delete next[key];
      } else {
        next[key] = filter;
      }
      return next;
    });
  };

  const handleClearFilters = () => {
    setFilters({});
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const handleSaveView = (view: SavedView) => {
    const next = [...savedViews, view];
    setSavedViews(next);
    saveViews(next);
    setActiveViewId(view.id);
  };

  const handleDeleteView = (id: string) => {
    const next = savedViews.filter((v) => v.id !== id);
    setSavedViews(next);
    saveViews(next);
    if (activeViewId === id) setActiveViewId(null);
  };

  const handleRenameView = (id: string, name: string) => {
    const next = savedViews.map((v) => (v.id === id ? { ...v, name } : v));
    setSavedViews(next);
    saveViews(next);
  };

  const handleUpdateView = (id: string) => {
    const next = savedViews.map((v) => (v.id === id ? { ...v, filters: { ...filters }, visibleFields: [...visibleFields] } : v));
    setSavedViews(next);
    saveViews(next);
  };

  const handleCreateView = () => {
    const newView: SavedView = {
      id: `view-${Date.now()}`,
      name: `${activeTableLabel} view`,
      databaseKey: activeDatabase,
      tableName: activeTable,
      filters: { ...filters },
      visibleFields: [...visibleFields],
      createdAt: new Date().toISOString(),
    };
    handleSaveView(newView);
  };

  const handleSetDefaultView = (id: string | null) => {
    setDefaultViewId(id);
    if (id) {
      localStorage.setItem(`${DEFAULT_VIEW_STORAGE_KEY}-${activeDatabase}-${activeTable}`, id);
    } else {
      localStorage.removeItem(`${DEFAULT_VIEW_STORAGE_KEY}-${activeDatabase}-${activeTable}`);
    }
  };

  const handleApplyView = (view: SavedView) => {
    setActiveViewId(view.id);
    setFilters(view.filters);
    setVisibleFields(view.visibleFields);
    if (view.databaseKey !== activeDatabase) setActiveDatabase(view.databaseKey);
    if (view.tableName !== activeTable) setActiveTable(view.tableName);
  };

  const handleResetView = () => {
    setActiveViewId(null);
    setFilters(DEFAULT_FILTERS);
    setVisibleFields(fieldData.fields.filter((field) => field.defaultVisible).map((field) => field.key));
  };

  const activeFilterCount = Object.keys(filters).length;
  const visibleFieldCount = visibleFields.length;
  const activeTableLabel = formatTableName(activeTable);
  const activeDatabaseSource = databaseSources.find((source) => source.key === activeDatabase);
  const selectedProfileIndex = selectedProfile ? profiles.findIndex((profile) => profile.id === selectedProfile.id) : -1;
  const activeTableCount = tables.find((table) => table.name === activeTable)?.rowCount ?? total;

  const activeView = savedViews.find(v => v.id === activeViewId);
  const isViewDirty = activeView 
    ? JSON.stringify(activeView.filters) !== JSON.stringify(filters) || 
      JSON.stringify(activeView.visibleFields) !== JSON.stringify(visibleFields)
    : false;

  useEffect(() => {
    if (activeViewId && isViewDirty) {
      handleUpdateView(activeViewId);
    }
  }, [activeViewId, isViewDirty, filters, visibleFields]);

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

  const handleCrossLinkNavigation = (targetTable: string, targetFilterKey: string, targetFilterValue: string) => {
    setActiveTable(targetTable);
    setFilters({ [targetFilterKey]: { operator: "eq", value: targetFilterValue } });
    setQuery("");
    setActiveViewId(null);
  };

  const handleTableSelect = (tableName: string) => {
    setActiveTable(tableName);
    setFilters(DEFAULT_FILTERS);
    setQuery("");
    setActiveViewId(null);
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
            databases={databaseSources}
            facets={fieldData.facets}
            filters={filters}
            onDatabaseSelect={setActiveDatabase}
            onFilterChange={updateFilter}
            onResetFilters={resetFilters}
          >
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto">
                <SavedViews
                  activeViewId={activeViewId}
                  onApplyView={handleApplyView}
                  onDeleteView={handleDeleteView}
                  onRenameView={handleRenameView}
                  onResetView={handleResetView}
                  isViewDirty={isViewDirty}
                  onUpdateView={handleUpdateView}
                  onCreateView={handleCreateView}
                  defaultViewId={defaultViewId}
                  onSetDefaultView={handleSetDefaultView}
                  views={savedViews.filter(
                    (v) => v.databaseKey === activeDatabase && v.tableName === activeTable
                  )}
                />
              </div>
              <div className="p-3 pt-0">
                <SaveViewButton
                  databaseKey={activeDatabase}
                  filters={filters}
                  onSave={handleSaveView}
                  tableName={activeTable}
                  visibleFields={visibleFields}
                />
              </div>
            </div>
          </TableSidebar>
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
          <main className="flex min-h-0 flex-1 flex-col overflow-visible px-2 pt-2 pb-3">
            
            {/* Top Level Table Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto px-2 pb-3 scrollbar-none">
              {orderedTables.map((table) => (
                <button
                  key={table.name}
                  draggable
                  onDragStart={(e) => handleTabDragStart(e, table.name)}
                  onDragOver={handleTabDragOver}
                  onDrop={(e) => handleTabDrop(e, table.name)}
                  onClick={() => handleTableSelect(table.name)}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-all",
                    activeTable === table.name
                      ? "bg-primary/15 text-primary shadow-sm"
                      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                  )}
                >
                  {formatTableName(table.name)}
                  <span className="ml-1 rounded-full bg-background/60 px-1.5 py-0.5 text-[9px] tabular-nums text-muted-foreground">
                    {table.rowCount.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-col min-h-0 flex-1 gap-2">
              {/* Slim Toolbar */}
              <div className="relative z-50 flex flex-wrap items-center justify-between gap-3 bg-background/50 backdrop-blur-sm rounded-xl px-3 py-2">
                
                {/* Left side: Search & Connection */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <label className="flex items-center gap-2 bg-background/80 rounded-lg px-3 py-1.5 shadow-sm focus-within:ring-1 focus-within:ring-primary/40 flex-1 max-w-sm transition-shadow">
                    <Search className="h-3.5 w-3.5 text-primary/70" />
                    <input
                      className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={`Search ${activeTableLabel}...`}
                      value={query}
                    />
                  </label>
                  
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium whitespace-nowrap",
                      loading
                        ? "bg-primary/10 text-primary"
                        : error
                          ? "bg-red-500/10 text-red-400"
                          : "bg-emerald-500/10 text-emerald-400"
                    )}
                  >
                    <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
                    {loading ? "Refreshing" : error ? "Error" : "Live"}
                  </span>
                </div>

                {/* Right side: Stats & Actions */}
                <div className="flex items-center gap-3">
                  <div className="hidden lg:flex items-center gap-4 text-[11px]">
                    {stats.map((stat) => (
                      <div className="flex items-center gap-1.5" key={stat.label}>
                        <span className="text-muted-foreground">{stat.label}:</span>
                        <span className="font-semibold text-foreground">{stat.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="h-4 w-px bg-border/40 hidden lg:block"></div>

                  <div className="flex items-center gap-1.5">
                    <button
                      className="icon-button focused-ring h-7 w-7 rounded-md"
                      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                      type="button"
                    >
                      {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                    </button>

                    <FieldPicker fields={fieldData.fields} onChange={setVisibleFields} visibleFields={visibleFields} />
                  </div>
                </div>
              </div>

              <section className="relative z-0 min-h-0 flex-1 overflow-hidden">
                <div className="flex h-full flex-col gap-2">



                <FilterBar
                  fields={fieldData.fields}
                  filters={filters}
                  onFilterChange={updateFilter}
                  onClearAll={handleClearFilters}
                />

                <div className="min-h-0 flex-1 overflow-hidden">
                  <ProfileTable
                    activeTable={activeTable}
                    columnWidths={columnWidths}
                    facets={fieldData.facets}
                    fields={fieldData.fields}
                    filters={filters}
                    onColumnWidthsChange={setColumnWidths}
                    onCellUpdate={handleCellUpdate}
                    onFilterChange={updateFilter}
                    onHideColumn={handleHideColumn}
                    onMoveColumn={handleMoveColumn}
                    onReorderColumn={handleReorderColumn}
                    onNavigateToTable={handleCrossLinkNavigation}
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
          </div>
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
          onCellUpdate={handleCellUpdate}
        />
      </div>
    </div>
  );
}

export default App;
