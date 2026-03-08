/**
 * Flatfox API Connector — live Inserate von flatfox.ch
 *
 * Öffentliche API: https://flatfox.ch/api/v1/public-listing/
 * Keine Authentifizierung erforderlich.
 * Paginierung: limit=100, offset=n
 * Limitiert auf max. MAX_PAGES Seiten um Rate-Limiting zu vermeiden.
 */

import type { PriceData } from '../types';

const FLATFOX_API = 'https://flatfox.ch/api/v1/public-listing/';
const PAGE_SIZE = 100;
const MAX_PAGES = 30; // max 3000 Inserate

interface FlatfoxListing {
  pk: number;
  offer_type: string;
  object_category: string;
  rent_net: number | null;
  rent_gross: number | null;
  rent_charges: number | null;
  surface_living: number | null;
  number_of_rooms: string | null;
  zipcode: number;
  city: string;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  published: string;
}

interface FlatfoxResponse {
  count: number;
  next: string | null;
  results: FlatfoxListing[];
}

// PLZ → BFS-Gemeindenummer (Kanton Zürich)
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
  '8200': '28',  // Schaffhausen (Grenzgebiet)
  '8500': '208', // Frauenfeld (ZH-nahe)
  '8180': '83',  // Bülach
  '8152': '72',  // Glattpark/Opfikon
  '8153': '72',  // Rümlang → Opfikon
  '8154': '72',  // Oberglatt
  '8155': '84',  // Niederhasli
  '8157': '85',  // Dielsdorf
  '8903': '243', // Birmensdorf
  '8904': '245', // Aesch → Dietikon
  '8910': '3',   // Affoltern am Albis
  '8912': '5',   // Obfelden
  '8913': '6',   // Ottenbach
  '8914': '1',   // Aeugst am Albis
  '8925': '9',   // Ebertswil
  '8926': '11',  // Kappel am Albis
  '8932': '13',  // Mettmenstetten
  '8933': '14',  // Maschwanden
  '8934': '15',  // Knonau
  '8942': '241', // Oberengstringen
  '8951': '242', // Fahrweid → Weiningen
  '8954': '246', // Geroldswil
  '8955': '247', // Oetwil an der Limmat
  '8956': '248', // Killwangen (AG)
  '8957': '249', // Spreitenbach (AG)
  '8962': '249', // Bergdietikon (AG)
  '8967': '249', // Widen (AG)
};

// PLZ-Bereiche für Kanton Zürich (grob)
const ZH_PLZ_RANGES = [
  [8001, 8099], [8100, 8199], [8200, 8299], [8300, 8399],
  [8400, 8499], [8500, 8599], [8600, 8699], [8700, 8799],
  [8800, 8899], [8900, 8999], [8600, 8699],
] as const;

function isZurichPlz(plz: number): boolean {
  return ZH_PLZ_RANGES.some(([min, max]) => plz >= min && plz <= max);
}

function getEffectiveRent(listing: FlatfoxListing): number | null {
  // Bevorzuge Nettomiete, fallback auf Bruttomiete
  const rent = listing.rent_net ?? listing.rent_gross;
  if (!rent || rent <= 0) return null;
  return rent;
}

async function fetchPage(offset: number, roomsFilter?: number): Promise<FlatfoxResponse> {
  const params = new URLSearchParams({
    canton: 'ZH',
    object_category: 'APARTMENT',
    offer_type: 'RENT',
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  if (roomsFilter !== undefined) {
    params.set('number_of_rooms', `${roomsFilter}.0`);
  }

  const res = await fetch(`${FLATFOX_API}?${params}`, {
    next: { revalidate: 3600 }, // 1h Cache
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`Flatfox API Fehler: ${res.status}`);
  return res.json() as Promise<FlatfoxResponse>;
}

// Aggregiert Listings nach PLZ → PriceData[]
function aggregate(listings: FlatfoxListing[]): PriceData[] {
  const byPlz = new Map<
    string,
    { city: string; rents: number[]; rentsM2: number[]; updated: string }
  >();

  for (const listing of listings) {
    const plz = String(listing.zipcode);
    if (!isZurichPlz(listing.zipcode)) continue;

    const rent = getEffectiveRent(listing);
    if (!rent) continue;

    if (!byPlz.has(plz)) {
      byPlz.set(plz, { city: listing.city, rents: [], rentsM2: [], updated: listing.published });
    }
    const entry = byPlz.get(plz)!;
    entry.rents.push(rent);

    if (listing.surface_living && listing.surface_living > 10) {
      entry.rentsM2.push(rent / listing.surface_living);
    }
    if (listing.published > entry.updated) entry.updated = listing.published;
  }

  const today = new Date().toISOString().slice(0, 10);
  const result: PriceData[] = [];

  for (const [plz, data] of byPlz) {
    if (data.rents.length === 0) continue;
    const bfsId = PLZ_TO_BFS[plz] ?? `plz-${plz}`;
    const sorted = [...data.rents].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

    let medianM2 = 0;
    if (data.rentsM2.length > 0) {
      const sortedM2 = [...data.rentsM2].sort((a, b) => a - b);
      const midM2 = Math.floor(sortedM2.length / 2);
      medianM2 = sortedM2.length % 2 === 0
        ? (sortedM2[midM2 - 1] + sortedM2[midM2]) / 2
        : sortedM2[midM2];
    }

    result.push({
      gemeinde_id: bfsId,
      gemeinde_name: data.city,
      avg_rent: Math.round(median),
      avg_rent_m2: Math.round(medianM2 * 10) / 10,
      sample_size: data.rents.length,
      last_updated: data.updated.slice(0, 10) || today,
      source: 'scraper',
    });
  }

  return result;
}

export async function fetchFromFlatfox(roomsFilter?: number): Promise<PriceData[]> {
  const allListings: FlatfoxListing[] = [];

  // Erste Seite laden um Gesamtanzahl zu kennen
  const first = await fetchPage(0, roomsFilter);
  allListings.push(...first.results);

  const totalPages = Math.min(Math.ceil(first.count / PAGE_SIZE), MAX_PAGES);

  // Restliche Seiten parallel laden (max 5 gleichzeitig)
  const batchSize = 5;
  for (let page = 1; page < totalPages; page += batchSize) {
    const batch = Array.from(
      { length: Math.min(batchSize, totalPages - page) },
      (_, i) => fetchPage((page + i) * PAGE_SIZE, roomsFilter),
    );
    const pages = await Promise.all(batch);
    for (const p of pages) allListings.push(...p.results);
  }

  return aggregate(allListings);
}
