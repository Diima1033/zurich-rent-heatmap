'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const FILL_COLOR_EXPRESSION: mapboxgl.ExpressionSpecification = [
  'interpolate', ['linear'],
  ['to-number', ['get', 'avg_rent']],
  1200, '#4575b4',
  1600, '#74add1',
  2000, '#ffffbf',
  2600, '#f46d43',
  3500, '#d73027',
];

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

interface TooltipState {
  x: number;
  y: number;
  name: string;
  avg_rent: number;
  avg_rent_m2: number;
  sample_size: number;
}

export default function MapComponent({ rooms }: { rooms?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const roomsRef = useRef<number | undefined>(rooms);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Immer aktuellen rooms-Wert im Ref halten
  roomsRef.current = rooms;

  // Map einmalig initialisieren
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [8.5417, 47.3769] as [number, number],
      zoom: 12,
      attributionControl: false,
    });

    mapRef.current = map;

    map.on('load', async () => {
      const rooms = roomsRef.current;
      const pricesUrl = rooms != null ? `/api/prices?rooms=${rooms}` : '/api/prices';

      const [quartiereData, gemeindenData] = await Promise.all([
        fetch(pricesUrl).then(r => r.json()),
        fetch('/api/gemeinden').then(r => r.json()),
      ]);

      // Gemeinden-Umrisse (neutrales Grau, kein Fill)
      map.addSource('gemeinden', { type: 'geojson', data: gemeindenData });
      map.addLayer({
        id: 'gemeinden-line',
        type: 'line',
        source: 'gemeinden',
        paint: { 'line-color': '#999999', 'line-width': 0.8, 'line-opacity': 0.6 },
      });

      // Stadtquartiere mit Heatmap-Farben
      map.addSource('quartiere', { type: 'geojson', data: quartiereData, promoteId: 'qnr' });

      // Debug: avg_rent-Typ aus dem ersten Feature loggen
      const firstFeature = (quartiereData as GeoJSON.FeatureCollection).features[0];
      if (firstFeature) {
        const val = firstFeature.properties?.avg_rent;
        console.log('[Map] avg_rent Beispielwert:', val, '| Typ:', typeof val);
      }

      map.addLayer({
        id: 'quartiere-fill',
        type: 'fill',
        source: 'quartiere',
        paint: {
          'fill-color': FILL_COLOR_EXPRESSION,
          'fill-opacity': 0.75,
        },
      });

      map.addLayer({
        id: 'quartiere-line',
        type: 'line',
        source: 'quartiere',
        paint: { 'line-color': '#ffffff', 'line-width': 0.8, 'line-opacity': 0.6 },
      });

      map.addLayer({
        id: 'quartiere-hover',
        type: 'fill',
        source: 'quartiere',
        paint: {
          'fill-color': '#ffffff',
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hovered'], false],
            0.2,
            0,
          ] as mapboxgl.ExpressionSpecification,
        },
      });

      // Hover + Tooltip
      let hoveredId: string | number | null = null;

      map.on('mousemove', 'quartiere-fill', (e) => {
        if (!e.features?.length) return;
        map.getCanvas().style.cursor = 'pointer';

        const feature = e.features[0];
        const props = feature.properties ?? {};

        if (hoveredId !== null) {
          map.setFeatureState({ source: 'quartiere', id: hoveredId }, { hovered: false });
        }
        hoveredId = feature.id ?? null;
        if (hoveredId !== null) {
          map.setFeatureState({ source: 'quartiere', id: hoveredId }, { hovered: true });
        }

        if (props.avg_rent != null) {
          setTooltip({
            x: e.point.x,
            y: e.point.y,
            name: props.qname ?? '',
            avg_rent: Number(props.avg_rent),
            avg_rent_m2: Number(props.avg_rent_m2),
            sample_size: Number(props.sample_size),
          });
        }
      });

      map.on('mouseleave', 'quartiere-fill', () => {
        map.getCanvas().style.cursor = '';
        if (hoveredId !== null) {
          map.setFeatureState({ source: 'quartiere', id: hoveredId }, { hovered: false });
        }
        hoveredId = null;
        setTooltip(null);
      });
    });

    // Kein Cleanup: Map bleibt für die gesamte Lebensdauer der App bestehen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Daten aktualisieren wenn Zimmerfilter wechselt
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    // Quartiere-Source existiert erst nach on('load') — sicher prüfen
    const source = map.getSource('quartiere') as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    const url = rooms != null ? `/api/prices?rooms=${rooms}` : '/api/prices';
    fetch(url)
      .then(r => r.json())
      .then(data => {
        source.setData(data);
        map.setPaintProperty('quartiere-fill', 'fill-color', FILL_COLOR_EXPRESSION);
      })
      .catch(console.error);
  }, [rooms]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {tooltip && (
        <div
          className="absolute bg-white rounded-lg shadow-lg px-3 py-2 text-sm border border-gray-200 pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          <div className="font-semibold text-gray-900">{tooltip.name}</div>
          <div className="text-gray-700">~{tooltip.avg_rent.toLocaleString('de-CH')} CHF/Mt</div>
          <div className="text-gray-500 text-xs">
            {tooltip.avg_rent_m2.toFixed(2)} CHF/m² · n={tooltip.sample_size}
          </div>
        </div>
      )}

      <div className="absolute bottom-8 left-4 bg-white rounded-lg shadow-lg px-3 py-2 text-xs border border-gray-200">
        <div className="font-semibold text-gray-700 mb-1">Nettomiete Stadt ZH (CHF/Mt)</div>
        {[
          { color: '#4575b4', label: "< 1'600" },
          { color: '#74add1', label: "1'600–2'000" },
          { color: '#ffffbf', label: "2'000–2'600" },
          { color: '#f46d43', label: "2'600–3'500" },
          { color: '#d73027', label: "> 3'500" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2 mt-0.5">
            <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-gray-600">{label}</span>
          </div>
        ))}
        <div className="text-gray-400 mt-1">Statistik Stadt ZH 2024</div>
      </div>
    </div>
  );
}
