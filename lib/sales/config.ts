import { z } from "zod";

export const salesModeSchema = z.enum(["contact", "stripe"]);
export type SalesMode = z.infer<typeof salesModeSchema>;

export function resolveSalesMode(
  environment: Record<string, string | undefined>,
): SalesMode {
  return salesModeSchema.parse(environment.SALES_MODE?.trim() || "contact");
}
