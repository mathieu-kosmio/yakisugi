import { describe, expect, it } from "vitest";
import {
  getIndustryMarkerName,
  getIndustrySireneUrl,
} from "@/components/map/industry-marker-tooltip";

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

  it("builds an official Annuaire des Entreprises URL from a SIRET", () => {
    expect(getIndustrySireneUrl({ siret: "55210055400013" })).toBe(
      "https://annuaire-entreprises.data.gouv.fr/etablissement/55210055400013",
    );
    expect(getIndustrySireneUrl({ siret: "invalid" })).toBeNull();
  });
});
