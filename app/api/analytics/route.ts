import { createHmac } from "node:crypto";
import { z } from "zod";
import { analyticsEventNames } from "@/lib/analytics/events";
import { resolveDataSourceConfig } from "@/lib/db/data-source-config";
import { createServerSupabaseClient } from "@/lib/db/supabase-server";

const eventSchema = z
  .object({
    event: z.enum(analyticsEventNames),
    visitorId: z.uuid(),
    incidentSlug: z.string().min(1).max(160).optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const input = eventSchema.parse(await request.json());
    const config = resolveDataSourceConfig(process.env);
    if (config.kind === "fixture") {
      return new Response(null, { status: 202 });
    }
    const salt = process.env.ANALYTICS_HASH_SALT?.trim();
    if (!salt || salt.length < 32) {
      throw new Error("ANALYTICS_HASH_SALT absent ou trop court");
    }
    const visitorHash = createHmac("sha256", salt)
      .update(input.visitorId)
      .digest("hex");
    const { error } = await createServerSupabaseClient(config)
      .from("analytics_events")
      .insert({
        event_name: input.event,
        visitor_hash: visitorHash,
        incident_slug: input.incidentSlug ?? null,
      });
    if (error) throw error;
    return new Response(null, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json(
        { error: "Événement analytics invalide" },
        { status: 400 },
      );
    }
    console.error("analytics_event_failed", error);
    return Response.json({ error: "Analytics indisponible" }, { status: 503 });
  }
}
