// Abstraktionsschicht — Visualisierung weiss nicht, woher Daten kommen
// TODO: Schritt 4+5 — Connector einbinden
import type { PriceData } from '../types';
import { fetchFromOpendata } from '../connectors/opendata';

export async function getPrices(rooms?: number): Promise<PriceData[]> {
  return fetchFromOpendata(rooms);
}
