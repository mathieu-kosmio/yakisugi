import type {
  ForestFeature,
  IndustryFeature,
  ParcelFeature,
  RadarFixture,
} from "@/lib/domain/types";

const incidentId = "11111111-1111-4111-8111-111111111111";

function parcel(
  index: number,
  west: number,
  south: number,
  species: string | null,
  affectedAreaHa: number,
  confidence: "low" | "medium" | "high",
): ParcelFeature {
  const east = west + 0.018;
  const north = south + 0.012;
  const parcelAreaHa = Math.round((affectedAreaHa + 1.2) * 10) / 10;

  return {
    type: "Feature",
    id: `parcel-${index}`,
    properties: {
      id: `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`,
      incidentId,
      inseeCode: index < 7 ? "33448" : "33011",
      communeName: index < 7 ? "Saumos" : "Le Temple",
      section: index < 6 ? "AB" : "AC",
      parcelNumber: String(40 + index).padStart(4, "0"),
      parcelUid: `${index < 7 ? "33448" : "33011"}000${index < 6 ? "AB" : "AC"}${String(40 + index).padStart(4, "0")}`,
      parcelAreaHa,
      affectedAreaHa,
      affectedRatio: Math.round((affectedAreaHa / parcelAreaHa) * 100) / 100,
      forestAreaHa: Math.round(affectedAreaHa * 0.93 * 10) / 10,
      dominantSpecies: species,
      estimatedVolumeMinM3: null,
      estimatedVolumeMaxM3: null,
      confidence,
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
  };
}

const forests: ForestFeature[] = [
  {
    type: "Feature",
    id: "forest-1",
    properties: {
      id: "forest-1",
      incidentId,
      forestTypeLabel: "Futaie de conifères",
      dominantSpecies: "Pin maritime",
      areaHa: 618.4,
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-1.08, 44.99],
          [-1.01, 44.99],
          [-1.01, 45.05],
          [-1.08, 45.05],
          [-1.08, 44.99],
        ],
      ],
    },
  },
  {
    type: "Feature",
    id: "forest-2",
    properties: {
      id: "forest-2",
      incidentId,
      forestTypeLabel: "Mélange feuillus-conifères",
      dominantSpecies: "Forêt mixte",
      areaHa: 184.2,
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-1.01, 45.015],
          [-0.96, 45.015],
          [-0.96, 45.06],
          [-1.01, 45.06],
          [-1.01, 45.015],
        ],
      ],
    },
  },
  {
    type: "Feature",
    id: "forest-3",
    properties: {
      id: "forest-3",
      incidentId,
      forestTypeLabel: "Feuillus",
      dominantSpecies: "Chêne",
      areaHa: 92.6,
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-1.045, 44.965],
          [-0.985, 44.965],
          [-0.985, 45.015],
          [-1.045, 45.015],
          [-1.045, 44.965],
        ],
      ],
    },
  },
  {
    type: "Feature",
    id: "forest-4",
    properties: {
      id: "forest-4",
      incidentId,
      forestTypeLabel: "Formation non identifiée",
      dominantSpecies: null,
      areaHa: 48.8,
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-0.985, 44.98],
          [-0.945, 44.98],
          [-0.945, 45.02],
          [-0.985, 45.02],
          [-0.985, 44.98],
        ],
      ],
    },
  },
];

const parcels: ParcelFeature[] = [
  parcel(1, -1.068, 45.025, "Pin maritime", 8.7, "high"),
  parcel(2, -1.044, 45.026, "Pin maritime", 6.9, "medium"),
  parcel(3, -1.02, 45.027, "Pin maritime", 11.4, "high"),
  parcel(4, -0.996, 45.029, "Forêt mixte", 4.2, "medium"),
  parcel(5, -0.972, 45.03, "Forêt mixte", 2.8, "low"),
  parcel(6, -1.057, 45.003, "Pin maritime", 14.1, "high"),
  parcel(7, -1.033, 45.004, "Chêne", 3.6, "medium"),
  parcel(8, -1.009, 45.005, "Pin maritime", 9.8, "high"),
  parcel(9, -0.985, 45.006, null, 1.9, "low"),
  parcel(10, -0.961, 45.007, "Pin maritime", 5.4, "medium"),
];

const industryData: Array<
  [
    string,
    string,
    IndustryFeature["properties"]["category"],
    string,
    number,
    number,
    number,
  ]
> = [
  ["industry-1", "Scierie des Pins", "SAWMILL", "Salaunes", -0.83, 44.94, 18],
  [
    "industry-2",
    "Bois Médoc Exploitation",
    "FORESTRY",
    "Castelnau-de-Médoc",
    -0.8,
    45.03,
    27,
  ],
  ["industry-3", "Panneaux Atlantique", "PANELS", "Bordeaux", -0.58, 44.84, 49],
  [
    "industry-4",
    "Négoce Girondin",
    "WOOD_TRADING",
    "Mérignac",
    -0.64,
    44.84,
    43,
  ],
  [
    "industry-5",
    "Énergie Sylvicole",
    "WOOD_ENERGY",
    "Belin-Béliet",
    -0.79,
    44.5,
    63,
  ],
  [
    "industry-6",
    "Emballages du Bassin",
    "PACKAGING",
    "Biganos",
    -0.97,
    44.64,
    44,
  ],
  ["industry-7", "Scierie Landaise", "SAWMILL", "Sore", -0.58, 44.32, 91],
  ["industry-8", "Forêt Services", "FORESTRY", "Hourtin", -1.06, 45.19, 20],
  [
    "industry-9",
    "Bois Landes Industrie",
    "PANELS",
    "Labouheyre",
    -0.92,
    44.21,
    102,
  ],
  [
    "industry-10",
    "Comptoir du Bois",
    "WOOD_TRADING",
    "Langon",
    -0.25,
    44.55,
    118,
  ],
];

const industries: IndustryFeature[] = industryData.map(
  ([id, companyName, category, commune, longitude, latitude, distanceKm]) => ({
    type: "Feature",
    id,
    properties: { id, companyName, category, commune, distanceKm },
    geometry: { type: "Point", coordinates: [longitude, latitude] },
  }),
);

export const radarFixture: RadarFixture = {
  incident: {
    type: "Feature",
    id: incidentId,
    properties: {
      id: incidentId,
      slug: "saumos-2026-fixture",
      name: "Incident de démonstration de Saumos",
      externalId: null,
      startDate: "2026-07-22",
      sourceName: "Fixture de développement",
      sourceUrl: "local://fixtures/radar.ts",
      sourceDate: null,
      areaHa: 1126.3,
      status: "published",
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-1.09, 44.955],
          [-0.94, 44.955],
          [-0.93, 45.07],
          [-1.1, 45.07],
          [-1.09, 44.955],
        ],
      ],
    },
  },
  forests: { type: "FeatureCollection", features: forests },
  parcels: { type: "FeatureCollection", features: parcels },
  industries: { type: "FeatureCollection", features: industries },
};
