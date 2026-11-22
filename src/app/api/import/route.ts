import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importFile } from "@/server/commands";

export const dynamic = "force-dynamic";

/**
 * Import a CSV or JSON file into a table with COPY, as Stoolap Desktop does.
 * The browser can't hand the server a path, so the file comes in the request
 * and is copied from a temporary file. Form fields: connId, table, format
 * (csv | json), header (true | false), file.
 */
export async function POST(req: NextRequest) {
  let path: string | null = null;
  try {
    const form = await req.formData();
    const file = form.get("file");
    const format = String(form.get("format") ?? "");
    if (!(file instanceof File)) throw new Error("No file");
    if (format !== "csv" && format !== "json") throw new Error(`Unsupported format: ${format}`);
    path = join(tmpdir(), `stoolap-import-${randomUUID()}.${format}`);
    await writeFile(path, Buffer.from(await file.arrayBuffer()));
    const result = await importFile(
      String(form.get("connId") ?? ""),
      String(form.get("table") ?? ""),
      path,
      format,
      form.get("header") === "true",
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  } finally {
    if (path) await unlink(path).catch(() => {});
  }
}
