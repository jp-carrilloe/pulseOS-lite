import { Filter, Plus, X } from "lucide-react";
import { useState } from "react";
import type { AdvancedFilter, FilterOperator, ProfileField, ProfileFieldKey, ProfileFilters } from "../lib/types";

interface FilterBarProps {
  fields: ProfileField[];
  filters: ProfileFilters;
  onFilterChange: (key: keyof ProfileFilters, filter: AdvancedFilter | null) => void;
  onClearAll: () => void;
}

export function FilterBar({ fields, filters, onFilterChange, onClearAll }: FilterBarProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [draftField, setDraftField] = useState<ProfileFieldKey | "">("");
  const [draftOperator, setDraftOperator] = useState<FilterOperator>("contains");
  const [draftValue, setDraftValue] = useState("");

  const activeFilters = Object.entries(filters).filter(([_, filter]) => filter !== null);

  const handleAdd = () => {
    if (!draftField) return;
    onFilterChange(draftField as keyof ProfileFilters, { operator: draftOperator, value: draftValue });
    setShowAdd(false);
    setDraftField("");
    setDraftValue("");
    setDraftOperator("contains");
  };

  return (
    <div className="flex flex-col gap-2 px-1">
      <div className="flex flex-wrap items-center gap-2">
        {activeFilters.length > 0 ? (
          <div className="flex items-center gap-1.5 mr-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Filters
          </div>
        ) : null}

        {activeFilters.map(([key, filter]) => {
          const field = fields.find((f) => f.key === key);
          const filterVal = filter as AdvancedFilter;
          return (
            <div
              key={key}
              className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary transition-colors hover:border-primary/50"
            >
              <span className="font-semibold">{field?.label || key}</span>
              <span className="text-primary/70">{filterVal.operator}</span>
              <span className="font-medium max-w-[150px] truncate">"{filterVal.value}"</span>
              <button
                className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
                onClick={() => onFilterChange(key as keyof ProfileFilters, null)}
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}

        <div className="relative flex items-center gap-2">
          {showAdd ? (
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/50 px-2 py-1.5 shadow-sm">
              <select
                className="bg-transparent text-xs outline-none text-foreground"
                value={draftField}
                onChange={(e) => setDraftField(e.target.value as ProfileFieldKey)}
              >
                <option value="" disabled>Select column...</option>
                {fields.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
              <select
                className="bg-transparent text-xs outline-none text-foreground border-l border-border/50 pl-2"
                value={draftOperator}
                onChange={(e) => setDraftOperator(e.target.value as FilterOperator)}
              >
                <option value="contains">contains</option>
                <option value="eq">equals</option>
                <option value="empty">is empty</option>
                <option value="not_empty">is not empty</option>
              </select>
              {draftOperator !== "empty" && draftOperator !== "not_empty" && (
                <input
                  type="text"
                  placeholder="Value"
                  className="w-24 bg-transparent text-xs outline-none text-foreground border-l border-border/50 pl-2"
                  value={draftValue}
                  onChange={(e) => setDraftValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd();
                    if (e.key === "Escape") setShowAdd(false);
                  }}
                  autoFocus
                />
              )}
              <div className="flex items-center gap-1 border-l border-border/50 pl-2">
                <button
                  className="rounded px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
                  onClick={handleAdd}
                  disabled={!draftField}
                >
                  Apply
                </button>
                <button
                  className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-background/60"
                  onClick={() => setShowAdd(false)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ) : (
            <button
              className="flex items-center gap-1.5 rounded-full border border-dashed border-border/70 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              onClick={() => setShowAdd(true)}
              type="button"
            >
              <Plus className="h-3.5 w-3.5" />
              Add filter
            </button>
          )}

          {activeFilters.length > 0 && !showAdd && (
            <button
              className="rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-destructive"
              onClick={onClearAll}
              type="button"
            >
              Clear all
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
