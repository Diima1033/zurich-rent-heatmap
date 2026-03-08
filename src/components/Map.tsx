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

// Interpoliert eine Farbe aus der FILL_COLOR_EXPRESSION für einen gegebenen avg_rent-Wert
function interpolateColor(rent: number): string {
  const stops: [number, string][] = [
    [1200, '#4575b4'],
    [1600, '#74add1'],
    [2000, '#ffffbf'],
    [2600, '#f46d43'],
    [3500, '#d73027'],
  ];
  if (rent <= stops[0][0]) return stops[0][1];
  if (rent >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [v0, c0] = stops[i];
    const [v1, c1] = stops[i + 1];
    if (rent >= v0 && rent <= v1) {
      const t = (rent - v0) / (v1 - v0);
      const hex = (h: string) => [
        parseInt(h.slice(1, 3), 16),
        parseInt(h.slice(3, 5), 16),
        parseInt(h.slice(5, 7), 16),
      ];
      const [r0, g0, b0] = hex(c0);
      const [r1, g1, b1] = hex(c1);
      const r = Math.round(r0 + t * (r1 - r0));
      const g = Math.round(g0 + t * (g1 - g0));
      const b = Math.round(b0 + t * (b1 - b0));
      return `rgb(${r},${g},${b})`;
    }
  }
  return stops[stops.length - 1][1];
}

interface TooltipState {
  x: number;
  y: number;
  name: string;
  avg_rent: number;
  avg_rent_m2: number;
  sample_size: number;
  synthetic?: boolean; // kantonal = synthetische Daten
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
      const gemeindenPricesUrl = rooms != null ? `/api/gemeinden-prices?rooms=${rooms}` : '/api/gemeinden-prices';

      const [quartiereData, gemeindenPricesData] = await Promise.all([
        fetch(pricesUrl).then(r => r.json()),
        fetch(gemeindenPricesUrl).then(r => r.json()),
      ]);

      // Gemeinden mit Heatmap-Farben (kantonale Synthetik-Daten)
      // promoteId: 'geodb_oid' statt 'bfs' — BFS ist nicht eindeutig (Exklaven!)
      map.addSource('gemeinden', { type: 'geojson', data: gemeindenPricesData, promoteId: 'geodb_oid' });

      map.addLayer({
        id: 'gemeinden-fill',
        type: 'fill',
        source: 'gemeinden',
        paint: {
          'fill-color': [
            'step', ['to-number', ['get', 'avg_rent'], 0],
            '#4575b4',
            1600, '#74add1',
            2000, '#fee090',
            2400, '#f46d43',
            2800, '#d73027',
          ] as mapboxgl.ExpressionSpecification,
          'fill-opacity': 0.65,
        },
      }, 'waterway-label');

      map.addLayer({
        id: 'gemeinden-line',
        type: 'line',
        source: 'gemeinden',
        paint: { 'line-color': '#ffffff', 'line-width': 0.6, 'line-opacity': 0.5 },
      }, 'waterway-label');

      map.addLayer({
        id: 'gemeinden-hover',
        type: 'fill',
        source: 'gemeinden',
        paint: {
          'fill-color': '#ffffff',
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hovered'], false],
            0.2,
            0,
          ] as mapboxgl.ExpressionSpecification,
        },
      }, 'waterway-label');

      // ── Diagnose gemeinden-fill ───────────────────────────────────────────────
      console.log('[DBG] map.getSource("gemeinden"):', map.getSource('gemeinden'));
      console.log('[DBG] map.getLayer("gemeinden-fill"):', map.getLayer('gemeinden-fill'));
      console.log('[DBG] getPaintProperty fill-color:', map.getPaintProperty('gemeinden-fill', 'fill-color'));
      console.log('[DBG] getPaintProperty fill-opacity:', map.getPaintProperty('gemeinden-fill', 'fill-opacity'));

      // querySourceFeatures braucht geladene Tiles → auf sourcedata warten
      const diagHandler = (e: mapboxgl.MapSourceDataEvent) => {
        if (e.sourceId !== 'gemeinden' || !e.isSourceLoaded) return;
        map.off('sourcedata', diagHandler);
        const features = map.querySourceFeatures('gemeinden');
        console.log('[DBG] querySourceFeatures("gemeinden") count:', features.length);
        features.slice(0, 3).forEach((f, i) => {
          const p = f.properties ?? {};
          console.log(`[DBG] Feature ${i}:`, {
            id: f.id,
            name: p['name'],
            bfs: p['bfs'],
            avg_rent: p['avg_rent'],
            avg_rent_type: typeof p['avg_rent'],
            has_geodb_oid: 'geodb_oid' in p,
          });
        });
        if (features.length > 0 && features[0].properties?.['avg_rent'] == null) {
          console.warn('[DBG] avg_rent fehlt in Features → Expression kann nicht interpolieren');
        }
      };
      map.on('sourcedata', diagHandler);
      // ─────────────────────────────────────────────────────────────────────────

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

      // Hover + Tooltip für Gemeinden (kantonaler Layer)
      let hoveredGemeindeId: string | number | null = null;

      map.on('mousemove', 'gemeinden-fill', (e) => {
        if (!e.features?.length) return;
        map.getCanvas().style.cursor = 'pointer';

        const feature = e.features[0];
        const props = feature.properties ?? {};

        if (hoveredGemeindeId !== null) {
          map.setFeatureState({ source: 'gemeinden', id: hoveredGemeindeId }, { hovered: false });
        }
        // feature.id kommt jetzt von geodb_oid (eindeutig)
        hoveredGemeindeId = feature.id ?? null;
        if (hoveredGemeindeId !== null) {
          map.setFeatureState({ source: 'gemeinden', id: hoveredGemeindeId }, { hovered: true });
        }

        if (props.avg_rent != null) {
          setTooltip({
            x: e.point.x,
            y: e.point.y,
            name: props.name ?? '',
            avg_rent: Number(props.avg_rent),
            avg_rent_m2: Number(props.avg_rent_m2),
            sample_size: Number(props.sample_size),
            synthetic: props.source === 'scraper',
          });
        }
      });

      map.on('mouseleave', 'gemeinden-fill', () => {
        map.getCanvas().style.cursor = '';
        if (hoveredGemeindeId !== null) {
          map.setFeatureState({ source: 'gemeinden', id: hoveredGemeindeId }, { hovered: false });
        }
        hoveredGemeindeId = null;
        setTooltip(null);
      });

      // Hover + Tooltip für Quartiere (Stadt Zürich Detail-Layer)
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

    const quartiereSource = map.getSource('quartiere') as mapboxgl.GeoJSONSource | undefined;
    const gemeindenSource = map.getSource('gemeinden') as mapboxgl.GeoJSONSource | undefined;
    if (!quartiereSource && !gemeindenSource) return;

    const suffix = rooms != null ? `?rooms=${rooms}` : '';

    if (quartiereSource) {
      fetch(`/api/prices${suffix}`)
        .then(r => r.json())
        .then(data => {
          quartiereSource.setData(data);
          map.setPaintProperty('quartiere-fill', 'fill-color', FILL_COLOR_EXPRESSION);
        })
        .catch(console.error);
    }

    if (gemeindenSource) {
      fetch(`/api/gemeinden-prices${suffix}`)
        .then(r => r.json())
        .then(data => {
          gemeindenSource.setData(data);
          map.setPaintProperty('gemeinden-fill', 'fill-color', FILL_COLOR_EXPRESSION);
        })
        .catch(console.error);
    }
  }, [rooms]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {tooltip && (
        <div
          className="absolute rounded-xl pointer-events-none"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y - 10,
            background: '#ffffff',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            padding: '10px 14px 10px 12px',
            minWidth: 160,
          }}
        >
          <div className="flex items-start gap-2">
            <span
              className="mt-1 shrink-0 rounded-full"
              style={{
                width: 10,
                height: 10,
                backgroundColor: interpolateColor(tooltip.avg_rent),
                display: 'inline-block',
              }}
            />
            <div>
              <div className="font-bold text-gray-900 leading-tight" style={{ fontSize: 14 }}>
                {tooltip.name}
              </div>
              <div className="font-semibold text-gray-800 mt-0.5" style={{ fontSize: 18, lineHeight: 1.2 }}>
                {tooltip.avg_rent.toLocaleString('de-CH')} <span className="text-gray-500 font-normal" style={{ fontSize: 12 }}>CHF/Mt</span>
              </div>
              <div className="text-gray-400 mt-0.5" style={{ fontSize: 11 }}>
                {tooltip.avg_rent_m2.toFixed(2)} CHF/m²
                {tooltip.sample_size > 0 && <> &nbsp;·&nbsp; n={tooltip.sample_size}</>}
                {tooltip.synthetic && <> &nbsp;·&nbsp; <span title="Schätzwert">~</span></>}
              </div>
            </div>
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
