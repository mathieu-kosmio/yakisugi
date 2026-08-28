import { describe, expect, it, vi } from "vitest";
import { GET as download } from "@/app/api/download/[token]/route";
import {
  deriveDownloadToken,
  hashDownloadToken,
} from "@/lib/stripe/download-token";
import {
  createSignedDownloadUrl,
  fulfillCheckoutEvent,
  getDownloadPathForSession,
} from "@/lib/stripe/order-service";
import { createCheckoutSession } from "@/lib/stripe/stripe-client";
import type {
  FulfillmentInput,
  PaidOrder,
  PurchaseRepository,
} from "@/lib/stripe/types";
import {
  signStripePayload,
  verifyAndParseStripeEvent,
} from "@/lib/stripe/webhook";

const incidentId = "11111111-1111-4111-8111-111111111111";
const exportId = "22222222-2222-4222-8222-222222222222";

function eventPayload(paymentStatus = "paid") {
  return JSON.stringify({
    id: "evt_test",
    type: "checkout.session.completed",
    created: 1_800_000_000,
    data: {
      object: {
        id: "cs_test_yakisugi",
        payment_status: paymentStatus,
        payment_intent: "pi_test",
        amount_total: 17_880,
        currency: "eur",
        customer_details: { email: "client@example.test" },
        metadata: {
          incident_id: incidentId,
          incident_slug: "saumos-2026",
          export_id: exportId,
        },
      },
    },
  });
}

class FakePurchaseRepository implements PurchaseRepository {
  orders = new Map<string, FulfillmentInput>();
  paidOrder: PaidOrder | null = null;

  async findPurchasableExport() {
    return null;
  }

  async fulfillOrder(input: FulfillmentInput) {
    this.orders.set(input.checkoutSessionId, input);
  }

  async findPaidOrderBySession(): Promise<PaidOrder | null> {
    return this.paidOrder;
  }

  async findPaidOrderByTokenHash(): Promise<PaidOrder | null> {
    return this.paidOrder;
  }

  async createExportSignedUrl(): Promise<string> {
    return "https://storage.example.test/signed";
  }
}

describe("Stripe Checkout", () => {
  it("creates a hosted payment session with server-owned metadata", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const parameters = new URLSearchParams(String(init?.body));
        expect(parameters.get("mode")).toBe("payment");
        expect(parameters.get("line_items[0][price]")).toBe("price_export");
        expect(parameters.get("metadata[incident_id]")).toBe(incidentId);
        expect(parameters.get("metadata[export_id]")).toBe(exportId);
        expect(parameters.get("success_url")).toContain(
          "{CHECKOUT_SESSION_ID}",
        );
        expect(init?.headers).toMatchObject({
          Authorization: `Basic ${Buffer.from("sk_test_secret:").toString("base64")}`,
        });
        return Response.json({
          id: "cs_test_yakisugi",
          url: "https://checkout.stripe.test/cs",
        });
      },
    );

    const session = await createCheckoutSession(
      {
        secretKey: "sk_test_secret",
        priceId: "price_export",
        appUrl: "https://yakisugi.example",
      },
      {
        incidentId,
        incidentSlug: "saumos-2026",
        incidentName: "Saumos 2026",
        exportId,
        storagePath: "bois-sinistre-saumos-2026.zip",
      },
      fetchMock as typeof fetch,
    );

    expect(session.url).toContain("checkout.stripe.test");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("webhook Stripe", () => {
  it("accepts a current valid signature and rejects invalid or stale signatures", () => {
    const payload = eventPayload();
    const timestamp = 1_800_000_000;
    const secret = "whsec_test";
    const signature = signStripePayload(payload, timestamp, secret);

    expect(
      verifyAndParseStripeEvent(
        payload,
        `t=${timestamp},v1=${signature}`,
        secret,
        timestamp,
      ).id,
    ).toBe("evt_test");
    expect(() =>
      verifyAndParseStripeEvent(
        payload,
        `t=${timestamp},v1=${"0".repeat(64)}`,
        secret,
        timestamp,
      ),
    ).toThrow("Signature Stripe invalide");
    expect(() =>
      verifyAndParseStripeEvent(
        payload,
        `t=${timestamp},v1=${signature}`,
        secret,
        timestamp + 301,
      ),
    ).toThrow("Signature Stripe expirée");
  });

  it("fulfills a paid session idempotently and keeps only the token hash", async () => {
    const payload = eventPayload();
    const signature = signStripePayload(payload, 1_800_000_000, "whsec_test");
    const event = verifyAndParseStripeEvent(
      payload,
      `t=1800000000,v1=${signature}`,
      "whsec_test",
      1_800_000_000,
    );
    const repository = new FakePurchaseRepository();

    await fulfillCheckoutEvent(event, repository, "x".repeat(32));
    await fulfillCheckoutEvent(event, repository, "x".repeat(32));

    expect(repository.orders.size).toBe(1);
    const order = repository.orders.get("cs_test_yakisugi");
    expect(order?.amountTotal).toBe(17_880);
    expect(order?.downloadTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(order?.downloadTokenHash).not.toContain("cs_test_yakisugi");
  });

  it("does not fulfill an unpaid Checkout session", async () => {
    const payload = eventPayload("unpaid");
    const signature = signStripePayload(payload, 1_800_000_000, "whsec_test");
    const event = verifyAndParseStripeEvent(
      payload,
      `t=1800000000,v1=${signature}`,
      "whsec_test",
      1_800_000_000,
    );
    const repository = new FakePurchaseRepository();

    expect(await fulfillCheckoutEvent(event, repository, "x".repeat(32))).toBe(
      "ignored",
    );
    expect(repository.orders.size).toBe(0);
  });
});

describe("téléchargement protégé", () => {
  it("derives a stable opaque token and stores a distinct hash", () => {
    const token = deriveDownloadToken("cs_test_yakisugi", "x".repeat(32));
    expect(token).toHaveLength(43);
    expect(deriveDownloadToken("cs_test_yakisugi", "x".repeat(32))).toBe(token);
    expect(hashDownloadToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashDownloadToken(token)).not.toBe(token);
  });

  it("turns a paid order into an application link then a short storage URL", async () => {
    const repository = new FakePurchaseRepository();
    repository.paidOrder = {
      checkoutSessionId: "cs_test_yakisugi",
      incidentSlug: "saumos-2026",
      exportPath: "bois-sinistre-saumos-2026.zip",
      downloadExpiresAt: "2030-01-01T00:00:00.000Z",
    };
    const secret = "x".repeat(32);
    const path = await getDownloadPathForSession(
      "cs_test_yakisugi",
      "saumos-2026",
      repository,
      secret,
    );
    expect(path).toBe(
      `/api/download/${deriveDownloadToken("cs_test_yakisugi", secret)}`,
    );
    expect(
      await createSignedDownloadUrl(
        deriveDownloadToken("cs_test_yakisugi", secret),
        repository,
      ),
    ).toBe("https://storage.example.test/signed");
  });

  it("rejects malformed tokens before accessing storage", async () => {
    const response = await download(
      new Request("http://local/api/download/invalid"),
      {
        params: Promise.resolve({ token: "invalid" }),
      },
    );
    expect(response.status).toBe(404);
  });
});
