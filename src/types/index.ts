// Das standardisierte Format — NIEMALS ändern
export interface PriceData {
  gemeinde_id: string;        // BFS-Gemeindenummer
  gemeinde_name: string;
  avg_rent: number;           // CHF/Monat, Median
  avg_rent_m2: number;        // CHF/m²
  sample_size: number;        // Anzahl Datenpunkte (für Konfidenz)
  last_updated: string;       // ISO Date
  source: 'opendata' | 'scraper' | 'partner_api';
  // Optional für Stadt Zürich:
  quartier?: string;
  kreis?: number;
}

export interface SearchResult {
  name: string;
  layer: 'kreise' | 'gemeinden';
  center: [number, number];
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

export interface MapConfig {
  zoom_level: 'gemeinde' | 'quartier';
  filter_rooms?: 1 | 2 | 3 | 4 | 5;
  price_range?: [number, number];
}
