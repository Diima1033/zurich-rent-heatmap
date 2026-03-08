import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { fetchFromKantonal } from '@/connectors/kantonal';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const roomsParam = searchParams.get('rooms');
    const rooms = roomsParam ? parseInt(roomsParam, 10) : undefined;

    const geojsonRaw = await readFile(
      path.join(process.cwd(), 'public/geodata/kanton-zuerich-gemeinden.geojson'),
      'utf-8'
    );
    const geojson = JSON.parse(geojsonRaw) as GeoJSON.FeatureCollection;

    // Nur Gemeinden (art_code 1 + 2), keine Seen oder ausserkantonale Enklaven
    const gemeindenFeatures = geojson.features.filter((f) => {
      const code = (f.properties as Record<string, unknown>)['art_code'];
      return code === 1 || code === 2;
    });

    const priceData = fetchFromKantonal(gemeindenFeatures, rooms);
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
