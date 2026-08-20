import type { Metadata } from "next";
import { RadarMap } from "@/components/map/radar-map";
import { radarFixture } from "@/fixtures/radar";

export const metadata: Metadata = {
  title: "Carte du bois sinistré",
  description:
    "Explorer les forêts, parcelles et industries sur la carte Yakisugi.",
};

export default function MapPage() {
  return (
    <section className="radar-page">
      <RadarMap fixture={radarFixture} />
    </section>
  );
}
