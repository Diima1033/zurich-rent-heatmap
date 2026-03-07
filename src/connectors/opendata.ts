// AKTIV: Phase 1 — Öffentliche CSVs von Statistik Stadt Zürich
// Datenquelle: Mietpreiserhebung 2024, Statistische Quartiere, CHF/m²
import type { PriceData } from '../types';

const CSV_URL =
  'https://data.stadt-zuerich.ch/dataset/bau_whg_mpe_mietpreis_raum_zizahl_gn_jahr_od5161/download/BAU516OD5161.csv';

// Statisches Mapping: Quartiername → {qnr, knr}
// Quelle: public/geodata/stadt-zuerich-quartiere.geojson
const QUARTIER_MAP: Record<string, { qnr: number; knr: number }> = {
  Rathaus: { qnr: 11, knr: 1 },
  Hochschulen: { qnr: 12, knr: 1 },
  Lindenhof: { qnr: 13, knr: 1 },
  City: { qnr: 14, knr: 1 },
  Wollishofen: { qnr: 21, knr: 2 },
  Leimbach: { qnr: 23, knr: 2 },
  Enge: { qnr: 24, knr: 2 },
  'Alt-Wiedikon': { qnr: 31, knr: 3 },
  Friesenberg: { qnr: 33, knr: 3 },
  Sihlfeld: { qnr: 34, knr: 3 },
  Werd: { qnr: 41, knr: 4 },
  Langstrasse: { qnr: 42, knr: 4 },
  Hard: { qnr: 44, knr: 4 },
  Gewerbeschule: { qnr: 51, knr: 5 },
  'Escher Wyss': { qnr: 52, knr: 5 },
  Unterstrass: { qnr: 61, knr: 6 },
  Oberstrass: { qnr: 63, knr: 6 },
  Fluntern: { qnr: 71, knr: 7 },
  Hottingen: { qnr: 72, knr: 7 },
  Hirslanden: { qnr: 73, knr: 7 },
  Witikon: { qnr: 74, knr: 7 },
  Seefeld: { qnr: 81, knr: 8 },
  'Mühlebach': { qnr: 82, knr: 8 },
  Weinegg: { qnr: 83, knr: 8 },
  Albisrieden: { qnr: 91, knr: 9 },
  Altstetten: { qnr: 92, knr: 9 },
  'Höngg': { qnr: 101, knr: 10 },
  Wipkingen: { qnr: 102, knr: 10 },
  Affoltern: { qnr: 111, knr: 11 },
  Oerlikon: { qnr: 115, knr: 11 },
  Seebach: { qnr: 119, knr: 11 },
  Saatlen: { qnr: 121, knr: 12 },
  'Schwamendingen-Mitte': { qnr: 122, knr: 12 },
  Hirzenbach: { qnr: 123, knr: 12 },
};

// Geschätzte Durchschnittsgrösse pro Zimmerzahl (m²)
// Wird genutzt um avg_rent (CHF/Monat) aus avg_rent_m2 (CHF/m²) zu schätzen
const AVG_SIZE_BY_ROOMS: Record<number, number> = {
  1: 40,
  2: 55,
  3: 75,
  4: 95,
  5: 120,
};
const DEFAULT_SIZE_M2 = 75; // für kombinierte 2+3+4-Zimmer

// CSV ZimmerLang-Werte je Zimmerzahl
const ZIMMER_LANG: Record<number, string> = {
  1: '1 Zimmer',
  2: '2 Zimmer',
  3: '3 Zimmer',
  4: '4 Zimmer',
  5: '5 und mehr Zimmer',
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/^\ufeff/, '').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx];
    });
    rows.push(row);
  }
  return rows;
}

export async function fetchFromOpendata(rooms?: number): Promise<PriceData[]> {
  const response = await fetch(CSV_URL, {
    next: { revalidate: 86400 }, // 24h Cache
  });

  if (!response.ok) {
    throw new Error(`Fehler beim Laden der Opendata-CSV: ${response.status}`);
  }

  const text = await response.text();
  const rows = parseCSV(text);
  const results: PriceData[] = [];

  const zimmerFilter = rooms != null ? ZIMMER_LANG[rooms] : '2 , 3  und 4 Zimmer';
  const sizeM2 = rooms != null ? (AVG_SIZE_BY_ROOMS[rooms] ?? DEFAULT_SIZE_M2) : DEFAULT_SIZE_M2;

  for (const row of rows) {
    // Filter: Statistische Quartiere, 2024, Nicht gemeinnützig, Nettomiete, CHF/m²
    if (
      row['RaumeinheitLang'] !== 'Statistische Quartiere' ||
      row['StichtagDatJahr'] !== '2024' ||
      row['GemeinnuetzigLang'] !== 'Nicht gemeinnützig' ||
      row['PreisartLang'] !== 'netto' ||
      row['ZimmerLang'] !== zimmerFilter ||
      row['EinheitLang'] !== 'Quadratmeter' ||
      row['GliederungLang'] === 'Ganze Stadt'
    ) {
      continue;
    }

    const name = row['GliederungLang'];
    const quartierInfo = QUARTIER_MAP[name];
    if (!quartierInfo) continue;

    const avg_rent_m2 = parseFloat(row['qu50']); // Median CHF/m²
    if (isNaN(avg_rent_m2)) continue;

    results.push({
      gemeinde_id: String(quartierInfo.qnr),
      gemeinde_name: 'Stadt Zürich',
      avg_rent: Math.round(avg_rent_m2 * sizeM2),
      avg_rent_m2,
      sample_size: parseInt(row['Sample1'], 10) || 0,
      last_updated: '2024-04-01',
      source: 'opendata',
      quartier: name,
      kreis: quartierInfo.knr,
    });
  }

  return results;
}
