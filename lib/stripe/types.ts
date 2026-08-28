export type PurchasableExport = {
  incidentId: string;
  incidentSlug: string;
  incidentName: string;
  exportId: string;
  storagePath: string;
};

export type PaidOrder = {
  checkoutSessionId: string | null;
  incidentSlug: string;
  exportPath: string;
  downloadExpiresAt: string;
};

export type FulfillmentInput = {
  incidentId: string;
  exportId: string;
  checkoutSessionId: string;
  paymentIntentId: string | null;
  customerEmail: string | null;
  amountTotal: number;
  currency: string;
  downloadTokenHash: string;
  downloadExpiresAt: string;
  paidAt: string;
};

export interface PurchaseRepository {
  findPurchasableExport(slug: string): Promise<PurchasableExport | null>;
  fulfillOrder(input: FulfillmentInput): Promise<void>;
  findPaidOrderBySession(sessionId: string): Promise<PaidOrder | null>;
  findPaidOrderByTokenHash(tokenHash: string): Promise<PaidOrder | null>;
  createExportSignedUrl(
    storagePath: string,
    expiresInSeconds: number,
  ): Promise<string>;
}
