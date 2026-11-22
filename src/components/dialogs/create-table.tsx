import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { useConnectionStore } from "@/stores/connection-store";
import { useTables, useTableColumns } from "@/hooks/use-schema";
import { errorMessage, quoteId } from "@/lib/utils";
import { formatDefaultValue } from "@/lib/sql-utils";
import { Tip } from "@/components/ui/tip";
import {
  CellInput,
  ColumnList,
  Flag,
  RowDetail,
  SqlPreview,
  TypeSelect,
  VectorSize,
} from "./column-grid";
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
  hasCheck: boolean;
  /** A CHECK's condition, without its parentheses */
  check: string;
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
  hasCheck: false,
  check: "",
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

const COLS = "grid grid-cols-[minmax(0,1fr)_112px_188px_120px_28px] items-center gap-x-2";

/** The table and column a foreign key points at, and what happens to the row
 *  when that one is deleted or changed */
function FkConfig({
  col,
  tables,
  onUpdate,
}: {
  col: ColumnDef;
  tables: string[];
  onUpdate: (updates: Partial<ColumnDef>) => void;
}) {
  const { t } = useTranslation("dialogs");
  const { data: refColumns } = useTableColumns(col.refTable || null);
  const trigger = "h-7 text-xs font-data";

  return (
    <RowDetail>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
      <Select value={col.refTable} onValueChange={(v) => onUpdate({ refTable: v, refColumn: "" })}>
        <SelectTrigger size="sm" className={`${trigger} w-[130px]`}>
          <SelectValue placeholder={t("table.refTable")} />
        </SelectTrigger>
        <SelectContent>
          {tables.map((name) => (
            <SelectItem key={name} value={name} className="font-data text-xs">
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={col.refColumn}
        onValueChange={(v) => onUpdate({ refColumn: v })}
        disabled={!col.refTable}
      >
        <SelectTrigger size="sm" className={`${trigger} w-[120px]`}>
          <SelectValue placeholder={t("table.refColumn")} />
        </SelectTrigger>
        <SelectContent>
          {refColumns?.map((c) => (
            <SelectItem key={c.field} value={c.field} className="font-data text-xs">
              {c.field}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(["onDelete", "onUpdate"] as const).map((key) => (
        <Select key={key} value={col[key]} onValueChange={(v) => onUpdate({ [key]: v })}>
          <SelectTrigger size="sm" className={trigger}>
            <span className="text-muted-foreground">{key === "onDelete" ? "ON DELETE" : "ON UPDATE"}</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FK_ACTIONS.map((a) => (
              <SelectItem key={a} value={a} className="font-data text-xs">
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
    </RowDetail>
  );
}

export function CreateTableDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateTableDialogProps) {
  const { t } = useTranslation("dialogs");
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
        // Before DEFAULT, which would read it as part of its value
        if (c.hasCheck && c.check.trim()) def += ` CHECK (${c.check.trim()})`;
        if (c.defaultValue) {
          def += ` DEFAULT ${formatDefaultValue(c.defaultValue)}`;
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
      await api.runSql(activeId, sql);
      onCreated();
      handleOpenChange(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };


  const tables = existingTables ?? [];
  const canCreate = !!tableName.trim() && columns.some((c) => c.name.trim());

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("createTable.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Label htmlFor="create-table-name" className="shrink-0">
              {t("createTable.name")}
            </Label>
            <Input
              id="create-table-name"
              placeholder="my_table"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              className="max-w-xs font-data"
            />
          </div>

          <div className="space-y-2">
            <ColumnList
              header={
                <div className={`${COLS} px-1.5 py-1.5`}>
                  <span className="px-2">{t("table.colName")}</span>
                  <span className="px-2">{t("table.colType")}</span>
                  <span className="px-1">{t("table.constraints")}</span>
                  <span className="px-2">{t("table.colDefault")}</span>
                  <span />
                </div>
              }
            >
              {columns.map((col, i) => (
                <div key={col._id} className="group">
                  <div className={`${COLS} px-1.5 py-1`}>
                    <CellInput
                      aria-label={t("table.colName")}
                      placeholder="column_name"
                      value={col.name}
                      onChange={(e) => updateColumn(i, { name: e.target.value })}
                    />
                    <TypeSelect
                      value={col.type}
                      onChange={(v) =>
                        updateColumn(i, {
                          type: v,
                          ...(v !== "VECTOR" && { dimensions: "" }),
                          // A vector is none of these
                          ...(v === "VECTOR" && { primaryKey: false, unique: false, autoIncrement: false }),
                        })
                      }
                    />
                    <div className="flex items-center gap-1">
                      <Flag
                        label="PK"
                        name={t("table.primaryKey")}
                        on={col.primaryKey}
                        onChange={(v) => updateColumn(i, { primaryKey: v })}
                        disabled={col.type === "VECTOR"}
                      />
                      <Flag
                        label="NN"
                        name={t("table.notNull")}
                        on={col.notNull || col.primaryKey}
                        onChange={(v) => updateColumn(i, { notNull: v })}
                        disabled={col.primaryKey}
                      />
                      <Flag
                        label="UQ"
                        name={t("table.unique")}
                        on={col.unique}
                        onChange={(v) => updateColumn(i, { unique: v })}
                        disabled={col.primaryKey || col.type === "VECTOR"}
                      />
                      <Flag
                        label="AI"
                        name={t("table.autoIncrement")}
                        on={col.autoIncrement}
                        onChange={(v) => updateColumn(i, { autoIncrement: v })}
                        disabled={col.type === "VECTOR"}
                      />
                      <Flag
                        label="FK"
                        name={t("table.foreignKey")}
                        on={col.hasForeignKey}
                        onChange={(v) =>
                          updateColumn(i, {
                            hasForeignKey: v,
                            ...(!v && { refTable: "", refColumn: "" }),
                          })
                        }
                        disabled={col.primaryKey}
                      />
                      <Flag
                        label="CK"
                        name={t("table.check")}
                        on={col.hasCheck}
                        onChange={(v) => updateColumn(i, { hasCheck: v })}
                      />
                    </div>
                    <CellInput
                      aria-label={t("table.colDefault")}
                      placeholder={t("table.defaultPlaceholder")}
                      value={col.defaultValue}
                      onChange={(e) => updateColumn(i, { defaultValue: e.target.value })}
                    />
                    <Tip label={t("alterTable.remove")}>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("alterTable.remove")}
                        className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
                        onClick={() => removeColumn(i)}
                        disabled={columns.length === 1}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </Tip>
                  </div>
                  {col.type === "VECTOR" && (
                    <VectorSize
                      label={t("table.colDims")}
                      placeholder={t("table.dimsPlaceholder")}
                      value={col.dimensions}
                      onChange={(dimensions) => updateColumn(i, { dimensions })}
                    />
                  )}
                  {col.hasCheck && (
                    <RowDetail>
                      <span className="font-data text-muted-foreground">CHECK (</span>
                      <Input
                        aria-label={t("table.check")}
                        placeholder={`${col.name || "value"} > 0`}
                        value={col.check}
                        onChange={(e) => updateColumn(i, { check: e.target.value })}
                        className="h-7 w-64 font-data text-xs md:text-xs"
                      />
                      <span className="font-data text-muted-foreground">)</span>
                    </RowDetail>
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
            </ColumnList>

            <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={addColumn}>
              <Plus className="h-3.5 w-3.5" />
              {t("table.addColumn")}
            </Button>
          </div>

          {canCreate && <SqlPreview label={t("actions.generatedSql")} sql={generateSQL()} />}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t("actions.cancel")}
          </Button>
          <Button data-default onClick={handleCreate} disabled={loading || !canCreate}>
            {loading ? t("actions.creating") : t("createTable.title")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
