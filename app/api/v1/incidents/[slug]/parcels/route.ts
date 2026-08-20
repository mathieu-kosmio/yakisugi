import { NextResponse } from "next/server";
import { z } from "zod";
import { listParcelsByIncident } from "@/lib/data/radar-repository";

const querySchema = z.object({
  species: z.string().trim().min(1).optional(),
  minArea: z.coerce.number().min(0).optional(),
  confidence: z
    .string()
    .transform((value) => value.split(","))
    .pipe(z.array(z.enum(["low", "medium", "high"])))
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

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
  });

  if (!parcels) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  const start = (page - 1) * pageSize;
  return NextResponse.json({
    data: parcels.slice(start, start + pageSize),
    pagination: {
      page,
      pageSize,
      total: parcels.length,
      pageCount: Math.ceil(parcels.length / pageSize),
    },
  });
}
