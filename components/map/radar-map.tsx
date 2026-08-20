"use client";

import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
} from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { filterParcels, summarizeIncident } from "@/lib/domain/radar";
import type { ParcelFeature, RadarFixture } from "@/lib/domain/types";

type RadarMapProps = {
  fixture: RadarFixture;
};

const speciesColors: Record<string, string> = {
  "Pin maritime": "#2d7a4d",
  "Forêt mixte": "#8aa45d",
  Chêne: "#b08d57",
};

function formatHectares(value: number) {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ha`;
}

export function RadarMap({ fixture }: RadarMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [selectedParcel, setSelectedParcel] = useState<ParcelFeature | null>(
    null,
  );
  const [species, setSpecies] = useState("");
  const [minArea, setMinArea] = useState(0);
  const summary = useMemo(() => summarizeIncident(fixture), [fixture]);
  const filteredParcels = useMemo(
    () =>
      filterParcels(fixture.parcels.features, {
        species: species || undefined,
        minAffectedAreaHa: minArea,
      }),
    [fixture.parcels.features, species, minArea],
  );

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style:
        process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
        "https://demotiles.maplibre.org/style.json",
      center: [-1.01, 45.015],
      zoom: 10.5,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    map.on("load", () => {
      map.addSource("incident", { type: "geojson", data: fixture.incident });
      map.addSource("forests", { type: "geojson", data: fixture.forests });
      map.addSource("parcels", { type: "geojson", data: fixture.parcels });
      map.addSource("industries", {
        type: "geojson",
        data: fixture.industries,
      });

      map.addLayer({
        id: "incident-fill",
        type: "fill",
        source: "incident",
        paint: { "fill-color": "#c75b2b", "fill-opacity": 0.16 },
      });
      map.addLayer({
        id: "incident-line",
        type: "line",
        source: "incident",
        paint: { "line-color": "#9f3f1c", "line-width": 3 },
      });
      map.addLayer({
        id: "forest-fill",
        type: "fill",
        source: "forests",
        paint: {
          "fill-color": [
            "match",
            ["get", "dominantSpecies"],
            "Pin maritime",
            speciesColors["Pin maritime"],
            "Forêt mixte",
            speciesColors["Forêt mixte"],
            "Chêne",
            speciesColors.Chêne,
            "#8b948c",
          ],
          "fill-opacity": 0.46,
        },
      });
      map.addLayer({
        id: "parcel-fill",
        type: "fill",
        source: "parcels",
        minzoom: 9.5,
        paint: {
          "fill-color": "#f1d67d",
          "fill-opacity": 0.22,
          "fill-outline-color": "#283a2f",
        },
      });
      map.addLayer({
        id: "parcel-line",
        type: "line",
        source: "parcels",
        minzoom: 9.5,
        paint: { "line-color": "#243c2d", "line-width": 1.2 },
      });
      map.addLayer({
        id: "industry-points",
        type: "circle",
        source: "industries",
        paint: {
          "circle-color": "#f7f6ef",
          "circle-radius": 6,
          "circle-stroke-color": "#14211a",
          "circle-stroke-width": 2,
        },
      });

      map.on("click", "parcel-fill", (event) => {
        const id = event.features?.[0]?.properties?.id;
        const parcel = fixture.parcels.features.find(
          (candidate) => candidate.properties.id === id,
        );
        setSelectedParcel(parcel ?? null);
      });
      map.on("mouseenter", "parcel-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "parcel-fill", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [fixture]);

  useEffect(() => {
    const source = mapRef.current?.getSource("parcels") as
      | GeoJSONSource
      | undefined;
    source?.setData({ type: "FeatureCollection", features: filteredParcels });

    if (
      selectedParcel &&
      !filteredParcels.some(
        (parcel) => parcel.properties.id === selectedParcel.properties.id,
      )
    ) {
      setSelectedParcel(null);
    }
  }, [filteredParcels, selectedParcel]);

  return (
    <div className="radar-layout">
      <aside className="radar-sidebar">
        <span className="fixture-badge">Données fictives</span>
        <h1>{summary.name}</h1>
        <p className="hero-copy">
          Explorez les surfaces forestières potentiellement affectées et les
          débouchés proches.
        </p>

        <div className="summary-grid">
          <div className="summary-card">
            <strong>{formatHectares(summary.forestAreaHa)}</strong>
            <span>forêt affectée</span>
          </div>
          <div className="summary-card">
            <strong>{filteredParcels.length}</strong>
            <span>parcelles affichées</span>
          </div>
          <div className="summary-card">
            <strong>{summary.mainSpecies ?? "Inconnue"}</strong>
            <span>essence principale</span>
          </div>
          <div className="summary-card">
            <strong>{summary.industryCountWithin100Km}</strong>
            <span>industries à moins de 100 km</span>
          </div>
        </div>

        <div className="filter-group">
          <label htmlFor="species-filter">Essence dominante</label>
          <select
            id="species-filter"
            value={species}
            onChange={(event) => setSpecies(event.target.value)}
          >
            <option value="">Toutes les essences</option>
            <option value="Pin maritime">Pin maritime</option>
            <option value="Forêt mixte">Forêt mixte</option>
            <option value="Chêne">Chêne</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="area-filter">Surface touchée minimale</label>
          <select
            id="area-filter"
            value={minArea}
            onChange={(event) => setMinArea(Number(event.target.value))}
          >
            <option value={0}>Toutes les surfaces</option>
            <option value={1}>Plus de 1 ha</option>
            <option value={5}>Plus de 5 ha</option>
            <option value={10}>Plus de 10 ha</option>
            <option value={25}>Plus de 25 ha</option>
          </select>
        </div>

        <fieldset className="legend">
          <legend className="legend-title">Légende</legend>
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: "#c75b2b" }} />
            Périmètre du sinistre
          </span>
          <span className="legend-item">
            <span
              className="legend-swatch"
              style={{ background: speciesColors["Pin maritime"] }}
            />
            Pin maritime
          </span>
          <span className="legend-item">
            <span
              className="legend-swatch"
              style={{ background: speciesColors["Forêt mixte"] }}
            />
            Forêt mixte
          </span>
          <span className="legend-item">
            <span
              className="legend-swatch"
              style={{ background: speciesColors.Chêne }}
            />
            Feuillus
          </span>
          <span className="legend-item">
            <span
              className="legend-swatch"
              style={{ borderRadius: "50%", background: "#14211a" }}
            />
            Site industriel
          </span>
        </fieldset>
      </aside>

      <div className="radar-map-wrap">
        <section
          ref={mapContainerRef}
          className="radar-map"
          aria-label="Carte interactive des zones affectées"
        />
        {selectedParcel ? (
          <article className="parcel-drawer" aria-live="polite">
            <div className="drawer-header">
              <div>
                <span className="fixture-badge">Parcelle fictive</span>
                <h2>
                  {selectedParcel.properties.section}{" "}
                  {selectedParcel.properties.parcelNumber}
                </h2>
              </div>
              <button
                className="drawer-close"
                type="button"
                aria-label="Fermer la fiche parcelle"
                onClick={() => setSelectedParcel(null)}
              >
                ×
              </button>
            </div>
            <p className="drawer-place">
              {selectedParcel.properties.communeName} ·{" "}
              {selectedParcel.properties.inseeCode}
            </p>
            <dl className="detail-list">
              <div className="detail-row">
                <dt>Surface cadastrale</dt>
                <dd>
                  {formatHectares(selectedParcel.properties.parcelAreaHa)}
                </dd>
              </div>
              <div className="detail-row">
                <dt>Surface touchée</dt>
                <dd>
                  {formatHectares(selectedParcel.properties.affectedAreaHa)}
                </dd>
              </div>
              <div className="detail-row">
                <dt>Taux affecté</dt>
                <dd>
                  {Math.round(selectedParcel.properties.affectedRatio * 100)} %
                </dd>
              </div>
              <div className="detail-row">
                <dt>Surface forestière</dt>
                <dd>
                  {formatHectares(selectedParcel.properties.forestAreaHa)}
                </dd>
              </div>
              <div className="detail-row">
                <dt>Essence dominante</dt>
                <dd>
                  {selectedParcel.properties.dominantSpecies ??
                    "Non identifiée"}
                </dd>
              </div>
              <div className="detail-row">
                <dt>Confiance</dt>
                <dd>{selectedParcel.properties.confidence}</dd>
              </div>
            </dl>
            <p className="volume-notice">
              <strong>Volume non estimé.</strong> Aucun coefficient forestier
              documenté et validé n’est configuré.
            </p>
          </article>
        ) : null}
      </div>
    </div>
  );
}
