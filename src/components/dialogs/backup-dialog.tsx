
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useConnectionStore } from "@/stores/connection-store";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { errorMessage, saveFile } from "@/lib/utils";
import { parseForeignKeys } from "@/lib/fk-parser";
import * as api from "@/lib/api-client";
import {
  DEFAULT_DUMP_OPTIONS,
  generateHeader,
  generateTableDrops,
  generateTableIndexes,
  generateViewSection,
} from "@/lib/sql-dump";
import type { DumpOptions } from "@/lib/sql-dump";

interface BackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BackupDialog({ open, onOpenChange }: BackupDialogProps) {
  const { t } = useTranslation("dialogs");
  const activeId = useConnectionStore((s) => s.activeId);
  const connections = useConnectionStore((s) => s.connections);
  const activeConn = connections.find((c) => c.id === activeId);

  const [options, setOptions] = useState<DumpOptions>({
    ...DEFAULT_DUMP_OPTIONS,
  });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const resetAndClose = () => {
    setOptions({ ...DEFAULT_DUMP_OPTIONS });
    setLoading(false);
    setProgress("");
    setError("");
    onOpenChange(false);
  };

  const toggleOption = (key: keyof DumpOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleBackup = async () => {
    if (!activeId || !activeConn) return;
    setLoading(true);
    setError("");

    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    const connName = activeConn.name.replace(/\s+/g, "_").toLowerCase();

    // The dump is gathered page by page, then handed to the browser to save
    const chunks: string[] = [];
    const writeChunk = async (chunk: string) => {
      if (chunk) chunks.push(chunk);
    };

    try {
      setProgress(t("backup.writingHeader"));
      await writeChunk(generateHeader(activeConn.name));

      if (options.tables) {
        setProgress(t("backup.fetchingTables"));
        const tables = await api.fetchTables(activeId);

        setProgress(t("backup.analyzing"));
        const tableOrder = await sortTablesByFKDeps(activeId, tables);

        if (options.dropBeforeCreate) {
          await writeChunk(generateTableDrops(tableOrder));
        }

        for (let i = 0; i < tableOrder.length; i++) {
          const tableName = tableOrder[i];
          setProgress(
            t("backup.exportingTable", { index: i + 1, total: tableOrder.length, name: tableName }),
          );

          const ddl = await api.fetchDDL(activeId, tableName, "table");
          const section = `-- Table: ${tableName}\n${ddl};\n\n`;
          await writeChunk(section);

          if (options.data) {
            const PAGE = 10000;
            let pageOffset = 0;
            // eslint-disable-next-line no-constant-condition
            while (true) {
              const page = await api.fetchTableInserts(
                activeId,
                tableName,
                pageOffset,
                PAGE,
              );
              if (page.rows > 0) await writeChunk(page.sql + "\n");
              if (page.rows < PAGE) break;
              pageOffset += PAGE;
            }
            await writeChunk("\n");
          }

          if (options.indexes) {
            const indexes = await api.fetchIndexes(activeId, tableName);
            const indexSql = generateTableIndexes(tableName, indexes);
            if (indexSql) {
              await writeChunk(indexSql);
            }
          }
        }
      }

      if (options.views) {
        setProgress(t("backup.fetchingViews"));
        const views = await api.fetchViews(activeId);
        for (let i = 0; i < views.length; i++) {
          const viewName = views[i];
          setProgress(t("backup.exportingView", { index: i + 1, total: views.length, name: viewName }));
          const ddl = await api.fetchDDL(activeId, viewName, "view");
          await writeChunk(generateViewSection(viewName, ddl, options));
        }
      }

      saveFile(chunks.join(""), `${connName}_${ts}.sql`, "application/sql");
      import("@/lib/native").then((n) =>
        n.notify(t("backup.notifyTitle"), t("backup.notifyBody", { name: activeConn.name })),
      );
      toast.success(t("backup.exported"));
      resetAndClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetAndClose();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5" />
            {t("backup.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {activeConn && (
            <p className="text-sm text-muted-foreground">
              <Trans
                t={t}
                i18nKey="backup.intro"
                values={{ name: activeConn.name }}
                components={{ b: <span className="font-medium text-foreground" /> }}
              />
            </p>
          )}

          <div className="space-y-3">
            <Label className="text-sm font-medium">{t("backup.include")}</Label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={options.tables}
                onCheckedChange={() => toggleOption("tables")}
                disabled={loading}
              />
              {t("backup.tables")}
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={options.data}
                onCheckedChange={() => toggleOption("data")}
                disabled={loading || !options.tables}
              />
              {t("backup.data")}
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={options.indexes}
                onCheckedChange={() => toggleOption("indexes")}
                disabled={loading || !options.tables}
              />
              {t("backup.indexes")}
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={options.views}
                onCheckedChange={() => toggleOption("views")}
                disabled={loading}
              />
              {t("backup.views")}
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={options.dropBeforeCreate}
                onCheckedChange={() => toggleOption("dropBeforeCreate")}
                disabled={loading}
              />
              {t("backup.dropBeforeCreate")}
            </label>
          </div>

          {progress && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              <span className="truncate">{progress}</span>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose} disabled={loading}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={handleBackup} disabled={loading} data-default>
            {loading ? t("backup.exporting") : t("backup.export")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Topologically sort tables so referenced tables come before tables with FKs.
 * Falls back to original order if cycles are detected.
 */
async function sortTablesByFKDeps(
  connId: string,
  tables: string[],
): Promise<string[]> {
  const tableSet = new Set(tables);
  const deps = new Map<string, Set<string>>();
  for (const t of tables) deps.set(t, new Set());

  for (const t of tables) {
    try {
      const ddl = await api.fetchDDL(connId, t, "table");
      const fks = parseForeignKeys(ddl);
      for (const fk of fks) {
        if (tableSet.has(fk.referencedTable) && fk.referencedTable !== t) {
          deps.get(t)!.add(fk.referencedTable);
        }
      }
    } catch {
      // If DDL fetch fails, keep original order for this table
    }
  }

  // Kahn's algorithm
  const inDegree = new Map<string, number>();
  for (const t of tables) inDegree.set(t, 0);
  // Count how many tables depend on each table
  const dependedBy = new Map<string, string[]>();
  for (const t of tables) dependedBy.set(t, []);
  for (const [t, refs] of deps) {
    for (const ref of refs) {
      dependedBy.get(ref)!.push(t);
    }
  }
  for (const [t, refs] of deps) {
    inDegree.set(t, refs.size);
  }

  const queue: string[] = [];
  for (const [t, deg] of inDegree) {
    if (deg === 0) queue.push(t);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const t = queue.shift()!;
    sorted.push(t);
    for (const dependent of dependedBy.get(t) ?? []) {
      const newDeg = (inDegree.get(dependent) ?? 1) - 1;
      inDegree.set(dependent, newDeg);
      if (newDeg === 0) queue.push(dependent);
    }
  }

  // If cycle detected (sorted.length < tables.length), fall back to original order
  return sorted.length === tables.length ? sorted : tables;
}
