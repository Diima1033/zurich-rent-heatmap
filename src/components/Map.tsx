'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

interface TooltipState {
  x: number;
  y: number;
  quartier: string;
  avg_rent: number;
  avg_rent_m2: number;
  sample_size: number;
}

export default function MapComponent() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [8.55, 47.38],
      zoom: 11,
    });

    map.on('load', async () => {
      // Preise + GeoJSON von API laden
      const res = await fetch('/api/prices');
      const geojson = await res.json();

      map.addSource('quartiere', {
        type: 'geojson',
        data: geojson,
        promoteId: 'qnr', // numerische ID für setFeatureState
      });

      // Farbgradient: blau (günstig) → rot (teuer)
      // Skala basierend auf avg_rent (CHF/Monat)
      map.addLayer({
        id: 'quartiere-fill',
        type: 'fill',
        source: 'quartiere',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'avg_rent'],
            1500, '#4575b4',  // günstig – blau
            2000, '#74add1',
            2200, '#fee090',  // mittel – gelb
            2500, '#f46d43',
            3000, '#d73027',  // teuer – rot
          ],
          'fill-opacity': [
            'case',
            ['has', 'avg_rent'], 0.75,
            0.1,
          ],
        },
      });

      map.addLayer({
        id: 'quartiere-line',
        type: 'line',
        source: 'quartiere',
        paint: {
          'line-color': '#ffffff',
          'line-width': 0.8,
          'line-opacity': 0.6,
        },
      });

      // Hover-Highlight
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
          ],
        },
      });

      let hoveredId: string | number | null = null;

      map.on('mousemove', 'quartiere-fill', (e) => {
        if (!e.features || e.features.length === 0) return;
        map.getCanvas().style.cursor = 'pointer';

        const feature = e.features[0];
        const props = feature.properties as Record<string, unknown>;

        if (hoveredId !== null) {
          map.setFeatureState({ source: 'quartiere', id: hoveredId }, { hovered: false });
        }
        hoveredId = feature.id ?? null;
        if (hoveredId !== null) {
          map.setFeatureState({ source: 'quartiere', id: hoveredId }, { hovered: true });
        }

        if (props['avg_rent']) {
          setTooltip({
            x: e.point.x,
            y: e.point.y,
            quartier: String(props['qname'] ?? ''),
            avg_rent: Number(props['avg_rent']),
            avg_rent_m2: Number(props['avg_rent_m2']),
            sample_size: Number(props['sample_size']),
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

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x + 12,
            top: tooltip.y - 8,
            pointerEvents: 'none',
          }}
          className="bg-white rounded-lg shadow-lg px-3 py-2 text-sm border border-gray-200"
        >
          <div className="font-semibold text-gray-900">{tooltip.quartier}</div>
          <div className="text-gray-700">
            ~{tooltip.avg_rent.toLocaleString('de-CH')} CHF/Mt
          </div>
          <div className="text-gray-500 text-xs">
            {tooltip.avg_rent_m2.toFixed(2)} CHF/m² · n={tooltip.sample_size}
          </div>
        </div>
      )}

      {/* Legende */}
      <div className="absolute bottom-8 left-4 bg-white rounded-lg shadow-lg px-3 py-2 text-xs border border-gray-200">
        <div className="font-semibold text-gray-700 mb-1">Nettomiete (CHF/Mt)</div>
        {[
          { color: '#4575b4', label: '< 1\'500' },
          { color: '#74add1', label: '1\'500–2\'000' },
          { color: '#fee090', label: '2\'000–2\'200' },
          { color: '#f46d43', label: '2\'200–2\'500' },
          { color: '#d73027', label: '> 2\'500' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2 mt-0.5">
            <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-gray-600">{label}</span>
          </div>
        ))}
        <div className="text-gray-400 mt-1">Quelle: Statistik Stadt ZH 2024</div>
      </div>
    </div>
  );
}
