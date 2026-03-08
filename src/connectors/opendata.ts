// AKTIV: Phase 1 — Öffentliche CSVs von Statistik Stadt Zürich
// Datenquelle: Mietpreiserhebung 2024
import type { PriceData } from '../types';

const CSV_URL =
  'https://data.stadt-zuerich.ch/dataset/bau_whg_mpe_mietpreis_raum_zizahl_gn_jahr_od5161/download/BAU516OD5161.csv';

// ── "Alle" (rooms=undefined) ──────────────────────────────────────────────────
// Quelle: Statistische Quartiere (34), EinheitLang='Quadratmeter' (CHF/m²)
// qu50 ist CHF/m², wird mit geschätzter Fläche multipliziert → avg_rent (CHF/Mt)
const DEFAULT_SIZE_M2 = 75;

// Mapping Quartiername → {qnr, knr} für Statistische Quartiere
const STAT_QUARTIER_MAP: Record<string, { qnr: number; knr: number }> = {
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

// ── Zimmerzahl-Filter (rooms=2/3/4) ──────────────────────────────────────────
// Quelle: Stadtquartiere (22), EinheitLang='Wohnung' (CHF/Mt, absolut)
// qu50 ist direkt CHF/Mt — keine Umrechnung nötig.
// 6 Stadtquartiere decken einen ganzen Kreis ab und werden auf alle zugehörigen
// Statistischen Quartiere aufgeteilt (gleicher Preis für alle im Kreis).
const STADTQUARTIER_MAP: Record<string, number[]> = {
  // Kreis-Einträge → expandiert auf alle zugehörigen Stat.Quartiere
  'Altstadt (Kreis 1)':        [11, 12, 13, 14],    // Rathaus, Hochschulen, Lindenhof, City
  'Wiedikon (Kreis 3)':        [31, 33, 34],         // Alt-Wiedikon, Friesenberg, Sihlfeld
  'Aussersihl (Kreis 4)':      [41, 42, 44],         // Werd, Langstrasse, Hard
  'Industriequartier (Kreis 5)': [51, 52],           // Gewerbeschule, Escher Wyss
  'Riesbach (Kreis 8)':        [81, 82, 83],         // Seefeld, Mühlebach, Weinegg
  'Schwamendingen (Kreis 12)': [121, 122, 123],      // Saatlen, Schwamendingen-Mitte, Hirzenbach
  // Direkte 1:1-Einträge
  Wollishofen:  [21],
  Leimbach:     [23],
  Enge:         [24],
  Unterstrass:  [61],
  Oberstrass:   [63],
  Fluntern:     [71],
  Hottingen:    [72],
  Hirslanden:   [73],
  Witikon:      [74],
  Albisrieden:  [91],
  Altstetten:   [92],
  'Höngg':      [101],
  Wipkingen:    [102],
  Affoltern:    [111],
  Oerlikon:     [115],
  Seebach:      [119],
};

// Geschätzte m² pro Zimmerzahl — nur für avg_rent_m2-Anzeige im Tooltip
const AVG_SIZE_BY_ROOMS: Record<number, number> = {
  1: 40,
  2: 55,
  3: 75,
  4: 95,
  5: 120,
};

const ZIMMER_LANG: Record<number, string> = {
  2: '2 Zimmer',
  3: '3 Zimmer',
  4: '4 Zimmer',
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

  if (rooms == null) {
    // ── "Alle": Statistische Quartiere (34), CHF/m² × Fläche ─────────────────
    for (const row of rows) {
      if (
        row['RaumeinheitLang'] !== 'Statistische Quartiere' ||
        row['StichtagDatJahr'] !== '2024' ||
        row['GemeinnuetzigLang'] !== 'Nicht gemeinnützig' ||
        row['PreisartLang'] !== 'netto' ||
        row['ZimmerLang'] !== '2 , 3  und 4 Zimmer' ||
        row['EinheitLang'] !== 'Quadratmeter' ||
        row['GliederungLang'] === 'Ganze Stadt'
      ) {
        continue;
      }

      const name = row['GliederungLang'];
      const quartierInfo = STAT_QUARTIER_MAP[name];
      if (!quartierInfo) continue;

      const avg_rent_m2 = parseFloat(row['qu50']);
      if (isNaN(avg_rent_m2)) continue;

      results.push({
        gemeinde_id: String(quartierInfo.qnr),
        gemeinde_name: 'Stadt Zürich',
        avg_rent: Math.round(avg_rent_m2 * DEFAULT_SIZE_M2),
        avg_rent_m2,
        sample_size: parseInt(row['Sample1'], 10) || 0,
        last_updated: '2024-04-01',
        source: 'opendata',
        quartier: name,
        kreis: quartierInfo.knr,
      });
    }
  } else {
    // ── Zimmerzahl-Filter: Stadtquartiere (22), CHF/Mt direkt aus qu50 ────────
    const zimmerFilter = ZIMMER_LANG[rooms];
    if (!zimmerFilter) return [];
    const sizeM2 = AVG_SIZE_BY_ROOMS[rooms] ?? DEFAULT_SIZE_M2;

    for (const row of rows) {
      if (
        row['RaumeinheitLang'] !== 'Stadtquartiere' ||
        row['StichtagDatJahr'] !== '2024' ||
        row['GemeinnuetzigLang'] !== 'Nicht gemeinnützig' ||
        row['PreisartLang'] !== 'netto' ||
        row['ZimmerLang'] !== zimmerFilter ||
        row['EinheitLang'] !== 'Wohnung' ||
        row['GliederungLang'] === 'Ganze Stadt'
      ) {
        continue;
      }

      const name = row['GliederungLang'];
      const qnrs = STADTQUARTIER_MAP[name];
      if (!qnrs) continue;

      const avg_rent = parseFloat(row['qu50']); // CHF/Mt, direkt aus CSV
      if (isNaN(avg_rent)) continue;

      const avg_rent_m2 = avg_rent / sizeM2;

      // Kreis-Einträge auf alle zugehörigen Stat.Quartiere expandieren
      for (const qnr of qnrs) {
        results.push({
          gemeinde_id: String(qnr),
          gemeinde_name: 'Stadt Zürich',
          avg_rent: Math.round(avg_rent),
          avg_rent_m2,
          sample_size: parseInt(row['Sample1'], 10) || 0,
          last_updated: '2024-04-01',
          source: 'opendata',
          quartier: name,
          kreis: Math.floor(qnr / 10),
        });
      }
    }
  }

  return results;
}
