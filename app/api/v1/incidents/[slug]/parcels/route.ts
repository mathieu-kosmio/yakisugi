import { NextResponse } from "next/server";
import { z } from "zod";
import { listParcelsByIncident } from "@/lib/data/radar-repository";

const querySchema = z
  .object({
    species: z.string().trim().min(1).max(100).optional(),
    minArea: z.coerce.number().min(0).max(1_000_000).optional(),
    confidence: z
      .string()
      .transform((value) => value.split(","))
      .pipe(z.array(z.enum(["low", "medium", "high"])))
      .optional(),
    page: z.coerce.number().int().positive().max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: RouteContext) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { slug } = await context.params;
  const { page, pageSize, species, minArea, confidence } = parsed.data;
  const parcels = await listParcelsByIncident(slug, {
    species,
    minAffectedAreaHa: minArea,
    confidence,
    page,
    pageSize,
  });

  if (!parcels) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  return NextResponse.json(parcels, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
  });
}
