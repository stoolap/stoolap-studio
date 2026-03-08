"use client";

import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Link2 } from "lucide-react";
import { useConnectionStore } from "@/stores/connection-store";
import { useTables, useTableColumns } from "@/hooks/use-schema";
import { quoteId } from "@/lib/utils";
import { DATA_TYPES, VECTOR_DIM_PRESETS } from "@/lib/constants";
import * as api from "@/lib/api-client";

let _colIdSeq = 0;

interface ColumnDef {
  _id: number;
  name: string;
  type: string;
  primaryKey: boolean;
  notNull: boolean;
  unique: boolean;
  defaultValue: string;
  autoIncrement: boolean;
  hasForeignKey: boolean;
  refTable: string;
  refColumn: string;
  onDelete: string;
  onUpdate: string;
  dimensions: string;
}

const FK_ACTIONS = ["RESTRICT", "CASCADE", "SET NULL", "NO ACTION"];

const emptyColumn = (): ColumnDef => ({
  _id: ++_colIdSeq,
  name: "",
  type: "TEXT",
  primaryKey: false,
  notNull: false,
  unique: false,
  defaultValue: "",
  autoIncrement: false,
  hasForeignKey: false,
  refTable: "",
  refColumn: "",
  onDelete: "RESTRICT",
  onUpdate: "RESTRICT",
  dimensions: "",
});

interface CreateTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

function FkConfig({
  col,
  tables,
  onUpdate,
}: {
  col: ColumnDef;
  tables: string[];
  onUpdate: (updates: Partial<ColumnDef>) => void;
}) {
  const { data: refColumns } = useTableColumns(col.refTable || null);

  return (
    <div className="flex items-center gap-2 pl-2 pr-1 py-1.5 bg-blue-500/5 border-t border-blue-500/20">
      <Link2 className="h-3 w-3 text-blue-400 shrink-0" />
      <Select
        value={col.refTable}
        onValueChange={(v) => onUpdate({ refTable: v, refColumn: "" })}
      >
        <SelectTrigger className="h-7 text-xs w-[140px]">
          <SelectValue placeholder="Ref table" />
        </SelectTrigger>
        <SelectContent>
          {tables.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={col.refColumn}
        onValueChange={(v) => onUpdate({ refColumn: v })}
        disabled={!col.refTable}
      >
        <SelectTrigger className="h-7 text-xs w-[120px]">
          <SelectValue placeholder="Ref column" />
        </SelectTrigger>
        <SelectContent>
          {refColumns?.map((c) => (
            <SelectItem key={c.field} value={c.field}>
              {c.field}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={col.onDelete}
        onValueChange={(v) => onUpdate({ onDelete: v })}
      >
        <SelectTrigger className="h-7 text-xs w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FK_ACTIONS.map((a) => (
            <SelectItem key={a} value={a}>
              DEL: {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={col.onUpdate}
        onValueChange={(v) => onUpdate({ onUpdate: v })}
      >
        <SelectTrigger className="h-7 text-xs w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FK_ACTIONS.map((a) => (
            <SelectItem key={a} value={a}>
              UPD: {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function CreateTableDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateTableDialogProps) {
  const activeId = useConnectionStore((s) => s.activeId);
  const { data: existingTables } = useTables();
  const [tableName, setTableName] = useState("");
  const [columns, setColumns] = useState<ColumnDef[]>(() => [
    {
      ...emptyColumn(),
      name: "id",
      type: "INTEGER",
      primaryKey: true,
      autoIncrement: true,
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resetForm = () => {
    setTableName("");
    setColumns([
      {
        ...emptyColumn(),
        name: "id",
        type: "INTEGER",
        primaryKey: true,
        autoIncrement: true,
      },
    ]);
    setError("");
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) resetForm();
    onOpenChange(isOpen);
  };

  const addColumn = () => setColumns([...columns, emptyColumn()]);

  const removeColumn = (i: number) =>
    setColumns(columns.filter((_, idx) => idx !== i));

  const updateColumn = (i: number, updates: Partial<ColumnDef>) =>
    setColumns(columns.map((c, idx) => (idx === i ? { ...c, ...updates } : c)));

  const generateSQL = () => {
    const colDefs = columns
      .filter((c) => c.name.trim())
      .map((c) => {
        const typeStr =
          c.type === "VECTOR" && c.dimensions
            ? `VECTOR(${c.dimensions})`
            : c.type;
        let def = `${quoteId(c.name)} ${typeStr}`;
        if (c.primaryKey) def += " PRIMARY KEY";
        if (c.autoIncrement) def += " AUTO_INCREMENT";
        if (c.notNull && !c.primaryKey) def += " NOT NULL";
        if (c.unique && !c.primaryKey) def += " UNIQUE";
        if (c.defaultValue) {
          const dv = c.defaultValue.trim();
          const isRaw =
            /^-?\d+(\.\d+)?$/.test(dv) ||
            /^(NULL|TRUE|FALSE|CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME)$/i.test(
              dv,
            ) ||
            (dv.startsWith("'") && dv.endsWith("'"));
          def += ` DEFAULT ${isRaw ? dv : `'${dv.replace(/'/g, "''")}'`}`;
        }
        return def;
      });

    const fkConstraints = columns
      .filter(
        (c) => c.name.trim() && c.hasForeignKey && c.refTable && c.refColumn,
      )
      .map(
        (c) =>
          `FOREIGN KEY (${quoteId(c.name)}) REFERENCES ${quoteId(c.refTable)}(${quoteId(c.refColumn)}) ON DELETE ${c.onDelete} ON UPDATE ${c.onUpdate}`,
      );

    const allDefs = [...colDefs, ...fkConstraints];
    return `CREATE TABLE ${quoteId(tableName)} (\n  ${allDefs.join(",\n  ")}\n)`;
  };

  const handleCreate = async () => {
    if (!activeId || !tableName.trim()) return;
    setLoading(true);
    setError("");
    try {
      const sql = generateSQL();
      await api.executeQuery(activeId, sql);
      onCreated();
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setLoading(false);
    }
  };

  const tables = existingTables ?? [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Table</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Table Name</Label>
            <Input
              placeholder="my_table"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              className="max-w-xs font-data"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Columns</Label>
              <Button variant="outline" size="sm" onClick={addColumn}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Column
              </Button>
            </div>

            {/* Column header */}
            <div className="grid grid-cols-[1fr_120px_60px_44px_44px_44px_44px_44px_120px_36px] gap-x-2 px-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              <span>Name</span>
              <span>Type</span>
              <span>Dims</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-center cursor-help">PK</span>
                </TooltipTrigger>
                <TooltipContent>Primary Key</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-center cursor-help">NN</span>
                </TooltipTrigger>
                <TooltipContent>Not Null</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-center cursor-help">UQ</span>
                </TooltipTrigger>
                <TooltipContent>Unique</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-center cursor-help">AI</span>
                </TooltipTrigger>
                <TooltipContent>Auto Increment</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-center cursor-help">FK</span>
                </TooltipTrigger>
                <TooltipContent>Foreign Key</TooltipContent>
              </Tooltip>
              <span>Default</span>
              <span />
            </div>

            {/* Column rows */}
            <div className="space-y-1">
              {columns.map((col, i) => (
                <div
                  key={col._id}
                  className="rounded border bg-muted/20 hover:bg-muted/40 transition-colors overflow-hidden"
                >
                  <div className="grid grid-cols-[1fr_120px_60px_44px_44px_44px_44px_44px_120px_36px] gap-x-2 items-center p-1.5">
                    <Input
                      placeholder="column_name"
                      value={col.name}
                      onChange={(e) =>
                        updateColumn(i, { name: e.target.value })
                      }
                      className="h-8 text-sm font-data"
                    />
                    <Select
                      value={col.type}
                      onValueChange={(v) =>
                        updateColumn(i, {
                          type: v,
                          ...(v !== "VECTOR" && { dimensions: "" }),
                        })
                      }
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
                    <Input
                      placeholder={col.type === "VECTOR" ? "e.g. 384" : ""}
                      value={col.dimensions}
                      onChange={(e) =>
                        updateColumn(i, {
                          dimensions: e.target.value.replace(/\D/g, ""),
                        })
                      }
                      className="h-8 text-sm font-data"
                      disabled={col.type !== "VECTOR"}
                    />
                    <div className="flex justify-center">
                      <Checkbox
                        checked={col.primaryKey}
                        onCheckedChange={(v) =>
                          updateColumn(i, { primaryKey: !!v })
                        }
                        disabled={col.type === "VECTOR"}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={col.notNull}
                        onCheckedChange={(v) =>
                          updateColumn(i, { notNull: !!v })
                        }
                        disabled={col.primaryKey}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={col.unique}
                        onCheckedChange={(v) =>
                          updateColumn(i, { unique: !!v })
                        }
                        disabled={col.primaryKey || col.type === "VECTOR"}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={col.autoIncrement}
                        onCheckedChange={(v) =>
                          updateColumn(i, { autoIncrement: !!v })
                        }
                        disabled={col.type === "VECTOR"}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={col.hasForeignKey}
                        onCheckedChange={(v) =>
                          updateColumn(i, {
                            hasForeignKey: !!v,
                            ...(!v && { refTable: "", refColumn: "" }),
                          })
                        }
                        disabled={col.primaryKey}
                      />
                    </div>
                    <Input
                      placeholder="default value"
                      value={col.defaultValue}
                      onChange={(e) =>
                        updateColumn(i, { defaultValue: e.target.value })
                      }
                      className="h-8 text-sm font-data"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeColumn(i)}
                      disabled={columns.length === 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {col.type === "VECTOR" && (
                    <div className="flex items-center gap-1.5 px-2 py-1.5 border-t border-purple-500/20 bg-purple-500/5">
                      <span className="text-[10px] text-muted-foreground mr-1">
                        Presets:
                      </span>
                      {VECTOR_DIM_PRESETS.map((d) => (
                        <Badge
                          key={d}
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 cursor-pointer hover:bg-purple-500/10 hover:border-purple-500/50"
                          onClick={() =>
                            updateColumn(i, { dimensions: String(d) })
                          }
                        >
                          {d}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {col.hasForeignKey && (
                    <FkConfig
                      col={col}
                      tables={tables}
                      onUpdate={(updates) => updateColumn(i, updates)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {tableName && columns.some((c) => c.name) && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Generated SQL
              </Label>
              <pre className="text-xs p-3 rounded bg-muted font-mono whitespace-pre-wrap border">
                {generateSQL()}
              </pre>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              loading || !tableName.trim() || !columns.some((c) => c.name)
            }
          >
            {loading ? "Creating..." : "Create Table"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
