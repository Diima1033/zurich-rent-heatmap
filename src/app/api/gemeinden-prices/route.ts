export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { fetchFromKantonal } from '@/connectors/kantonal';
import { aggregate, FlatfoxListing } from '@/connectors/flatfox';

interface FlatfoxCache {
  fetched_at: string;
  count: number;
  listings: FlatfoxListing[];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const roomsParam = searchParams.get('rooms');
    const rooms = roomsParam ? parseInt(roomsParam, 10) : undefined;

    const [geojsonRaw, cacheRaw] = await Promise.all([
      readFile(
        path.join(process.cwd(), 'public/geodata/kanton-zuerich-gemeinden.geojson'),
        'utf-8'
      ),
      readFile(
        path.join(process.cwd(), 'public/data/flatfox-cache.json'),
        'utf-8'
      ),
    ]);

    const geojson = JSON.parse(geojsonRaw) as GeoJSON.FeatureCollection;
    const cache = JSON.parse(cacheRaw) as FlatfoxCache;

    // Nur Gemeinden (art_code 1 + 2), keine Seen oder ausserkantonale Enklaven
    const gemeindenFeatures = geojson.features.filter((f) => {
      const code = (f.properties as Record<string, unknown>)['art_code'];
      return code === 1 || code === 2;
    });

    const flatfoxData = aggregate(cache.listings, rooms);
    const flatfoxMap = new Map(flatfoxData.map(p => [p.gemeinde_id, p]));
    const kantonalData = fetchFromKantonal(gemeindenFeatures, rooms);
    const priceData = kantonalData.map(k => flatfoxMap.get(k.gemeinde_id) ?? k);
    const priceMap = new Map(priceData.map((p) => [p.gemeinde_id, p]));

    const enrichedFeatures = gemeindenFeatures.map((feature) => {
      const bfs = String((feature.properties as Record<string, unknown>)['bfs']);
      const prices = priceMap.get(bfs);
      return {
        ...feature,
        properties: {
          ...feature.properties,
          ...(prices
            ? {
                avg_rent: prices.avg_rent,
                avg_rent_m2: prices.avg_rent_m2,
                sample_size: prices.sample_size,
                source: prices.source,
                cache_date: cache.fetched_at,
              }
            : {}),
        },
      };
    });

    return NextResponse.json({
      type: 'FeatureCollection',
      features: enrichedFeatures,
    });
  } catch (error) {
    console.error('Fehler in /api/gemeinden-prices:', error);
    return NextResponse.json({ error: 'Fehler beim Laden der Gemeinde-Preise' }, { status: 500 });
  }
}
