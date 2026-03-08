"use client";

import { useState, useRef, useEffect } from "react";
import { useEditorStore } from "@/stores/editor-store";
import { useQueryExecution } from "@/hooks/use-query-execution";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, X, Table2, FileCode, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function EditorTabs() {
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

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      updateTabTitle(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  return (
    <div
      role="tablist"
      className="flex items-center bg-muted/30 overflow-x-auto scrollbar-none border-b"
    >
      {tabs.map((tab) => (
        <Tooltip key={tab.id}>
          <TooltipTrigger asChild>
            <div
              role="tab"
              aria-selected={activeTabId === tab.id}
              className={cn(
                "group flex items-center gap-1.5 px-3 py-1.5 text-sm cursor-pointer shrink-0 border-r border-border/20 transition-colors",
                activeTabId === tab.id
                  ? "bg-background text-foreground tab-active"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60",
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.mode === "data" ? (
                <Table2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              ) : (
                <FileCode className="h-3.5 w-3.5 shrink-0 opacity-40" />
              )}
              {renamingId === tab.id ? (
                <input
                  ref={renameInputRef}
                  className="w-24 bg-transparent text-sm outline-none border-b border-primary"
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
                  className="truncate max-w-[120px]"
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
                  className="ml-0.5 h-3 w-3 animate-spin text-yellow-500"
                  aria-label="Running"
                />
              )}
              {tabs.length > 1 && (
                <button
                  className="ml-0.5 opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:text-destructive transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelQuery(tab.id);
                    closeTab(tab.id);
                  }}
                  aria-label={`Close ${tab.title}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {tab.title}
            {tab.mode === "data" && " (Data)"}
            {tab.mode !== "data" && " — double-click to rename"}
          </TooltipContent>
        </Tooltip>
      ))}
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 shrink-0 mx-1.5 opacity-50 hover:opacity-100"
        onClick={() => addTab()}
        title="New query tab"
        aria-label="New query tab"
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}
