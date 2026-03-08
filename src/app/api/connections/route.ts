import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/lib/db-manager";
import { safeErrorMessage } from "@/lib/sql-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(dbManager.list());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // sendBeacon cleanup request on page unload
    if (body.cleanup === true) {
      await dbManager.closeExample();
      return NextResponse.json({ ok: true });
    }

    const { path, name } = body;
    if (typeof path !== "string" || !path) {
      return NextResponse.json(
        { error: "Missing or invalid path" },
        { status: 400 },
      );
    }
    if (name !== undefined && typeof name !== "string") {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    const meta = await dbManager.open(path, name);
    return NextResponse.json(meta);
  } catch (e) {
    return NextResponse.json(
      { error: safeErrorMessage(e, "Failed to open database") },
      { status: 400 },
    );
  }
}

// Close Example DB on session end
export async function DELETE() {
  try {
    await dbManager.closeExample();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: safeErrorMessage(e, "Failed to cleanup") },
      { status: 400 },
    );
  }
}
