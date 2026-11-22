import { describe, expect, it, vi } from "vitest";

// The server refuses a DROP the way Stoolap does for a referenced table
vi.stubGlobal(
  "fetch",
  vi.fn(async (_url: string, init: { body: string }) => {
    const { args } = JSON.parse(init.body) as { args: { sql: string } };
    if (args.sql.startsWith("DROP")) {
      const error = "foreign key constraint violation: column 'customer_id' in table 'orders' references 'customers(id)'";
      return new Response(JSON.stringify({ error }), { status: 400 });
    }
    return new Response(JSON.stringify({ ddl: "CREATE TABLE", time: 1 }));
  }),
);

import { executeQuery, runSql } from "./api-client";

describe("runSql", () => {
  it("throws when the statement fails, unlike executeQuery", async () => {
    await expect(executeQuery("c", "DROP TABLE customers")).resolves.toEqual({
      error: expect.stringContaining("foreign key"),
    });
    await expect(runSql("c", "DROP TABLE customers")).rejects.toThrow("foreign key");
  });

  it("returns the result when it succeeds", async () => {
    await expect(runSql("c", "CREATE TABLE t (id INTEGER PRIMARY KEY)")).resolves.toEqual({
      ddl: "CREATE TABLE",
      time: 1,
    });
  });
});
