import type { CheckoutConfig } from "@/lib/stripe/config";
import type { PurchasableExport } from "@/lib/stripe/types";

type CheckoutSession = {
  id: string;
  url: string;
};

export async function createCheckoutSession(
  config: CheckoutConfig,
  purchasable: PurchasableExport,
  fetchImplementation: typeof fetch = fetch,
): Promise<CheckoutSession> {
  const parameters = new URLSearchParams({
    mode: "payment",
    locale: "fr",
    customer_creation: "always",
    billing_address_collection: "required",
    "automatic_tax[enabled]": "true",
    "line_items[0][price]": config.priceId,
    "line_items[0][quantity]": "1",
    client_reference_id: purchasable.incidentId,
    "metadata[incident_id]": purchasable.incidentId,
    "metadata[incident_slug]": purchasable.incidentSlug,
    "metadata[export_id]": purchasable.exportId,
    success_url: `${config.appUrl}/acheter/${purchasable.incidentSlug}/succes?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.appUrl}/acheter/${purchasable.incidentSlug}?annule=1`,
  });
  const response = await fetchImplementation(
    "https://api.stripe.com/v1/checkout/sessions",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.secretKey}:`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: parameters,
    },
  );
  const payload = (await response.json()) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.id || !payload.url) {
    throw new Error(payload.error?.message ?? "Stripe Checkout indisponible");
  }
  return { id: payload.id, url: payload.url };
}
