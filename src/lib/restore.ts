import i18n from "./i18n";

const BATCH_SIZE = 50;

/**
 * Run a dump's statements in order. `run` must throw when a statement fails;
 * the restore then stops, rolling back the open DML transaction, and throws.
 * Consecutive INSERT/UPDATE/DELETE go in batches of up to 50, each batch
 * flushed before the next other statement so the file's order holds; with
 * `useTransaction`, each run of them is one transaction.
 */
export async function restoreStatements(
  run: (sql: string) => Promise<unknown>,
  statements: string[],
  opts: { useTransaction: boolean; aborted: () => boolean; onProgress: (done: number) => void },
): Promise<void> {
  let inTransaction = false;
  let batch: string[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const sql = batch.join(";\n");
    batch = [];
    await run(sql);
  };

  try {
    for (let i = 0; i < statements.length; i++) {
      if (opts.aborted()) throw new Error(i18n.t("common:errors.restoreCancelled"));
      opts.onProgress(i + 1);

      const head = statements[i].trimStart().toUpperCase();
      const isDml = head.startsWith("INSERT") || head.startsWith("UPDATE") || head.startsWith("DELETE");

      if (isDml) {
        if (!inTransaction && opts.useTransaction) {
          await run("BEGIN");
          inTransaction = true;
        }
        batch.push(statements[i]);
        if (batch.length >= BATCH_SIZE) await flush();
        continue;
      }
      // Pending rows go in before the next other statement
      await flush();
      if (inTransaction) {
        await run("COMMIT");
        inTransaction = false;
      }
      await run(statements[i]);
    }
    await flush();
    if (inTransaction) {
      await run("COMMIT");
      inTransaction = false;
    }
  } catch (e) {
    if (inTransaction) await run("ROLLBACK").catch(() => {});
    throw e;
  }
}
