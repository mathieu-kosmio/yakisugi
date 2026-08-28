import { NextResponse } from "next/server";
import { z } from "zod";
import { listIncidents } from "@/lib/data/radar-repository";
import { paginationFor } from "@/lib/data/radar-repository-types";

const querySchema = z
  .object({
    page: z.coerce.number().int().positive().max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const incidents = await listIncidents();
  const { page, pageSize } = parsed.data;
  const start = (page - 1) * pageSize;
  return NextResponse.json(
    {
      data: incidents.slice(start, start + pageSize),
      pagination: paginationFor(page, pageSize, incidents.length),
    },
    {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    },
  );
}
