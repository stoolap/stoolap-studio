"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Waypoints, Search, Code, Loader2 } from "lucide-react";
import { useConnectionStore } from "@/stores/connection-store";
import { useEditorStore } from "@/stores/editor-store";
import { useTables, useTableColumns } from "@/hooks/use-schema";
import { cn, quoteId } from "@/lib/utils";
import {
  isDistanceColumn,
  formatVector,
  isValidVectorLiteral,
} from "@/lib/vector-utils";
import * as api from "@/lib/api-client";
import type { QueryResult } from "@/lib/types";

interface VectorSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTable?: string;
  initialColumn?: string;
  initialVector?: string;
}

const METRICS = [
  { value: "cosine", label: "Cosine", fn: "VEC_DISTANCE_COSINE" },
  { value: "l2", label: "L2 (Euclidean)", fn: "VEC_DISTANCE_L2" },
  { value: "ip", label: "Inner Product", fn: "VEC_DISTANCE_IP" },
];

export function VectorSearchDialog({
  open,
  onOpenChange,
  initialTable,
  initialColumn,
  initialVector,
}: VectorSearchDialogProps) {
  const activeId = useConnectionStore((s) => s.activeId);
  const addTab = useEditorStore((s) => s.addTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const { data: allTables } = useTables();

  const [selectedTable, setSelectedTable] = useState(initialTable ?? "");
  const [selectedColumn, setSelectedColumn] = useState(initialColumn ?? "");
  const [metric, setMetric] = useState("cosine");
  const [queryVector, setQueryVector] = useState(initialVector ?? "");
  const [kLimit, setKLimit] = useState(10);
  const [whereClause, setWhereClause] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");

  // Fetch columns for selected table
  const { data: tableColumns } = useTableColumns(
    open && selectedTable ? selectedTable : null,
  );

  // Pick-from-table state
  const [pickRows, setPickRows] = useState<{ label: string; vector: string }[]>(
    [],
  );
  const [loadingPick, setLoadingPick] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;

  // Vector columns for the selected table
  const vectorColumns = useMemo(() => {
    if (!tableColumns) return [];
    return tableColumns.filter((c) =>
      c.type.toUpperCase().startsWith("VECTOR"),
    );
  }, [tableColumns]);

  // All non-vector columns (for display labels in "Pick" mode)
  const labelColumns = useMemo(() => {
    if (!tableColumns) return [];
    return tableColumns
      .filter((c) => !c.type.toUpperCase().startsWith("VECTOR"))
      .slice(0, 3);
  }, [tableColumns]);

  // Auto-select first vector column when table changes
  useEffect(() => {
    if (
      vectorColumns.length > 0 &&
      !vectorColumns.find((c) => c.field === selectedColumn)
    ) {
      setSelectedColumn(vectorColumns[0].field);
    }
  }, [vectorColumns, selectedColumn]);

  // Reset state when dialog opens with new initial values
  useEffect(() => {
    if (open) {
      if (initialTable) setSelectedTable(initialTable);
      if (initialColumn) setSelectedColumn(initialColumn);
      if (initialVector) setQueryVector(initialVector);
      setResults(null);
      setError("");
      setPickRows([]);
    }
  }, [open, initialTable, initialColumn, initialVector]);

  // Tables that have vector columns — we filter lazily via the column data
  // For simplicity, show all tables and let the user pick
  // (vector columns will auto-populate)

  const distFn =
    METRICS.find((m) => m.value === metric)?.fn ?? "VEC_DISTANCE_COSINE";

  const generatedSQL = useMemo(() => {
    if (!selectedTable || !selectedColumn || !queryVector.trim()) return "";
    const vec = queryVector.trim();
    if (!isValidVectorLiteral(vec)) return "";
    const col = quoteId(selectedColumn);
    const tbl = quoteId(selectedTable);
    const where = whereClause.trim();
    let sql = `SELECT *, ${distFn}(${col}, '${vec}') AS distance\nFROM ${tbl}`;
    if (where) {
      // Reject semicolons to prevent multi-statement injection in concatenated SQL
      if (/;/.test(where)) {
        return "";
      }
      sql += `\nWHERE ${where}`;
    }
    sql += `\nORDER BY distance\nLIMIT ${kLimit}`;
    return sql;
  }, [selectedTable, selectedColumn, queryVector, distFn, whereClause, kLimit]);

  const handleSearch = useCallback(async () => {
    if (!activeId || !generatedSQL) return;
    setSearching(true);
    setError("");
    setResults(null);
    try {
      const result = await api.executeQuery(activeId, generatedSQL);
      if (!openRef.current) return; // dialog was closed
      if ("error" in result && result.error) {
        setError(result.error);
      } else if ("columns" in result) {
        setResults(result as QueryResult);
      }
    } catch (e) {
      if (!openRef.current) return;
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [activeId, generatedSQL]);

  const handleOpenInEditor = useCallback(() => {
    if (!generatedSQL) return;
    const tabId = addTab(`k-NN: ${selectedTable}`, generatedSQL);
    setActiveTab(tabId);
    onOpenChange(false);
  }, [generatedSQL, selectedTable, addTab, setActiveTab, onOpenChange]);

  const loadPickRows = useCallback(async () => {
    if (!activeId || !selectedTable || !selectedColumn) return;
    setLoadingPick(true);
    try {
      const labelCols = labelColumns.map((c) => quoteId(c.field)).join(", ");
      const selectCols = labelCols
        ? `${labelCols}, ${quoteId(selectedColumn)}`
        : quoteId(selectedColumn);
      const sql = `SELECT ${selectCols} FROM ${quoteId(selectedTable)} LIMIT 50`;
      const result = await api.executeQuery(activeId, sql);
      if (!openRef.current) return; // dialog was closed
      if ("columns" in result && result.rows) {
        const vecIdx = result.columns.indexOf(selectedColumn);
        const rows = result.rows
          .filter((r) => r[vecIdx] != null)
          .map((r) => {
            const labelParts = result.columns
              .filter((_, i) => i !== vecIdx)
              .map((col) => {
                const idx = result.columns.indexOf(col);
                return String(r[idx] ?? "");
              });
            const label = labelParts.join(" | ") || `Row`;
            const raw = r[vecIdx];
            const vec = formatVector(raw);
            return { label, vector: vec };
          });
        setPickRows(rows);
      }
    } catch {
      setPickRows([]);
    } finally {
      setLoadingPick(false);
    }
  }, [activeId, selectedTable, selectedColumn, labelColumns]);

  // Distance bar for results
  const distanceRange = useMemo(() => {
    if (!results) return null;
    const distIdx = results.columns.findIndex((c) => isDistanceColumn(c));
    if (distIdx === -1) return null;
    let min = Infinity,
      max = -Infinity;
    for (const row of results.rows) {
      const v = Number(row[distIdx]);
      if (!isNaN(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (min === Infinity) return null;
    return { idx: distIdx, min, max };
  }, [results]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Waypoints className="h-5 w-5 text-purple-500" />
            Vector Similarity Search
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          {/* Table + Column + Metric row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Table</Label>
              <Select
                value={selectedTable}
                onValueChange={(v) => {
                  setSelectedTable(v);
                  setSelectedColumn("");
                  setResults(null);
                  setPickRows([]);
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select table..." />
                </SelectTrigger>
                <SelectContent>
                  {(allTables ?? []).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Vector Column</Label>
              <Select
                value={selectedColumn}
                onValueChange={setSelectedColumn}
                disabled={vectorColumns.length === 0}
              >
                <SelectTrigger className="h-9 text-sm text-purple-500">
                  <SelectValue
                    placeholder={
                      vectorColumns.length === 0
                        ? "No vector columns"
                        : "Select..."
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {vectorColumns.map((c) => (
                    <SelectItem key={c.field} value={c.field}>
                      <span className="flex items-center gap-1.5">
                        <Waypoints className="h-3 w-3 text-purple-400" />
                        {c.field}
                        <span className="text-[10px] text-muted-foreground">
                          {c.type}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Distance Metric</Label>
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRICS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Query Vector */}
          <div className="space-y-1.5">
            <Label className="text-xs">Query Vector</Label>
            <Tabs
              defaultValue="paste"
              className="w-full"
              onValueChange={(v) => {
                if (v === "pick" && pickRows.length === 0) loadPickRows();
              }}
            >
              <TabsList className="h-8">
                <TabsTrigger value="paste" className="text-xs px-3">
                  Paste
                </TabsTrigger>
                <TabsTrigger value="pick" className="text-xs px-3">
                  Pick from table
                </TabsTrigger>
              </TabsList>
              <TabsContent value="paste">
                <Input
                  placeholder="[0.1, 0.2, 0.3, ...]"
                  value={queryVector}
                  onChange={(e) => setQueryVector(e.target.value)}
                  className={cn(
                    "h-9 text-sm font-data text-purple-500",
                    queryVector.trim() &&
                      !isValidVectorLiteral(queryVector) &&
                      "border-destructive",
                  )}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch();
                  }}
                />
                {queryVector.trim() && !isValidVectorLiteral(queryVector) && (
                  <p className="text-[11px] text-destructive mt-1">
                    Must be a numeric array like [0.1, 0.2, 0.3]
                  </p>
                )}
              </TabsContent>
              <TabsContent value="pick">
                <ScrollArea className="h-[140px] border rounded-md">
                  {loadingPick ? (
                    <div className="flex items-center justify-center h-full p-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : pickRows.length === 0 ? (
                    <div className="p-4 text-xs text-muted-foreground text-center">
                      {selectedTable ? "No rows found" : "Select a table first"}
                    </div>
                  ) : (
                    <div className="p-1 space-y-0.5">
                      {pickRows.map((row, i) => {
                        const isSelected = queryVector === row.vector;
                        const abbreviated =
                          row.vector.length > 40
                            ? row.vector.substring(0, 37) + "...]"
                            : row.vector;
                        return (
                          <button
                            key={i}
                            className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent transition-colors ${
                              isSelected
                                ? "bg-purple-500/10 ring-1 ring-purple-500/30"
                                : ""
                            }`}
                            onClick={() => setQueryVector(row.vector)}
                          >
                            <div className="font-medium truncate">
                              {row.label}
                            </div>
                            <div className="font-data text-[10px] text-muted-foreground truncate">
                              {abbreviated}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>

          {/* k + WHERE row */}
          <div className="grid grid-cols-[100px_1fr] gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">k (limit)</Label>
              <Input
                type="number"
                min={1}
                max={1000}
                value={kLimit}
                onChange={(e) =>
                  setKLimit(Math.max(1, parseInt(e.target.value) || 10))
                }
                className="h-9 text-sm font-data"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">WHERE (optional)</Label>
              <Input
                placeholder="e.g. category = 'Developer'"
                value={whereClause}
                onChange={(e) => setWhereClause(e.target.value)}
                className="h-9 text-sm font-data"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
              />
            </div>
          </div>

          {/* SQL Preview */}
          {generatedSQL && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                SQL Preview
              </Label>
              <pre className="text-xs font-data bg-muted/50 border rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
                {generatedSQL}
              </pre>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2">
              {error}
            </div>
          )}

          {/* Inline Results */}
          {results && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Results ({results.rows.length} row
                {results.rows.length !== 1 ? "s" : ""},{" "}
                {results.time.toFixed(1)}ms)
              </Label>
              <div className="border rounded-md overflow-hidden max-h-[300px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60 sticky top-0">
                    <tr>
                      {results.columns.map((col) => (
                        <th
                          key={col}
                          className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.rows.map((row, ri) => (
                      <tr key={ri} className="border-t hover:bg-accent/30">
                        {row.map((cell, ci) => {
                          const isDist =
                            distanceRange && ci === distanceRange.idx;
                          const numVal = isDist ? Number(cell) : NaN;
                          const showBar =
                            isDist && !isNaN(numVal) && distanceRange;
                          let barPct = 0;
                          let barHue = 120;
                          if (showBar) {
                            const pct =
                              distanceRange.max === distanceRange.min
                                ? 0
                                : (numVal - distanceRange.min) /
                                  (distanceRange.max - distanceRange.min);
                            barPct = 1 - pct;
                            barHue = 120 - pct * 120;
                          }
                          const displayVal =
                            cell == null
                              ? ""
                              : typeof cell === "string" &&
                                  cell.startsWith("[") &&
                                  cell.length > 30
                                ? cell.substring(0, 27) + "...]"
                                : String(cell);

                          return (
                            <td
                              key={ci}
                              className="px-2 py-1 font-data whitespace-nowrap max-w-[200px] truncate"
                            >
                              {showBar ? (
                                <span className="flex items-center gap-1.5">
                                  <span>{numVal.toFixed(4)}</span>
                                  <span
                                    className="inline-block h-2.5 rounded-sm shrink-0"
                                    style={{
                                      width: `${Math.max(4, barPct * 60)}px`,
                                      backgroundColor: `hsl(${barHue}, 75%, 45%)`,
                                    }}
                                  />
                                </span>
                              ) : (
                                displayVal
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
          )}
        </div>

        <DialogFooter className="gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenInEditor}
            disabled={!generatedSQL}
            className="gap-1.5"
          >
            <Code className="h-3.5 w-3.5" />
            Open in Editor
          </Button>
          <Button
            size="sm"
            onClick={handleSearch}
            disabled={!generatedSQL || searching || !activeId}
            className="gap-1.5"
          >
            {searching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            {searching ? "Searching..." : "Search"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
