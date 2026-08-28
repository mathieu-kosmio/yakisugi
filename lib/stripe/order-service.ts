import {
  deriveDownloadToken,
  hashDownloadToken,
} from "@/lib/stripe/download-token";
import type { PurchaseRepository } from "@/lib/stripe/types";
import type { StripeCheckoutEvent } from "@/lib/stripe/webhook";

export const DOWNLOAD_VALIDITY_SECONDS = 7 * 24 * 60 * 60;

export async function fulfillCheckoutEvent(
  event: StripeCheckoutEvent,
  repository: PurchaseRepository,
  tokenSecret: string,
): Promise<"fulfilled" | "ignored"> {
  if (
    ![
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ].includes(event.type) ||
    event.data.object.payment_status === "unpaid"
  ) {
    return "ignored";
  }
  const session = event.data.object;
  const paidAt = new Date(event.created * 1000);
  const downloadToken = deriveDownloadToken(session.id, tokenSecret);
  await repository.fulfillOrder({
    incidentId: session.metadata.incident_id,
    exportId: session.metadata.export_id,
    checkoutSessionId: session.id,
    paymentIntentId: session.payment_intent ?? null,
    customerEmail:
      session.customer_details?.email ?? session.customer_email ?? null,
    amountTotal: session.amount_total,
    currency: session.currency,
    downloadTokenHash: hashDownloadToken(downloadToken),
    downloadExpiresAt: new Date(
      paidAt.getTime() + DOWNLOAD_VALIDITY_SECONDS * 1000,
    ).toISOString(),
    paidAt: paidAt.toISOString(),
  });
  return "fulfilled";
}

export async function getDownloadPathForSession(
  sessionId: string,
  incidentSlug: string,
  repository: PurchaseRepository,
  tokenSecret: string,
): Promise<string | null> {
  const order = await repository.findPaidOrderBySession(sessionId);
  if (!order || order.incidentSlug !== incidentSlug) return null;
  return `/api/download/${deriveDownloadToken(sessionId, tokenSecret)}`;
}

export async function createSignedDownloadUrl(
  token: string,
  repository: PurchaseRepository,
): Promise<string | null> {
  const order = await repository.findPaidOrderByTokenHash(
    hashDownloadToken(token),
  );
  if (!order) return null;
  return repository.createExportSignedUrl(order.exportPath, 60);
}
