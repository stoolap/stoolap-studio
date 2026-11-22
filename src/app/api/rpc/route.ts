import { NextRequest, NextResponse } from "next/server";
import { commands } from "@/server/commands";

export const dynamic = "force-dynamic";

/** The driver gives an INTEGER past 2^53 as a BigInt, which JSON can't hold */
const replacer = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

/**
 * One endpoint for the UI's calls: `{ cmd, args }` runs the command of that
 * name (server/commands.ts), as Stoolap Desktop's UI runs a Tauri command.
 * A failure answers 400 with `{ error }`.
 */
export async function POST(req: NextRequest) {
  let body: { cmd?: unknown; args?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const run = typeof body.cmd === "string" && Object.hasOwn(commands, body.cmd) ? commands[body.cmd] : null;
  if (!run) return NextResponse.json({ error: `Unknown command: ${String(body.cmd)}` }, { status: 400 });
  try {
    const result = await run((body.args ?? {}) as Record<string, unknown>);
    return new NextResponse(JSON.stringify(result ?? null, replacer), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
