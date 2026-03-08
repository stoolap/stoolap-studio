"use client";

import { useEditorStore } from "@/stores/editor-store";
import { DataGrid } from "./data-grid";
import { ExplainView } from "@/components/explain/explain-view";
import { AlertCircle, CheckCircle2, Terminal } from "lucide-react";
import { useModKey } from "@/hooks/use-mod-key";

export function ResultsPanel() {
  const result = useEditorStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.result ?? null,
  );
  const lastExecutedSql = useEditorStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.lastExecutedSql,
  );
  const mod = useModKey();

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <Terminal className="h-8 w-8 opacity-20" />
        <p className="text-sm">Run a query to see results</p>
        <p className="text-xs text-muted-foreground/50">
          {mod}+Enter to execute
        </p>
      </div>
    );
  }

  if ("error" in result && result.error) {
    return (
      <div className="p-4 flex items-start gap-2 overflow-auto h-full">
        <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        <pre className="text-sm text-destructive whitespace-pre-wrap font-data">
          {result.error}
        </pre>
      </div>
    );
  }

  if ("columns" in result) {
    // Detect EXPLAIN by checking the SQL that was executed
    const executedSql = lastExecutedSql?.trimStart().toUpperCase() ?? "";
    const isExplain =
      executedSql.startsWith("EXPLAIN") &&
      result.columns.length === 1 &&
      result.rows.length > 0;

    if (isExplain) {
      const planText = result.rows.map((r) => String(r[0] ?? "")).join("\n");
      return <ExplainView plan={planText} />;
    }

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {result.rows.length >= 10000 && (
          <div className="px-3 py-1 bg-amber-500/10 border-b text-xs text-amber-600 dark:text-amber-400 shrink-0">
            Large result set ({result.rows.length.toLocaleString()} rows).
            Consider adding LIMIT to your query for better performance.
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <DataGrid columns={result.columns} rows={result.rows} />
        </div>
      </div>
    );
  }

  if ("ddl" in result) {
    return (
      <div className="p-4 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <span className="text-sm">
          {result.ddl} completed
          <span className="text-muted-foreground ml-1 tabular-nums">
            ({result.time}ms)
          </span>
        </span>
      </div>
    );
  }

  if ("changes" in result) {
    return (
      <div className="p-4 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <span className="text-sm">
          {result.changes} row{result.changes !== 1 ? "s" : ""} affected
          <span className="text-muted-foreground ml-1 tabular-nums">
            ({result.time}ms)
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className="p-4 flex items-center gap-2 text-muted-foreground">
      <CheckCircle2 className="h-4 w-4" />
      <span className="text-sm">Query executed successfully</span>
    </div>
  );
}
