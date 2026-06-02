import { ArrowDown, ArrowUp, ArrowLeft, ArrowRight, ArrowUpDown, ChevronDown, ExternalLink, Filter, EyeOff } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from "react";
import type {
  ProfileField,
  ProfileFieldKey,
  ProfileFilters,
  SigmaProfile,
  SortDirection,
  AdvancedFilter,
  FilterOperator,
} from "../lib/types";
import { cn, formatValue, statusTone, truncate } from "../lib/utils";

type ColumnWidths = Partial<Record<ProfileFieldKey, number>>;
type CellPosition = { rowIndex: number; fieldKey: ProfileFieldKey };
type CellRange = { startRow: number; endRow: number; startCol: number; endCol: number };

interface ProfileTableProps {
  activeTable: string;
  profiles: SigmaProfile[];
  fields: ProfileField[];
  visibleFields: ProfileFieldKey[];
  sortBy: string;
  sortDirection: SortDirection;
  onSort: (fieldKey: ProfileFieldKey, forceDirection?: "asc" | "desc") => void;
  onProfileSelect: (profile: SigmaProfile) => void;
  onCellUpdate: (rowId: string | number, field: string, value: unknown) => Promise<void>;
  columnWidths: ColumnWidths;
  onColumnWidthsChange: Dispatch<SetStateAction<ColumnWidths>>;
  rowHeight: number;
  onRowHeightChange: (height: number) => void;
  /** Facet values for column-level filter popovers */
  facets?: Record<string, string[]>;
  filters?: ProfileFilters;
  onFilterChange?: (key: keyof ProfileFilters, filter: AdvancedFilter | null) => void;
  onHideColumn?: (fieldKey: ProfileFieldKey) => void;
  onMoveColumn?: (fieldKey: ProfileFieldKey, direction: "left" | "right") => void;
  onReorderColumn?: (sourceKey: ProfileFieldKey, targetKey: ProfileFieldKey) => void;
  onNavigateToTable?: (targetTable: string, targetFilterKey: string, targetFilterValue: string) => void;
}

const MIN_COLUMN_WIDTH = 120;
const ROW_GUTTER_WIDTH = 44;
const MIN_ROW_HEIGHT = 48;
const MAX_ROW_HEIGHT = 260;

function getLineClampForRowHeight(rowHeight: number) {
  if (rowHeight <= 72) return 1;
  if (rowHeight <= 104) return 2;
  if (rowHeight <= 136) return 3;
  if (rowHeight <= 176) return 4;
  if (rowHeight <= 216) return 5;
  return 6;
}

function isEditableValue(value: unknown) {
  return typeof value !== "object" || value === null;
}

function clampCellRange(range: CellRange, maxRows: number, maxCols: number): CellRange {
  return {
    startRow: Math.max(0, Math.min(maxRows - 1, range.startRow)),
    endRow: Math.max(0, Math.min(maxRows - 1, range.endRow)),
    startCol: Math.max(0, Math.min(maxCols - 1, range.startCol)),
    endCol: Math.max(0, Math.min(maxCols - 1, range.endCol)),
  };
}

function normalizeRange(range: CellRange): CellRange {
  return {
    startRow: Math.min(range.startRow, range.endRow),
    endRow: Math.max(range.startRow, range.endRow),
    startCol: Math.min(range.startCol, range.endCol),
    endCol: Math.max(range.startCol, range.endCol),
  };
}

export function ProfileTable({
  activeTable,
  profiles,
  fields,
  visibleFields,
  sortBy,
  sortDirection,
  onSort,
  onProfileSelect,
  onCellUpdate,
  columnWidths,
  onColumnWidthsChange,
  rowHeight,
  onRowHeightChange,
  facets = {},
  filters = {},
  onFilterChange,
  onHideColumn,
  onMoveColumn,
  onReorderColumn,
  onNavigateToTable,
}: ProfileTableProps) {
  const [draggedColumn, setDraggedColumn] = useState<ProfileFieldKey | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ProfileFieldKey | null>(null);
  const [resizingField, setResizingField] = useState<ProfileFieldKey | null>(null);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [savingCell, setSavingCell] = useState<CellPosition | null>(null);
  const [selection, setSelection] = useState<CellRange | null>(null);
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const [draftFilterOperator, setDraftFilterOperator] = useState<FilterOperator>("contains");
  const [draftFilterValue, setDraftFilterValue] = useState("");
  const [containerWidth, setContainerWidth] = useState(0);
  const resizeStateRef = useRef<{ field: ProfileFieldKey; startX: number; startWidth: number } | null>(null);
  const rowResizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);
  const visible = useMemo(
    () => visibleFields.map((key) => fields.find((f) => f.key === key)).filter(Boolean) as ProfileField[],
    [fields, visibleFields]
  );
  const rowLineClamp = getLineClampForRowHeight(rowHeight);

  const [filterRect, setFilterRect] = useState<{ top: number; left?: number; right?: number } | null>(null);

  const handleOpenFilter = (fieldKey: ProfileFieldKey, currentFilter?: AdvancedFilter, e?: ReactMouseEvent) => {
    if (openFilterKey === fieldKey) {
      setOpenFilterKey(null);
      return;
    }
    
    if (e) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      // If closer to the right edge, anchor to the right
      if (rect.right > window.innerWidth - 250) {
        setFilterRect({ top: rect.bottom, right: window.innerWidth - rect.right });
      } else {
        setFilterRect({ top: rect.bottom, left: rect.left });
      }
    }

    setOpenFilterKey(fieldKey);
    if (currentFilter) {
      setDraftFilterOperator(currentFilter.operator);
      setDraftFilterValue(currentFilter.value);
    } else {
      setDraftFilterOperator("contains");
      setDraftFilterValue("");
    }
  };

  // Drag and Drop Column Reordering
  const handleDragStart = (e: React.DragEvent<HTMLTableCellElement>, fieldKey: ProfileFieldKey) => {
    setDraggedColumn(fieldKey);
    e.dataTransfer.effectAllowed = "move";
    // Optional: customize drag image
  };

  const handleDragOver = (e: React.DragEvent<HTMLTableCellElement>, fieldKey: ProfileFieldKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (fieldKey !== draggedColumn) {
      setDragOverColumn(fieldKey);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLTableCellElement>) => {
    e.preventDefault();
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLTableCellElement>, targetKey: ProfileFieldKey) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (draggedColumn && draggedColumn !== targetKey && onReorderColumn) {
      onReorderColumn(draggedColumn, targetKey);
    }
    setDraggedColumn(null);
  };

  // Track container width to fill available space
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Effective column widths: scale up proportionally when columns don't fill the container
  const rawColWidths = useMemo(
    () => visible.map((f) => Math.max(MIN_COLUMN_WIDTH, columnWidths[f.key] ?? MIN_COLUMN_WIDTH)),
    [visible, columnWidths]
  );
  const rawTotalWidth = rawColWidths.reduce((s, w) => s + w, 0) + ROW_GUTTER_WIDTH;
  const needsExpansion = containerWidth > 0 && rawTotalWidth < containerWidth;

  const effectiveColWidths = useMemo(() => {
    if (!needsExpansion || containerWidth === 0) return rawColWidths;
    const available = Math.max(1, containerWidth - ROW_GUTTER_WIDTH);
    const rawTotal = rawColWidths.reduce((s, w) => s + w, 0) || 1;
    return rawColWidths.map((w) => Math.max(MIN_COLUMN_WIDTH, Math.floor((w / rawTotal) * available)));
  }, [needsExpansion, containerWidth, rawColWidths]);

  const effectiveWidthByKey = useMemo(
    () => Object.fromEntries(visible.map((f, i) => [f.key, effectiveColWidths[i] ?? MIN_COLUMN_WIDTH])),
    [visible, effectiveColWidths]
  );

  useEffect(() => {
    resizeStateRef.current = null;
    rowResizeStateRef.current = null;
    setEditingCell(null);
    setSavingCell(null);
    setSelection(null);
    setOpenFilterKey(null);
  }, [activeTable]);

  // Close filter popover on outside click
  useEffect(() => {
    if (!openFilterKey) return;
    const handleClick = (e: MouseEvent) => {
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(e.target as Node)) {
        setOpenFilterKey(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openFilterKey]);

  useEffect(() => {
    if (!resizingField) return;
    const handlePointerMove = (event: PointerEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const delta = event.clientX - state.startX;
      const nextWidth = Math.max(MIN_COLUMN_WIDTH, state.startWidth + delta);
      onColumnWidthsChange((cur) => ({ ...cur, [state.field]: nextWidth }));
    };
    const stopResizing = () => {
      resizeStateRef.current = null;
      setResizingField(null);
      document.body.classList.remove("is-column-resizing");
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      document.body.classList.remove("is-column-resizing");
    };
  }, [onColumnWidthsChange, resizingField]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const state = rowResizeStateRef.current;
      if (!state) return;
      const delta = event.clientY - state.startY;
      const next = Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, state.startHeight + delta));
      onRowHeightChange(next);
    };
    const stopResizing = () => {
      if (!rowResizeStateRef.current) return;
      rowResizeStateRef.current = null;
      document.body.classList.remove("is-row-resizing");
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      document.body.classList.remove("is-row-resizing");
    };
  }, [onRowHeightChange]);

  const tableWidth = needsExpansion ? containerWidth : rawTotalWidth;

  const focusCell = (rowIndex: number, fieldKey: ProfileFieldKey) => {
    cellRefs.current[`${rowIndex}:${fieldKey}`]?.focus();
  };

  const setSingleCellSelection = (rowIndex: number, colIndex: number) => {
    setSelection({ startRow: rowIndex, endRow: rowIndex, startCol: colIndex, endCol: colIndex });
  };

  const startColumnResizing = (event: ReactPointerEvent<HTMLSpanElement>, field: ProfileFieldKey) => {
    event.preventDefault();
    event.stopPropagation();
    resizeStateRef.current = {
      field,
      startX: event.clientX,
      // Use effective (displayed) width as the base so drag delta is pixel-accurate
      startWidth: effectiveWidthByKey[field] ?? MIN_COLUMN_WIDTH,
    };
    setResizingField(field);
    document.body.classList.add("is-column-resizing");
  };

  const startRowResizing = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    rowResizeStateRef.current = { startY: event.clientY, startHeight: rowHeight };
    document.body.classList.add("is-row-resizing");
  };

  const beginEditing = (rowIndex: number, fieldKey: ProfileFieldKey) => {
    const row = profiles[rowIndex];
    if (!row) return;
    const value = row[fieldKey];
    if (!isEditableValue(value)) return;
    setEditingCell({ rowIndex, fieldKey });
    setDraftValue(value == null ? "" : String(value));
    setSingleCellSelection(rowIndex, visible.findIndex((f) => f.key === fieldKey));
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setDraftValue("");
  };

  const commitEditing = async () => {
    if (!editingCell) return;
    const row = profiles[editingCell.rowIndex];
    if (!row) { cancelEditing(); return; }
    const currentValue = row[editingCell.fieldKey];
    const nextValue = draftValue === "" ? null : draftValue;
    if (String(currentValue ?? "") === String(nextValue ?? "")) { cancelEditing(); return; }
    setSavingCell(editingCell);
    try {
      await onCellUpdate(row.id, editingCell.fieldKey, nextValue);
      cancelEditing();
      focusCell(editingCell.rowIndex, editingCell.fieldKey);
    } finally {
      setSavingCell(null);
    }
  };

  const handleCellClick = (rowIndex: number, colIndex: number, event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.shiftKey && selection) {
      setSelection(
        clampCellRange(
          {
            startRow: selection.startRow,
            endRow: rowIndex,
            startCol: selection.startCol,
            endCol: colIndex,
          },
          profiles.length,
          visible.length
        )
      );
    } else {
      setSingleCellSelection(rowIndex, colIndex);
    }
  };

  const handleRowClick = (profile: SigmaProfile, event: ReactMouseEvent<HTMLTableRowElement>) => {
    // Don't open drawer if user is clicking on a cell button or an active editor
    const target = event.target as HTMLElement;
    if (target.closest("input") || target.closest("a")) return;
    
    const button = target.closest("button");
    if (button && !button.classList.contains("spreadsheet-cell")) return;
    
    onProfileSelect(profile);
  };

  const handleGridKeyDown = async (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!selection || profiles.length === 0 || visible.length === 0) return;
    if (editingCell) {
      if (event.key === "Escape") { event.preventDefault(); cancelEditing(); }
      return;
    }
    const normalized = normalizeRange(selection);
    let nextRow = normalized.endRow;
    let nextCol = normalized.endCol;
    switch (event.key) {
      case "ArrowUp": event.preventDefault(); nextRow -= 1; break;
      case "ArrowDown": event.preventDefault(); nextRow += 1; break;
      case "ArrowLeft": event.preventDefault(); nextCol -= 1; break;
      case "ArrowRight": event.preventDefault(); nextCol += 1; break;
      case "Tab": event.preventDefault(); nextCol += event.shiftKey ? -1 : 1; break;
      case "Enter":
        event.preventDefault();
        if (event.shiftKey) { nextRow -= 1; } else {
          beginEditing(normalized.endRow, visible[normalized.endCol].key);
          return;
        }
        break;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          const fieldKey = visible[normalized.endCol].key;
          beginEditing(normalized.endRow, fieldKey);
          setDraftValue(event.key);
        }
        return;
    }
    const clampedRow = Math.max(0, Math.min(profiles.length - 1, nextRow));
    const clampedCol = Math.max(0, Math.min(visible.length - 1, nextCol));
    if (event.shiftKey) {
      setSelection(
        clampCellRange(
          { startRow: normalized.startRow, endRow: clampedRow, startCol: normalized.startCol, endCol: clampedCol },
          profiles.length,
          visible.length
        )
      );
    } else {
      setSingleCellSelection(clampedRow, clampedCol);
    }
    focusCell(clampedRow, visible[clampedCol].key);
  };

  const isCellSelected = (rowIndex: number, colIndex: number) => {
    if (!selection) return false;
    const range = normalizeRange(selection);
    return (
      rowIndex >= range.startRow &&
      rowIndex <= range.endRow &&
      colIndex >= range.startCol &&
      colIndex <= range.endCol
    );
  };

  return (
    <div
      className="panel-surface flex h-full w-full flex-col overflow-hidden rounded-xl"
      onKeyDown={handleGridKeyDown}
      ref={gridRef}
      tabIndex={0}
    >
      <div className="relative min-h-0 flex-1 overflow-x-auto overflow-y-auto" ref={scrollRef}>
        <table
          className="text-left text-sm"
          style={{
            width: needsExpansion ? "100%" : `${tableWidth}px`,
            minWidth: needsExpansion ? "unset" : `${tableWidth}px`,
            tableLayout: needsExpansion ? "fixed" : "auto",
          }}
        >
          <colgroup>
            <col style={{ width: `${ROW_GUTTER_WIDTH}px` }} />
            {visible.map((field, i) => (
              <col
                key={field.key}
                style={{ width: `${effectiveColWidths[i] ?? MIN_COLUMN_WIDTH}px` }}
              />
            ))}
          </colgroup>

          {/* ── Table head ── */}
          <thead className="sticky top-0 z-10 bg-background/[0.92] text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-xl">
            <tr>
              {/* Row number gutter header */}
              <th className="group/row-gutter sticky left-0 z-20 bg-background/[0.96] px-0 py-0">
                <div className="relative flex h-full min-h-[52px] items-center justify-center">
                  <span className="text-[10px] font-semibold tracking-[0.16em]">#</span>
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-3 translate-y-1/2 cursor-row-resize row-boundary-handle"
                    onPointerDown={startRowResizing}
                  />
                </div>
              </th>

              {/* Column headers */}
              {visible.map((field) => {
                const width = effectiveWidthByKey[field.key] ?? MIN_COLUMN_WIDTH;
                const hasFacet = facets[field.key] && facets[field.key].length > 0;
                const activeFilterValue = filters[field.key];
                const isFilterOpen = openFilterKey === field.key;

                return (
                  <th
                    className={cn(
                      "group/table-header relative px-4 py-3 font-semibold transition-colors",
                      dragOverColumn === field.key ? "bg-primary/20" : "",
                      draggedColumn === field.key ? "opacity-50" : ""
                    )}
                    draggable
                    onDragStart={(e) => handleDragStart(e, field.key)}
                    onDragOver={(e) => handleDragOver(e, field.key)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, field.key)}
                    key={field.key}
                    style={{ width }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        className="focused-ring inline-flex w-full min-w-0 flex-1 items-center justify-between gap-1.5 rounded-lg px-1 py-1 text-left cursor-pointer hover:text-foreground group/header-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenFilter(field.key, activeFilterValue, e);
                        }}
                        type="button"
                      >
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <span className="truncate">{field.label}</span>
                          {field.sortable && sortBy === field.key && sortDirection === "asc" ? <ArrowUp className="h-3 w-3 shrink-0 text-primary" /> : null}
                          {field.sortable && sortBy === field.key && sortDirection === "desc" ? <ArrowDown className="h-3 w-3 shrink-0 text-primary" /> : null}
                        </div>
                        <ChevronDown className={cn(
                          "h-3 w-3 shrink-0 transition-transform",
                          isFilterOpen ? "rotate-180 text-foreground" : "text-muted-foreground/40 opacity-0 group-hover/header-btn:opacity-100"
                        )} />
                      </button>

                      <div className="relative">
                        {/* Active filter dot indicator without a separate button */}
                        {activeFilterValue && !isFilterOpen && (
                          <span className="absolute -right-2 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                        )}

                        {/* Popover menu */}
                        {isFilterOpen ? createPortal(
                          <div
                            className="panel-surface fixed z-[200] mt-1 min-w-[200px] overflow-hidden rounded-2xl py-1 shadow-xl"
                            style={{ 
                              top: filterRect?.top, 
                              ...(filterRect?.right !== undefined ? { right: filterRect.right } : {}),
                              ...(filterRect?.left !== undefined ? { left: filterRect.left } : {})
                            }}
                            ref={filterPopoverRef}
                          >
                            {field.sortable && (
                              <>
                                <button
                                  className="flex w-full items-center px-3 py-2 text-left text-xs transition hover:bg-primary/10 text-foreground"
                                  onClick={() => {
                                    onSort(field.key, "asc");
                                    setOpenFilterKey(null);
                                  }}
                                  type="button"
                                >
                                  <ArrowUp className="mr-2 h-3 w-3 text-muted-foreground" /> Sort A to Z
                                </button>
                                <button
                                  className="flex w-full items-center px-3 py-2 text-left text-xs transition hover:bg-primary/10 text-foreground"
                                  onClick={() => {
                                    onSort(field.key, "desc");
                                    setOpenFilterKey(null);
                                  }}
                                  type="button"
                                >
                                  <ArrowDown className="mr-2 h-3 w-3 text-muted-foreground" /> Sort Z to A
                                </button>
                              </>
                            )}
                            
                            {onMoveColumn && (
                              <div className="flex w-full items-center">
                                <button
                                  className="flex flex-1 items-center justify-center px-3 py-2 text-xs transition hover:bg-primary/10 text-foreground"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onMoveColumn(field.key, "left");
                                  }}
                                  title="Move Column Left"
                                  type="button"
                                >
                                  <ArrowLeft className="h-3 w-3 text-muted-foreground" />
                                </button>
                                <button
                                  className="flex flex-1 items-center justify-center px-3 py-2 text-xs transition hover:bg-primary/10 text-foreground"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onMoveColumn(field.key, "right");
                                  }}
                                  title="Move Column Right"
                                  type="button"
                                >
                                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                </button>
                              </div>
                            )}

                            {onHideColumn && (
                              <>
                                <button
                                  className="flex w-full items-center px-3 py-2 text-left text-xs transition hover:bg-primary/10 text-foreground"
                                  onClick={() => {
                                    onHideColumn(field.key);
                                    setOpenFilterKey(null);
                                  }}
                                  type="button"
                                >
                                  <EyeOff className="mr-2 h-3 w-3 text-muted-foreground" /> Hide Column
                                </button>
                              </>
                            )}

                                  {onFilterChange && (
                                <div className="px-3 py-2">
                                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                                    Filter by {field.label}
                                  </div>
                                  <select
                                    className="mb-2 w-full rounded-md bg-background/50 px-2 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-none shadow-sm"
                                    value={draftFilterOperator}
                                    onChange={(e) => setDraftFilterOperator(e.target.value as FilterOperator)}
                                  >
                                    <option value="contains">Contains</option>
                                    <option value="eq">Is exactly</option>
                                    <option value="empty">Is empty</option>
                                    <option value="not_empty">Is not empty</option>
                                  </select>
                                  {draftFilterOperator !== "empty" && draftFilterOperator !== "not_empty" && (
                                    <input
                                      type="text"
                                      className="mb-2 w-full rounded-md bg-background/50 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:outline-none shadow-sm"
                                      placeholder="Filter value..."
                                      value={draftFilterValue}
                                      onChange={(e) => setDraftFilterValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          onFilterChange(field.key as keyof ProfileFilters, { operator: draftFilterOperator, value: draftFilterValue });
                                          setOpenFilterKey(null);
                                        }
                                      }}
                                    />
                                  )}
                                  <div className="flex gap-2">
                                    <button
                                      className="flex-1 rounded-md bg-primary px-2 py-1.5 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                                      onClick={() => {
                                        onFilterChange(field.key as keyof ProfileFilters, { operator: draftFilterOperator, value: draftFilterValue });
                                        setOpenFilterKey(null);
                                      }}
                                      type="button"
                                    >
                                      Apply
                                    </button>
                                    {activeFilterValue && (
                                      <button
                                        className="rounded-md bg-background/80 px-2 py-1.5 text-[10px] font-semibold text-foreground hover:bg-primary/10 transition-colors"
                                        onClick={() => {
                                          onFilterChange(field.key as keyof ProfileFilters, null);
                                          setOpenFilterKey(null);
                                        }}
                                        type="button"
                                      >
                                        Clear
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              {onFilterChange && <div className="mx-3 my-1 h-px bg-border/50" />}

                              {hasFacet && onFilterChange && (
                                <>
                                  <div className="px-3 py-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Or exact match
                                  </div>
                                  <button
                                    className={cn(
                                      "flex w-full items-center px-3 py-2 text-left text-xs transition hover:bg-primary/10",
                                      !activeFilterValue ? "font-semibold text-foreground" : "text-muted-foreground"
                                    )}
                                    onClick={() => {
                                      onFilterChange(field.key as keyof ProfileFilters, null);
                                      setOpenFilterKey(null);
                                    }}
                                    type="button"
                                  >
                                    All
                                  </button>
                                {facets[field.key].map((option) => (
                                  <button
                                    className={cn(
                                      "flex w-full items-center px-3 py-2 text-left text-xs transition hover:bg-primary/10",
                                      activeFilterValue?.operator === "eq" && activeFilterValue?.value === option ? "font-semibold text-primary" : "text-muted-foreground"
                                    )}
                                    key={option}
                                    onClick={() => {
                                      onFilterChange(field.key as keyof ProfileFilters, { operator: "eq", value: option });
                                      setOpenFilterKey(null);
                                    }}
                                    type="button"
                                  >
                                    {option}
                                  </button>
                                ))}
                              </>
                            )}
                          </div>
                        , document.body) : null}
                      </div>

                      {/* Column resize handle */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute inset-y-2 right-0 z-20 w-3 -translate-x-1/2 cursor-col-resize rounded-full transition",
                          "before:absolute before:inset-y-1 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border/60 before:content-['']",
                          "group-hover/table-header:before:bg-primary/40 hover:before:bg-primary/80",
                          resizingField === field.key && "before:bg-primary"
                        )}
                        onPointerDown={(event) => startColumnResizing(event, field.key)}
                      />
                    </div>

                    {/* Active filter pill under header */}
                    {activeFilterValue ? (
                      <div className="mt-1 flex items-center gap-1">
                        <span className="truncate rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                          {activeFilterValue.operator === "empty"
                            ? "Empty"
                            : activeFilterValue.operator === "not_empty"
                              ? "Not empty"
                              : activeFilterValue.value}
                        </span>
                        <button
                          className="text-[9px] text-muted-foreground hover:text-primary shrink-0"
                          onClick={() => onFilterChange?.(field.key as keyof ProfileFilters, null)}
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* ── Table body ── */}
          <tbody>
            {profiles.length === 0 ? (
              <tr>
                <td className="px-5 py-20 text-center text-muted-foreground" colSpan={Math.max(visible.length + 1, 1)}>
                  No records matched this view. Try removing a filter or searching more broadly.
                </td>
              </tr>
            ) : null}

            {profiles.map((profile, rowIndex) => (
              <tr
                className={cn(
                  "group/row cursor-pointer transition-colors hover:bg-primary/[0.04]",
                  rowIndex % 2 === 0 ? "bg-transparent" : "bg-background/40"
                )}
                key={profile.id}
                onClick={(e) => handleRowClick(profile, e)}
              >
                {/* Row number gutter — click = open drawer, double-click does nothing special */}
                <td
                  className="sticky left-0 z-10 bg-background/[0.96] px-2 text-center text-[11px] font-medium text-muted-foreground group-hover/row:bg-primary/[0.06]"
                  style={{ height: rowHeight, minHeight: rowHeight }}
                >
                  <span className="flex h-full items-center justify-center tabular-nums">
                    {rowIndex + 1}
                  </span>
                </td>

                {/* Data cells */}
                {visible.map((field, colIndex) => {
                  const width = effectiveWidthByKey[field.key] ?? MIN_COLUMN_WIDTH;
                  const isSelected = isCellSelected(rowIndex, colIndex);
                  const isEditing = editingCell?.rowIndex === rowIndex && editingCell.fieldKey === field.key;
                  const isSaving = savingCell?.rowIndex === rowIndex && savingCell.fieldKey === field.key;

                  return (
                    <td
                      className={cn("relative px-0 py-0 align-top", isSelected && "spreadsheet-cell-selected")}
                      key={`${String(profile.id)}-${field.key}`}
                      style={{ width, minWidth: width, height: rowHeight, minHeight: rowHeight }}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          className="spreadsheet-editor h-full w-full bg-transparent px-4 py-3 text-sm outline-none"
                          onBlur={() => { void commitEditing(); }}
                          onChange={(event) => setDraftValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              void commitEditing();
                            }
                            if (event.key === "Escape") { event.preventDefault(); cancelEditing(); }
                          }}
                          value={draftValue}
                        />
                      ) : (
                        <button
                          className={cn(
                            "spreadsheet-cell focused-ring h-full w-full px-4 py-3 text-left align-top",
                            isSaving && "cursor-progress opacity-70"
                          )}
                          onClick={(event) => handleCellClick(rowIndex, colIndex, event)}
                          onDoubleClick={() => beginEditing(rowIndex, field.key)}
                          ref={(node) => { cellRefs.current[`${rowIndex}:${field.key}`] = node; }}
                          type="button"
                        >
                          <Cell
                            activeTable={activeTable}
                            field={field.key}
                            onNavigateToTable={onNavigateToTable}
                            profile={profile}
                            rowHeight={rowHeight}
                            rowLineClamp={rowLineClamp}
                            width={width}
                          />
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Expanded row (kept for future use but not currently triggered) ──
function Cell({
  activeTable,
  field,
  onNavigateToTable,
  profile,
  width,
  rowHeight,
  rowLineClamp,
}: {
  activeTable: string;
  field: ProfileFieldKey;
  onNavigateToTable?: (targetTable: string, targetFilterKey: string, targetFilterValue: string) => void;
  profile: SigmaProfile;
  width: number;
  rowHeight: number;
  rowLineClamp: number;
}) {
  const value = profile[field];
  const cellContentStyle = {
    display: "-webkit-box",
    WebkitLineClamp: rowLineClamp,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
    maxHeight: `${Math.max(rowHeight - 24, 24)}px`,
  };

  if (field === "name") {
    return (
      <div className="space-y-0.5">
        <div className="text-sm font-semibold text-foreground" style={cellContentStyle}>
          {profile.name}
        </div>
        {activeTable === "Companies" ? (
          <button
            className="text-xs text-primary hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              onNavigateToTable?.("People", "venture_name", profile.name);
            }}
            type="button"
          >
            View people
          </button>
        ) : profile.venture_name ? (
          <button
            className="text-xs text-muted-foreground hover:text-primary hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              onNavigateToTable?.("Companies", "name", String(profile.venture_name));
            }}
            type="button"
          >
            {String(profile.venture_name)}
          </button>
        ) : null}
      </div>
    );
  }

  if (field === "venture_name") {
    if (!value) return <span className="text-muted-foreground">—</span>;
    return (
      <button
        className="text-sm text-primary hover:underline"
        onClick={(e) => {
          e.stopPropagation();
          onNavigateToTable?.("Companies", "name", String(value));
        }}
        type="button"
      >
        {String(value)}
      </button>
    );
  }

  if (field === "research_status" || field === "profile_completion_status" || field === "match_status") {
    return (
      <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", statusTone(String(value)))}>
        {formatValue(value)}
      </span>
    );
  }

  if (field === "profile_completion_percentage") {
    const percentage = typeof value === "number" ? value : Number(value || 0);
    return (
      <div className="min-w-[110px]">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-semibold">{Number.isFinite(percentage) ? `${Math.round(percentage)}%` : "—"}</span>
        </div>
        <div className="h-2 rounded-full bg-secondary/85">
          <div
            className="h-2 rounded-full bg-primary"
            style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
          />
        </div>
      </div>
    );
  }

  if (field === "linkedin_url" || field === "company_url") {
    if (!value) return <span className="text-muted-foreground">—</span>;
    return (
      <a
        className="focused-ring inline-flex max-w-full items-center gap-1 rounded-lg text-primary hover:underline"
        href={String(value)}
        onClick={(event) => event.stopPropagation()}
        rel="noreferrer"
        target="_blank"
      >
        <span className="truncate">{String(value).replace(/^https?:\/\//, "")}</span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </a>
    );
  }

  if (
    field === "venture_description" ||
    field === "semantic_summary" ||
    field === "notes" ||
    field === "draft_text"
  ) {
    const previewLengthByMode =
      rowLineClamp <= 1 ? 110 : rowLineClamp <= 2 ? 220 : rowLineClamp <= 4 ? 420 : 720;
    const previewLength =
      width >= 420
        ? previewLengthByMode
        : width >= 320
          ? Math.round(previewLengthByMode * 0.75)
          : Math.round(previewLengthByMode * 0.5);
    return (
      <span className="text-muted-foreground" style={cellContentStyle}>
        {truncate(String(value || ""), previewLength)}
      </span>
    );
  }

  return (
    <span className="block" style={cellContentStyle}>
      {formatValue(value)}
    </span>
  );
}

// ── Row expand chevron for future use ──
export function ExpandChevron({ expanded }: { expanded: boolean }) {
  return (
    <ChevronDown
      className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
    />
  );
}
