import { describe, expect, it } from "vitest";
import { GET as getParcels } from "@/app/api/v1/incidents/[slug]/parcels/route";
import { GET as getIncident } from "@/app/api/v1/incidents/[slug]/route";

describe("fixture API", () => {
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
});
