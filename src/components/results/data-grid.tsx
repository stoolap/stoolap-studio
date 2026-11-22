
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  useTable,
  tableFeatures,
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  columnSizingFeature,
  columnResizingFeature,
  createSortedRowModel,
  createFilteredRowModel,
  sortFn_alphanumeric,
  sortFn_datetime,
  sortFn_text,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnResizeMode,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Copy,
  Search,
  X,
  Link2,
  Waypoints,
} from "lucide-react";
import * as native from "@/lib/native";
import { toast } from "sonner";
import { cn, errorMessage } from "@/lib/utils";
import { useModKey } from "@/hooks/use-mod-key";
import {
  isDistanceColumn,
  objectToVectorString,
  formatVectorValue,
  formatVectorExpanded,
} from "@/lib/vector-utils";
import type { ForeignKeyInfo } from "@/lib/types";
import { Tip } from "@/components/ui/tip";

/**
 * What the grid uses of the table: sorting (by column type, the "auto"
 * sort picks among these), the search over every cell, and column widths
 * the user drags. Filtering comes before the global search, sizing before
 * resizing, as the features depend on each other.
 */
/**
 * A column's starting width: its header's or its widest value's in the
 * first rows, whichever is wider, measured in the grid's own fonts (the
 * monospace one differs by system). Kept to 60–400px: a long text still
 * opens in full on a click. The user's resizing overrides it.
 */
const SAMPLE_ROWS = 100;
let measure: CanvasRenderingContext2D | null | undefined;
function columnWidth(header: string, values: string[]): number {
  measure ??= document.createElement("canvas").getContext("2d");
  if (!measure) return 150;
  // As .font-data and the header cell (.text-xs, medium) are set in globals.css
  measure.font = `13px "SF Mono", SFMono-Regular, ui-monospace, Menlo, Monaco, Consolas, monospace`;
  // Monospace: the longest value is the widest
  const longest = values.reduce((a, b) => (b.length > a.length ? b : a), "");
  const valueWidth = measure.measureText(longest).width + 24 + 2;
  measure.font = `500 14px ${getComputedStyle(document.body).fontFamily}`;
  // Its padding and room for the sort arrow
  const headerWidth = measure.measureText(header).width + 24 + 20;
  return Math.round(Math.min(400, Math.max(60, valueWidth, headerWidth)));
}

const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  columnSizingFeature,
  columnResizingFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, datetime: sortFn_datetime, text: sortFn_text },
});

interface DataGridProps {
  columns: string[];
  rows: unknown[][];
  columnTypes?: string[];
  onCellEdit?: (rowIndex: number, colIndex: number, value: string) => void;
  onDeleteRow?: (rowIndex: number) => void;
  foreignKeys?: ForeignKeyInfo[];
  onNavigateToFK?: (
    refTable: string,
    refColumn: string,
    value: unknown,
  ) => void;
  onFindSimilar?: (column: string, vectorValue: string) => void;
  serverSort?: { column: string; direction: "ASC" | "DESC" };
  onServerSort?: (column: string, direction: "ASC" | "DESC") => void;
}

function VectorHeatmap({ values }: { values: number[] }) {
  const { t } = useTranslation("editor");
  let min = Infinity,
    max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const absMax = Math.max(Math.abs(min), Math.abs(max));

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
        <span>{t("grid.dimensions", { count: values.length })}</span>
        <span>
          {t("grid.range", { min: min.toFixed(3), max: max.toFixed(3) })}
        </span>
      </div>
      {values.map((val, i) => {
        const normalized = absMax === 0 ? 0 : val / absMax;
        const hue = normalized < 0 ? 220 : 0;
        const lightness = 100 - Math.abs(normalized) * 50;
        return (
          <div key={i} className="flex items-center gap-2 h-5">
            <span className="text-xs text-muted-foreground tabular-nums w-6 text-right shrink-0">
              [{i}]
            </span>
            <div className="flex-1 h-4 rounded-sm border border-border/30 overflow-hidden relative">
              <div
                className="absolute inset-0"
                style={{ backgroundColor: `hsl(${hue}, 75%, ${lightness}%)` }}
              />
              <div
                className="absolute top-0 bottom-0 left-0 bg-foreground/10"
                style={{ width: `${Math.abs(normalized) * 100}%` }}
              />
            </div>
            <span className="text-xs font-data tabular-nums w-16 text-right shrink-0">
              {val.toFixed(4)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function DataGrid({
  columns,
  rows,
  columnTypes,
  onCellEdit,
  onDeleteRow,
  foreignKeys,
  onNavigateToFK,
  onFindSimilar,
  serverSort,
  onServerSort,
}: DataGridProps) {
  const { t } = useTranslation("editor");
  const mod = useModKey();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const columnResizeMode: ColumnResizeMode = "onChange";
  const [editingCell, setEditingCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [expandedCell, setExpandedCell] = useState<{
    row: number;
    col: number;
    value: string;
  } | null>(null);
  const [heatmapView, setHeatmapView] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [editPos, setEditPos] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ctrl+F to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        // Only if our container is focused or contains the active element
        if (
          containerRef.current?.contains(document.activeElement) ||
          containerRef.current === document.activeElement
        ) {
          e.preventDefault();
          setSearchOpen(true);
          requestAnimationFrame(() => searchInputRef.current?.focus());
        }
      }
      if (
        e.key === "Escape" &&
        searchOpen &&
        !editingCell &&
        (containerRef.current?.contains(document.activeElement) ||
          containerRef.current === document.activeElement)
      ) {
        setSearchOpen(false);
        setGlobalFilter("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchOpen, editingCell]);

  // Clean up click timer on unmount
  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  // Position and focus the overlay input when editing starts
  useEffect(() => {
    if (!editingCell || !tableContainerRef.current) {
      setEditPos(null);
      return;
    }
    const cell = tableContainerRef.current.querySelector(
      `[data-row="${editingCell.row}"][data-col="${editingCell.col}"]`,
    ) as HTMLElement | null;
    if (!cell) return;

    const scrollEl = tableContainerRef.current;
    const containerRect = scrollEl.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    setEditPos({
      top: cellRect.top - containerRect.top + scrollEl.scrollTop,
      left: cellRect.left - containerRect.left + scrollEl.scrollLeft,
      width: cellRect.width,
      height: cellRect.height,
    });

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [editingCell]);

  const commitEdit = useCallback(() => {
    if (!editingCell || !onCellEdit) {
      setEditingCell(null);
      return;
    }
    const originalValue = rows[editingCell.row]?.[editingCell.col];
    if (editValue !== String(originalValue ?? "")) {
      onCellEdit(editingCell.row, editingCell.col, editValue);
    }
    setEditingCell(null);
  }, [editingCell, editValue, onCellEdit, rows]);

  // Set of column indices that are vector types
  const vectorColSet = useMemo(() => {
    const set = new Set<number>();
    if (columnTypes) {
      columnTypes.forEach((t, i) => {
        if (t?.toUpperCase().startsWith("VECTOR")) set.add(i);
      });
    }
    return set;
  }, [columnTypes]);

  // Distance column ranges for visualization
  const distanceRanges = useMemo(() => {
    const ranges = new Map<number, { min: number; max: number }>();
    columns.forEach((col, i) => {
      if (!isDistanceColumn(col)) return;
      let min = Infinity,
        max = -Infinity;
      for (const row of rows) {
        const val = Number(row[i]);
        if (!isNaN(val) && isFinite(val)) {
          if (val < min) min = val;
          if (val > max) max = val;
        }
      }
      if (min <= max) ranges.set(i, { min, max });
    });
    return ranges;
  }, [columns, rows]);

  // Parse expanded cell's vector value into number array for heatmap
  const parsedVector = useMemo(() => {
    if (!expandedCell || !vectorColSet.has(expandedCell.col)) return null;
    const trimmed = expandedCell.value.trim();
    if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
    const parts = trimmed
      .slice(1, -1)
      .split(",")
      .map((p) => Number(p.trim()));
    if (parts.some(isNaN)) return null;
    return parts;
  }, [expandedCell, vectorColSet]);

  const formatCellValue = useCallback(
    (value: unknown, colIndex?: number): string => {
      if (value === null) return "NULL";
      if (typeof value === "boolean") return String(value);
      if (typeof value === "object") {
        // WASM returns vectors as numeric-keyed objects — convert to array notation
        const vecStr = objectToVectorString(value as Record<string, unknown>);
        if (vecStr) {
          if (colIndex !== undefined && vectorColSet.has(colIndex)) {
            return formatVectorValue(vecStr) ?? vecStr;
          }
          return vecStr;
        }
        return JSON.stringify(value);
      }
      const str = String(value);
      // Abbreviate vector values
      if (colIndex !== undefined && vectorColSet.has(colIndex)) {
        return formatVectorValue(str) ?? str;
      }
      return str;
    },
    [vectorColSet],
  );

  const fkMap = useMemo(() => {
    const map = new Map<string, ForeignKeyInfo>();
    if (foreignKeys) {
      for (const fk of foreignKeys) {
        map.set(fk.columnName, fk);
      }
    }
    return map;
  }, [foreignKeys]);

  // Number cells are right-aligned (FK cells render as links, left-aligned);
  // align their headers the same way.
  const rightAlignedCols = useMemo(
    () =>
      columns.map((col, i) => {
        if (fkMap.has(col)) return false;
        const sample = rows.find((r) => r[i] !== null)?.[i];
        return typeof sample === "number";
      }),
    [columns, rows, fkMap],
  );

  const handleCopyCellValue = useCallback((value: string) => {
    try {
      navigator.clipboard.writeText(value);
      toast.success(t("grid.cellCopied"));
    } catch {
      toast.error(t("grid.copyFailed"));
    }
  }, [t]);

  // Starting widths from the content. Not again for each page of the same
  // columns (data tabs), which would make the columns jump.
  const hasRows = rows.length > 0;
  const columnKey = columns.join("\u0000");
  const startWidths = useMemo(
    () =>
      columns.map((col, i) =>
        columnWidth(col, rows.slice(0, SAMPLE_ROWS).map((row) => formatCellValue(row[i], i))),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [columnKey, hasRows, formatCellValue],
  );

  // Stable column defs with resizing
  const columnDefs = useMemo<ColumnDef<typeof features, unknown[]>[]>(
    () =>
      columns.map((col, i) => ({
        id: String(i),
        header: col,
        accessorFn: (row) => row[i],
        size: startWidths[i] ?? 150,
        minSize: 60,
        maxSize: 600,
        cell: ({ getValue, row: tableRow }) => {
          const value = getValue();
          const isVector = vectorColSet.has(i);
          const display = formatCellValue(value, i);
          const isLong = display.length > 50 || isVector;
          const fk = fkMap.get(col);

          if (fk && value !== null && onNavigateToFK) {
            return (
              <Tip label={t("grid.goTo", { table: fk.referencedTable, column: fk.referencedColumn, value: display })} delay={700}>
                <span
                  className="flex items-center gap-1 truncate font-data text-blue-500 hover:text-blue-600 hover:underline cursor-pointer"
                  data-row={tableRow.index}
                  data-col={i}
                  onClick={() =>
                    onNavigateToFK(fk.referencedTable, fk.referencedColumn, value)
                  }
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (onCellEdit) {
                      setEditingCell({ row: tableRow.index, col: i });
                      setEditValue(value === null ? "" : String(value));
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    handleCopyCellValue(String(value));
                  }}
                >
                  {display}
                  <Link2 className="h-2.5 w-2.5 shrink-0 opacity-50" />
                </span>
              </Tip>
            );
          }

          // Distance column with color bar visualization
          const distRange = distanceRanges.get(i);
          if (distRange && typeof value === "number" && isFinite(value)) {
            const pct =
              distRange.max === distRange.min
                ? 0
                : (value - distRange.min) / (distRange.max - distRange.min);
            const hue = 120 - pct * 120; // green(120) → red(0)
            return (
              <Tip label={t("grid.distance", { value: value.toFixed(6) })} delay={700}>
                <span
                  className="flex items-center gap-1.5 font-data tabular-nums text-right"
                  data-row={tableRow.index}
                  data-col={i}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    handleCopyCellValue(String(value));
                  }}
                >
                  <span className="flex-1 text-right">{value.toFixed(4)}</span>
                  <div
                    className="h-2.5 rounded-full shrink-0"
                    style={{
                      width: `${Math.max(4, (1 - pct) * 40)}px`,
                      backgroundColor: `hsl(${hue}, 75%, 45%)`,
                      opacity: 0.8,
                    }}
                  />
                </span>
              </Tip>
            );
          }

          // Vector cells: native context menu with Copy / Find Similar / Expand
          if (isVector) {
            const rawStr =
              value === null
                ? "NULL"
                : typeof value === "object"
                  ? (objectToVectorString(value as Record<string, unknown>) ??
                    JSON.stringify(value))
                  : String(value);
            return (
              <Tip label={display} delay={700}>
                <span
                  className="block truncate cursor-default font-data text-purple-500/70"
                  data-row={tableRow.index}
                  data-col={i}
                  onClick={() => {
                    if (clickTimerRef.current)
                      clearTimeout(clickTimerRef.current);
                    clickTimerRef.current = setTimeout(() => {
                      clickTimerRef.current = null;
                      setExpandedCell({
                        row: tableRow.index,
                        col: i,
                        value: rawStr,
                      });
                    }, 250);
                  }}
                  onDoubleClick={() => {
                    if (clickTimerRef.current) {
                      clearTimeout(clickTimerRef.current);
                      clickTimerRef.current = null;
                    }
                  }}
                  onContextMenu={async (e) => {
                    e.preventDefault();
                    const menuItems: Array<{
                      id: string;
                      label: string;
                      type?: "separator" | "normal";
                    }> = [{ id: "copy", label: t("grid.copyValue") }];
                    if (onFindSimilar && value !== null) {
                      menuItems.push({
                        id: "findSimilar",
                        label: t("grid.findSimilar"),
                      });
                    }
                    menuItems.push({
                      id: "sep",
                      label: "",
                      type: "separator",
                    });
                    menuItems.push({ id: "expand", label: t("grid.expand") });

                    const selected =
                      await native.showContextMenu(menuItems);
                    if (selected === "copy") handleCopyCellValue(rawStr);
                    if (selected === "findSimilar")
                      onFindSimilar?.(columns[i], rawStr);
                    if (selected === "expand")
                      setExpandedCell({
                        row: tableRow.index,
                        col: i,
                        value: rawStr,
                      });
                  }}
                >
                  {display}
                </span>
              </Tip>
            );
          }

          return (
            <Tip label={isLong ? display : undefined} delay={700}>
              <span
                className={cn(
                  "block truncate cursor-default font-data",
                  value === null && "text-muted-foreground/60 italic",
                  typeof value === "number" && "text-right",
                  typeof value === "boolean" && "text-center",
                  onCellEdit && "cursor-text",
                )}
                data-row={tableRow.index}
                data-col={i}
                onDoubleClick={() => {
                  if (clickTimerRef.current) {
                    clearTimeout(clickTimerRef.current);
                    clickTimerRef.current = null;
                  }
                  if (onCellEdit) {
                    setEditingCell({ row: tableRow.index, col: i });
                    setEditValue(value === null ? "" : String(value));
                  }
                }}
                onClick={() => {
                  if (isLong) {
                    if (clickTimerRef.current)
                      clearTimeout(clickTimerRef.current);
                    clickTimerRef.current = setTimeout(() => {
                      clickTimerRef.current = null;
                      const rawStr =
                        value === null
                          ? "NULL"
                          : typeof value === "object"
                            ? (objectToVectorString(
                                value as Record<string, unknown>,
                              ) ?? JSON.stringify(value))
                            : String(value);
                      setExpandedCell({
                        row: tableRow.index,
                        col: i,
                        value: rawStr,
                      });
                    }, 250);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  handleCopyCellValue(value === null ? "" : String(value));
                }}
              >
                {display}
              </span>
            </Tip>
          );
        },
        sortFn: "auto",
      })),
    [
      columns,
      startWidths,
      onCellEdit,
      onFindSimilar,
      formatCellValue,
      handleCopyCellValue,
      fkMap,
      onNavigateToFK,
      vectorColSet,
      distanceRanges,
      t,
    ],
  );

  // Global filter function: search all cells
  const globalFilterFn = useCallback(
    (
      row: { getValue: (id: string) => unknown },
      _columnId: string,
      filterValue: string,
    ) => {
      if (!filterValue) return true;
      const q = filterValue.toLowerCase();
      for (let i = 0; i < columns.length; i++) {
        const val = row.getValue(String(i));
        const str = formatCellValue(val).toLowerCase();
        if (str.includes(q)) return true;
      }
      return false;
    },
    [columns.length, formatCellValue],
  );

  const table = useTable({
    features,
    data: rows,
    columns: columnDefs,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn,
    columnResizeMode,
    enableColumnResizing: true,
  });

  const tableRows = table.getRowModel().rows;

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 28,
    overscan: 20,
  });

  const handleCopy = useCallback(() => {
    const header = columns.join("\t");
    const visibleRows = tableRows.map((r) => r.original as unknown[]);
    const body = visibleRows
      .map((r) => r.map((v) => (v === null ? "" : String(v))).join("\t"))
      .join("\n");
    try {
      navigator.clipboard.writeText(`${header}\n${body}`);
      toast.success(t("grid.rowsCopied", { count: visibleRows.length }));
    } catch {
      toast.error(t("grid.copyFailed"));
    }
  }, [columns, tableRows, t]);

  if (columns.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        {t("grid.noColumns")}
      </div>
    );
  }

  const colCount = columns.length + (onDeleteRow ? 2 : 1);

  return (
    <div
      ref={containerRef}
      className="h-full flex flex-col relative"
      tabIndex={-1}
    >
      {/* Search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-2.5 py-1 border-b panel-toolbar shrink-0">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <input
            ref={searchInputRef}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            placeholder={t("grid.searchPlaceholder")}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearchOpen(false);
                setGlobalFilter("");
              }
            }}
          />
          {globalFilter && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {tableRows.length}/{rows.length}
            </span>
          )}
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              setSearchOpen(false);
              setGlobalFilter("");
            }}
            aria-label={t("grid.closeSearch")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div
        ref={tableContainerRef}
        className="overflow-auto flex-1 relative"
        onScroll={() => {
          if (editingCell) commitEdit();
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "c") {
            e.preventDefault();
            handleCopy();
          }
        }}
        tabIndex={0}
      >
        <table
          className="border-collapse text-sm"
          style={{
            width: table.getCenterTotalSize() + 60 + (onDeleteRow ? 32 : 0),
          }}
        >
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="bg-muted/80 border-b border-border">
                {/* Row number header */}
                <th className="px-2 py-1.5 text-center font-medium text-muted-foreground border-r border-border/50 text-xs w-12 bg-muted/80">
                  #
                </th>
                {onDeleteRow && (
                  <th className="w-8 bg-muted/80 border-r border-border/50" />
                )}
                {hg.headers.map((header, colIndex) => {
                  const colName = String(header.column.columnDef.header);
                  const isServerSorted =
                    serverSort && serverSort.column === colName;
                  return (
                    <th
                      key={header.id}
                      className="relative px-3 py-1.5 text-left font-medium text-foreground/80 border-r border-border/50 cursor-pointer select-none hover:bg-accent/50 whitespace-nowrap bg-muted/80 text-xs"
                      style={{ width: header.getSize() }}
                      onClick={
                        onServerSort
                          ? () => {
                              if (isServerSorted) {
                                onServerSort(
                                  colName,
                                  serverSort.direction === "ASC"
                                    ? "DESC"
                                    : "ASC",
                                );
                              } else {
                                onServerSort(colName, "ASC");
                              }
                            }
                          : header.column.getToggleSortingHandler()
                      }
                    >
                      <div
                        className={cn(
                          "flex items-center gap-1",
                          rightAlignedCols[colIndex] && "flex-row-reverse",
                        )}
                      >
                        <span className="truncate">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </span>
                        {onServerSort ? (
                          <>
                            {isServerSorted &&
                              serverSort.direction === "ASC" && (
                                <ArrowUp className="h-3 w-3 text-primary shrink-0" />
                              )}
                            {isServerSorted &&
                              serverSort.direction === "DESC" && (
                                <ArrowDown className="h-3 w-3 text-primary shrink-0" />
                              )}
                          </>
                        ) : (
                          <>
                            {header.column.getIsSorted() === "asc" && (
                              <ArrowUp className="h-3 w-3 text-primary shrink-0" />
                            )}
                            {header.column.getIsSorted() === "desc" && (
                              <ArrowDown className="h-3 w-3 text-primary shrink-0" />
                            )}
                          </>
                        )}
                      </div>
                      {/* Column resize handle */}
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          "absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none",
                          header.column.getIsResizing()
                            ? "bg-primary"
                            : "hover:bg-primary/50",
                        )}
                      />
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          {(() => {
            const virtualItems = rowVirtualizer.getVirtualItems();
            const totalSize = rowVirtualizer.getTotalSize();
            const paddingTop =
              virtualItems.length > 0 ? virtualItems[0].start : 0;
            const paddingBottom =
              virtualItems.length > 0
                ? totalSize - virtualItems[virtualItems.length - 1].end
                : 0;
            return (
              <tbody>
                {paddingTop > 0 && (
                  <tr>
                    <td
                      style={{ height: paddingTop, padding: 0 }}
                      colSpan={colCount}
                    />
                  </tr>
                )}
                {virtualItems.map((virtualRow) => {
                  const row = tableRows[virtualRow.index];
                  const isEven = virtualRow.index % 2 === 0;
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "group/row hover:bg-primary/5 border-b border-border/20",
                        isEven && "grid-row-even",
                      )}
                      style={{ height: `${virtualRow.size}px` }}
                    >
                      {/* Row number */}
                      <td className="px-2 py-1 text-center text-muted-foreground/40 border-r border-border/20 tabular-nums text-xs w-12 select-none">
                        {virtualRow.index + 1}
                      </td>
                      {/* Delete button */}
                      {onDeleteRow && (
                        <td className="w-8 text-center border-r border-border/20">
                          <Tip label={t("grid.deleteRow")}>
                            <button
                              className="opacity-0 group-hover/row:opacity-100 text-destructive/60 hover:text-destructive transition-opacity"
                              onClick={() => onDeleteRow(row.index)}
                              aria-label={t("grid.deleteRow")}
                            >
                              <Trash2 className="h-3.5 w-3.5 mx-auto" />
                            </button>
                          </Tip>
                        </td>
                      )}
                      {/* Data cells */}
                      {/* Every cell: the grid never hides a column */}
                      {row.getAllCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="px-3 py-1 border-r border-border/20 overflow-hidden"
                          style={{
                            width: cell.column.getSize(),
                            maxWidth: cell.column.getSize(),
                          }}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr>
                    <td
                      style={{ height: paddingBottom, padding: 0 }}
                      colSpan={colCount}
                    />
                  </tr>
                )}
              </tbody>
            );
          })()}
        </table>
        {/* Editing overlay (inside scroll container for correct positioning) */}
        {editingCell && editPos && (
          <input
            ref={inputRef}
            className="absolute z-20 bg-background border-2 border-primary rounded-sm px-1.5 py-0.5 text-xs font-data outline-none shadow-sm"
            style={{
              top: editPos.top,
              left: editPos.left,
              width: editPos.width,
              height: editPos.height,
            }}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") setEditingCell(null);
            }}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 px-3 py-1 border-t panel-toolbar text-xs text-muted-foreground shrink-0">
        <span className="tabular-nums">
          {globalFilter
            ? t("grid.filteredRows", { shown: tableRows.length, count: rows.length })
            : t("grid.rows", { count: rows.length })}
        </span>
        <div className="flex-1" />
        <Tip label={t("grid.searchTitle", { mod })}>
          <button
            className="flex items-center gap-1 hover:text-foreground transition-colors"
            onClick={() => {
              setSearchOpen(true);
              requestAnimationFrame(() => searchInputRef.current?.focus());
            }}
          >
            <Search className="h-3 w-3" />
            {t("grid.search")}
          </button>
        </Tip>
        <Tip label={t(globalFilter ? "grid.copyVisibleRowsTitle" : "grid.copyRowsTitle", { mod })}>
          <button
            className="flex items-center gap-1 hover:text-foreground transition-colors"
            onClick={handleCopy}
          >
            <Copy className="h-3 w-3" />
            {t("grid.copy")}
          </button>
        </Tip>
      </div>

      {/* Expanded cell overlay */}
      {expandedCell &&
        (() => {
          const isVecCell = vectorColSet.has(expandedCell.col);
          const showHeatmap = isVecCell && heatmapView && parsedVector;
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
              role="dialog"
              aria-modal="true"
              aria-label={t("grid.expandedCell", { column: columns[expandedCell.col] })}
              onClick={() => setExpandedCell(null)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setExpandedCell(null);
              }}
              tabIndex={-1}
              autoFocus
            >
              <div
                className={cn(
                  "bg-background border rounded-lg shadow-lg overflow-auto p-3 m-4",
                  showHeatmap
                    ? "max-w-xl max-h-[70vh]"
                    : "max-w-lg max-h-[60vh]",
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={cn(
                      "text-xs font-semibold uppercase tracking-wider",
                      isVecCell ? "text-purple-400" : "text-muted-foreground",
                    )}
                  >
                    {isVecCell && <Waypoints className="h-3 w-3 inline mr-1" />}
                    {columns[expandedCell.col]}
                  </span>
                  <div className="flex items-center gap-2">
                    {isVecCell && onFindSimilar && (
                      <button
                        className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
                        onClick={() => {
                          onFindSimilar(
                            columns[expandedCell.col],
                            expandedCell.value,
                          );
                          setExpandedCell(null);
                        }}
                      >
                        <Waypoints className="h-3 w-3" />
                        {t("grid.findSimilar")}
                      </button>
                    )}
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => handleCopyCellValue(expandedCell.value)}
                    >
                      <Copy className="h-3 w-3" />
                      {t("grid.copy")}
                    </button>
                  </div>
                </div>
                {/* Heatmap / Text toggle for vector cells */}
                {isVecCell && parsedVector && (
                  <div className="flex items-center gap-1 mb-2">
                    <button
                      className={cn(
                        "text-xs px-2 py-0.5 rounded",
                        heatmapView
                          ? "bg-purple-500/20 text-purple-400"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => setHeatmapView(true)}
                    >
                      {t("grid.heatmap")}
                    </button>
                    <button
                      className={cn(
                        "text-xs px-2 py-0.5 rounded",
                        !heatmapView
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => setHeatmapView(false)}
                    >
                      {t("grid.text")}
                    </button>
                  </div>
                )}
                {showHeatmap ? (
                  <div className="p-3 bg-muted/30 rounded max-h-[50vh] overflow-y-auto">
                    <VectorHeatmap values={parsedVector} />
                  </div>
                ) : (
                  <pre
                    className={cn(
                      "text-sm font-data whitespace-pre-wrap break-all p-3 bg-muted/30 rounded",
                      isVecCell && "text-purple-500/80",
                    )}
                  >
                    {isVecCell
                      ? formatVectorExpanded(expandedCell.value)
                      : expandedCell.value}
                  </pre>
                )}
              </div>
            </div>
          );
        })()}
    </div>
  );
}
