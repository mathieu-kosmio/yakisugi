import { NextResponse } from "next/server";
import { getIncidentBySlug } from "@/lib/data/radar-repository";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const incident = await getIncidentBySlug(slug);

  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  return NextResponse.json(incident, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
  });
}
