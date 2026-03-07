import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    const geojsonRaw = await readFile(
      path.join(process.cwd(), 'public/geodata/kanton-zuerich-gemeinden.geojson'),
      'utf-8'
    );
    const geojson = JSON.parse(geojsonRaw);

    // Nur Gemeinden und Exklaven — Seen (art_code=3) und ausserkantonale Enklave (art_code=4) ausfiltern
    const filtered = {
      ...geojson,
      features: geojson.features.filter(
        (f: GeoJSON.Feature) => {
          const code = (f.properties as Record<string, unknown>)['art_code'];
          return code === 1 || code === 2;
        }
      ),
    };

    return NextResponse.json(filtered);
  } catch (error) {
    console.error('Fehler in /api/gemeinden:', error);
    return NextResponse.json({ error: 'Fehler beim Laden der Gemeindedaten' }, { status: 500 });
  }
}
