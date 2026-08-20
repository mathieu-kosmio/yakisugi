import { NextResponse } from "next/server";
import { listIncidents } from "@/lib/data/radar-repository";

export async function GET() {
  return NextResponse.json(await listIncidents(), {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
  });
}
