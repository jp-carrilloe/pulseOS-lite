import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, SetStateAction } from "react";
import type { ProfileField, ProfileFieldKey, SigmaProfile, SortDirection } from "../lib/types";
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
  onSort: (field: string) => void;
  onProfileSelect: (profile: SigmaProfile) => void;
  onCellUpdate: (rowId: string | number, field: string, value: unknown) => Promise<void>;
  columnWidths: ColumnWidths;
  onColumnWidthsChange: Dispatch<SetStateAction<ColumnWidths>>;
  rowHeight: number;
  onRowHeightChange: (height: number) => void;
}

const MIN_COLUMN_WIDTH = 120;
const MIN_ROW_HEIGHT = 60;
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
    endCol: Math.max(0, Math.min(maxCols - 1, range.endCol))
  };
}

function normalizeRange(range: CellRange): CellRange {
  return {
    startRow: Math.min(range.startRow, range.endRow),
    endRow: Math.max(range.startRow, range.endRow),
    startCol: Math.min(range.startCol, range.endCol),
    endCol: Math.max(range.startCol, range.endCol)
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
  onRowHeightChange
}: ProfileTableProps) {
  const [resizingField, setResizingField] = useState<ProfileFieldKey | null>(null);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [savingCell, setSavingCell] = useState<CellPosition | null>(null);
  const [selection, setSelection] = useState<CellRange | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | number | null>(null);
  const resizeStateRef = useRef<{ field: ProfileFieldKey; startX: number; startWidth: number } | null>(null);
  const rowResizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const visible = useMemo(() => fields.filter((field) => visibleFields.includes(field.key)), [fields, visibleFields]);
  const rowLineClamp = getLineClampForRowHeight(rowHeight);

  useEffect(() => {
    resizeStateRef.current = null;
    rowResizeStateRef.current = null;
    setEditingCell(null);
    setSavingCell(null);
    setSelection(null);
    setExpandedRowId(null);
  }, [activeTable]);

  useEffect(() => {
    if (!resizingField) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;

      const delta = event.clientX - resizeState.startX;
      const nextWidth = Math.max(MIN_COLUMN_WIDTH, resizeState.startWidth + delta);

      onColumnWidthsChange((current) => ({
        ...current,
        [resizeState.field]: nextWidth
      }));
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
      const resizeState = rowResizeStateRef.current;
      if (!resizeState) return;

      const delta = event.clientY - resizeState.startY;
      const nextHeight = Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, resizeState.startHeight + delta));
      onRowHeightChange(nextHeight);
    };

    const stopResizing = () => {
      if (!rowResizeStateRef.current) {
        return;
      }

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

  const tableWidth = visible.reduce((sum, field) => sum + Math.max(MIN_COLUMN_WIDTH, columnWidths[field.key] ?? 0), 0);

  const focusCell = (rowIndex: number, fieldKey: ProfileFieldKey) => {
    const refKey = `${rowIndex}:${fieldKey}`;
    cellRefs.current[refKey]?.focus();
  };

  const setSingleCellSelection = (rowIndex: number, colIndex: number) => {
    setSelection({
      startRow: rowIndex,
      endRow: rowIndex,
      startCol: colIndex,
      endCol: colIndex
    });
  };

  const startColumnResizing = (event: ReactPointerEvent<HTMLSpanElement>, field: ProfileFieldKey) => {
    event.preventDefault();
    event.stopPropagation();

    resizeStateRef.current = {
      field,
      startX: event.clientX,
      startWidth: columnWidths[field] ?? MIN_COLUMN_WIDTH
    };

    setResizingField(field);
    document.body.classList.add("is-column-resizing");
  };

  const startRowResizing = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    rowResizeStateRef.current = {
      startY: event.clientY,
      startHeight: rowHeight
    };
    document.body.classList.add("is-row-resizing");
  };

  const beginEditing = (rowIndex: number, fieldKey: ProfileFieldKey) => {
    const row = profiles[rowIndex];
    if (!row) return;

    const value = row[fieldKey];
    if (!isEditableValue(value)) return;

    setEditingCell({ rowIndex, fieldKey });
    setDraftValue(value == null ? "" : String(value));
    setSingleCellSelection(rowIndex, visible.findIndex((field) => field.key === fieldKey));
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setDraftValue("");
  };

  const commitEditing = async () => {
    if (!editingCell) return;
    const row = profiles[editingCell.rowIndex];
    if (!row) {
      cancelEditing();
      return;
    }

    const currentValue = row[editingCell.fieldKey];
    const nextValue = draftValue === "" ? null : draftValue;
    if (String(currentValue ?? "") === String(nextValue ?? "")) {
      cancelEditing();
      return;
    }

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
    const nextRange = selection
      ? normalizeRange({
          startRow: selection.startRow,
          endRow: rowIndex,
          startCol: selection.startCol,
          endCol: colIndex
        })
      : { startRow: rowIndex, endRow: rowIndex, startCol: colIndex, endCol: colIndex };

    if (event.shiftKey && selection) {
      setSelection(clampCellRange(nextRange, profiles.length, visible.length));
    } else {
      setSingleCellSelection(rowIndex, colIndex);
    }
  };

  const handleGridKeyDown = async (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!selection || profiles.length === 0 || visible.length === 0) {
      return;
    }

    if (editingCell) {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelEditing();
      }
      return;
    }

    const normalized = normalizeRange(selection);
    let nextRow = normalized.endRow;
    let nextCol = normalized.endCol;

    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        nextRow -= 1;
        break;
      case "ArrowDown":
        event.preventDefault();
        nextRow += 1;
        break;
      case "ArrowLeft":
        event.preventDefault();
        nextCol -= 1;
        break;
      case "ArrowRight":
        event.preventDefault();
        nextCol += 1;
        break;
      case "Tab":
        event.preventDefault();
        nextCol += event.shiftKey ? -1 : 1;
        break;
      case "Enter":
        event.preventDefault();
        if (event.shiftKey) {
          nextRow -= 1;
        } else {
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
          {
            startRow: normalized.startRow,
            endRow: clampedRow,
            startCol: normalized.startCol,
            endCol: clampedCol
          },
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
    return rowIndex >= range.startRow && rowIndex <= range.endRow && colIndex >= range.startCol && colIndex <= range.endCol;
  };

  const toggleRowExpansion = (rowId: string | number) => {
    setExpandedRowId((current) => (String(current) === String(rowId) ? null : rowId));
  };

  return (
    <div
      className="panel-surface spreadsheet-shell overflow-hidden rounded-[30px]"
      onKeyDown={handleGridKeyDown}
      ref={gridRef}
      tabIndex={0}
    >
      <div className="relative overflow-x-auto overflow-y-auto">
        <table className="text-left text-sm" style={{ width: `${Math.max(tableWidth, 980)}px`, minWidth: `${Math.max(tableWidth, 980)}px` }}>
          <colgroup>
            <col style={{ width: "52px" }} />
            {visible.map((field) => (
              <col key={field.key} style={{ width: `${Math.max(MIN_COLUMN_WIDTH, columnWidths[field.key] ?? MIN_COLUMN_WIDTH)}px` }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10 border-b border-border/70 bg-background/[0.92] text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-xl">
            <tr>
              <th className="group/row-gutter sticky left-0 z-20 border-r border-border/70 bg-background/[0.96] px-0 py-0">
                <div className="relative flex h-full min-h-[57px] items-center justify-center">
                  <span className="text-[10px] font-semibold tracking-[0.16em]">Rows</span>
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-3 translate-y-1/2 cursor-row-resize row-boundary-handle"
                    onPointerDown={startRowResizing}
                  />
                </div>
              </th>
              {visible.map((field) => {
                const width = Math.max(MIN_COLUMN_WIDTH, columnWidths[field.key] ?? MIN_COLUMN_WIDTH);

                return (
                  <th className="group/table-header relative px-4 py-4 font-semibold" key={field.key} style={{ width }}>
                    <div className="flex items-center justify-between gap-3">
                      <button
                        className={cn(
                          "focused-ring inline-flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-left",
                          field.sortable ? "cursor-pointer hover:text-foreground" : "cursor-default"
                        )}
                        disabled={!field.sortable}
                        onClick={() => onSort(field.key)}
                        type="button"
                      >
                        <span className="truncate">{field.label}</span>
                        {field.sortable && sortBy !== field.key ? <ArrowUpDown className="h-3.5 w-3.5 shrink-0" /> : null}
                        {field.sortable && sortBy === field.key && sortDirection === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5 shrink-0" />
                        ) : null}
                        {field.sortable && sortBy === field.key && sortDirection === "desc" ? (
                          <ArrowDown className="h-3.5 w-3.5 shrink-0" />
                        ) : null}
                      </button>

                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute inset-y-2 right-0 z-20 w-3 -translate-x-1/2 cursor-col-resize rounded-full transition",
                          "before:absolute before:inset-y-1 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border before:content-['']",
                          "group-hover/table-header:before:bg-primary/40 hover:before:bg-primary/80",
                          resizingField === field.key && "before:bg-primary"
                        )}
                        onPointerDown={(event) => startColumnResizing(event, field.key)}
                      />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {profiles.length === 0 ? (
              <tr>
                <td className="px-5 py-20 text-center text-muted-foreground" colSpan={Math.max(visible.length + 1, 1)}>
                  No records matched this view. Try removing a filter or searching more broadly.
                </td>
              </tr>
            ) : null}
            {profiles.map((profile, rowIndex) => (
              <>
                <tr
                  className={cn(
                    "group border-b border-border/50 transition-colors",
                    rowIndex % 2 === 0 ? "bg-transparent" : "bg-background/40"
                  )}
                  key={profile.id}
                >
                  <td
                    className="sticky left-0 z-10 border-r border-border/70 bg-background/[0.96] px-2 text-center text-[11px] font-medium text-muted-foreground"
                    style={{ height: rowHeight, minHeight: rowHeight }}
                  >
                    <div className="flex items-center gap-1">
                      <button
                        aria-expanded={String(expandedRowId) === String(profile.id)}
                        aria-label={`${String(expandedRowId) === String(profile.id) ? "Collapse" : "Expand"} row ${rowIndex + 1}`}
                        className="focused-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-primary/8 hover:text-foreground"
                        onClick={() => toggleRowExpansion(profile.id)}
                        type="button"
                      >
                        {String(expandedRowId) === String(profile.id) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        className="focused-ring min-w-0 flex-1 rounded-md py-1 hover:bg-primary/8 hover:text-foreground"
                        onClick={() => onProfileSelect(profile)}
                        type="button"
                      >
                        {rowIndex + 1}
                      </button>
                    </div>
                  </td>
                  {visible.map((field, colIndex) => {
                    const width = Math.max(MIN_COLUMN_WIDTH, columnWidths[field.key] ?? MIN_COLUMN_WIDTH);
                    const isSelected = isCellSelected(rowIndex, colIndex);
                    const isEditing = editingCell?.rowIndex === rowIndex && editingCell.fieldKey === field.key;
                    const isSaving = savingCell?.rowIndex === rowIndex && savingCell.fieldKey === field.key;

                    return (
                      <td
                        className={cn(
                          "relative px-0 py-0 align-top",
                          isSelected && "spreadsheet-cell-selected"
                        )}
                        key={`${profile.id}-${field.key}`}
                        style={{ width, minWidth: width, height: rowHeight, minHeight: rowHeight }}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            className="spreadsheet-editor h-full w-full bg-transparent px-4 py-3 text-sm outline-none"
                            onBlur={() => {
                              void commitEditing();
                            }}
                            onChange={(event) => setDraftValue(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                void commitEditing();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelEditing();
                              }
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
                            ref={(node) => {
                              cellRefs.current[`${rowIndex}:${field.key}`] = node;
                            }}
                            type="button"
                          >
                            <Cell field={field.key} profile={profile} rowHeight={rowHeight} rowLineClamp={rowLineClamp} width={width} />
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
                {String(expandedRowId) === String(profile.id) ? (
                  <tr className="border-b border-border/50 bg-primary/[0.04]" key={`${profile.id}-expanded`}>
                    <td className="sticky left-0 z-10 border-r border-border/70 bg-background/[0.98] px-3 py-4 align-top">
                      <div className="space-y-2 text-left">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Expanded
                        </div>
                        <button
                          className="focused-ring inline-flex rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/30 hover:bg-primary/[0.08]"
                          onClick={() => onProfileSelect(profile)}
                          type="button"
                        >
                          Open drawer
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-4" colSpan={visible.length}>
                      <ExpandedRow profile={profile} />
                    </td>
                  </tr>
                ) : null}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpandedRow({ profile }: { profile: SigmaProfile }) {
  const priorityFields: Array<{ key: ProfileFieldKey; label: string }> = [
    { key: "venture_description", label: "Description" },
    { key: "semantic_summary", label: "Summary" },
    { key: "draft_text", label: "Draft" },
    { key: "notes", label: "Notes" }
  ];

  const populatedPriorityFields = priorityFields.filter(({ key }) => {
    const value = profile[key];
    return value != null && String(value).trim() !== "";
  });

  const compactFields: Array<{ key: ProfileFieldKey; label: string }> = [
    { key: "research_status", label: "Research" },
    { key: "profile_completion_status", label: "Completion" },
    { key: "match_status", label: "Match" },
    { key: "stage", label: "Stage" },
    { key: "category", label: "Category" },
    { key: "region", label: "Region" },
    { key: "city", label: "City" },
    { key: "linkedin_url", label: "LinkedIn" },
    { key: "company_url", label: "Website" }
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-semibold text-foreground">{profile.name || "Untitled record"}</div>
        {profile.venture_name ? (
          <span className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">
            {profile.venture_name}
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {compactFields.map(({ key, label }) => (
          <section className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3" key={key}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
            <div className="mt-2 break-words text-sm leading-6 text-foreground">{formatValue(profile[key])}</div>
          </section>
        ))}
      </div>

      {populatedPriorityFields.length > 0 ? (
        <div className="grid gap-3">
          {populatedPriorityFields.map(({ key, label }) => (
            <section className="rounded-2xl border border-border/60 bg-background/70 px-4 py-4" key={key}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground">{formatValue(profile[key])}</div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Cell({
  field,
  profile,
  width,
  rowHeight,
  rowLineClamp
}: {
  field: ProfileFieldKey;
  profile: SigmaProfile;
  width: number;
  rowHeight: number;
  rowLineClamp: number;
}) {
  const value = profile[field];
  const textClamp = rowLineClamp;
  const cellContentStyle = {
    display: "-webkit-box",
    WebkitLineClamp: textClamp,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
    maxHeight: `${Math.max(rowHeight - 24, 24)}px`
  };

  if (field === "name") {
    return (
      <div className="space-y-1">
        <div className="text-sm font-semibold text-foreground" style={cellContentStyle}>
          {profile.name}
        </div>
        {profile.venture_name ? <div className="text-xs text-muted-foreground">Founder profile</div> : null}
      </div>
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
          <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }} />
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

  if (field === "venture_description" || field === "semantic_summary" || field === "notes" || field === "draft_text") {
    const previewLengthByMode =
      rowLineClamp <= 1 ? 110 : rowLineClamp <= 2 ? 220 : rowLineClamp <= 4 ? 420 : 720;
    const previewLength = width >= 420 ? previewLengthByMode : width >= 320 ? Math.round(previewLengthByMode * 0.75) : Math.round(previewLengthByMode * 0.5);
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
