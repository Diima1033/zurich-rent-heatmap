import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { fetchFromOpendata } from '@/connectors/opendata';
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

    const [geojsonRaw, cacheRaw, opendataPrices] = await Promise.all([
      readFile(
        path.join(process.cwd(), 'public/geodata/stadt-zuerich-kreise.geojson'),
        'utf-8'
      ),
      readFile(
        path.join(process.cwd(), 'public/data/flatfox-cache.json'),
        'utf-8'
      ),
      fetchFromOpendata(rooms),
    ]);

    const geojson = JSON.parse(geojsonRaw);
    const cache = JSON.parse(cacheRaw) as FlatfoxCache;

    // Flatfox-Cache aggregieren (liefert Kreis-Level-Daten für Stadt ZH)
    const flatfoxData = aggregate(cache.listings, rooms);
    const flatfoxMap = new Map(flatfoxData.map(p => [p.gemeinde_id, p]));

    // Opendata liefert Kreis-Ebene (knr als ID) — Flatfox-Overlay wo vorhanden
    const opendataMap = new Map(opendataPrices.map(p => [p.gemeinde_id, p]));
    const priceMap = new Map([...opendataMap, ...flatfoxMap]);

    // Preisdaten in GeoJSON-Properties mergen (Kreise: name-Property = Kreis-Nummer als Float)
    const enrichedFeatures = geojson.features.map((feature: GeoJSON.Feature) => {
      const knr = String(Math.round(Number((feature.properties as Record<string, unknown>)['name'])));
      const prices = priceMap.get(knr);

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
    console.error('Fehler in /api/prices:', error);
    return NextResponse.json({ error: 'Fehler beim Laden der Preisdaten' }, { status: 500 });
  }
}
