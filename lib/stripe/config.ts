import { z } from "zod";

const checkoutSchema = z.object({
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_PRICE_INCIDENT_EXPORT: z.string().min(1),
  APP_URL: z.url(),
});

const webhookSchema = z.object({
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  DOWNLOAD_TOKEN_SECRET: z.string().min(32),
});

export type CheckoutConfig = {
  secretKey: string;
  priceId: string;
  appUrl: string;
};

export type WebhookConfig = {
  webhookSecret: string;
  downloadTokenSecret: string;
};

export function resolveCheckoutConfig(
  environment: Record<string, string | undefined>,
): CheckoutConfig {
  const result = checkoutSchema.parse(environment);
  return {
    secretKey: result.STRIPE_SECRET_KEY,
    priceId: result.STRIPE_PRICE_INCIDENT_EXPORT,
    appUrl: result.APP_URL.replace(/\/$/, ""),
  };
}

export function resolveWebhookConfig(
  environment: Record<string, string | undefined>,
): WebhookConfig {
  const result = webhookSchema.parse(environment);
  return {
    webhookSecret: result.STRIPE_WEBHOOK_SECRET,
    downloadTokenSecret: result.DOWNLOAD_TOKEN_SECRET,
  };
}
