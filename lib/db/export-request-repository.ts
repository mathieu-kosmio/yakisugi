import "server-only";

import { resolveDataSourceConfig } from "@/lib/db/data-source-config";
import { createServerSupabaseClient } from "@/lib/db/supabase-server";
import type {
  CreatedExportRequest,
  ExportRequestInput,
  ExportRequestRepository,
} from "@/lib/sales/export-request-types";

export class SupabaseExportRequestRepository
  implements ExportRequestRepository
{
  private readonly client;

  constructor() {
    const config = resolveDataSourceConfig(process.env);
    if (config.kind !== "supabase") {
      throw new Error("Les demandes d'export nécessitent Supabase");
    }
    this.client = createServerSupabaseClient(config);
  }

  async create(
    input: ExportRequestInput,
  ): Promise<CreatedExportRequest | null> {
    const { data: incident, error: incidentError } = await this.client
      .from("incidents")
      .select("id,slug")
      .eq("slug", input.incidentSlug)
      .eq("status", "published")
      .maybeSingle();
    if (incidentError) throw incidentError;
    if (!incident) return null;

    const { data, error } = await this.client
      .from("export_requests")
      .insert({
        incident_id: incident.id,
        contact_name: input.contactName,
        organization: input.organization,
        contact_email: input.contactEmail,
        intended_use: input.intendedUse,
        message: input.message,
        consent_at: input.consentAt,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: data.id, incidentSlug: incident.slug };
  }
}

export function createExportRequestRepository(): ExportRequestRepository {
  return new SupabaseExportRequestRepository();
}
