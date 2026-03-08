// Phase 1 Platzhalter: Synthetische Mietpreise für Kanton Zürich Gemeinden
// Basiert auf Distanz zu Zürich-Zentrum. Wird durch echte OGD-Daten ersetzt,
// sobald das Statistische Amt KTZ entsprechende Gemeindepreise publiziert.

import type { PriceData } from '../types';

const ZH_CENTER: [number, number] = [8.5417, 47.3769]; // [lng, lat]

// Haversine-Distanz in km
function distanceKm(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Einfacher Schwerpunkt: Mittelpunkt aller Polygon-Koordinaten
function computeCentroid(geometry: GeoJSON.Geometry): [number, number] | null {
  const coords: [number, number][] = [];

  if (geometry.type === 'Polygon') {
    geometry.coordinates[0].forEach((c) => coords.push([c[0], c[1]]));
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach((poly) =>
      poly[0].forEach((c) => coords.push([c[0], c[1]]))
    );
  }

  if (coords.length === 0) return null;
  const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  return [lng, lat];
}

// Preis-Modell: linearer Abfall mit Distanz
// 0 km  → 3000 CHF  (Zentrum Zürich)
// 40 km → 1200 CHF  (Rand des Kantons, z.B. Andelfingen, Flaach)
const PRICE_AT_CENTER = 3000;
const PRICE_AT_EDGE = 1200;
const MAX_DIST_KM = 40;

// Zimmer-Aufschlag auf den Basispreis
const ROOMS_DELTA: Record<number, number> = {
  1: -350,
  2: 0,
  3: 450,
  4: 900,
  5: 1400,
};

// Leichte Streuung pro Gemeinde damit die Karte natürlicher wirkt (deterministisch per BFS)
function deterministicNoise(bfs: number): number {
  return ((bfs * 1619 + 37) % 201) - 100; // −100 … +100 CHF
}

/**
 * Generiert synthetische PriceData[] für alle übergebenen GeoJSON-Features.
 * @param features  Features aus kanton-zuerich-gemeinden.geojson (art_code 1 oder 2)
 * @param rooms     Optionaler Zimmerfilter (1–5)
 */
export function fetchFromKantonal(
  features: GeoJSON.Feature[],
  rooms?: number
): PriceData[] {
  const roomsDelta = rooms != null ? (ROOMS_DELTA[rooms] ?? 0) : 0;
  const results: PriceData[] = [];

  for (const feature of features) {
    const props = feature.properties as Record<string, unknown>;
    const bfs = Number(props['bfs']);
    const name = String(props['name'] ?? '');
    if (!bfs || !feature.geometry) continue;

    const centroid = computeCentroid(feature.geometry);
    if (!centroid) continue;

    const dist = distanceKm(ZH_CENTER[0], ZH_CENTER[1], centroid[0], centroid[1]);
    const t = Math.min(dist / MAX_DIST_KM, 1); // 0 = Zentrum, 1 = Rand
    const baseRent = Math.round(PRICE_AT_CENTER + t * (PRICE_AT_EDGE - PRICE_AT_CENTER));
    const noise = deterministicNoise(bfs);
    const avg_rent = Math.max(1000, baseRent + roomsDelta + noise);
    const avg_rent_m2 = parseFloat((avg_rent / 75).toFixed(2));

    results.push({
      gemeinde_id: String(bfs),
      gemeinde_name: name,
      avg_rent,
      avg_rent_m2,
      sample_size: 0, // synthetisch — keine echten Datenpunkte
      last_updated: '2024-01-01',
      source: 'scraper', // Platzhalter bis echte OGD-Daten vorliegen
    });
  }

  return results;
}
