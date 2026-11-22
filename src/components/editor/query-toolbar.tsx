
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Play,
  FileSearch,
  Loader2,
  FileOutput,
  History,
  AlignLeft,
  Square,
  FolderOpen,
  Save,
  Bookmark,
  BookmarkCheck,
  X,
} from "lucide-react";
import { useQueryExecution } from "@/hooks/use-query-execution";
import { useEditorStore } from "@/stores/editor-store";
import { useBookmarkStore } from "@/stores/bookmark-store";
import type { ApiResult, QueryResult } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatSQL } from "@/lib/sql-formatter";
import { saveFile, escapeCSV, errorMessage, pickFile } from "@/lib/utils";
import { toast } from "sonner";
import { useModKey } from "@/hooks/use-mod-key";
import { explainAll } from "@/lib/sql-utils";
import { getEditorSelection } from "@/lib/editor-registry";

/** How long the user waited (for a script, the whole script's wait, not the
 * statement's engine time) and what changed. A result's row count is under
 * its grid, which also counts the rows a search leaves. */
function resultStats(result: ApiResult | null, waited?: number) {
  if (!result) return null;
  if ("time" in result && waited !== undefined) result = { ...result, time: waited };
  if ("error" in result && result.error) return null;
  if ("columns" in result) {
    return `${result.time}ms`;
  }
  if ("ddl" in result) {
    return `${result.ddl} | ${result.time}ms`;
  }
  if ("changes" in result) {
    return i18n.t("editor:toolbar.statsChanges", { count: result.changes, time: result.time });
  }
  return null;
}

function exportCSV(result: QueryResult, name: string) {
  const header = result.columns.map(escapeCSV).join(",");
  const rows = result.rows.map((r) => r.map(escapeCSV).join(","));
  const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  saveFile([header, ...rows].join("\n"), `${name}_${ts}.csv`, "text/csv");
}

function exportJSON(result: QueryResult, name: string) {
  const objs = result.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    result.columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
  const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  saveFile(
    JSON.stringify(objs, null, 2),
    `${name}_${ts}.json`,
    "application/json",
  );
}

export function QueryToolbar() {
  const { t } = useTranslation("editor");
  const { executeQuery, cancelQuery, isConnected } = useQueryExecution();

  const activeTab = useEditorStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null,
  );
  const updateTabSql = useEditorStore((s) => s.updateTabSql);
  const addTab = useEditorStore((s) => s.addTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const queryHistory = useEditorStore((s) => s.queryHistory);
  const { bookmarks, addBookmark, removeBookmark } = useBookmarkStore();
  const mod = useModKey();
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [bookmarkName, setBookmarkName] = useState("");
  const saveInputRef = useRef<HTMLInputElement | null>(null);

  // Like Mod+Enter, the buttons run only the selected text when there is one
  const sqlToRun = () => getEditorSelection().trim() || activeTab?.sql.trim() || "";

  const handleRun = () => {
    const sql = sqlToRun();
    if (activeTab && sql) executeQuery(activeTab.id, sql);
  };

  const handleExplain = () => {
    const sql = sqlToRun();
    if (activeTab && sql) executeQuery(activeTab.id, explainAll(sql));
  };

  const handleFormat = () => {
    if (activeTab && activeTab.sql.trim()) {
      const formatted = formatSQL(activeTab.sql);
      updateTabSql(activeTab.id, formatted);
    }
  };

  const handleCancel = () => {
    if (activeTab) cancelQuery(activeTab.id);
  };

  const handleOpenFile = async () => {
    const file = await pickFile(".sql,.txt,text/plain");
    if (!file) return;
    try {
      const sql = await file.text();
      const tabName = file.name.replace(/\.sql$/i, "") || t("tabs.defaultTitle");
      setActiveTab(addTab(tabName, sql));
    } catch (e) {
      toast.error(t("toolbar.openFailed", { name: file.name }), { description: errorMessage(e) });
    }
  };

  const handleSaveBookmark = () => {
    if (!activeTab?.sql.trim()) return;
    if (!showSaveInput) {
      setBookmarkName(activeTab.title);
      setShowSaveInput(true);
      requestAnimationFrame(() => saveInputRef.current?.focus());
      return;
    }
    if (bookmarkName.trim()) {
      addBookmark(bookmarkName.trim(), activeTab.sql);
      setShowSaveInput(false);
      setBookmarkName("");
    }
  };

  const handleLoadBookmark = (sql: string, name: string) => {
    const tabId = addTab(name, sql);
    setActiveTab(tabId);
  };

  // Elapsed timer while query is running
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRunning = activeTab?.isRunning ?? false;

  useEffect(() => {
    if (isRunning) {
      setElapsed(0); // eslint-disable-line react-hooks/set-state-in-effect -- reset timer on run
      const start = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed((Date.now() - start) / 1000);
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  const stats = activeTab ? resultStats(activeTab.result, activeTab.resultsTime) : null;
  const hasQueryResult =
    activeTab?.result &&
    "columns" in activeTab.result &&
    !activeTab.result.error;
  const exportName = activeTab?.title?.replace(/\s+/g, "_") ?? "export";

  return (
    <div className="flex items-center gap-0.5 px-1.5 h-8 border-b panel-toolbar shrink-0">
      {/* Execute */}
      <Tooltip>
        <TooltipTrigger asChild>
          {activeTab?.isRunning ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleCancel}
              className="h-7 gap-1.5 px-2.5 text-xs"
            >
              <Square className="h-3 w-3" />
              {t("toolbar.stop")}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleRun}
              disabled={!isConnected || !activeTab?.sql.trim()}
              className="h-7 gap-1.5 px-2.5 text-xs"
            >
              <Play className="h-3 w-3" />
              {t("toolbar.run")}
            </Button>
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {activeTab?.isRunning
            ? t("toolbar.cancelQuery")
            : !isConnected
              ? t("toolbar.connectFirst")
              : !activeTab?.sql.trim()
                ? t("toolbar.writeQuery")
                : t("toolbar.execute", { mod })}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={t("toolbar.explain")}
            onClick={handleExplain}
            disabled={
              !isConnected || !activeTab?.sql.trim() || activeTab?.isRunning
            }
          >
            <FileSearch className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {t("toolbar.explainShortcut", { mod })}
        </TooltipContent>
      </Tooltip>

      <div className="toolbar-separator" />

      {/* Edit */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={t("toolbar.format")}
            onClick={handleFormat}
            disabled={!activeTab?.sql.trim()}
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {t("toolbar.formatShortcut", { mod })}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={t("toolbar.openFile")}
            onClick={handleOpenFile}
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("toolbar.openFile")}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={t("toolbar.saveFile")}
            onClick={() => {
              if (activeTab?.sql.trim()) {
                const name = activeTab.title.replace(/\s+/g, "_");
                saveFile(activeTab.sql, `${name}.sql`, "text/plain");
              }
            }}
            disabled={!activeTab?.sql.trim()}
          >
            <Save className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("toolbar.saveFile")}</TooltipContent>
      </Tooltip>


      {hasQueryResult && (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t("toolbar.exportResults")}>
                  <FileOutput className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("toolbar.exportResults")}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent>
            <DropdownMenuItem
              onClick={() => {
                const r = activeTab?.result;
                if (r && "columns" in r)
                  exportCSV(r as QueryResult, exportName);
              }}
            >
              {t("toolbar.exportCsv")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const r = activeTab?.result;
                if (r && "columns" in r)
                  exportJSON(r as QueryResult, exportName);
              }}
            >
              {t("toolbar.exportJson")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <div className="toolbar-separator" />

      {/* Library */}
      {queryHistory.length > 0 && (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t("toolbar.history")}>
                  <History className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("toolbar.history")}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="w-80">
            <ScrollArea className="max-h-60">
              {queryHistory.map((sql) => (
                <DropdownMenuItem
                  key={sql}
                  className="text-xs font-data py-1"
                  onClick={() => {
                    if (activeTab) {
                      updateTabSql(activeTab.id, sql);
                    }
                  }}
                >
                  <span className="truncate">{sql}</span>
                </DropdownMenuItem>
              ))}
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={t("toolbar.saveBookmark")}
            onClick={handleSaveBookmark}
            disabled={!activeTab?.sql.trim()}
          >
            <BookmarkCheck className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("toolbar.saveBookmark")}</TooltipContent>
      </Tooltip>

      {showSaveInput && (
        <form
          className="flex items-center gap-0.5"
          onSubmit={(e) => {
            e.preventDefault();
            handleSaveBookmark();
          }}
        >
          <input
            ref={saveInputRef}
            className="h-7 w-32 px-2 text-xs border rounded bg-background"
            placeholder={t("toolbar.bookmarkName")}
            value={bookmarkName}
            onChange={(e) => setBookmarkName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setShowSaveInput(false);
                setBookmarkName("");
              }
            }}
          />
          <Button type="submit" size="sm" variant="ghost" className="h-7 px-2 text-xs">
            {t("toolbar.ok")}
          </Button>
        </form>
      )}

      {bookmarks.length > 0 && (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t("toolbar.bookmarks")}>
                  <Bookmark className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("toolbar.bookmarks")}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="w-72">
            <ScrollArea className="max-h-60">
              {bookmarks.map((bm) => (
                <DropdownMenuItem
                  key={bm.id}
                  className="text-xs py-1 flex items-center gap-2"
                  onClick={() => handleLoadBookmark(bm.sql, bm.name)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{bm.name}</div>
                    <div className="text-xs text-muted-foreground truncate font-data">
                      {bm.sql.slice(0, 80)}
                    </div>
                  </div>
                  <button
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeBookmark(bm.id);
                    }}
                    aria-label={t("toolbar.removeBookmark", { name: bm.name })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </DropdownMenuItem>
              ))}
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <div className="flex-1" />
      {isRunning && (
        <span className="text-xs text-muted-foreground tabular-nums flex items-center gap-1">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          {elapsed.toFixed(1)}s
        </span>
      )}
      {!isRunning && stats && (
        <span className="text-xs text-muted-foreground/70 tabular-nums">
          {stats}
        </span>
      )}
    </div>
  );
}
