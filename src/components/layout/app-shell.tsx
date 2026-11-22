import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn, errorMessage } from "@/lib/utils";
import { Toolbar } from "./toolbar";
import { QueryTimeoutSelect } from "./query-timeout-select";
import { Welcome } from "./welcome";
import { AppMenu } from "./app-menu";
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
import * as native from "@/lib/native";
import { NativeHost } from "@/components/common/native-host";
import { Tip } from "@/components/ui/tip";

const SIDEBAR_WIDTH_DEFAULT = 240;
const EDITOR_HEIGHT_DEFAULT = 220;

export function AppShell() {
  const { t } = useTranslation("layout");
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
  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  // The app's menu and the sidebar's toggle, at the tab row's start
  const toggles = (
    <div className="flex shrink-0 items-center gap-0.5 px-1">
      <AppMenu />
      <SidebarToggle open={sidebarOpen} onToggle={toggleSidebar} />
    </div>
  );
  const transactionOpen = useConnectionStore((s) => (activeId ? !!s.openTransactions[activeId] : false));

  const setConnections = useConnectionStore((s) => s.setConnections);
  const setActiveId = useConnectionStore((s) => s.setActiveId);

  // Restore persisted layout sizes
  useEffect(() => {
    try {
      const sw = localStorage.getItem("stoolap-sidebar-width");
      if (sw) setSidebarWidth(Number(sw) || SIDEBAR_WIDTH_DEFAULT);
      const eh = localStorage.getItem("stoolap-editor-height");
      if (eh) setEditorHeight(Number(eh) || EDITOR_HEIGHT_DEFAULT);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  // On mount: close Example DB, then sync connections
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await native.closeExample();
        if (cancelled) return;
        const remaining = await native.listConnections();
        if (cancelled) return;
        setConnections(remaining);
        const currentActiveId = useConnectionStore.getState().activeId;
        if (
          remaining.length > 0 &&
          !remaining.find((c: { id: string }) => c.id === currentActiveId)
        ) {
          setActiveId(remaining[0].id);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setIsDark(document.documentElement.classList.contains("dark"));
    return () => observer.disconnect();
  }, []);

  // Listen for sidebar toggle (Cmd+B via keyboard shortcut)
  useEffect(() => {
    const handler = () => setSidebarOpen((prev) => !prev);
    window.addEventListener("stoolap:toggle-sidebar", handler);
    return () => window.removeEventListener("stoolap:toggle-sidebar", handler);
  }, []);

  const handleSidebarMouseDown = useCallback(() => {
    setIsResizingSidebar(true);
  }, []);

  const handleEditorMouseDown = useCallback(() => {
    setIsResizingEditor(true);
  }, []);

  useEffect(() => {
    if (!isResizingSidebar && !isResizingEditor) return;

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
    <div className="h-screen flex text-foreground">
      <KeyboardShortcuts />
      <NativeHost />
      {/* Headless toolbar — just manages dialogs */}
      <Toolbar />

      {/* Slides open and shut: its width goes to 0 while the content keeps
          its own, clipped. Not while being resized, which would lag. */}
      <div
        style={{ width: sidebarOpen ? sidebarWidth : 0 }}
        inert={!sidebarOpen}
        className={cn(
          "shrink-0 overflow-hidden",
          !isResizingSidebar && "transition-[width] duration-200 ease-out motion-reduce:transition-none",
        )}
      >
        <div style={{ width: sidebarWidth }} className="h-full border-r border-border/40 bg-sidebar">
          <Sidebar />
        </div>
      </div>
      {sidebarOpen && (
        <div
          role="separator"
          aria-orientation="vertical"
          className="w-px shrink-0 cursor-col-resize bg-transparent hover:w-0.5 hover:bg-primary/30 active:bg-primary/50"
          onMouseDown={handleSidebarMouseDown}
        />
      )}

      <div className="flex-1 min-w-0 flex flex-col bg-background">
        <div className="flex-1 flex overflow-hidden">

          {/* Main content area — opaque background */}
          <div
            ref={editorAreaRef}
            className="flex-1 flex flex-col overflow-hidden bg-background"
          >
            {connections.length === 0 ? (
              <>
                <div className="flex h-9 shrink-0 items-center">{toggles}</div>
                <Welcome />
              </>
            ) : (
              <>
                <div className="flex items-center">
                  {toggles}
                  <div className="flex-1 self-stretch overflow-hidden">
                    <EditorTabs />
                  </div>
                </div>

                {isDataTab ? (
                  <DataTabContent
                    // Its own filters, page, sort and time travel: not the
                    // previous data tab's
                    key={activeTab.id}
                    tableName={activeTab.tableName!}
                    initialFilter={activeTab.initialFilter}
                  />
                ) : (
                  <>
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

                    <QueryToolbar />

                    <div
                      role="separator"
                      aria-orientation="horizontal"
                      className="h-px cursor-row-resize hover:h-0.5 hover:bg-primary/30 active:bg-primary/50 shrink-0 bg-border/30"
                      onMouseDown={handleEditorMouseDown}
                    />

                    <div className="flex-1 overflow-hidden">
                      <ResultsPanel />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center h-8 text-xs bg-background shrink-0">
          <div className="flex items-center gap-1.5 px-3 h-full">
            {activeConn ? (
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                <span className="text-foreground/80">{activeConn.name}</span>
                {activeConn.type === "memory" ? (
                  <Tip label={t("statusBar.inMemoryHint")} side="top">
                    <span className="cursor-help text-muted-foreground">— {t("statusBar.inMemory")}</span>
                  </Tip>
                ) : (
                  <span className="text-muted-foreground">— {activeConn.path}</span>
                )}
                {transactionOpen && (
                  <Tip label={t("statusBar.transactionOpenHint")} side="top">
                    <span className="ml-1 flex cursor-help items-center gap-1 rounded bg-amber-500/15 px-1.5 text-amber-600 dark:text-amber-400">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                      {t("statusBar.transactionOpen")}
                    </span>
                  </Tip>
                )}
              </>
            ) : (
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" />
                <span className="text-muted-foreground">{t("statusBar.noConnection")}</span>
              </>
            )}
          </div>
          <div className="flex-1" />
          {/* Hidden, not unmounted: it pushes the saved timeout at startup */}
          <div hidden={!activeConn}>
            <QueryTimeoutSelect />
          </div>
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
  const { t } = useTranslation("layout");
  const { data: columns, isLoading, error } = useTableColumns(tableName);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-destructive text-xs">
        {t("dataTab.unavailable", { table: tableName, error: errorMessage(error) })}
      </div>
    );
  }

  if (isLoading || !columns) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
        {t("dataTab.loading")}
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

function SidebarToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useTranslation("layout");
  const label = open ? t("appShell.hideSidebar") : t("appShell.showSidebar");
  return (
    <Tip label={label}>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 rounded-md"
        onClick={onToggle}
        aria-label={label}
      >
        {open ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeft className="h-3.5 w-3.5" />}
      </Button>
    </Tip>
  );
}
