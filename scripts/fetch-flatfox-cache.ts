/**
 * Build-time Script: Flatfox-Daten cachen
 *
 * Lädt alle Flatfox-Inserate für Kanton Zürich und speichert sie als
 * public/data/flatfox-cache.json, damit die API-Route ohne Live-Requests
 * auskommt (Vercel 10s Timeout).
 *
 * Verwendung: tsx scripts/fetch-flatfox-cache.ts
 * Automatisch via package.json "prebuild" Hook.
 */

import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const FLATFOX_API = 'https://flatfox.ch/api/v1/public-listing/';
const PAGE_SIZE = 100;
const MAX_PAGES = 350;

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

async function fetchPage(offset: number): Promise<FlatfoxResponse> {
  const params = new URLSearchParams({
    canton: 'ZH',
    object_category: 'APARTMENT',
    offer_type: 'RENT',
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });

  const res = await fetch(`${FLATFOX_API}?${params}`, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`Flatfox API Fehler: ${res.status}`);
  return res.json() as Promise<FlatfoxResponse>;
}

async function main() {
  console.log('[fetch-flatfox-cache] Starte Flatfox-Datenabruf...');

  const first = await fetchPage(0);
  const allListings: FlatfoxListing[] = [...first.results];
  const totalPages = Math.min(Math.ceil(first.count / PAGE_SIZE), MAX_PAGES);

  console.log(`[fetch-flatfox-cache] Gesamt: ${first.count} Inserate, ${totalPages} Seiten`);

  const batchSize = 10;
  for (let page = 1; page < totalPages; page += batchSize) {
    const batch = Array.from(
      { length: Math.min(batchSize, totalPages - page) },
      (_, i) => fetchPage((page + i) * PAGE_SIZE),
    );
    const pages = await Promise.all(batch);
    for (const p of pages) allListings.push(...p.results);
    process.stdout.write(`\r[fetch-flatfox-cache] Geladen: ${allListings.length}/${first.count}`);
  }
  console.log();

  const outDir = path.join(process.cwd(), 'public/data');
  await mkdir(outDir, { recursive: true });

  const outPath = path.join(outDir, 'flatfox-cache.json');
  const payload = {
    fetched_at: new Date().toISOString(),
    count: allListings.length,
    listings: allListings,
  };
  await writeFile(outPath, JSON.stringify(payload), 'utf-8');
  console.log(`[fetch-flatfox-cache] Cache gespeichert: ${outPath} (${allListings.length} Inserate)`);
}

main().catch((err) => {
  console.error('[fetch-flatfox-cache] Fehler:', err);
  process.exit(1);
});
