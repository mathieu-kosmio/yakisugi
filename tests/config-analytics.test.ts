import { afterEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/analytics/client";
import { createServerSupabaseClient } from "@/lib/db/supabase-server";
import {
  resolveCheckoutConfig,
  resolveWebhookConfig,
} from "@/lib/stripe/config";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("configuration Stripe", () => {
  it("normalizes a complete Checkout configuration", () => {
    expect(
      resolveCheckoutConfig({
        STRIPE_SECRET_KEY: "sk_test_example",
        STRIPE_PRICE_INCIDENT_EXPORT: "price_export",
        APP_URL: "https://yakisugi.example/",
      }),
    ).toEqual({
      secretKey: "sk_test_example",
      priceId: "price_export",
      appUrl: "https://yakisugi.example",
    });
  });

  it("requires complete Checkout and webhook secrets", () => {
    expect(() => resolveCheckoutConfig({})).toThrow();
    expect(() =>
      resolveWebhookConfig({
        STRIPE_WEBHOOK_SECRET: "whsec_example",
        DOWNLOAD_TOKEN_SECRET: "too-short",
      }),
    ).toThrow();
  });

  it("returns a validated webhook configuration", () => {
    expect(
      resolveWebhookConfig({
        STRIPE_WEBHOOK_SECRET: "whsec_example",
        DOWNLOAD_TOKEN_SECRET: "x".repeat(32),
      }),
    ).toEqual({
      webhookSecret: "whsec_example",
      downloadTokenSecret: "x".repeat(32),
    });
  });
});

describe("client Supabase serveur", () => {
  it("creates an isolated server client without browser session persistence", () => {
    const client = createServerSupabaseClient({
      kind: "supabase",
      url: "https://example.supabase.co",
      secretKey: "secret",
    });
    expect(client.auth).toBeDefined();
  });
});

describe("analytics navigateur", () => {
  it("creates and reuses an anonymous session visitor identifier", () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-4111-8111-111111111111",
    );

    trackEvent("map_opened", "saumos-2026");
    trackEvent("parcel_clicked", "saumos-2026");

    expect(crypto.randomUUID).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/analytics",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        body: JSON.stringify({
          event: "parcel_clicked",
          visitorId: "11111111-1111-4111-8111-111111111111",
          incidentSlug: "saumos-2026",
        }),
      }),
    );
  });

  it("does not transmit analytics when session storage is unavailable", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("sessionStorage", {
      getItem() {
        throw new Error("storage unavailable");
      },
    });

    expect(() => trackEvent("map_opened")).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
