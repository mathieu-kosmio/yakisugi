import { describe, expect, it } from "vitest";
import { POST as postAnalytics } from "@/app/api/analytics/route";
import { GET as getIndustries } from "@/app/api/v1/incidents/[slug]/industries/route";
import { GET as getParcels } from "@/app/api/v1/incidents/[slug]/parcels/route";
import { GET as getIncident } from "@/app/api/v1/incidents/[slug]/route";
import { GET as getIncidents } from "@/app/api/v1/incidents/route";

describe("fixture API", () => {
  it("accepts only a bounded first-party analytics event", async () => {
    const accepted = await postAnalytics(
      new Request("http://local/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "map_opened",
          visitorId: "33333333-3333-4333-8333-333333333333",
          incidentSlug: "saumos-2026-fixture",
        }),
      }),
    );
    const rejected = await postAnalytics(
      new Request("http://local/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "email_captured",
          visitorId: "33333333-3333-4333-8333-333333333333",
        }),
      }),
    );

    expect(accepted.status).toBe(202);
    expect(rejected.status).toBe(400);
  });

  it("returns 404 for an unknown incident", async () => {
    const response = await getIncident(
      new Request("http://local/api/v1/incidents/missing"),
      {
        params: Promise.resolve({ slug: "missing" }),
      },
    );

    expect(response.status).toBe(404);
  });

  it("filters and paginates parcels", async () => {
    const response = await getParcels(
      new Request(
        "http://local/api/v1/incidents/saumos-2026-fixture/parcels?species=Pin%20maritime&minArea=5&page=1&pageSize=2",
      ),
      { params: Promise.resolve({ slug: "saumos-2026-fixture" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.pagination.total).toBe(6);
    expect(body.pagination.pageCount).toBe(3);
  });

  it("rejects an excessive public page size", async () => {
    const response = await getParcels(
      new Request(
        "http://local/api/v1/incidents/saumos-2026-fixture/parcels?pageSize=1000",
      ),
      { params: Promise.resolve({ slug: "saumos-2026-fixture" }) },
    );

    expect(response.status).toBe(400);
  });

  it("paginates the incident collection", async () => {
    const response = await getIncidents(
      new Request("http://local/api/v1/incidents?page=1&pageSize=1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toEqual({
      page: 1,
      pageSize: 1,
      total: 1,
      pageCount: 1,
    });
  });

  it("filters and paginates nearby industries", async () => {
    const response = await getIndustries(
      new Request(
        "http://local/api/v1/incidents/saumos-2026-fixture/industries?category=SAWMILL&maxDistance=100&page=1&pageSize=1",
      ),
      { params: Promise.resolve({ slug: "saumos-2026-fixture" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].properties.category).toBe("SAWMILL");
    expect(body.pagination.total).toBe(2);
    expect(body.pagination.pageCount).toBe(2);
  });

  it("rejects unknown public query parameters", async () => {
    const response = await getParcels(
      new Request(
        "http://local/api/v1/incidents/saumos-2026-fixture/parcels?unexpected=true",
      ),
      { params: Promise.resolve({ slug: "saumos-2026-fixture" }) },
    );

    expect(response.status).toBe(400);
  });
});
