"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnectionStore } from "@/stores/connection-store";
import { useEditorStore } from "@/stores/editor-store";
import { useTableForeignKeys } from "@/hooks/use-schema";
import { DataGrid } from "@/components/results/data-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Table2,
  Filter,
  X,
  Trash2,
  Download,
  Upload,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn, downloadFile, escapeCSV } from "@/lib/utils";
import * as api from "@/lib/api-client";
import type { FilterCondition } from "@/lib/api-client";
import type { ColumnInfo } from "@/lib/types";
import { ConfirmDialog } from "@/components/dialogs/confirm-dialog";
import { VectorSearchDialog } from "@/components/dialogs/vector-search-dialog";
import { RowEditorDialog } from "./row-editor";

const OPERATORS = [
  { value: "eq", label: "=" },
  { value: "neq", label: "!=" },
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "like", label: "LIKE" },
  { value: "nlike", label: "NOT LIKE" },
  { value: "null", label: "IS NULL" },
  { value: "nnull", label: "IS NOT NULL" },
  { value: "in", label: "IN" },
];

const VECTOR_OPERATORS = [
  { value: "cosine", label: "Cosine dist <" },
  { value: "l2", label: "L2 dist <" },
  { value: "ip", label: "IP dist <" },
];

const NO_VALUE_OPS = new Set(["null", "nnull"]);
const VEC_OPS = new Set(["cosine", "l2", "ip"]);

interface FilterRow {
  id: number;
  column: string;
  operator: string;
  value: string;
}

let nextFilterId = 0;

function newFilter(column: string): FilterRow {
  return { id: ++nextFilterId, column, operator: "eq", value: "" };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

interface TableViewerProps {
  table: string;
  columns: ColumnInfo[];
  initialFilter?: { column: string; value: string };
}

export function TableViewer({
  table,
  columns,
  initialFilter,
}: TableViewerProps) {
  const activeId = useConnectionStore((s) => s.activeId);
  const addDataTab = useEditorStore((s) => s.addDataTab);
  const { data: foreignKeys } = useTableForeignKeys(table);
  const [offset, setOffset] = useState(0);
  const [orderBy, setOrderBy] = useState<string | undefined>();
  const [orderDir, setOrderDir] = useState<"ASC" | "DESC">("ASC");
  const [insertOpen, setInsertOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
  const [appliedFilters, setAppliedFilters] = useState<FilterCondition[]>([]);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [showTimeTravel, setShowTimeTravel] = useState(false);
  const [asOfTimestamp, setAsOfTimestamp] = useState("");
  const [appliedAsOf, setAppliedAsOf] = useState<string | undefined>();
  const [limit, setLimit] = useState(100);
  const [vecSearchOpen, setVecSearchOpen] = useState(false);
  const [vecSearchProps, setVecSearchProps] = useState<{
    column?: string;
    vector?: string;
  }>({});
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

  const vectorColumns = useMemo(() => {
    const set = new Set<string>();
    for (const c of columns) {
      if (c.type.toUpperCase().startsWith("VECTOR")) set.add(c.field);
    }
    return set;
  }, [columns]);

  // Apply initial filter from FK navigation
  useEffect(() => {
    if (initialFilter) {
      const f = newFilter(initialFilter.column);
      f.value = initialFilter.value;
      setFilterRows([f]);
      setAppliedFilters([
        {
          column: initialFilter.column,
          operator: "eq",
          value: initialFilter.value,
        },
      ]);
      setShowFilters(true);
    }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    data,
    isLoading,
    error: fetchError,
    refetch,
  } = useQuery({
    queryKey: [
      "tableData",
      activeId,
      table,
      offset,
      limit,
      orderBy,
      orderDir,
      appliedFilters,
      appliedAsOf,
    ],
    queryFn: () =>
      api.fetchTableData(
        activeId!,
        table,
        offset,
        limit,
        orderBy,
        orderDir,
        appliedFilters.length > 0 ? appliedFilters : undefined,
        appliedAsOf,
      ),
    enabled: !!activeId,
  });

  const pkColumn = columns.find((c) => c.key === "PRI");

  const handleCellEdit = useCallback(
    async (rowIndex: number, colIndex: number, value: string) => {
      if (!activeId || !data || !pkColumn) return;
      const colName = data.columns[colIndex];
      // Skip inline edit for vector columns
      const colInfo = columns.find((c) => c.field === colName);
      if (colInfo?.type.toUpperCase().startsWith("VECTOR")) return;
      const pkIdx = data.columns.indexOf(pkColumn.field);
      if (pkIdx === -1) return;
      const pkValue = data.rows[rowIndex][pkIdx];
      try {
        await api.updateRow(activeId, table, pkColumn.field, pkValue, {
          [colName]: value === "" ? null : value,
        });
        refetch();
        toast.success("Row updated");
      } catch (e) {
        toast.error("Update failed", {
          description: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
    [activeId, data, pkColumn, table, columns, refetch],
  );

  const handleDeleteRow = useCallback((rowIndex: number) => {
    setPendingDeleteRow(rowIndex);
  }, []);

  const doDeleteRow = useCallback(async () => {
    if (pendingDeleteRow === null || !activeId || !data || !pkColumn) return;
    const pkIdx = data.columns.indexOf(pkColumn.field);
    if (pkIdx === -1) return;
    const pkValue = data.rows[pendingDeleteRow][pkIdx];
    try {
      await api.deleteRow(activeId, table, pkColumn.field, pkValue);
      refetch();
      toast.success("Row deleted");
    } catch (e) {
      toast.error("Delete failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
    setPendingDeleteRow(null);
  }, [pendingDeleteRow, activeId, data, pkColumn, table, refetch]);

  const handleInsert = useCallback(
    async (row: Record<string, unknown>) => {
      if (!activeId) return;
      await api.insertRow(activeId, table, row);
      setOffset(0);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["tableData", activeId] });
      toast.success("Row inserted");
    },
    [activeId, table, refetch, queryClient],
  );

  const handleServerSort = useCallback(
    (column: string, direction: "ASC" | "DESC") => {
      setOrderBy(column);
      setOrderDir(direction);
      setOffset(0);
    },
    [],
  );

  const handleNavigateFK = useCallback(
    (refTable: string, refColumn: string, value: unknown) => {
      addDataTab(refTable, {
        column: refColumn,
        value: String(value ?? ""),
      });
    },
    [addDataTab],
  );

  const handleFindSimilar = useCallback(
    (column: string, vectorValue: string) => {
      setVecSearchProps({ column, vector: vectorValue });
      setVecSearchOpen(true);
    },
    [],
  );

  const addFilter = () => {
    const firstCol = columns[0]?.field ?? "";
    const f = newFilter(firstCol);
    if (vectorColumns.has(firstCol)) f.operator = "cosine";
    setFilterRows((prev) => [...prev, f]);
    if (!showFilters) setShowFilters(true);
  };

  const updateFilter = (id: number, updates: Partial<FilterRow>) => {
    setFilterRows((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    );
  };

  const removeFilter = (id: number) => {
    setFilterRows((prev) => prev.filter((f) => f.id !== id));
  };

  const applyFilters = () => {
    const valid = filterRows
      .filter((f) => {
        if (!f.column) return false;
        if (NO_VALUE_OPS.has(f.operator)) return true;
        if (VEC_OPS.has(f.operator)) {
          const pipeIdx = f.value.lastIndexOf("|");
          if (pipeIdx === -1) return false;
          return (
            f.value.substring(0, pipeIdx).trim() !== "" &&
            f.value.substring(pipeIdx + 1).trim() !== ""
          );
        }
        return f.value.trim() !== "";
      })
      .map((f) => ({
        column: f.column,
        operator: f.operator,
        value: f.value,
      }));
    setAppliedFilters(valid);
    setOffset(0);
  };

  const clearFilters = () => {
    setFilterRows([]);
    setAppliedFilters([]);
    setOffset(0);
  };

  const hasUnappliedChanges = useMemo(() => {
    const pending = filterRows
      .filter((f) => {
        if (!f.column) return false;
        if (NO_VALUE_OPS.has(f.operator)) return true;
        if (VEC_OPS.has(f.operator)) {
          const pipeIdx = f.value.lastIndexOf("|");
          if (pipeIdx === -1) return false;
          return (
            f.value.substring(0, pipeIdx).trim() !== "" &&
            f.value.substring(pipeIdx + 1).trim() !== ""
          );
        }
        return f.value.trim() !== "";
      })
      .map((f) => ({ column: f.column, operator: f.operator, value: f.value }));
    if (pending.length !== appliedFilters.length) return true;
    return pending.some(
      (p, i) =>
        p.column !== appliedFilters[i].column ||
        p.operator !== appliedFilters[i].operator ||
        p.value !== appliedFilters[i].value,
    );
  }, [filterRows, appliedFilters]);

  const handleExportCSV = () => {
    if (!data) return;
    const header = data.columns.map(escapeCSV).join(",");
    const rows = data.rows.map((r) => r.map(escapeCSV).join(","));
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    downloadFile(
      [header, ...rows].join("\n"),
      `${table}_${ts}.csv`,
      "text/csv",
    );
  };

  const handleExportJSON = () => {
    if (!data) return;
    const objs = data.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      data.columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    downloadFile(
      JSON.stringify(objs, null, 2),
      `${table}_${ts}.json`,
      "application/json",
    );
  };

  const handleExportAllCSV = async () => {
    if (!activeId) return;
    const EXPORT_LIMIT = 100_000;
    const PAGE_SIZE = 10_000;
    const exportTarget = Math.min(totalRows, EXPORT_LIMIT);

    if (exportTarget > 10_000) {
      const ok = window.confirm(
        `This will export ${exportTarget.toLocaleString()} rows${totalRows > EXPORT_LIMIT ? ` (capped at ${EXPORT_LIMIT.toLocaleString()})` : ""}. Large exports may take a while. Continue?`,
      );
      if (!ok) return;
    }
    try {
      toast.info("Exporting all rows...");
      const filters = appliedFilters.length > 0 ? appliedFilters : undefined;
      // Build CSV incrementally as Blob parts to avoid holding all rows in memory
      const blobParts: string[] = [];
      let totalExported = 0;

      for (let off = 0; off < exportTarget; off += PAGE_SIZE) {
        const chunk = await api.fetchTableData(
          activeId,
          table,
          off,
          Math.min(PAGE_SIZE, exportTarget - off),
          orderBy,
          orderDir,
          filters,
          appliedAsOf,
        );
        if (off === 0) {
          blobParts.push(chunk.columns.map(escapeCSV).join(",") + "\n");
        }
        if (chunk.rows.length > 0) {
          blobParts.push(
            chunk.rows.map((r) => r.map(escapeCSV).join(",")).join("\n") + "\n",
          );
          totalExported += chunk.rows.length;
        }
        if (chunk.rows.length < PAGE_SIZE) break;
      }

      const blob = new Blob(blobParts, { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${table}_all_${ts}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${totalExported} rows`);
    } catch (e) {
      toast.error("Export failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  const handleImportCSV = () => {
    csvInputRef.current?.click();
  };

  const handleCSVFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file || !activeId) return;
    // Reset so same file can be re-selected
    e.target.value = "";
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .filter((l) => l.trim());
      if (lines.length < 2) {
        toast.error(
          "CSV file must have a header row and at least one data row",
        );
        return;
      }
      const csvHeaders = parseCSVLine(lines[0]);
      const rows: Record<string, unknown>[] = [];
      let skipped = 0;
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length !== csvHeaders.length) {
          skipped++;
          continue;
        }
        const row: Record<string, unknown> = {};
        for (let j = 0; j < csvHeaders.length; j++) {
          const v = values[j];
          if (v === "" || v === "NULL") continue;
          row[csvHeaders[j]] = v;
        }
        if (Object.keys(row).length > 0) {
          rows.push(row);
        } else {
          skipped++;
        }
      }
      // Batch insert in chunks of 500
      let imported = 0;
      const totalChunks = Math.ceil(rows.length / 500);
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        try {
          const result = await api.insertRows(activeId, table, chunk);
          imported += result.changes;
        } catch (chunkErr) {
          const chunkIndex = Math.floor(i / 500) + 1;
          refetch();
          queryClient.invalidateQueries({ queryKey: ["tableData", activeId] });
          queryClient.invalidateQueries({ queryKey: ["rowcount", activeId] });
          toast.error(`Import failed at batch ${chunkIndex}/${totalChunks}`, {
            description: `${imported} row${imported !== 1 ? "s" : ""} imported before failure. ${chunkErr instanceof Error ? chunkErr.message : "Unknown error"}`,
          });
          return;
        }
      }
      refetch();
      queryClient.invalidateQueries({ queryKey: ["tableData", activeId] });
      queryClient.invalidateQueries({ queryKey: ["rowcount", activeId] });
      const msg = `Imported ${imported} row${imported !== 1 ? "s" : ""}`;
      if (skipped > 0) {
        toast.success(msg, {
          description: `${skipped} row${skipped !== 1 ? "s" : ""} skipped (column mismatch or empty)`,
        });
      } else {
        toast.success(msg);
      }
    } catch (e) {
      toast.error("Import failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setImporting(false);
    }
  };

  const totalRows = data?.totalRows ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-2 py-1 border-b panel-toolbar">
        <Table2 className="h-3.5 w-3.5 text-blue-400 shrink-0 ml-1" />
        <span className="text-sm font-medium mr-1">{table}</span>
        <div className="toolbar-separator" />
        <div className="flex-1" />
        <Button
          variant={showFilters ? "default" : "ghost"}
          size="sm"
          onClick={() => {
            if (showFilters && filterRows.length === 0) {
              setShowFilters(false);
            } else if (!showFilters) {
              if (filterRows.length === 0) addFilter();
              else setShowFilters(true);
            } else {
              setShowFilters(false);
            }
          }}
          className={cn(
            "gap-1",
            appliedFilters.length > 0 && !showFilters && "text-primary",
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          Filter
          {appliedFilters.length > 0 && (
            <span className="ml-0.5 text-[10px] bg-primary/20 text-primary rounded-full px-1.5">
              {appliedFilters.length}
            </span>
          )}
        </Button>
        <Button
          variant={showTimeTravel ? "default" : "ghost"}
          size="sm"
          onClick={() => {
            setShowTimeTravel(!showTimeTravel);
            if (showTimeTravel && !asOfTimestamp) {
              setAppliedAsOf(undefined);
            }
          }}
          className={cn(
            "gap-1",
            appliedAsOf && !showTimeTravel && "text-amber-500",
          )}
        >
          <Clock className="h-3.5 w-3.5" />
          Time Travel
          {appliedAsOf && (
            <span className="ml-0.5 text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full px-1.5">
              ON
            </span>
          )}
        </Button>
        <div className="toolbar-separator" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setInsertOpen(true)}
          className="gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          Insert
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleImportCSV}
          disabled={importing}
          className="gap-1"
        >
          {importing ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {importing ? "Importing..." : "Import"}
        </Button>
        {data && data.rows.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1">
                <Download className="h-3.5 w-3.5" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleExportCSV}>
                Export Page as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportJSON}>
                Export Page as JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportAllCSV}>
                Export All as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => refetch()}
          aria-label="Refresh data"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="border-b bg-muted/20 px-3 py-2 space-y-1.5">
          {filterRows.map((f) => {
            const isVec = vectorColumns.has(f.column);
            const isVecOp = VEC_OPS.has(f.operator);
            const ops = isVec ? VECTOR_OPERATORS : OPERATORS;
            return (
              <div key={f.id} className="flex items-center gap-2">
                {/* Column */}
                <Select
                  value={f.column}
                  onValueChange={(v) => {
                    const updates: Partial<FilterRow> = { column: v };
                    // Auto-switch operator when changing between vector and non-vector columns
                    if (vectorColumns.has(v) && !VEC_OPS.has(f.operator)) {
                      updates.operator = "cosine";
                      updates.value = "";
                    } else if (
                      !vectorColumns.has(v) &&
                      VEC_OPS.has(f.operator)
                    ) {
                      updates.operator = "eq";
                      updates.value = "";
                    }
                    updateFilter(f.id, updates);
                  }}
                >
                  <SelectTrigger className="w-[160px] h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((c) => (
                      <SelectItem key={c.field} value={c.field}>
                        <span className="font-data">{c.field}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Operator */}
                <Select
                  value={f.operator}
                  onValueChange={(v) => updateFilter(f.id, { operator: v })}
                >
                  <SelectTrigger
                    className={cn(
                      "w-[140px] h-8 text-sm",
                      isVecOp && "text-purple-500",
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ops.map((op) => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Value — vector: two inputs (query vector + threshold) */}
                {isVecOp ? (
                  <div className="flex-1 flex gap-1.5">
                    <Input
                      placeholder="[0.1, 0.2, 0.3, ...]"
                      value={
                        f.value.substring(
                          0,
                          Math.max(0, f.value.lastIndexOf("|")),
                        ) || (f.value.includes("|") ? "" : f.value)
                      }
                      onChange={(e) => {
                        const pipeIdx = f.value.lastIndexOf("|");
                        const threshold =
                          pipeIdx !== -1 ? f.value.substring(pipeIdx + 1) : "";
                        updateFilter(f.id, {
                          value: `${e.target.value}|${threshold}`,
                        });
                      }}
                      className="flex-1 h-8 text-sm font-data text-purple-500"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyFilters();
                      }}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="max dist"
                      value={
                        f.value.includes("|")
                          ? f.value.substring(f.value.lastIndexOf("|") + 1)
                          : ""
                      }
                      onChange={(e) => {
                        const pipeIdx = f.value.lastIndexOf("|");
                        const vecPart =
                          pipeIdx !== -1
                            ? f.value.substring(0, pipeIdx)
                            : f.value;
                        updateFilter(f.id, {
                          value: `${vecPart}|${e.target.value}`,
                        });
                      }}
                      className="w-28 h-8 text-sm font-data"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyFilters();
                      }}
                    />
                  </div>
                ) : !NO_VALUE_OPS.has(f.operator) ? (
                  <Input
                    placeholder={
                      f.operator === "like"
                        ? "%pattern%"
                        : f.operator === "in"
                          ? "val1|val2|val3"
                          : "value"
                    }
                    value={f.value}
                    onChange={(e) =>
                      updateFilter(f.id, { value: e.target.value })
                    }
                    className="flex-1 h-8 text-sm font-data"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyFilters();
                    }}
                  />
                ) : (
                  <div className="flex-1" />
                )}

                {/* Remove */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeFilter(f.id)}
                  aria-label="Remove filter"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}

          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={addFilter}
              className="gap-1 h-7 text-xs"
            >
              <Plus className="h-3 w-3" />
              Add Condition
            </Button>
            <div className="flex-1" />
            {(filterRows.length > 0 || appliedFilters.length > 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="gap-1 h-7 text-xs text-muted-foreground"
              >
                <Trash2 className="h-3 w-3" />
                Clear All
              </Button>
            )}
            <Button
              size="sm"
              onClick={applyFilters}
              disabled={filterRows.length === 0}
              className={cn(
                "gap-1 h-7 text-xs",
                hasUnappliedChanges && "animate-pulse",
              )}
            >
              <Filter className="h-3 w-3" />
              Apply
            </Button>
          </div>
        </div>
      )}

      {/* Time Travel bar */}
      {showTimeTravel && (
        <div className="border-b bg-amber-50/30 dark:bg-amber-950/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 shrink-0">
              AS OF TIMESTAMP
            </span>
            <Input
              type="datetime-local"
              step="1"
              value={asOfTimestamp}
              onChange={(e) => setAsOfTimestamp(e.target.value)}
              className="h-7 w-[220px] text-xs font-data"
              onKeyDown={(e) => {
                if (e.key === "Enter" && asOfTimestamp) {
                  setAppliedAsOf(asOfTimestamp.replace("T", " "));
                  setOffset(0);
                }
              }}
            />
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={!asOfTimestamp}
              onClick={() => {
                setAppliedAsOf(asOfTimestamp.replace("T", " "));
                setOffset(0);
              }}
            >
              Apply
            </Button>
            {appliedAsOf && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-muted-foreground"
                onClick={() => {
                  setAsOfTimestamp("");
                  setAppliedAsOf(undefined);
                  setOffset(0);
                }}
              >
                <X className="h-3 w-3" />
                Clear
              </Button>
            )}
            <div className="flex-1" />
            <span className="text-[11px] text-muted-foreground">
              View table data at a specific point in time
            </span>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="p-3 text-xs text-muted-foreground">Loading...</div>
        ) : fetchError ? (
          <div className="p-3 text-xs text-destructive">
            Failed to load data:{" "}
            {fetchError instanceof Error ? fetchError.message : "Unknown error"}
          </div>
        ) : data ? (
          <DataGrid
            columns={data.columns}
            rows={data.rows}
            columnTypes={columns.map((c) => c.type)}
            onCellEdit={pkColumn ? handleCellEdit : undefined}
            onDeleteRow={pkColumn ? handleDeleteRow : undefined}
            foreignKeys={foreignKeys}
            onNavigateToFK={handleNavigateFK}
            onFindSimilar={
              vectorColumns.size > 0 ? handleFindSimilar : undefined
            }
            serverSort={
              orderBy ? { column: orderBy, direction: orderDir } : undefined
            }
            onServerSort={handleServerSort}
          />
        ) : null}
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-1 px-3 py-1 border-t panel-toolbar text-xs">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - limit))}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="text-muted-foreground tabular-nums">
          {data && data.rows.length > 0
            ? `Rows ${offset + 1}-${offset + data.rows.length} of ${totalRows}`
            : "No rows"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={!data || offset + limit >= totalRows}
          onClick={() => setOffset(offset + limit)}
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <div className="toolbar-separator" />
        <Select
          value={String(limit)}
          onValueChange={(v) => {
            setLimit(Number(v));
            setOffset(0);
          }}
        >
          <SelectTrigger className="h-6 w-20 text-xs border-0 bg-transparent shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[25, 50, 100, 250, 500].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} rows
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {appliedFilters.length > 0 && (
          <span className="ml-2 text-primary text-[11px]">
            {appliedFilters.length} filter
            {appliedFilters.length !== 1 ? "s" : ""} active
          </span>
        )}
        {appliedAsOf && (
          <span className="ml-2 text-amber-500 text-[11px] flex items-center gap-1">
            <Clock className="h-3 w-3" />
            AS OF {appliedAsOf}
          </span>
        )}
      </div>

      <input
        ref={csvInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleCSVFileSelected}
      />

      <RowEditorDialog
        open={insertOpen}
        onOpenChange={setInsertOpen}
        columns={columns}
        onSave={handleInsert}
      />

      {pendingDeleteRow !== null &&
        data &&
        pkColumn &&
        pendingDeleteRow < data.rows.length && (
          <ConfirmDialog
            open
            onOpenChange={() => setPendingDeleteRow(null)}
            title="Delete Row"
            description={`Delete row with ${pkColumn.field} = ${data.rows[pendingDeleteRow]?.[data.columns.indexOf(pkColumn.field)]}?`}
            confirmLabel="Delete"
            destructive
            onConfirm={doDeleteRow}
          />
        )}

      <VectorSearchDialog
        open={vecSearchOpen}
        onOpenChange={setVecSearchOpen}
        initialTable={table}
        initialColumn={vecSearchProps.column}
        initialVector={vecSearchProps.vector}
      />
    </div>
  );
}
