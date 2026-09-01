import { describe, expect, it } from "vitest";
import { getIndustryMarkerName } from "@/components/map/industry-marker-tooltip";

describe("getIndustryMarkerName", () => {
  it("returns the industrial site name used in the marker tooltip", () => {
    expect(getIndustryMarkerName({ companyName: "Scierie des Pins" })).toBe(
      "Scierie des Pins",
    );
  });

  it("does not create a tooltip when the name is absent", () => {
    expect(getIndustryMarkerName({ companyName: "   " })).toBeNull();
    expect(getIndustryMarkerName({})).toBeNull();
  });
});
