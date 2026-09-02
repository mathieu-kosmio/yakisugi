"use client";

import type {
  GeoJSONSource,
  Map as MapLibreMap,
  Popup as MapLibrePopup,
} from "maplibre-gl";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getIndustryMarkerName,
  getIndustrySireneUrl,
} from "@/components/map/industry-marker-tooltip";
import {
  type MapBaseLayer,
  MapBaseLayerSwitch,
} from "@/components/map/map-base-layer-switch";
import { trackEvent } from "@/lib/analytics/client";
import { filterParcels, summarizeIncident } from "@/lib/domain/radar";
import type {
  Confidence,
  IndustryCategory,
  ParcelFeature,
  RadarFixture,
} from "@/lib/domain/types";

type RadarMapProps = {
  fixture: RadarFixture;
};

const speciesColors: Record<string, string> = {
  "Pin maritime": "#2d7a4d",
  "Forêt mixte": "#8aa45d",
  Chêne: "#b08d57",
};

const satelliteTileUrl =
  process.env.NEXT_PUBLIC_SATELLITE_TILE_URL ??
  "https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";

function formatHectares(value: number) {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ha`;
}

export function RadarMap({ fixture }: RadarMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const baseLayerRef = useRef<MapBaseLayer>("plan");
  const analyticsTrackedRef = useRef(false);
  const [selectedParcel, setSelectedParcel] = useState<ParcelFeature | null>(
    null,
  );
  const [species, setSpecies] = useState("");
  const [minArea, setMinArea] = useState(0);
  const [confidence, setConfidence] = useState<Confidence | "">("");
  const [industryCategory, setIndustryCategory] = useState<
    IndustryCategory | ""
  >("");
  const [maxDistance, setMaxDistance] = useState(200);
  const [baseLayer, setBaseLayer] = useState<MapBaseLayer>("plan");
  const summary = useMemo(() => summarizeIncident(fixture), [fixture]);
  const availableSpecies = useMemo(
    () =>
      [
        ...new Set(
          fixture.parcels.features
            .map((parcel) => parcel.properties.dominantSpecies)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort((left, right) => left.localeCompare(right, "fr")),
    [fixture.parcels.features],
  );
  const availableIndustryCategories = useMemo(
    () =>
      [
        ...new Set(
          fixture.industries.features.map(
            (industry) => industry.properties.category,
          ),
        ),
      ].sort(),
    [fixture.industries.features],
  );
  const filteredParcels = useMemo(
    () =>
      filterParcels(fixture.parcels.features, {
        species: species || undefined,
        minAffectedAreaHa: minArea,
        confidence: confidence ? [confidence] : undefined,
      }),
    [fixture.parcels.features, species, minArea, confidence],
  );
  const filteredIndustries = useMemo(
    () =>
      fixture.industries.features.filter(
        (industry) =>
          industry.properties.distanceKm <= maxDistance &&
          (!industryCategory ||
            industry.properties.category === industryCategory),
      ),
    [fixture.industries.features, industryCategory, maxDistance],
  );

  useEffect(() => {
    if (analyticsTrackedRef.current) return;
    analyticsTrackedRef.current = true;
    const slug = fixture.incident.properties.slug;
    trackEvent("map_opened", slug);
    trackEvent("incident_selected", slug);
  }, [fixture.incident.properties.slug]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    let disposed = false;
    let activeMap: MapLibreMap | null = null;
    let industryPopup: MapLibrePopup | null = null;

    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (disposed || !mapContainerRef.current || mapRef.current) return;

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style:
          process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
          "https://demotiles.maplibre.org/style.json",
        center: [-1.01, 45.015],
        zoom: 10.5,
        attributionControl: false,
      });
      activeMap = map;
      mapRef.current = map;

      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );
      map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        "bottom-right",
      );

      map.on("load", () => {
        map.addSource("satellite", {
          type: "raster",
          tiles: [satelliteTileUrl],
          tileSize: 256,
          attribution:
            '<a href="https://www.ign.fr/" target="_blank" rel="noopener noreferrer">IGN</a>',
        });
        map.addLayer({
          id: "satellite-base",
          type: "raster",
          source: "satellite",
          layout: {
            visibility:
              baseLayerRef.current === "satellite" ? "visible" : "none",
          },
        });
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

        industryPopup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 10,
        });

        map.on("click", "parcel-fill", (event) => {
          const id = event.features?.[0]?.properties?.id;
          const parcel = fixture.parcels.features.find(
            (candidate) => candidate.properties.id === id,
          );
          if (parcel)
            trackEvent("parcel_clicked", fixture.incident.properties.slug);
          setSelectedParcel(parcel ?? null);
        });
        map.on("mouseenter", "parcel-fill", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "parcel-fill", () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("mouseenter", "industry-points", (event) => {
          const companyName = getIndustryMarkerName(
            event.features?.[0]?.properties,
          );
          if (!companyName || !industryPopup) return;

          const content = document.createElement("p");
          content.className = "industry-marker-tooltip";
          content.textContent = `${companyName} · Cliquer pour consulter la fiche SIRENE`;
          industryPopup
            .setLngLat(event.lngLat)
            .setDOMContent(content)
            .addTo(map);
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("click", "industry-points", (event) => {
          const sireneUrl = getIndustrySireneUrl(
            event.features?.[0]?.properties,
          );
          if (!sireneUrl) return;

          window.open(sireneUrl, "_blank", "noopener,noreferrer");
        });
        map.on("mouseleave", "industry-points", () => {
          industryPopup?.remove();
          map.getCanvas().style.cursor = "";
        });
      });
    });

    return () => {
      disposed = true;
      industryPopup?.remove();
      activeMap?.remove();
      if (mapRef.current === activeMap) mapRef.current = null;
    };
  }, [fixture]);

  function changeBaseLayer(nextLayer: MapBaseLayer) {
    baseLayerRef.current = nextLayer;
    setBaseLayer(nextLayer);
    const map = mapRef.current;
    if (map?.getLayer("satellite-base")) {
      map.setLayoutProperty(
        "satellite-base",
        "visibility",
        nextLayer === "satellite" ? "visible" : "none",
      );
    }
  }

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

  useEffect(() => {
    const source = mapRef.current?.getSource("industries") as
      | GeoJSONSource
      | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: filteredIndustries,
    });
  }, [filteredIndustries]);

  const isFixture =
    fixture.incident.properties.sourceUrl.startsWith("local://");

  return (
    <div className="radar-layout">
      <aside className="radar-sidebar">
        <span className="fixture-badge">
          {isFixture ? "Données fictives" : "Données publiées"}
        </span>
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
            <strong>{filteredIndustries.length}</strong>
            <span>industries affichées</span>
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
            {availableSpecies.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="confidence-filter">Niveau de confiance</label>
          <select
            id="confidence-filter"
            value={confidence}
            onChange={(event) =>
              setConfidence(event.target.value as Confidence | "")
            }
          >
            <option value="">Tous les niveaux</option>
            <option value="high">Haute</option>
            <option value="medium">Moyenne</option>
            <option value="low">Faible</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="industry-category-filter">Métier industriel</label>
          <select
            id="industry-category-filter"
            value={industryCategory}
            onChange={(event) => {
              setIndustryCategory(event.target.value as IndustryCategory | "");
              trackEvent(
                "industry_filter_used",
                fixture.incident.properties.slug,
              );
            }}
          >
            <option value="">Tous les métiers</option>
            {availableIndustryCategories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="distance-filter">
            Distance industrielle maximale
          </label>
          <select
            id="distance-filter"
            value={maxDistance}
            onChange={(event) => {
              setMaxDistance(Number(event.target.value));
              trackEvent(
                "industry_filter_used",
                fixture.incident.properties.slug,
              );
            }}
          >
            <option value={25}>25 km</option>
            <option value={50}>50 km</option>
            <option value={100}>100 km</option>
            <option value={150}>150 km</option>
            <option value={200}>200 km</option>
          </select>
        </div>

        <Link
          className="map-event-link"
          href={`/evenements/${fixture.incident.properties.slug}`}
        >
          Voir la fiche complète de l'événement
        </Link>

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
        <MapBaseLayerSwitch value={baseLayer} onChange={changeBaseLayer} />
        <section
          ref={mapContainerRef}
          className="radar-map"
          aria-label="Carte interactive des zones affectées"
        />
        {selectedParcel ? (
          <article className="parcel-drawer" aria-live="polite">
            <div className="drawer-header">
              <div>
                <span className="fixture-badge">
                  {isFixture ? "Parcelle fictive" : "Parcelle calculée"}
                </span>
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
