import { z } from "zod";
import type {
  CreatedExportRequest,
  ExportRequestRepository,
} from "@/lib/sales/export-request-types";

const submittedRequestSchema = z
  .object({
    incidentSlug: z.string().min(1).max(160),
    contactName: z.string().trim().min(2).max(120),
    organization: z.string().trim().min(2).max(160),
    contactEmail: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    intendedUse: z.string().trim().min(2).max(120),
    message: z
      .string()
      .trim()
      .max(2000)
      .transform((value) => value || null),
    consent: z.literal(true),
    website: z.string().max(200).default(""),
  })
  .strict();

export type SubmittedExportRequest = z.input<typeof submittedRequestSchema>;

export async function submitExportRequest(
  input: unknown,
  repository: ExportRequestRepository,
  now = new Date(),
): Promise<CreatedExportRequest | "spam" | null> {
  const request = submittedRequestSchema.parse(input);
  if (request.website) return "spam";
  return repository.create({
    incidentSlug: request.incidentSlug,
    contactName: request.contactName,
    organization: request.organization,
    contactEmail: request.contactEmail,
    intendedUse: request.intendedUse,
    message: request.message,
    consentAt: now.toISOString(),
  });
}
