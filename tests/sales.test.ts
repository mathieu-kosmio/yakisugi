import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as stripeCheckout } from "@/app/api/stripe/checkout/route";
import { POST as stripeWebhook } from "@/app/api/stripe/webhook/route";
import { resolveSalesMode } from "@/lib/sales/config";
import { createPostExportRequest } from "@/lib/sales/export-request-handler";
import { submitExportRequest } from "@/lib/sales/export-request-service";
import type {
  ExportRequestInput,
  ExportRequestRepository,
} from "@/lib/sales/export-request-types";

class FakeExportRequestRepository implements ExportRequestRepository {
  inputs: ExportRequestInput[] = [];
  result: { id: string; incidentSlug: string } | null = {
    id: "11111111-1111-4111-8111-111111111111",
    incidentSlug: "saumos-2026",
  };

  async create(input: ExportRequestInput) {
    this.inputs.push(input);
    return this.result;
  }
}

const validRequest = {
  incidentSlug: "saumos-2026",
  contactName: " Alice Martin ",
  organization: " Scierie Atlantique ",
  contactEmail: "ALICE@EXAMPLE.TEST",
  intendedUse: "Étude de gisement",
  message: " Besoin au format SIG ",
  consent: true,
  website: "",
};

afterEach(() => vi.unstubAllEnvs());

describe("mode commercial", () => {
  it("uses contact by default and validates explicit modes", () => {
    expect(resolveSalesMode({})).toBe("contact");
    expect(resolveSalesMode({ SALES_MODE: "stripe" })).toBe("stripe");
    expect(() => resolveSalesMode({ SALES_MODE: "invalid" })).toThrow();
  });

  it("disables Stripe routes while contact mode is active", async () => {
    vi.stubEnv("SALES_MODE", "contact");
    expect(
      (
        await stripeCheckout(
          new Request("http://local/api/stripe/checkout", { method: "POST" }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await stripeWebhook(
          new Request("http://local/api/stripe/webhook", { method: "POST" }),
        )
      ).status,
    ).toBe(404);
  });
});

describe("demande d'export", () => {
  it("disables the contact endpoint while Stripe mode is active", async () => {
    const repository = new FakeExportRequestRepository();
    const post = createPostExportRequest(() => repository, {
      SALES_MODE: "stripe",
    });
    const response = await post(
      new Request("https://yakisugi.example/api/export-requests", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(404);
    expect(repository.inputs).toHaveLength(0);
  });

  it("normalizes and records a consented professional request", async () => {
    const repository = new FakeExportRequestRepository();
    const result = await submitExportRequest(
      validRequest,
      repository,
      new Date("2026-08-20T12:00:00Z"),
    );

    expect(result).toMatchObject({ incidentSlug: "saumos-2026" });
    expect(repository.inputs[0]).toEqual({
      incidentSlug: "saumos-2026",
      contactName: "Alice Martin",
      organization: "Scierie Atlantique",
      contactEmail: "alice@example.test",
      intendedUse: "Étude de gisement",
      message: "Besoin au format SIG",
      consentAt: "2026-08-20T12:00:00.000Z",
    });
  });

  it("absorbs honeypot spam without writing data", async () => {
    const repository = new FakeExportRequestRepository();
    expect(
      await submitExportRequest(
        { ...validRequest, website: "https://spam.example" },
        repository,
      ),
    ).toBe("spam");
    expect(repository.inputs).toHaveLength(0);
  });

  it("rejects missing consent and cross-origin submissions", async () => {
    const repository = new FakeExportRequestRepository();
    await expect(
      submitExportRequest({ ...validRequest, consent: false }, repository),
    ).rejects.toThrow();

    const post = createPostExportRequest(() => repository, {
      SALES_MODE: "contact",
      APP_URL: "https://yakisugi.example",
    });
    const response = await post(
      new Request("https://yakisugi.example/api/export-requests", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://malicious.example",
        },
        body: JSON.stringify(validRequest),
      }),
    );
    expect(response.status).toBe(403);
    expect(repository.inputs).toHaveLength(0);
  });

  it("returns a created response for a same-origin JSON submission", async () => {
    const repository = new FakeExportRequestRepository();
    const post = createPostExportRequest(() => repository, {
      SALES_MODE: "contact",
      APP_URL: "https://yakisugi.example",
    });
    const response = await post(
      new Request("https://yakisugi.example/api/export-requests", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://yakisugi.example",
        },
        body: JSON.stringify(validRequest),
      }),
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ accepted: true });
  });

  it("accepts a form submission and redirects to its confirmation", async () => {
    const repository = new FakeExportRequestRepository();
    const post = createPostExportRequest(() => repository, {
      SALES_MODE: "contact",
      APP_URL: "https://yakisugi.example",
    });
    const body = new URLSearchParams({
      incidentSlug: validRequest.incidentSlug,
      contactName: validRequest.contactName,
      organization: validRequest.organization,
      contactEmail: validRequest.contactEmail,
      intendedUse: validRequest.intendedUse,
      message: validRequest.message,
      consent: "on",
      website: "",
    });
    const response = await post(
      new Request("https://yakisugi.example/api/export-requests", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://yakisugi.example",
        },
        body,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/acheter/saumos-2026?demande=envoyee",
    );
    expect(repository.inputs).toHaveLength(1);
  });

  it("returns explicit errors for invalid input and repository outages", async () => {
    const repository = new FakeExportRequestRepository();
    const post = createPostExportRequest(() => repository, {
      SALES_MODE: "contact",
    });
    const invalid = await post(
      new Request("https://yakisugi.example/api/export-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );
    expect(invalid.status).toBe(400);

    repository.create = async () => {
      throw new Error("database unavailable");
    };
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const unavailable = await post(
      new Request("https://yakisugi.example/api/export-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validRequest),
      }),
    );
    expect(unavailable.status).toBe(503);
    expect(consoleError).toHaveBeenCalledWith(
      "export_request_failed",
      expect.any(Error),
    );
  });
});
