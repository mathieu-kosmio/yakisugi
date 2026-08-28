import { z } from "zod";
import { createPurchaseRepository } from "@/lib/db/purchase-repository";
import { resolveSalesMode } from "@/lib/sales/config";
import { resolveWebhookConfig } from "@/lib/stripe/config";
import { fulfillCheckoutEvent } from "@/lib/stripe/order-service";
import { verifyAndParseStripeEvent } from "@/lib/stripe/webhook";

export async function POST(request: Request) {
  if (resolveSalesMode(process.env) !== "stripe") {
    return Response.json({ error: "Route indisponible" }, { status: 404 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Signature absente" }, { status: 400 });
  }
  try {
    const payload = await request.text();
    const config = resolveWebhookConfig(process.env);
    const event = verifyAndParseStripeEvent(
      payload,
      signature,
      config.webhookSecret,
    );
    const result = await fulfillCheckoutEvent(
      event,
      createPurchaseRepository(),
      config.downloadTokenSecret,
    );
    return Response.json({ received: true, result });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "Événement invalide" }, { status: 400 });
    }
    if (
      error instanceof Error &&
      error.message.startsWith("Signature Stripe")
    ) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("stripe_webhook_failed", error);
    return Response.json({ error: "Traitement impossible" }, { status: 500 });
  }
}
