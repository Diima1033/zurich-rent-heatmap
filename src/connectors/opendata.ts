// AKTIV: Phase 1 — Öffentliche CSVs von opendata.swiss / statistik.zh.ch
// TODO: Schritt 4 — Implementierung
import type { PriceData } from '../types';

export async function fetchFromOpendata(): Promise<PriceData[]> {
  // 1. CSV von Stadt Zürich laden (Quartiere)
  // 2. CSV von Kanton Zürich laden (Gemeinden)
  // 3. Beide normalisieren → PriceData[]
  // 4. Zurückgeben
  return [];
}
