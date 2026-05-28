import { Check, SlidersHorizontal } from "lucide-react";
import type { ProfileField, ProfileFieldKey } from "../lib/types";
import { cn } from "../lib/utils";

interface FieldPickerProps {
  fields: ProfileField[];
  visibleFields: ProfileFieldKey[];
  onChange: (fields: ProfileFieldKey[]) => void;
}

export function FieldPicker({ fields, visibleFields, onChange }: FieldPickerProps) {
  function toggle(field: ProfileFieldKey) {
    if (visibleFields.includes(field)) {
      onChange(visibleFields.filter((item) => item !== field));
      return;
    }

    onChange([...visibleFields, field]);
  }

  return (
    <details className="group relative z-[120]">
      <summary className="input-shell focused-ring flex cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold">
        <SlidersHorizontal className="h-4 w-4 text-primary" />
        Fields
        <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
          {visibleFields.length}
        </span>
      </summary>

      <div className="panel-surface absolute right-0 top-full z-[140] mt-3 grid max-h-[520px] w-[320px] gap-2 rounded-[26px] p-3 shadow-2xl">
        <div className="px-2 pb-1 pt-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Visible columns</div>
          <div className="mt-1 text-sm text-muted-foreground">Choose which fields appear in the table view.</div>
        </div>

        <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
          {fields.map((field) => {
            const checked = visibleFields.includes(field.key);

            return (
              <label
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-2xl border px-3 py-3 text-sm transition-colors",
                  checked
                    ? "border-primary/25 bg-primary/10 text-foreground"
                    : "border-transparent bg-background/[0.35] text-muted-foreground hover:border-border/80 hover:bg-background/60 hover:text-foreground"
                )}
                key={field.key}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{field.label}</div>
                  <div className="text-xs text-muted-foreground">{field.sortable ? "Sortable" : "Static field"}</div>
                </div>
                <span
                  className={cn(
                    "ml-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    checked ? "border-primary/40 bg-primary text-primary-foreground" : "border-border/70 bg-background/60"
                  )}
                >
                  {checked ? <Check className="h-3 w-3" /> : null}
                </span>
                <input
                  checked={checked}
                  className="sr-only"
                  onChange={() => toggle(field.key)}
                  type="checkbox"
                />
              </label>
            );
          })}
        </div>
      </div>
    </details>
  );
}
