"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnResizeMode,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Copy,
  Search,
  X,
  Link2,
  Waypoints,
  Expand,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useModKey } from "@/hooks/use-mod-key";
import {
  isDistanceColumn,
  objectToVectorString,
  formatVectorValue,
  formatVectorExpanded,
} from "@/lib/vector-utils";
import type { ForeignKeyInfo } from "@/lib/types";

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
  let min = Infinity,
    max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const absMax = Math.max(Math.abs(min), Math.abs(max));

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2">
        <span>{values.length} dimensions</span>
        <span>
          Range: [{min.toFixed(3)}, {max.toFixed(3)}]
        </span>
      </div>
      {values.map((val, i) => {
        const normalized = absMax === 0 ? 0 : val / absMax;
        const hue = normalized < 0 ? 220 : 0;
        const lightness = 100 - Math.abs(normalized) * 50;
        return (
          <div key={i} className="flex items-center gap-2 h-5">
            <span className="text-[10px] text-muted-foreground tabular-nums w-6 text-right shrink-0">
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
            <span className="text-[10px] font-data tabular-nums w-16 text-right shrink-0">
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

  const handleCopyCellValue = useCallback((value: string) => {
    try {
      navigator.clipboard.writeText(value);
      toast.success("Cell value copied");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }, []);

  // Stable column defs with resizing
  const columnDefs = useMemo<ColumnDef<unknown[]>[]>(
    () =>
      columns.map((col, i) => ({
        id: String(i),
        header: col,
        accessorFn: (row) => row[i],
        size: 150,
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
              <span
                className="flex items-center gap-1 truncate font-data text-blue-500 hover:text-blue-600 hover:underline cursor-pointer"
                data-row={tableRow.index}
                data-col={i}
                title={`Go to ${fk.referencedTable}.${fk.referencedColumn} = ${display}`}
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
              <span
                className="flex items-center gap-1.5 font-data tabular-nums text-right"
                data-row={tableRow.index}
                data-col={i}
                title={`Distance: ${value.toFixed(6)}`}
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
            );
          }

          // Vector cells: context menu with Copy / Find Similar / Expand
          if (isVector) {
            const rawStr =
              value === null
                ? "NULL"
                : typeof value === "object"
                  ? (objectToVectorString(value as Record<string, unknown>) ??
                    JSON.stringify(value))
                  : String(value);
            return (
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <span
                    className="block truncate cursor-default font-data text-purple-500/70"
                    data-row={tableRow.index}
                    data-col={i}
                    title={display}
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
                  >
                    {display}
                  </span>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => handleCopyCellValue(rawStr)}>
                    <Copy className="h-3.5 w-3.5 mr-2" />
                    Copy Value
                  </ContextMenuItem>
                  {onFindSimilar && value !== null && (
                    <ContextMenuItem
                      onClick={() => onFindSimilar(columns[i], rawStr)}
                    >
                      <Waypoints className="h-3.5 w-3.5 mr-2 text-purple-400" />
                      Find Similar
                    </ContextMenuItem>
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={() =>
                      setExpandedCell({
                        row: tableRow.index,
                        col: i,
                        value: rawStr,
                      })
                    }
                  >
                    <Expand className="h-3.5 w-3.5 mr-2" />
                    Expand
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          }

          return (
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
              title={isLong ? display : undefined}
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
          );
        },
        sortingFn: "auto",
      })),
    [
      columns,
      onCellEdit,
      onFindSimilar,
      formatCellValue,
      handleCopyCellValue,
      fkMap,
      onNavigateToFK,
      vectorColSet,
      distanceRanges,
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

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
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
      toast.success(`Copied ${visibleRows.length} rows`);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }, [columns, tableRows]);

  if (columns.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        No columns to display
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
        <div className="flex items-center gap-2 px-3 py-1.5 border-b panel-toolbar shrink-0">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            ref={searchInputRef}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            placeholder="Search in results..."
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
            aria-label="Close search"
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
                {hg.headers.map((header) => {
                  const colName = String(header.column.columnDef.header);
                  const isServerSorted =
                    serverSort && serverSort.column === colName;
                  return (
                    <th
                      key={header.id}
                      className="relative px-3 py-1.5 text-left font-medium text-foreground/80 border-r border-border/50 cursor-pointer select-none hover:bg-accent/50 whitespace-nowrap bg-muted/80"
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
                      <div className="flex items-center gap-1">
                        <span className="text-sm truncate">
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
                          <button
                            className="opacity-0 group-hover/row:opacity-100 text-destructive/60 hover:text-destructive transition-opacity"
                            onClick={() => onDeleteRow(row.index)}
                            title="Delete row"
                            aria-label="Delete row"
                          >
                            <Trash2 className="h-3.5 w-3.5 mx-auto" />
                          </button>
                        </td>
                      )}
                      {/* Data cells */}
                      {row.getVisibleCells().map((cell) => (
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
            ? `${tableRows.length} of ${rows.length} row${rows.length !== 1 ? "s" : ""}`
            : `${rows.length} row${rows.length !== 1 ? "s" : ""}`}
        </span>
        <div className="flex-1" />
        <button
          className="flex items-center gap-1 hover:text-foreground transition-colors"
          onClick={() => {
            setSearchOpen(true);
            requestAnimationFrame(() => searchInputRef.current?.focus());
          }}
          title={`Search (${mod}+F)`}
        >
          <Search className="h-3 w-3" />
          Search
        </button>
        <button
          className="flex items-center gap-1 hover:text-foreground transition-colors"
          onClick={handleCopy}
          title={`Copy${globalFilter ? " visible" : ""} rows as TSV (${mod}+C)`}
        >
          <Copy className="h-3 w-3" />
          Copy
        </button>
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
              aria-label={`Expanded cell: ${columns[expandedCell.col]}`}
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
                        Find Similar
                      </button>
                    )}
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => handleCopyCellValue(expandedCell.value)}
                    >
                      <Copy className="h-3 w-3" />
                      Copy
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
                      Heatmap
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
                      Text
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
