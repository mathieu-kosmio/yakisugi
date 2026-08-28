import { NextResponse } from "next/server";
import { z } from "zod";
import { listIndustriesByIncident } from "@/lib/data/radar-repository";

const querySchema = z
  .object({
    maxDistance: z.coerce.number().min(0).max(200).default(100),
    category: z
      .enum([
        "FORESTRY",
        "SAWMILL",
        "PANELS",
        "PACKAGING",
        "WOOD_TRADING",
        "WOOD_ENERGY",
        "OTHER",
      ])
      .optional(),
    page: z.coerce.number().int().positive().max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: RouteContext) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { slug } = await context.params;
  const industries = await listIndustriesByIncident(slug, {
    maxDistanceKm: parsed.data.maxDistance,
    category: parsed.data.category,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  });

  if (!industries) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  return NextResponse.json(industries, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
  });
}
