"use client";

import { useState, useMemo, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Trash2, Undo2 } from "lucide-react";
import { useConnectionStore } from "@/stores/connection-store";
import { cn, quoteId } from "@/lib/utils";
import { DATA_TYPES, VECTOR_DIM_PRESETS } from "@/lib/constants";
import * as api from "@/lib/api-client";
import type { ColumnInfo } from "@/lib/types";

const TYPE_ALIASES: Record<string, string> = {
  INT: "INTEGER",
  BIGINT: "INTEGER",
  SMALLINT: "INTEGER",
  TINYINT: "INTEGER",
  REAL: "FLOAT",
  DOUBLE: "FLOAT",
  NUMERIC: "FLOAT",
  DECIMAL: "FLOAT",
  VARCHAR: "TEXT",
  CHAR: "TEXT",
  STRING: "TEXT",
  BOOL: "BOOLEAN",
  DATETIME: "TIMESTAMP",
  DATE: "TIMESTAMP",
};

function normalizeType(type: string): string {
  const upper = type.toUpperCase();
  if (upper.startsWith("VECTOR")) return "VECTOR";
  if (DATA_TYPES.includes(upper)) return upper;
  return TYPE_ALIASES[upper] ?? "TEXT";
}

function extractDimensions(type: string): string {
  const match = type.match(/^VECTOR\((\d+)\)$/i);
  return match ? match[1] : "";
}

interface ColumnState {
  originalName: string;
  name: string;
  type: string;
  dimensions: string;
  nullable: boolean;
  key: string;
  status: "existing" | "renamed" | "modified" | "added" | "dropped";
}

interface AlterTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: string;
  columns: ColumnInfo[];
  onAltered: () => void;
}

export function AlterTableDialog({
  open,
  onOpenChange,
  table,
  columns: originalColumns,
  onAltered,
}: AlterTableDialogProps) {
  const activeId = useConnectionStore((s) => s.activeId);
  const [tableName, setTableName] = useState(table);
  const [cols, setCols] = useState<ColumnState[]>(() =>
    initCols(originalColumns),
  );
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState("TEXT");
  const [newColDimensions, setNewColDimensions] = useState("");
  const [newColNullable, setNewColNullable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Sync state when props change (e.g., dialog re-opened for a different table)
  useEffect(() => {
    if (open) {
      setTableName(table);
      setCols(initCols(originalColumns));
      setNewColName("");
      setNewColType("TEXT");
      setNewColDimensions("");
      setNewColNullable(true);
      setError("");
    }
  }, [open, table, originalColumns]);

  // Add new column
  const handleAddColumn = () => {
    if (!newColName.trim()) return;
    setCols([
      ...cols,
      {
        originalName: "",
        name: newColName.trim(),
        type: newColType,
        dimensions: newColType === "VECTOR" ? newColDimensions : "",
        nullable: newColNullable,
        key: "",
        status: "added",
      },
    ]);
    setNewColName("");
    setNewColType("TEXT");
    setNewColDimensions("");
    setNewColNullable(true);
  };

  // Mark column for drop
  const toggleDrop = (i: number) => {
    setCols(
      cols.map((c, idx) => {
        if (idx !== i) return c;
        if (c.status === "added") return c; // use remove for added
        if (c.status === "dropped") {
          // Undo drop — restore original status
          const changed = c.name !== c.originalName;
          return { ...c, status: changed ? "renamed" : "existing" };
        }
        return { ...c, status: "dropped" };
      }),
    );
  };

  // Remove an added column (not yet committed)
  const removeAdded = (i: number) => {
    setCols(cols.filter((_, idx) => idx !== i));
  };

  // Rename column
  const renameCol = (i: number, newName: string) => {
    setCols(
      cols.map((c, idx) => {
        if (idx !== i) return c;
        if (c.status === "added") return { ...c, name: newName };
        const isRenamed = newName !== c.originalName;
        const origInfo = originalColumns.find(
          (oc) => oc.field === c.originalName,
        );
        const origType = origInfo ? normalizeType(origInfo.type) : c.type;
        const origDims = origInfo
          ? extractDimensions(origInfo.type)
          : c.dimensions;
        const isTypeChanged = c.type !== origType || c.dimensions !== origDims;
        const status =
          !isRenamed && !isTypeChanged
            ? "existing"
            : isRenamed
              ? "renamed"
              : "modified";
        return { ...c, name: newName, status };
      }),
    );
  };

  // Change type (modify)
  const changeType = (i: number, newType: string) => {
    setCols(
      cols.map((c, idx) => {
        if (idx !== i) return c;
        const dims = newType !== "VECTOR" ? "" : c.dimensions;
        if (c.status === "added")
          return { ...c, type: newType, dimensions: dims };
        const isRenamed = c.name !== c.originalName;
        const status = isRenamed ? "renamed" : "modified";
        return { ...c, type: newType, dimensions: dims, status };
      }),
    );
  };

  // Change dimensions (for VECTOR type)
  const changeDimensions = (i: number, dims: string) => {
    setCols(
      cols.map((c, idx) => {
        if (idx !== i) return c;
        if (c.status === "added") return { ...c, dimensions: dims };
        return { ...c, dimensions: dims, status: "modified" };
      }),
    );
  };

  // Undo all changes on a column
  const undoCol = (i: number) => {
    const orig = originalColumns.find(
      (oc) => oc.field === cols[i].originalName,
    );
    if (!orig) return;
    setCols(
      cols.map((c, idx) =>
        idx === i
          ? {
              originalName: orig.field,
              name: orig.field,
              type: normalizeType(orig.type),
              dimensions: extractDimensions(orig.type),
              nullable: orig.nullable,
              key: orig.key,
              status: "existing",
            }
          : c,
      ),
    );
  };

  // Generate SQL statements for all changes
  const statements = useMemo(() => {
    const stmts: string[] = [];

    // Table rename
    if (tableName !== table) {
      stmts.push(
        `ALTER TABLE ${quoteId(table)} RENAME TO ${quoteId(tableName)}`,
      );
    }

    const tbl = quoteId(tableName !== table ? tableName : table);

    for (const c of cols) {
      const typeStr =
        c.type === "VECTOR" && c.dimensions
          ? `VECTOR(${c.dimensions})`
          : c.type;
      if (c.status === "dropped") {
        stmts.push(`ALTER TABLE ${tbl} DROP COLUMN ${quoteId(c.originalName)}`);
      } else if (c.status === "added") {
        let sql = `ALTER TABLE ${tbl} ADD COLUMN ${quoteId(c.name)} ${typeStr}`;
        if (!c.nullable) sql += " NOT NULL";
        stmts.push(sql);
      } else if (c.status === "renamed") {
        // Emit RENAME first
        stmts.push(
          `ALTER TABLE ${tbl} RENAME COLUMN ${quoteId(c.originalName)} TO ${quoteId(c.name)}`,
        );
        // If type also changed, emit MODIFY with the new name
        const origInfo = originalColumns.find(
          (oc) => oc.field === c.originalName,
        );
        const origType = origInfo ? normalizeType(origInfo.type) : "";
        const origDims = origInfo ? extractDimensions(origInfo.type) : "";
        if (c.type !== origType || c.dimensions !== origDims) {
          stmts.push(
            `ALTER TABLE ${tbl} MODIFY COLUMN ${quoteId(c.name)} ${typeStr}`,
          );
        }
      } else if (c.status === "modified") {
        stmts.push(
          `ALTER TABLE ${tbl} MODIFY COLUMN ${quoteId(c.name)} ${typeStr}`,
        );
      }
    }

    return stmts;
  }, [cols, tableName, table, originalColumns]);

  const hasChanges = statements.length > 0;

  const handleApply = async () => {
    if (!activeId || !hasChanges) return;
    setLoading(true);
    setError("");
    try {
      for (const sql of statements) {
        await api.executeQuery(activeId, sql);
      }
      onAltered();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Alter failed");
    } finally {
      setLoading(false);
    }
  };

  const isTableRenamed = tableName !== table;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Edit Table: <span className="font-data font-normal">{table}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Table name */}
          <div className="flex items-center gap-3">
            <Label className="shrink-0">Table Name</Label>
            <Input
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              className="max-w-xs font-data"
            />
            {isTableRenamed && (
              <Badge
                variant="outline"
                className="text-blue-500 border-blue-500/50"
              >
                Renamed
              </Badge>
            )}
          </div>

          {/* Existing columns */}
          <div className="space-y-2">
            <Label>Columns</Label>

            {/* Header */}
            <div className="grid grid-cols-[1fr_130px_60px_50px_50px_80px] gap-x-2 px-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              <span>Name</span>
              <span>Type</span>
              <span>Dims</span>
              <span className="text-center">PK</span>
              <span className="text-center">NULL</span>
              <span className="text-right">Actions</span>
            </div>

            {/* Rows */}
            <div className="space-y-1">
              {cols.map((col, i) => {
                const isDropped = col.status === "dropped";
                const isAdded = col.status === "added";
                const isChanged =
                  col.status === "renamed" || col.status === "modified";
                const isPK = col.key === "PRI";

                return (
                  <div
                    key={`${col.originalName || col.name}-${i}`}
                    className={cn(
                      "grid grid-cols-[1fr_130px_60px_50px_50px_80px] gap-x-2 items-center px-3 py-1.5 rounded border transition-colors",
                      isDropped &&
                        "bg-destructive/5 border-destructive/30 opacity-60",
                      isAdded && "bg-green-500/5 border-green-500/30",
                      isChanged &&
                        !isDropped &&
                        "bg-blue-500/5 border-blue-500/30",
                      !isDropped && !isAdded && !isChanged && "bg-muted/20",
                    )}
                  >
                    {/* Name - editable */}
                    <div className="flex items-center gap-2">
                      {isDropped ? (
                        <span className="text-sm font-data line-through text-muted-foreground">
                          {col.originalName}
                        </span>
                      ) : (
                        <Input
                          value={col.name}
                          onChange={(e) => renameCol(i, e.target.value)}
                          className="h-8 text-sm font-data"
                          disabled={isPK && !isAdded}
                        />
                      )}
                      {col.status === "renamed" && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1 py-0 text-blue-500 border-blue-500/50 shrink-0"
                            >
                              was: {col.originalName}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            Renamed from {col.originalName}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    {/* Type - dropdown */}
                    {isDropped ? (
                      <span className="text-sm font-data text-muted-foreground line-through">
                        {col.type}
                      </span>
                    ) : (
                      <Select
                        value={col.type}
                        onValueChange={(v) => changeType(i, v)}
                        disabled={isPK && !isAdded}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DATA_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Dimensions (for VECTOR type) */}
                    {isDropped ? (
                      <span className="text-sm font-data text-muted-foreground line-through">
                        {col.dimensions}
                      </span>
                    ) : (
                      <Input
                        placeholder={col.type === "VECTOR" ? "dims" : ""}
                        value={col.dimensions}
                        onChange={(e) =>
                          changeDimensions(i, e.target.value.replace(/\D/g, ""))
                        }
                        className="h-8 text-sm font-data"
                        disabled={col.type !== "VECTOR" || (isPK && !isAdded)}
                      />
                    )}

                    {/* PK indicator */}
                    <div className="flex justify-center">
                      {isPK && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                        >
                          PK
                        </Badge>
                      )}
                    </div>

                    {/* Nullable */}
                    <div className="flex justify-center">
                      <Checkbox
                        checked={col.nullable}
                        disabled={isDropped || isPK}
                        onCheckedChange={(v) =>
                          setCols(
                            cols.map((c, idx) =>
                              idx === i ? { ...c, nullable: !!v } : c,
                            ),
                          )
                        }
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-1">
                      {isChanged && !isDropped && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => undoCol(i)}
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Undo changes</TooltipContent>
                        </Tooltip>
                      )}
                      {isAdded ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => removeAdded(i)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Remove</TooltipContent>
                        </Tooltip>
                      ) : !isPK ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-7 w-7",
                                isDropped
                                  ? "text-muted-foreground hover:text-foreground"
                                  : "text-muted-foreground hover:text-destructive",
                              )}
                              onClick={() => toggleDrop(i)}
                            >
                              {isDropped ? (
                                <Undo2 className="h-3.5 w-3.5" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {isDropped ? "Undo drop" : "Drop column"}
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add new column */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              Add New Column
            </Label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="column_name"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                className="flex-1 h-9 font-data"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddColumn();
                }}
              />
              <Select
                value={newColType}
                onValueChange={(v) => {
                  setNewColType(v);
                  if (v !== "VECTOR") setNewColDimensions("");
                }}
              >
                <SelectTrigger className="w-[130px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATA_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {newColType === "VECTOR" && (
                <>
                  <Input
                    placeholder="dims"
                    value={newColDimensions}
                    onChange={(e) =>
                      setNewColDimensions(e.target.value.replace(/\D/g, ""))
                    }
                    className="w-[70px] h-9 font-data"
                  />
                  <div className="flex items-center gap-1">
                    {VECTOR_DIM_PRESETS.slice(0, 4).map((d) => (
                      <Badge
                        key={d}
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 cursor-pointer hover:bg-purple-500/10 hover:border-purple-500/50"
                        onClick={() => setNewColDimensions(String(d))}
                      >
                        {d}
                      </Badge>
                    ))}
                  </div>
                </>
              )}
              <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                <Checkbox
                  checked={newColNullable}
                  onCheckedChange={(v) => setNewColNullable(!!v)}
                />
                Nullable
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddColumn}
                disabled={!newColName.trim()}
                className="shrink-0"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </div>
          </div>

          {/* SQL preview */}
          {hasChanges && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {statements.length} change{statements.length !== 1 ? "s" : ""}{" "}
                to apply
              </Label>
              <pre className="text-xs p-3 rounded bg-muted font-mono whitespace-pre-wrap border">
                {statements.join(";\n")};
              </pre>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={loading || !hasChanges}>
            {loading
              ? "Applying..."
              : `Apply ${statements.length} Change${statements.length !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function initCols(columns: ColumnInfo[]): ColumnState[] {
  return columns.map((c) => ({
    originalName: c.field,
    name: c.field,
    type: normalizeType(c.type),
    dimensions: extractDimensions(c.type),
    nullable: c.nullable,
    key: c.key,
    status: "existing" as const,
  }));
}
