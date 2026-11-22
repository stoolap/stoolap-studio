
import { useState, useMemo, useEffect, useCallback } from "react";
import { Trans, useTranslation } from "react-i18next";
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
import { Plus, Trash2, Undo2 } from "lucide-react";
import { useConnectionStore } from "@/stores/connection-store";
import { useTableIndexes } from "@/hooks/use-schema";
import { cn, errorMessage, quoteId } from "@/lib/utils";
import { formatDefaultValue } from "@/lib/sql-utils";
import { DATA_TYPES } from "@/lib/constants";
import * as api from "@/lib/api-client";
import type { ColumnInfo } from "@/lib/types";
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

const COLS = "grid grid-cols-[minmax(0,1fr)_112px_124px_120px_60px] items-center gap-x-2";

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

/** Whether the column's type, size or NOT NULL differ from the table's:
 *  what MODIFY COLUMN changes */
function isRetyped(
  c: { type: string; dimensions: string; nullable: boolean },
  orig: ColumnInfo,
): boolean {
  return (
    c.type !== normalizeType(orig.type) ||
    c.dimensions !== extractDimensions(orig.type) ||
    c.nullable !== orig.nullable
  );
}

/** The column's DEFAULT as DESCRIBE gives it; NULL (left by DROP DEFAULT)
 *  is none */
function defaultOf(orig: ColumnInfo): string {
  return orig.defaultValue === "NULL" ? "" : orig.defaultValue;
}

/** The column's CHECK condition, which DESCRIBE ends its Extra with:
 *  "auto_increment, CHECK (id > 0)" */
function checkOf(orig: ColumnInfo): string {
  return orig.extra.match(/CHECK \((.*)\)$/)?.[1] ?? "";
}

/** The CHECK condition the row asks for (empty for none) */
function checkWanted(c: { hasCheck: boolean; check: string }): string {
  return c.hasCheck ? c.check.trim() : "";
}

/** Whether the column differs from the table's, its name aside */
function isModified(c: ColumnState, orig: ColumnInfo): boolean {
  return (
    isRetyped(c, orig) ||
    c.unique !== (orig.key === "UNI") ||
    c.defaultValue.trim() !== defaultOf(orig) ||
    checkWanted(c) !== checkOf(orig)
  );
}

interface ColumnState {
  originalName: string;
  name: string;
  type: string;
  dimensions: string;
  nullable: boolean;
  /** UNIQUE: kept as a unique index of its own */
  unique: boolean;
  key: string;
  /** DEFAULT (empty for none) */
  defaultValue: string;
  hasCheck: boolean;
  /** The CHECK's condition, without its parentheses */
  check: string;
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
  const { t } = useTranslation("dialogs");
  const activeId = useConnectionStore((s) => s.activeId);
  const [tableName, setTableName] = useState(table);
  const [cols, setCols] = useState<ColumnState[]>(() =>
    initCols(originalColumns),
  );
  const [nextId, setNextId] = useState("");
  const { data: indexes } = useTableIndexes(open ? table : null);
  // The unique index of one column alone, which UQ turns off
  const uniqueIndex = useCallback(
    (column: string) =>
      indexes?.find((ix) => ix.isUnique && ix.columns.length === 1 && ix.columns[0] === column)
        ?.indexName,
    [indexes],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Sync state when props change (e.g., dialog re-opened for a different table)
  useEffect(() => {
    if (open) {
      setTableName(table);
      setCols(initCols(originalColumns));
      setNextId("");
      setError("");
    }
  }, [open, table, originalColumns]);

  // Add a new column: a row of its own at the end, filled in there
  const addColumn = () =>
    setCols([
      ...cols,
      {
        originalName: "",
        name: "",
        type: "TEXT",
        dimensions: "",
        nullable: true,
        unique: false,
        key: "",
        defaultValue: "",
        hasCheck: false,
        check: "",
        status: "added",
      },
    ]);

  // Change an added column's NOT NULL, UNIQUE, DEFAULT or CHECK
  const editAdded = (i: number, updates: Partial<ColumnState>) =>
    setCols(cols.map((c, idx) => (idx === i ? { ...c, ...updates } : c)));

  // Mark column for drop
  const toggleDrop = (i: number) => {
    setCols(
      cols.map((c, idx) => {
        if (idx !== i) return c;
        if (c.status === "added") return c; // use remove for added
        if (c.status === "dropped") {
          // Undo drop — back to the edits made before it
          const orig = originalColumns.find((oc) => oc.field === c.originalName);
          const status =
            c.name !== c.originalName
              ? "renamed"
              : orig && isModified(c, orig)
                ? "modified"
                : "existing";
          return { ...c, status };
        }
        return { ...c, status: "dropped" };
      }),
    );
  };

  // Remove an added column (not yet committed)
  const removeAdded = (i: number) => {
    setCols(cols.filter((_, idx) => idx !== i));
  };

  // Change an existing column's name, type, size, constraints or DEFAULT. It counts as
  // renamed or modified by how it differs from the column as it is now.
  const editCol = (i: number, updates: Partial<ColumnState>) => {
    setCols(
      cols.map((c, idx) => {
        if (idx !== i) return c;
        const next = { ...c, ...updates };
        if (next.type !== "VECTOR") next.dimensions = "";
        if (c.status === "added") return next;
        const orig = originalColumns.find((oc) => oc.field === c.originalName);
        const status =
          next.name !== c.originalName
            ? "renamed"
            : orig && isModified(next, orig)
              ? "modified"
              : "existing";
        return { ...next, status };
      }),
    );
  };

  // Undo all changes on a column
  const undoCol = (i: number) => {
    const orig = originalColumns.find(
      (oc) => oc.field === cols[i].originalName,
    );
    if (!orig) return;
    setCols(cols.map((c, idx) => (idx === i ? initCols([orig])[0] : c)));
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
    // Named as Stoolap names a column's UNIQUE
    const createUnique = (name: string) =>
      `CREATE UNIQUE INDEX ${quoteId(`unique_${tableName}_${name}`)} ON ${tbl} (${quoteId(name)})`;

    for (const c of cols) {
      const typeStr =
        c.type === "VECTOR" && c.dimensions
          ? `VECTOR(${c.dimensions})`
          : c.type;
      if (c.status === "dropped") {
        stmts.push(`ALTER TABLE ${tbl} DROP COLUMN ${quoteId(c.originalName)}`);
      } else if (c.status === "added") {
        if (!c.name.trim()) continue; // not named yet
        let sql = `ALTER TABLE ${tbl} ADD COLUMN ${quoteId(c.name)} ${typeStr}`;
        if (!c.nullable) sql += " NOT NULL";
        // Stoolap refuses NOT NULL without a non-NULL DEFAULT on a table with rows
        if (c.defaultValue.trim()) sql += ` DEFAULT ${formatDefaultValue(c.defaultValue)}`;
        if (checkWanted(c)) sql += ` CHECK (${checkWanted(c)})`;
        stmts.push(sql);
        // ADD COLUMN takes no UNIQUE: an index of its own after it
        if (c.unique) stmts.push(createUnique(c.name));
      } else if (c.status === "renamed" || c.status === "modified") {
        if (c.status === "renamed") {
          stmts.push(
            `ALTER TABLE ${tbl} RENAME COLUMN ${quoteId(c.originalName)} TO ${quoteId(c.name)}`,
          );
        }
        const orig = originalColumns.find((oc) => oc.field === c.originalName);
        if (!orig) continue;
        const col = `ALTER TABLE ${tbl} ALTER COLUMN ${quoteId(c.name)}`;
        const dflt = c.defaultValue.trim();
        const newDefault = dflt !== defaultOf(orig) ? dflt : "";
        const check = checkWanted(c);
        const newCheck = check !== checkOf(orig) ? check : "";
        // Removed ones first: a change of type judges the CHECKs still there
        if (!dflt && defaultOf(orig)) stmts.push(`${col} DROP DEFAULT`);
        if (!check && checkOf(orig)) stmts.push(`${col} DROP CHECK`);
        if (isRetyped(c, orig) || newDefault || newCheck) {
          // MODIFY sets the type and NOT NULL, and the DEFAULT and CHECK it
          // names; the ones it leaves out stay, but NOT NULL left out is dropped
          let sql = `ALTER TABLE ${tbl} MODIFY COLUMN ${quoteId(c.name)} ${typeStr}`;
          if (!c.nullable) sql += " NOT NULL";
          if (newDefault) sql += ` DEFAULT ${formatDefaultValue(newDefault)}`;
          if (newCheck) sql += ` CHECK (${newCheck})`;
          stmts.push(sql);
        }
        if (c.unique !== (orig.key === "UNI")) {
          const index = uniqueIndex(c.originalName);
          if (c.unique) stmts.push(createUnique(c.name));
          else if (index) stmts.push(`DROP INDEX ${quoteId(index)} ON ${tbl}`);
        }
      }
    }

    // Lower than an id in use, Stoolap leaves it as it is
    if (nextId) stmts.push(`ALTER TABLE ${tbl} AUTO_INCREMENT = ${nextId}`);

    return stmts;
  }, [cols, tableName, table, originalColumns, nextId, uniqueIndex]);

  const hasChanges = statements.length > 0;

  const handleApply = async () => {
    if (!activeId || !hasChanges) return;
    setLoading(true);
    setError("");
    try {
      for (const sql of statements) {
        await api.runSql(activeId, sql);
      }
      onAltered();
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const isTableRenamed = tableName !== table;
  const autoIncrement = (name: string) =>
    !!originalColumns.find((oc) => oc.field === name)?.extra.toLowerCase().includes("auto_increment");
  const hasAutoIncrement = originalColumns.some((oc) => autoIncrement(oc.field));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <Trans
              t={t}
              i18nKey="alterTable.title"
              values={{ table }}
              components={{ b: <span className="font-data font-normal" /> }}
            />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Table name */}
          <div className="flex items-center gap-3">
            <Label htmlFor="alter-table-name" className="shrink-0">
              {t("createTable.name")}
            </Label>
            <Input
              id="alter-table-name"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              className="max-w-xs font-data"
            />
            {isTableRenamed && (
              <span className="text-xs text-blue-500">{t("alterTable.renamed")}</span>
            )}
            {hasAutoIncrement && (
              <>
                <Label htmlFor="alter-table-next-id" className="ml-auto shrink-0">
                  {t("alterTable.nextId")}
                </Label>
                <Tip label={t("alterTable.nextIdHint")}>
                  <Input
                    id="alter-table-next-id"
                    inputMode="numeric"
                    value={nextId}
                    onChange={(e) => setNextId(e.target.value.replace(/\D/g, ""))}
                    className="w-24 font-data"
                  />
                </Tip>
              </>
            )}
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
              {cols.map((col, i) => {
                const isDropped = col.status === "dropped";
                const isAdded = col.status === "added";
                const isChanged = col.status === "renamed" || col.status === "modified";
                const isPK = col.key === "PRI";
                const locked = isPK && !isAdded;

                return (
                  <div
                    key={col.originalName || `new-${i}`}
                    className={cn(
                      "group",
                      isAdded && "bg-green-500/[0.06]",
                      isChanged && "bg-blue-500/[0.06]",
                      isDropped && "bg-destructive/[0.05]",
                    )}
                  >
                    <div className={`${COLS} px-1.5 py-1`}>
                      {/* Name */}
                      {isDropped ? (
                        <span className="truncate px-2 font-data text-sm text-muted-foreground line-through">
                          {col.originalName}
                        </span>
                      ) : (
                        <div className="flex min-w-0 items-center gap-1">
                          <CellInput
                            aria-label={t("table.colName")}
                            placeholder={isAdded ? "column_name" : undefined}
                            value={col.name}
                            onChange={(e) => editCol(i, { name: e.target.value })}
                            disabled={locked}
                            autoFocus={isAdded && !col.name}
                          />
                          {col.status === "renamed" && (
                            <Tip label={t("alterTable.renamedFrom", { name: col.originalName })}>
                              <span className="shrink-0 truncate font-data text-xs text-blue-500">
                                {t("alterTable.was", { name: col.originalName })}
                              </span>
                            </Tip>
                          )}
                        </div>
                      )}

                      {/* Type */}
                      {isDropped ? (
                        <span className="px-2 font-data text-xs text-muted-foreground line-through">
                          {col.type}
                        </span>
                      ) : (
                        <TypeSelect value={col.type} onChange={(type) => editCol(i, { type })} disabled={locked} />
                      )}

                      {/* Constraints: PK and AI as the table has them */}
                      <div className={cn("flex items-center gap-1", isDropped && "opacity-50")}>
                        <Flag label="PK" name={t("table.primaryKey")} on={isPK} />
                        {isPK || isDropped ? null : (
                          <Flag
                            label="NN"
                            name={t("table.notNull")}
                            on={!col.nullable}
                            onChange={(v) => (isAdded ? editAdded : editCol)(i, { nullable: !v })}
                          />
                        )}
                        {isPK || isDropped ? (
                          <Flag label="UQ" name={t("table.unique")} on={col.unique && !isPK} />
                        ) : (
                          <Flag
                            label="UQ"
                            name={t("table.unique")}
                            on={col.unique}
                            onChange={(v) => (isAdded ? editAdded : editCol)(i, { unique: v })}
                            // A UNIQUE over several columns can't be turned off here
                            disabled={!isAdded && col.key === "UNI" && !uniqueIndex(col.originalName)}
                          />
                        )}
                        <Flag label="AI" name={t("table.autoIncrement")} on={autoIncrement(col.originalName)} />
                        {isDropped ? (
                          <Flag label="CK" name={t("table.check")} on={col.hasCheck} />
                        ) : (
                          <Flag
                            label="CK"
                            name={t("table.check")}
                            on={col.hasCheck}
                            onChange={(v) => (isAdded ? editAdded : editCol)(i, { hasCheck: v })}
                          />
                        )}
                      </div>

                      {/* Default */}
                      {isAdded ? (
                        <Tip label={t("alterTable.defaultHint")}>
                          <CellInput
                            aria-label={t("table.colDefault")}
                            placeholder={t("table.defaultPlaceholder")}
                            value={col.defaultValue}
                            onChange={(e) => editAdded(i, { defaultValue: e.target.value })}
                          />
                        </Tip>
                      ) : isDropped ? (
                        <span className="truncate px-2 font-data text-xs text-muted-foreground line-through">
                          {col.defaultValue}
                        </span>
                      ) : (
                        <CellInput
                          aria-label={t("table.colDefault")}
                          placeholder={locked ? undefined : t("table.defaultPlaceholder")}
                          value={col.defaultValue}
                          onChange={(e) => editCol(i, { defaultValue: e.target.value })}
                          disabled={locked}
                        />
                      )}

                      {/* Actions */}
                      <div className="flex justify-end gap-0.5">
                        {isChanged && (
                          <Tip label={t("alterTable.undo")}>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t("alterTable.undo")}
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => undoCol(i)}
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                            </Button>
                          </Tip>
                        )}
                        {isAdded ? (
                          <Tip label={t("alterTable.remove")}>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t("alterTable.remove")}
                              className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
                              onClick={() => removeAdded(i)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </Tip>
                        ) : !isPK ? (
                          <Tip label={isDropped ? t("alterTable.undoDrop") : t("alterTable.drop")}>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={isDropped ? t("alterTable.undoDrop") : t("alterTable.drop")}
                              className={cn(
                                "h-7 w-7 text-muted-foreground",
                                isDropped
                                  ? "hover:text-foreground"
                                  : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive",
                              )}
                              onClick={() => toggleDrop(i)}
                            >
                              {isDropped ? <Undo2 className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </Tip>
                        ) : null}
                      </div>
                    </div>
                    {col.type === "VECTOR" && !isDropped && (
                      <VectorSize
                        label={t("table.colDims")}
                        placeholder={t("table.dimsPlaceholder")}
                        value={col.dimensions}
                        onChange={(dimensions) => editCol(i, { dimensions })}
                        disabled={locked}
                      />
                    )}
                    {col.hasCheck && !isDropped && (
                      <RowDetail>
                        <span className="font-data text-muted-foreground">CHECK (</span>
                        <Input
                          aria-label={t("table.check")}
                          placeholder={`${col.name || "value"} > 0`}
                          value={col.check}
                          onChange={(e) => (isAdded ? editAdded : editCol)(i, { check: e.target.value })}
                          className="h-7 w-64 font-data text-xs md:text-xs"
                        />
                        <span className="font-data text-muted-foreground">)</span>
                      </RowDetail>
                    )}
                  </div>
                );
              })}
            </ColumnList>

            <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={addColumn}>
              <Plus className="h-3.5 w-3.5" />
              {t("table.addColumn")}
            </Button>
          </div>

          {hasChanges && (
            <SqlPreview
              label={t("alterTable.pending", { count: statements.length })}
              sql={`${statements.join(";\n")};`}
            />
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={handleApply} disabled={loading || !hasChanges}>
            {loading
              ? t("alterTable.applying")
              : t("alterTable.apply", { count: statements.length })}
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
    unique: c.key === "UNI",
    key: c.key,
    defaultValue: defaultOf(c),
    hasCheck: !!checkOf(c),
    check: checkOf(c),
    status: "existing" as const,
  }));
}
