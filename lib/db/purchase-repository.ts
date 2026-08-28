import "server-only";

import { resolveDataSourceConfig } from "@/lib/db/data-source-config";
import { createServerSupabaseClient } from "@/lib/db/supabase-server";
import type {
  FulfillmentInput,
  PaidOrder,
  PurchasableExport,
  PurchaseRepository,
} from "@/lib/stripe/types";

function requireSupabaseConfig() {
  const config = resolveDataSourceConfig(process.env);
  if (config.kind !== "supabase") {
    throw new Error("Le paiement requiert la source de données Supabase");
  }
  return config;
}

export class SupabasePurchaseRepository implements PurchaseRepository {
  private readonly client;
  private readonly exportBucket: string;

  constructor() {
    this.client = createServerSupabaseClient(requireSupabaseConfig());
    this.exportBucket =
      process.env.YAKISUGI_EXPORT_BUCKET?.trim() || "incident-exports";
  }

  async findPurchasableExport(slug: string): Promise<PurchasableExport | null> {
    const { data: incident, error: incidentError } = await this.client
      .from("incidents")
      .select("id,slug,name")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (incidentError) throw incidentError;
    if (!incident) return null;

    const { data: exportRecord, error: exportError } = await this.client
      .from("exports")
      .select("id,storage_path")
      .eq("incident_id", incident.id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (exportError) throw exportError;
    if (!exportRecord) return null;
    return {
      incidentId: incident.id,
      incidentSlug: incident.slug,
      incidentName: incident.name,
      exportId: exportRecord.id,
      storagePath: exportRecord.storage_path,
    };
  }

  async fulfillOrder(input: FulfillmentInput): Promise<void> {
    const { error } = await this.client.from("orders").upsert(
      {
        incident_id: input.incidentId,
        export_id: input.exportId,
        stripe_checkout_session_id: input.checkoutSessionId,
        stripe_payment_intent_id: input.paymentIntentId,
        customer_email: input.customerEmail,
        amount_total: input.amountTotal,
        currency: input.currency,
        status: "paid",
        download_token_hash: input.downloadTokenHash,
        download_expires_at: input.downloadExpiresAt,
        paid_at: input.paidAt,
        payment_channel: "stripe",
      },
      { onConflict: "stripe_checkout_session_id" },
    );
    if (error) throw error;
  }

  async findPaidOrderBySession(sessionId: string): Promise<PaidOrder | null> {
    const order = await this.findOrder("stripe_checkout_session_id", sessionId);
    return order;
  }

  async findPaidOrderByTokenHash(tokenHash: string): Promise<PaidOrder | null> {
    const order = await this.findOrder("download_token_hash", tokenHash);
    return order;
  }

  private async findOrder(
    field: "stripe_checkout_session_id" | "download_token_hash",
    value: string,
  ): Promise<PaidOrder | null> {
    const { data: order, error: orderError } = await this.client
      .from("orders")
      .select(
        "stripe_checkout_session_id,incident_id,export_id,download_expires_at",
      )
      .eq(field, value)
      .eq("status", "paid")
      .gt("download_expires_at", new Date().toISOString())
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order?.download_expires_at || !order.export_id) return null;

    const [
      { data: incident, error: incidentError },
      { data: exportRecord, error: exportError },
    ] = await Promise.all([
      this.client
        .from("incidents")
        .select("slug")
        .eq("id", order.incident_id)
        .single(),
      this.client
        .from("exports")
        .select("storage_path")
        .eq("id", order.export_id)
        .single(),
    ]);
    if (incidentError) throw incidentError;
    if (exportError) throw exportError;
    return {
      checkoutSessionId: order.stripe_checkout_session_id,
      incidentSlug: incident.slug,
      exportPath: exportRecord.storage_path,
      downloadExpiresAt: order.download_expires_at,
    };
  }

  async createExportSignedUrl(
    storagePath: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.exportBucket)
      .createSignedUrl(storagePath, expiresInSeconds, { download: true });
    if (error) throw error;
    return data.signedUrl;
  }
}

export function createPurchaseRepository(): PurchaseRepository {
  return new SupabasePurchaseRepository();
}
