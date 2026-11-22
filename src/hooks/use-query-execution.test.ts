import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

/** Each query waits until the test settles it, or its wait is stopped */
const pending: ((r: unknown) => void)[] = [];
vi.mock("@/lib/api-client", () => ({
  transactionOpen: async () => false,
  executeQuery: (_conn: string, _sql: string, signal: AbortSignal) =>
    new Promise((resolve, reject) => {
      pending.push(resolve);
      signal.addEventListener("abort", () => reject(new Error("aborted")));
    }),
}));

/** Connected to "conn" (a server render would read the store's initial state) */
vi.mock("@/stores/connection-store", () => {
  const state = { activeId: "conn", setTransactionOpen: () => {} };
  return { useConnectionStore: Object.assign((select: (s: typeof state) => unknown) => select(state), { getState: () => state }) };
});

const { endRun, startRun, stopRuns, useQueryExecution } = await import("./use-query-execution");
const { useEditorStore } = await import("@/stores/editor-store");

/** The hook's executeQuery, taken from one render */
function executeQuery(client = new QueryClient()) {
  let run!: ReturnType<typeof useQueryExecution>["executeQuery"];
  const Probe = () => {
    run = useQueryExecution().executeQuery;
    return null;
  };
  renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Probe)));
  return run;
}

describe("query runs", () => {
  it("Stop reaches a run whichever component started it", () => {
    const run = startRun("tab-1");
    stopRuns("tab-1");
    expect(run.signal.aborted).toBe(true);
  });

  it("an earlier run ending leaves the newer one stoppable", () => {
    const first = startRun("tab-2");
    const second = startRun("tab-2");
    expect(first.signal.aborted).toBe(true);
    endRun("tab-2", first);
    stopRuns("tab-2");
    expect(second.signal.aborted).toBe(true);
  });

  it("a replaced run's stop leaves the newer run running", async () => {
    const tabId = useEditorStore.getState().addTab("Query", "");
    const run = executeQuery();
    const tab = () => useEditorStore.getState().tabs.find((t) => t.id === tabId)!;

    const first = run(tabId, "SELECT 1");
    const second = run(tabId, "SELECT 2");
    await first;
    expect(tab().isRunning).toBe(true);

    pending[pending.length - 1]({ columns: ["a"], rows: [[2]], time: 1 });
    await second;
    expect(tab().isRunning).toBe(false);
    expect(tab().result).toMatchObject({ rows: [[2]] });
  });

  it("anything but a plain read refreshes the sidebar", async () => {
    const tabId = useEditorStore.getState().addTab("Query", "");
    const client = new QueryClient();
    const refreshed = vi.spyOn(client, "invalidateQueries");
    const run = executeQuery(client);
    const ran = async (sql: string) => {
      refreshed.mockClear();
      const done = run(tabId, sql);
      pending[pending.length - 1]({ changes: 1, time: 1 });
      await done;
      return refreshed.mock.calls.some(([f]) => f?.queryKey?.[0] === "tables");
    };
    expect(await ran("SELECT * FROM t")).toBe(false);
    expect(await ran("INSERT INTO t VALUES (1)")).toBe(true);
    expect(await ran("-- a note\nCREATE VIEW v AS SELECT 1")).toBe(true);
  });

  it("shows the time the user waited, not only the engine's", async () => {
    const tabId = useEditorStore.getState().addTab("Query", "");
    const done = executeQuery()(tabId, "SELECT 1");
    // The rows take a while to arrive after the engine's 1 ms
    await new Promise((r) => setTimeout(r, 30));
    pending[pending.length - 1]({ columns: ["a"], rows: [[1]], time: 1 });
    await done;
    const shown = useEditorStore.getState().tabs.find((t) => t.id === tabId)!.result as { time: number };
    expect(shown.time).toBeGreaterThanOrEqual(25);
  });

  it("keeps a script's wait for the toolbar, and each statement's own time", async () => {
    const tabId = useEditorStore.getState().addTab("Query", "");
    const done = executeQuery()(tabId, "SELECT * FROM big; SELECT 1");
    await new Promise((r) => setTimeout(r, 30));
    pending[pending.length - 1]({
      results: [
        { columns: ["a"], rows: [[1]], time: 1, sql: "SELECT * FROM big" },
        { columns: ["b"], rows: [[1]], time: 2, sql: "SELECT 1" },
      ],
      time: 3,
    });
    await done;
    const tab = useEditorStore.getState().tabs.find((t) => t.id === tabId)!;
    expect(tab.resultsTime).toBeGreaterThanOrEqual(25);
    expect(tab.results?.map((r) => (r as { time: number }).time)).toEqual([1, 2]);
  });
});
