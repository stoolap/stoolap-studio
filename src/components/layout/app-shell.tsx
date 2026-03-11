"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Toolbar } from "./toolbar";
import { Sidebar } from "./sidebar";
import { EditorTabs } from "@/components/editor/editor-tabs";
import { SqlEditor } from "@/components/editor/sql-editor";
import { QueryToolbar } from "@/components/editor/query-toolbar";
import { ResultsPanel } from "@/components/results/results-panel";
import { TableViewer } from "@/components/data/table-viewer";
import { KeyboardShortcuts } from "@/components/common/keyboard-shortcuts";
import { useEditorStore } from "@/stores/editor-store";
import { useConnectionStore } from "@/stores/connection-store";
import { useTableColumns, useEditorSchema } from "@/hooks/use-schema";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as api from "@/lib/api-client";

const SIDEBAR_WIDTH_DEFAULT = 280;
const EDITOR_HEIGHT_DEFAULT = 220;

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_WIDTH_DEFAULT);
  const [editorHeight, setEditorHeight] = useState(EDITOR_HEIGHT_DEFAULT);
  const [isDark, setIsDark] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingEditor, setIsResizingEditor] = useState(false);
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const sidebarWidthRef = useRef(sidebarWidth);
  const editorHeightRef = useRef(editorHeight);
  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
    editorHeightRef.current = editorHeight;
  });

  const activeTab = useEditorStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null,
  );
  const tabs = useEditorStore((s) => s.tabs);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const activeId = useConnectionStore((s) => s.activeId);
  const connections = useConnectionStore((s) => s.connections);
  const activeConn = connections.find((c) => c.id === activeId);

  const setConnections = useConnectionStore((s) => s.setConnections);
  const setActiveId = useConnectionStore((s) => s.setActiveId);

  // Restore persisted layout sizes after hydration
  useEffect(() => {
    try {
      const sw = localStorage.getItem("stoolap-sidebar-width");
      if (sw) setSidebarWidth(Number(sw) || SIDEBAR_WIDTH_DEFAULT); // eslint-disable-line react-hooks/set-state-in-effect
      const eh = localStorage.getItem("stoolap-editor-height");
      if (eh) setEditorHeight(Number(eh) || EDITOR_HEIGHT_DEFAULT);
    } catch {
      /* localStorage unavailable (private browsing) */
    }
  }, []);

  // On mount: close Example DB, then sync all remaining connections from server
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Close Example DB from previous session
        await fetch("/api/connections", { method: "DELETE" });
        if (cancelled) return;
        // Sync remaining connections (memory + file all survive)
        const remaining = await api.listConnections();
        if (cancelled) return;
        setConnections(remaining);
        const currentActiveId = useConnectionStore.getState().activeId;
        if (
          remaining.length > 0 &&
          !remaining.find((c) => c.id === currentActiveId)
        ) {
          setActiveId(remaining[0].id);
        }
      } catch {
        // Server not ready yet, ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // On page unload: close Example DB via DELETE (sendBeacon only supports POST,
  // so we route cleanup through the POST handler with a cleanup flag)
  useEffect(() => {
    const handleUnload = () => {
      const blob = new Blob([JSON.stringify({ cleanup: true })], {
        type: "application/json",
      });
      navigator.sendBeacon("/api/connections", blob);
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  // Set first tab active if none selected
  useEffect(() => {
    if (!activeTab && tabs.length > 0) {
      setActiveTab(tabs[0].id);
    }
  }, [activeTab, tabs, setActiveTab]);

  // Watch dark mode changes (for CodeMirror theme)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    setIsDark(document.documentElement.classList.contains("dark")); // eslint-disable-line react-hooks/set-state-in-effect
    return () => observer.disconnect();
  }, []);

  // Listen for sidebar toggle shortcut (Cmd+B)
  useEffect(() => {
    const handler = () => setSidebarOpen((prev) => !prev);
    window.addEventListener("stoolap:toggle-sidebar", handler);
    return () => window.removeEventListener("stoolap:toggle-sidebar", handler);
  }, []);

  // Sidebar resize handler
  const handleSidebarMouseDown = useCallback(() => {
    setIsResizingSidebar(true);
  }, []);

  // Editor resize handler
  const handleEditorMouseDown = useCallback(() => {
    setIsResizingEditor(true);
  }, []);

  useEffect(() => {
    if (!isResizingSidebar && !isResizingEditor) return;

    // Disable text selection and set resize cursor during drag
    document.body.style.userSelect = "none";
    document.body.style.cursor = isResizingSidebar
      ? "col-resize"
      : "row-resize";

    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar) {
        const newWidth = Math.max(160, Math.min(500, e.clientX));
        setSidebarWidth(newWidth);
      }
      if (isResizingEditor && editorAreaRef.current) {
        const rect = editorAreaRef.current.getBoundingClientRect();
        const newHeight = Math.max(60, Math.min(600, e.clientY - rect.top));
        setEditorHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      if (isResizingSidebar) {
        localStorage.setItem(
          "stoolap-sidebar-width",
          String(sidebarWidthRef.current),
        );
      }
      if (isResizingEditor) {
        localStorage.setItem(
          "stoolap-editor-height",
          String(editorHeightRef.current),
        );
      }
      setIsResizingSidebar(false);
      setIsResizingEditor(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizingSidebar, isResizingEditor]);

  const editorSchema = useEditorSchema();
  const isDataTab = activeTab?.mode === "data" && activeTab.tableName;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <KeyboardShortcuts />
      <Toolbar />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <>
            <div
              style={{ width: sidebarWidth }}
              className="shrink-0 overflow-hidden border-r"
            >
              <Sidebar />
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              className="w-px cursor-col-resize hover:w-0.5 hover:bg-primary/30 active:bg-primary/50 shrink-0 transition-all bg-border/50"
              onMouseDown={handleSidebarMouseDown}
            />
          </>
        )}

        {/* Main content */}
        <div
          ref={editorAreaRef}
          className="flex-1 flex flex-col overflow-hidden"
        >
          {/* Sidebar toggle + Editor tabs */}
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 rounded-none"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-3.5 w-3.5" />
              ) : (
                <PanelLeft className="h-3.5 w-3.5" />
              )}
            </Button>
            <div className="flex-1 overflow-hidden">
              <EditorTabs />
            </div>
          </div>

          {isDataTab ? (
            <DataTabContent
              tableName={activeTab.tableName!}
              initialFilter={activeTab.initialFilter}
            />
          ) : (
            <>
              {/* Editor */}
              <div
                style={{ height: editorHeight }}
                className="shrink-0 overflow-hidden"
              >
                {activeTab && (
                  <SqlEditor
                    tabId={activeTab.id}
                    value={activeTab.sql}
                    isDark={isDark}
                    schema={editorSchema}
                  />
                )}
              </div>

              {/* Query toolbar */}
              <QueryToolbar />

              {/* Resize handle */}
              <div
                role="separator"
                aria-orientation="horizontal"
                className="h-px cursor-row-resize hover:h-0.5 hover:bg-primary/30 active:bg-primary/50 shrink-0 transition-all bg-border/50"
                onMouseDown={handleEditorMouseDown}
              />

              {/* Results */}
              <div className="flex-1 overflow-hidden">
                <ResultsPanel />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center h-7 border-t text-xs bg-muted/30 shrink-0 select-none">
        <div className="flex items-center gap-1.5 px-3 border-r border-border/30 h-full">
          {activeConn ? (
            <>
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              <span className="text-foreground/70">{activeConn.name}</span>
            </>
          ) : (
            <>
              <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" />
              <span className="text-muted-foreground">Disconnected</span>
            </>
          )}
        </div>
        {activeConn && (
          <div className="flex items-center px-3 border-r border-border/30 h-full text-muted-foreground">
            {activeConn.type === "memory" ? "In-Memory" : activeConn.path}
          </div>
        )}
        {activeTab && (
          <div className="flex items-center px-3 border-r border-border/30 h-full text-muted-foreground">
            {activeTab.mode === "data"
              ? `Table: ${activeTab.tableName}`
              : activeTab.title}
          </div>
        )}
        <div className="flex-1" />
        <div className="flex items-center px-3 h-full text-muted-foreground/50">
          Stoolap Studio v{process.env.NEXT_PUBLIC_APP_VERSION}
        </div>
      </div>
    </div>
  );
}

function DataTabContent({
  tableName,
  initialFilter,
}: {
  tableName: string;
  initialFilter?: { column: string; value: string };
}) {
  const { data: columns, isLoading, error } = useTableColumns(tableName);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-destructive text-xs">
        Table &quot;{tableName}&quot; is no longer available:{" "}
        {error instanceof Error ? error.message : "Not found"}
      </div>
    );
  }

  if (isLoading || !columns) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
        Loading table schema...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden">
      <TableViewer
        table={tableName}
        columns={columns}
        initialFilter={initialFilter}
      />
    </div>
  );
}
