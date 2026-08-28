import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerClientMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
}));

vi.mock("@/lib/db/supabase-server", () => ({
  createServerSupabaseClient: createServerClientMock,
}));

import { SupabaseExportRequestRepository } from "@/lib/db/export-request-repository";

const input = {
  incidentSlug: "saumos-2026",
  contactName: "Alice Martin",
  organization: "Scierie Atlantique",
  contactEmail: "alice@example.test",
  intendedUse: "Étude de gisement",
  message: "Besoin au format SIG",
  consentAt: "2026-08-20T12:00:00.000Z",
};

function queryEndingWith(result: unknown, terminal: "maybeSingle" | "single") {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    insert: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.insert.mockReturnValue(query);
  query[terminal].mockResolvedValue(result);
  return query;
}

beforeEach(() => {
  vi.stubEnv("YAKISUGI_DATA_SOURCE", "supabase");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("SupabaseExportRequestRepository", () => {
  it("creates a private request for a published incident", async () => {
    const incidentQuery = queryEndingWith(
      {
        data: {
          id: "11111111-1111-4111-8111-111111111111",
          slug: "saumos-2026",
        },
        error: null,
      },
      "maybeSingle",
    );
    const requestQuery = queryEndingWith(
      {
        data: { id: "22222222-2222-4222-8222-222222222222" },
        error: null,
      },
      "single",
    );
    createServerClientMock.mockReturnValue({
      from: vi.fn((table: string) =>
        table === "incidents" ? incidentQuery : requestQuery,
      ),
    });

    const repository = new SupabaseExportRequestRepository();
    await expect(repository.create(input)).resolves.toEqual({
      id: "22222222-2222-4222-8222-222222222222",
      incidentSlug: "saumos-2026",
    });
    expect(requestQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_email: "alice@example.test",
        consent_at: "2026-08-20T12:00:00.000Z",
      }),
    );
  });

  it("returns null when the incident is not published", async () => {
    const incidentQuery = queryEndingWith(
      { data: null, error: null },
      "maybeSingle",
    );
    createServerClientMock.mockReturnValue({
      from: vi.fn(() => incidentQuery),
    });

    const repository = new SupabaseExportRequestRepository();
    await expect(repository.create(input)).resolves.toBeNull();
  });

  it("surfaces incident lookup and insertion failures", async () => {
    const lookupFailure = queryEndingWith(
      { data: null, error: new Error("lookup failed") },
      "maybeSingle",
    );
    createServerClientMock.mockReturnValueOnce({
      from: vi.fn(() => lookupFailure),
    });
    await expect(
      new SupabaseExportRequestRepository().create(input),
    ).rejects.toThrow("lookup failed");

    const incidentQuery = queryEndingWith(
      {
        data: {
          id: "11111111-1111-4111-8111-111111111111",
          slug: "saumos-2026",
        },
        error: null,
      },
      "maybeSingle",
    );
    const insertionFailure = queryEndingWith(
      { data: null, error: new Error("insert failed") },
      "single",
    );
    createServerClientMock.mockReturnValueOnce({
      from: vi.fn((table: string) =>
        table === "incidents" ? incidentQuery : insertionFailure,
      ),
    });
    await expect(
      new SupabaseExportRequestRepository().create(input),
    ).rejects.toThrow("insert failed");
  });
});
