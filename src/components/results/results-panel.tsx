
import { Trans, useTranslation } from "react-i18next";
import { useEditorStore } from "@/stores/editor-store";
import { DataGrid } from "./data-grid";
import { ExplainView } from "@/components/explain/explain-view";
import { AlertCircle, CheckCircle2, PenLine, Table2, Terminal } from "lucide-react";
import { useModKey } from "@/hooks/use-mod-key";
import { cn, scrollSideways } from "@/lib/utils";
import { isExplain } from "@/lib/sql-utils";
import { Tip } from "@/components/ui/tip";

/**
 * A script's statements as tabs over the result, each labelled with what it
 * returned. Only shown when more than one statement ran.
 */
export function ResultsPanel() {
  const { t } = useTranslation("editor");
  const tab = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null);
  const selectTabResult = useEditorStore((s) => s.selectTabResult);
  const results = tab?.results;
  // A script that failed partway: its failure over the statements that ran
  const failed = tab?.resultsError ? <FailedBar error={tab.resultsError} /> : null;
  if (!tab || !results || results.length < 2) {
    if (!failed) return <ResultView />;
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {failed}
        <div className="flex-1 overflow-hidden">
          <ResultView />
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {failed}
      <div
        role="tablist"
        aria-label={t("results.statementResults")}
        className="flex shrink-0 items-end gap-0.5 overflow-x-auto border-b border-border bg-muted/40 px-1.5 pt-1 scrollbar-none"
        onWheel={scrollSideways}
      >
        {results.map((r, i) => {
          const [Icon, detail] =
            "columns" in r
              ? [Table2, t("results.rows", { count: r.rows.length })]
              : "ddl" in r
                ? [CheckCircle2, r.ddl]
                : [PenLine, t("results.changed", { count: r.changes })];
          const selected = i === tab.resultIndex;
          return (
            <Tip key={i} label={r.sql.replace(/\s+/g, " ").trim()} side="bottom">
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectTabResult(tab.id, i)}
                className={cn(
                  "-mb-px flex shrink-0 items-center gap-1.5 rounded-t-md border px-3 py-1.5 text-xs",
                  selected
                    ? "border-border border-b-background bg-background font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground",
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", selected ? "text-primary" : "opacity-60")} />
                <span>
                  <Trans
                    t={t}
                    i18nKey="results.resultTab"
                    values={{ n: i + 1, detail }}
                    components={{ d: <span className="font-normal text-muted-foreground" /> }}
                  />
                </span>
              </button>
            </Tip>
          );
        })}
      </div>
      <div className="flex-1 overflow-hidden">
        <ResultView />
      </div>
    </div>
  );
}

function FailedBar({ error }: { error: string }) {
  return (
    <div className="flex shrink-0 items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <pre className="flex-1 whitespace-pre-wrap font-data text-xs text-destructive">{error}</pre>
    </div>
  );
}

function ResultView() {
  const { t } = useTranslation("editor");
  const result = useEditorStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.result ?? null,
  );
  // The statement behind the result: its own in a script, else the run's SQL
  const lastExecutedSql = useEditorStore((s) => {
    const t = s.tabs.find((t) => t.id === s.activeTabId);
    return t?.results?.[t.resultIndex ?? -1]?.sql ?? t?.lastExecutedSql;
  });
  const mod = useModKey();

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1.5">
        <Terminal className="h-6 w-6 opacity-15" />
        <p className="text-xs text-muted-foreground/50">{t("results.empty")}</p>
        <p className="text-xs text-muted-foreground/30">
          {t("results.emptyHint", { mod })}
        </p>
      </div>
    );
  }

  if ("error" in result && result.error) {
    return (
      <div className="p-4 flex items-start gap-2 overflow-auto h-full">
        <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        <div className="flex flex-col items-start gap-2">
          <pre className="text-sm text-destructive whitespace-pre-wrap font-data">
            {result.error}
          </pre>
        </div>
      </div>
    );
  }

  if ("columns" in result) {
    // Detect EXPLAIN by checking the SQL that was executed
    const explain =
      isExplain(lastExecutedSql ?? "") &&
      result.columns.length === 1 &&
      result.rows.length > 0;

    if (explain) {
      const planText = result.rows.map((r) => String(r[0] ?? "")).join("\n");
      return <ExplainView plan={planText} />;
    }

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {result.rows.length >= 10000 && (
          <div className="px-3 py-1 bg-amber-500/10 border-b text-xs text-amber-600 dark:text-amber-400 shrink-0">
            {t("results.largeResult", { count: result.rows.length })}
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
          {t("results.ddlCompleted", { ddl: result.ddl })}
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
          {t("results.rowsAffected", { count: result.changes })}
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
      <span className="text-sm">{t("results.success")}</span>
    </div>
  );
}
