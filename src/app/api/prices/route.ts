import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { getPrices } from '@/api/prices';

export async function GET() {
  try {
    const [priceData, geojsonRaw] = await Promise.all([
      getPrices(),
      readFile(
        path.join(process.cwd(), 'public/geodata/stadt-zuerich-quartiere.geojson'),
        'utf-8'
      ),
    ]);

    const geojson = JSON.parse(geojsonRaw);

    // Preise als Map: gemeinde_id → PriceData
    const priceMap = new Map(priceData.map((p) => [p.gemeinde_id, p]));

    // Preisdaten in GeoJSON-Properties mergen
    const enrichedFeatures = geojson.features.map((feature: GeoJSON.Feature) => {
      const qnr = String((feature.properties as Record<string, unknown>)['qnr']);
      const prices = priceMap.get(qnr);

      return {
        ...feature,
        properties: {
          ...feature.properties,
          ...(prices
            ? {
                avg_rent: prices.avg_rent,
                avg_rent_m2: prices.avg_rent_m2,
                sample_size: prices.sample_size,
                last_updated: prices.last_updated,
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
    console.error('Fehler in /api/prices:', error);
    return NextResponse.json({ error: 'Fehler beim Laden der Preisdaten' }, { status: 500 });
  }
}
