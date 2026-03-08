/**
 * Homegate Connector — liest aggregierte Scraper-Daten
 *
 * Voraussetzung: public/data/homegate-prices.json muss existieren.
 * Erzeugen mit: python scripts/scrape-homegate.py && python scripts/aggregate.py
 */

import type { PriceData } from '../types';

interface HomegateEntry {
  plz: string;
  gemeinde: string;
  median_rent: number;
  mean_rent: number;
  median_rent_m2: number | null;
  count: number;
  by_rooms: Record<string, { median_rent: number; median_rent_m2: number | null; count: number }>;
  last_updated: string;
  source: string;
}

// PLZ → BFS-Gemeindenummer (Kanton Zürich, Auswahl)
// Vollständig: https://www.cadastre.ch/de/services/service/plz.html
const PLZ_TO_BFS: Record<string, string> = {
  // Stadt Zürich: BFS 261
  '8001': '261', '8002': '261', '8003': '261', '8004': '261',
  '8005': '261', '8006': '261', '8008': '261', '8032': '261',
  '8037': '261', '8038': '261', '8041': '261', '8044': '261',
  '8045': '261', '8046': '261', '8047': '261', '8048': '261',
  '8049': '261', '8050': '261', '8051': '261', '8052': '261',
  '8053': '261', '8055': '261', '8057': '261', '8064': '261',
  // Winterthur: BFS 230
  '8400': '230', '8401': '230', '8402': '230', '8403': '230',
  '8404': '230', '8405': '230', '8406': '230', '8408': '230',
  // Weitere Gemeinden
  '8700': '157', // Küsnacht
  '8702': '160', // Zollikon
  '8703': '151', // Erlenbach
  '8706': '156', // Meilen
  '8800': '133', // Thalwil
  '8802': '131', // Kilchberg
  '8803': '132', // Rüschlikon
  '8820': '139', // Wädenswil
  '8600': '191', // Dübendorf
  '8610': '198', // Uster
  '8620': '120', // Wetzikon
  '8902': '243', // Urdorf
  '8952': '244', // Schlieren
  '8953': '245', // Dietikon
  '8302': '62',  // Kloten
  '8304': '68',  // Wallisellen
  '8330': '177', // Pfäffikon
  '8340': '117', // Hinwil
};

function plzToBfsId(plz: string, gemeindeName: string): string {
  return PLZ_TO_BFS[plz] ?? `plz-${plz}`;
}

export async function fetchFromHomegate(roomsFilter?: number): Promise<PriceData[]> {
  const res = await fetch('/data/homegate-prices.json', { next: { revalidate: 86400 } });

  if (!res.ok) {
    throw new Error(
      `Homegate-Preisdaten nicht gefunden (${res.status}). ` +
      'Bitte zuerst den Scraper ausführen: python scripts/scrape-homegate.py && python scripts/aggregate.py'
    );
  }

  const entries: HomegateEntry[] = await res.json();

  return entries
    .map((entry): PriceData | null => {
      const bfsId = plzToBfsId(entry.plz, entry.gemeinde);

      let avgRent = entry.median_rent;
      let avgRentM2 = entry.median_rent_m2 ?? 0;
      let sampleSize = entry.count;

      // Zimmer-Filter anwenden
      if (roomsFilter !== undefined) {
        const roomKey = String(roomsFilter);
        const roomData = entry.by_rooms?.[roomKey];
        if (!roomData) return null; // Keine Daten für diese Zimmerzahl
        avgRent = roomData.median_rent;
        avgRentM2 = roomData.median_rent_m2 ?? 0;
        sampleSize = roomData.count;
      }

      return {
        gemeinde_id: bfsId,
        gemeinde_name: entry.gemeinde,
        avg_rent: avgRent,
        avg_rent_m2: avgRentM2,
        sample_size: sampleSize,
        last_updated: entry.last_updated,
        source: 'scraper',
      };
    })
    .filter((d): d is PriceData => d !== null);
}
