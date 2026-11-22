import type { ComponentProps, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tip } from "@/components/ui/tip";
import { cn } from "@/lib/utils";
import { DATA_TYPES, VECTOR_DIM_PRESETS } from "@/lib/constants";

// The column list of Create Table and Edit Table: one rounded list, its rows
// parted by thin lines, as the system's own settings lists. Fields in the
// cells show a border only when pointed at or focused.

/** The list: a header row, then the rows */
export function ColumnList({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
      <div className="border-b border-border/70 bg-muted/40 text-xs text-muted-foreground">{header}</div>
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  );
}

/** A field in a cell: no border until pointed at or focused */
export function CellInput({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <Input
      className={cn(
        "h-7 rounded-md border-transparent bg-transparent px-2 text-sm font-data shadow-none dark:bg-transparent",
        "hover:border-input focus-visible:border-ring focus-visible:ring-[2px]",
        "disabled:opacity-100 disabled:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** The column's type, as a borderless menu */
export function TypeSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (type: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        size="sm"
        className="h-7 w-full border-transparent bg-transparent px-2 font-data text-xs shadow-none hover:border-input dark:bg-transparent dark:hover:bg-transparent disabled:opacity-100 disabled:text-muted-foreground"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DATA_TYPES.map((type) => (
          <SelectItem key={type} value={type} className="font-data text-xs">
            {type}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A constraint (PK, NN…) as a small tag that turns on and off; its full name
 *  in a tooltip. Without onChange it only shows, when on. */
export function Flag({
  label,
  name,
  on,
  onChange,
  disabled,
}: {
  label: string;
  name: string;
  on: boolean;
  onChange?: (on: boolean) => void;
  disabled?: boolean;
}) {
  const look = cn(
    "inline-flex h-5 min-w-7 items-center justify-center rounded px-1 font-data text-[10px] font-semibold tracking-wide",
    on ? "bg-primary/15 text-primary" : "text-muted-foreground/50",
  );
  if (!onChange) {
    return on ? (
      <Tip label={name}>
        <span className={look}>{label}</span>
      </Tip>
    ) : null;
  }
  return (
    <Tip label={name}>
      <button
        type="button"
        aria-pressed={on}
        aria-label={name}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={cn(
          look,
          "transition-colors disabled:pointer-events-none disabled:opacity-30",
          on ? "hover:bg-primary/25" : "hover:bg-foreground/10 hover:text-foreground",
        )}
      >
        {label}
      </button>
    </Tip>
  );
}

/** A row's settings that only some columns have (a vector's size, a foreign
 *  key), under it, indented to the name */
export function RowDetail({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 pb-2 pl-3 pr-2 text-xs">{children}</div>;
}

/** The SQL that will run, folded away until asked for */
export function SqlPreview({ label, sql }: { label: string; sql: string }) {
  return (
    <details className="group">
      <summary className="inline-flex cursor-default list-none items-center gap-1 text-xs text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
        {label}
      </summary>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border/70 bg-muted/40 p-3 font-mono text-xs">
        {sql}
      </pre>
    </details>
  );
}

/** A vector column's size: typed, or picked from the usual ones */
export function VectorSize({
  label,
  placeholder,
  value,
  onChange,
  disabled,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (dims: string) => void;
  disabled?: boolean;
}) {
  return (
    <RowDetail>
      <span className="text-muted-foreground">{label}</span>
      <Input
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className="h-7 w-20 font-data text-xs md:text-xs"
      />
      {!disabled &&
        VECTOR_DIM_PRESETS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onChange(String(d))}
            className={cn(
              "h-6 rounded px-1.5 font-data transition-colors",
              value === String(d)
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
            )}
          >
            {d}
          </button>
        ))}
    </RowDetail>
  );
}
