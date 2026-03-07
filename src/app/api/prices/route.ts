// TODO: Schritt 5 — API-Endpunkt implementieren
import { NextResponse } from 'next/server';
import { getPrices } from '@/api/prices';

export async function GET() {
  const data = await getPrices();
  return NextResponse.json(data);
}
