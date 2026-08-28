import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const checkoutSessionSchema = z.object({
  id: z.string().min(1),
  payment_status: z.string(),
  payment_intent: z.string().nullable().optional(),
  amount_total: z.number().int().nonnegative(),
  currency: z.string().min(1),
  customer_details: z
    .object({ email: z.string().nullable().optional() })
    .nullable()
    .optional(),
  customer_email: z.string().nullable().optional(),
  metadata: z.object({
    incident_id: z.string().uuid(),
    incident_slug: z.string().min(1),
    export_id: z.string().uuid(),
  }),
});

const stripeEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  created: z.number().int().nonnegative(),
  data: z.object({ object: checkoutSessionSchema }),
});

export type StripeCheckoutEvent = z.infer<typeof stripeEventSchema>;

export function signStripePayload(
  payload: string,
  timestamp: number,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
}

export function verifyAndParseStripeEvent(
  payload: string,
  signatureHeader: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): StripeCheckoutEvent {
  const parts = signatureHeader
    .split(",")
    .map((part) => part.trim().split("=", 2));
  const timestampValue = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts
    .filter(([key]) => key === "v1")
    .map(([, value]) => value);
  const timestamp = Number(timestampValue);
  if (
    !Number.isInteger(timestamp) ||
    Math.abs(nowSeconds - timestamp) > toleranceSeconds
  ) {
    throw new Error("Signature Stripe expirée ou invalide");
  }

  const expected = Buffer.from(
    signStripePayload(payload, timestamp, secret),
    "hex",
  );
  const valid = signatures.some((signature) => {
    if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    const received = Buffer.from(signature, "hex");
    return (
      received.length === expected.length && timingSafeEqual(received, expected)
    );
  });
  if (!valid) throw new Error("Signature Stripe invalide");
  return stripeEventSchema.parse(JSON.parse(payload));
}
