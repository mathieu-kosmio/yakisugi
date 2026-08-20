import { NextResponse } from "next/server";
import { z } from "zod";
import { listIndustriesByIncident } from "@/lib/data/radar-repository";

const querySchema = z.object({
  maxDistance: z.coerce.number().min(0).max(200).default(100),
});

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
  const industries = await listIndustriesByIncident(
    slug,
    parsed.data.maxDistance,
  );

  if (!industries) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  return NextResponse.json({ data: industries });
}
