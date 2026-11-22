import { describe, expect, it } from "vitest";
import { restoreStatements } from "./restore";

function runner(failOn?: string) {
  const ran: string[] = [];
  const run = async (sql: string) => {
    ran.push(sql);
    if (failOn && sql.includes(failOn)) throw new Error(`failed: ${failOn}`);
  };
  return { ran, run };
}

const opts = (useTransaction: boolean) => ({ useTransaction, aborted: () => false, onProgress: () => {} });

describe("restoreStatements", () => {
  it("keeps the file's order without a transaction", async () => {
    const { ran, run } = runner();
    await restoreStatements(run, ["CREATE TABLE t (a INT)", "INSERT INTO t VALUES (1)", "DROP TABLE t"], opts(false));
    expect(ran).toEqual(["CREATE TABLE t (a INT)", "INSERT INTO t VALUES (1)", "DROP TABLE t"]);
  });

  it("wraps each run of rows in a transaction", async () => {
    const { ran, run } = runner();
    await restoreStatements(
      run,
      ["CREATE TABLE t (a INT)", "INSERT INTO t VALUES (1)", "INSERT INTO t VALUES (2)", "CREATE INDEX i ON t(a)"],
      opts(true),
    );
    expect(ran).toEqual([
      "CREATE TABLE t (a INT)",
      "BEGIN",
      "INSERT INTO t VALUES (1);\nINSERT INTO t VALUES (2)",
      "COMMIT",
      "CREATE INDEX i ON t(a)",
    ]);
  });

  it("stops at a failure, rolls back and reports it", async () => {
    const { ran, run } = runner("nope");
    await expect(
      restoreStatements(run, ["INSERT INTO t VALUES (1)", "INSERT INTO nope VALUES (2)", "CREATE TABLE x (a INT)"], opts(true)),
    ).rejects.toThrow("failed: nope");
    expect(ran).toEqual(["BEGIN", "INSERT INTO t VALUES (1);\nINSERT INTO nope VALUES (2)", "ROLLBACK"]);
  });

  it("stops when a statement outside a batch fails", async () => {
    const { ran, run } = runner("bad");
    await expect(restoreStatements(run, ["CREATE TABLE bad", "CREATE TABLE ok (a INT)"], opts(false))).rejects.toThrow();
    expect(ran).toEqual(["CREATE TABLE bad"]);
  });
});
