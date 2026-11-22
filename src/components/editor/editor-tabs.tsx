
import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/stores/editor-store";
import { useQueryExecution } from "@/hooks/use-query-execution";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, X, Table2, FileCode, Loader2 } from "lucide-react";
import { cn, scrollSideways } from "@/lib/utils";
import { Tip } from "@/components/ui/tip";

export function EditorTabs() {
  const { t } = useTranslation("editor");
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const addTab = useEditorStore((s) => s.addTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const updateTabTitle = useEditorStore((s) => s.updateTabTitle);
  const { cancelQuery } = useQueryExecution();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingId]);

  // Bring the active tab into view: one opened past the right edge of a
  // full tab bar would otherwise stay hidden.
  const tabListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tabListRef.current
      ?.querySelector('[role="tab"][aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId, tabs.length]);

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      updateTabTitle(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  return (
    // Its empty space moves the window on macOS, where the tab row is the title bar
    <div data-tauri-drag-region className="flex h-full items-center gap-1 px-1">
      <div
        ref={tabListRef}
        role="tablist"
        className="flex min-w-0 items-center gap-1 self-stretch overflow-x-auto scrollbar-none"
        onWheel={scrollSideways}
      >
        {tabs.map((tab) => (
          <Tooltip key={tab.id}>
            <TooltipTrigger asChild>
              <div
                role="tab"
                aria-selected={activeTabId === tab.id}
                className={cn(
                  // Pills on the toolbar, as macOS 26's tabs
                  "group my-1.5 flex items-center self-stretch gap-1.5 rounded-lg px-3 py-1 text-xs cursor-pointer shrink-0",
                  activeTabId === tab.id
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground/70 hover:text-foreground/80 hover:bg-foreground/5",
                )}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.mode === "data" ? (
                  <Table2 className="h-4 w-4 text-blue-400 shrink-0" />
                ) : (
                  <FileCode className="h-4 w-4 shrink-0 opacity-50" />
                )}
                {renamingId === tab.id ? (
                  <input
                    ref={renameInputRef}
                    className="w-20 bg-transparent text-xs outline-none border-b border-primary"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="truncate max-w-[100px]"
                    onDoubleClick={(e) => {
                      if (tab.mode !== "data") {
                        e.stopPropagation();
                        setRenamingId(tab.id);
                        setRenameValue(tab.title);
                      }
                    }}
                  >
                    {tab.title}
                  </span>
                )}
                {tab.isRunning && (
                  <Loader2
                    className="ml-0.5 h-2.5 w-2.5 animate-spin text-yellow-500"
                    aria-label={t("tabs.running")}
                  />
                )}
                {tabs.length > 1 && (
                  <button
                    className={cn(
                      "ml-1 rounded p-0.5 group-hover:opacity-50 hover:!opacity-100 hover:bg-foreground/10",
                      // The active tab always shows its close button
                      activeTabId === tab.id ? "opacity-50" : "opacity-0",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      cancelQuery(tab.id);
                      closeTab(tab.id);
                    }}
                    aria-label={t("tabs.close", { title: tab.title })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {tab.mode === "data"
                ? t("tabs.dataTooltip", { title: tab.title })
                : t("tabs.renameTooltip", { title: tab.title })}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      {/* Outside the scrolling list, so a full tab bar cannot push it off-screen */}
      <Tip label={t("tabs.newTab")}>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 opacity-40 hover:opacity-100"
          onClick={() => addTab()}
          aria-label={t("tabs.newTab")}
        >
          <Plus className="size-[18px]" />
        </Button>
      </Tip>
    </div>
  );
}
