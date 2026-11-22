import { describe, expect, it } from "vitest";
import { dropSavedExampleTabs, EXAMPLES_SQL_START } from "./editor-store";
import type { EditorTab } from "@/lib/types";

const tab = (id: string, title: string, sql: string): EditorTab => ({
  id,
  title,
  sql,
  result: null,
  isRunning: false,
  mode: "query",
});

describe("dropSavedExampleTabs", () => {
  it("removes saved Examples tabs and keeps the user's", () => {
    const out = dropSavedExampleTabs({
      tabs: [
        tab("a", "Query 1", "SELECT 1"),
        tab("b", "Examples", `${EXAMPLES_SQL_START}\nSELECT * FROM order_summary;`),
        tab("c", "Examples", `${EXAMPLES_SQL_START}\n...`),
        tab("d", "Examples", "SELECT 'my own tab named Examples'"),
      ],
      activeTabId: "c",
    });
    expect(out.tabs!.map((t) => t.id)).toEqual(["a", "d"]);
    expect(out.activeTabId).toBe("a");
  });

  it("leaves one empty tab when nothing else was saved", () => {
    const out = dropSavedExampleTabs({
      tabs: [tab("b", "Examples", EXAMPLES_SQL_START)],
      activeTabId: "b",
    });
    expect(out.tabs).toHaveLength(1);
    expect(out.tabs![0].title).toBe("Query 1");
    expect(out.activeTabId).toBe(out.tabs![0].id);
  });
});
