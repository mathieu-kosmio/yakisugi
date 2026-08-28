import { z } from "zod";
import { createExportRequestRepository } from "@/lib/db/export-request-repository";
import { resolveSalesMode } from "@/lib/sales/config";
import { submitExportRequest } from "@/lib/sales/export-request-service";
import type { ExportRequestRepository } from "@/lib/sales/export-request-types";

async function readInput(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return request.json();
  const form = await request.formData();
  return {
    incidentSlug: form.get("incidentSlug"),
    contactName: form.get("contactName"),
    organization: form.get("organization"),
    contactEmail: form.get("contactEmail"),
    intendedUse: form.get("intendedUse"),
    message: form.get("message") ?? "",
    consent: form.get("consent") === "on",
    website: form.get("website") ?? "",
  };
}

function isJsonRequest(request: Request) {
  return (request.headers.get("content-type") ?? "").includes(
    "application/json",
  );
}

function hasValidOrigin(request: Request, appUrl: string | undefined) {
  const origin = request.headers.get("origin");
  if (!origin || !appUrl) return true;
  try {
    return new URL(origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

export function createPostExportRequest(
  repositoryFactory: () => ExportRequestRepository = createExportRequestRepository,
  environment: Record<string, string | undefined> = process.env,
) {
  return async function postExportRequest(request: Request) {
    if (resolveSalesMode(environment) !== "contact") {
      return Response.json({ error: "Route indisponible" }, { status: 404 });
    }
    if (!hasValidOrigin(request, environment.APP_URL)) {
      return Response.json({ error: "Origine invalide" }, { status: 403 });
    }
    try {
      const input = await readInput(request);
      const result = await submitExportRequest(input, repositoryFactory());
      if (result === null) {
        return Response.json({ error: "Événement inconnu" }, { status: 404 });
      }
      if (isJsonRequest(request)) {
        return Response.json(
          { id: result === "spam" ? null : result.id, accepted: true },
          { status: 201 },
        );
      }
      const slug = String(
        (input as { incidentSlug?: unknown }).incidentSlug ?? "",
      );
      return new Response(null, {
        status: 303,
        headers: {
          Location: `/acheter/${encodeURIComponent(slug)}?demande=envoyee`,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        return Response.json({ error: "Formulaire invalide" }, { status: 400 });
      }
      console.error("export_request_failed", error);
      return Response.json(
        { error: "Demande temporairement indisponible" },
        { status: 503 },
      );
    }
  };
}
