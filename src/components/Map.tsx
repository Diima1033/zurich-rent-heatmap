'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { SearchResult } from '@/types';

const FILL_COLOR_EXPRESSION: mapboxgl.ExpressionSpecification = [
  'interpolate', ['linear'],
  ['to-number', ['get', 'avg_rent']],
  1200, '#4575b4',
  1600, '#74add1',
  2000, '#fee090',
  2600, '#f46d43',
  3500, '#d73027',
];

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

function getGeomBbox(geometry: GeoJSON.Geometry): [number, number, number, number] {
  const coords: number[][] = [];
  const collect = (ring: number[][]) => ring.forEach(c => coords.push(c));
  if (geometry.type === 'Polygon') geometry.coordinates.forEach(r => collect(r));
  else if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach(p => p.forEach(r => collect(r)));
  if (!coords.length) return [0, 0, 0, 0];
  const lons = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

// Interpoliert eine Farbe aus der FILL_COLOR_EXPRESSION für einen gegebenen avg_rent-Wert
function interpolateColor(rent: number): string {
  const stops: [number, string][] = [
    [1200, '#4575b4'],
    [1600, '#74add1'],
    [2000, '#fee090'],
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

export default function MapComponent({
  rooms,
  selectedResult,
  onSearchDataReady,
}: {
  rooms?: number;
  selectedResult?: SearchResult | null;
  onSearchDataReady?: (data: SearchResult[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const roomsRef = useRef<number | undefined>(rooms);
  const selectedFeatureRef = useRef<{ source: string; id: string | number } | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [legendVisible, setLegendVisible] = useState(true);
  useEffect(() => {
    setLegendVisible(window.innerWidth >= 768);
  }, []);
  const tapActiveRef = useRef<boolean>(false);

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
      // Label-Farben auf dunkelblau setzen (gut lesbar auf hellem Hintergrund)
      map.getStyle().layers
        .filter(l => l.type === 'symbol')
        .forEach(l => {
          map.setPaintProperty(l.id, 'text-color', '#1a1a2e');
        });

      const rooms = roomsRef.current;
      const pricesUrl = rooms != null ? `/api/prices?rooms=${rooms}` : '/api/prices';
      const gemeindenPricesUrl = rooms != null ? `/api/gemeinden-prices?rooms=${rooms}` : '/api/gemeinden-prices';

      const [quartiereData, gemeindenPricesData] = await Promise.all([
        fetch(pricesUrl).then(r => r.json()),
        fetch(gemeindenPricesUrl).then(r => r.json()),
      ]);

      // Search-Daten aus den geladenen GeoJSON-Features extrahieren
      if (onSearchDataReady) {
        const quartiereResults: SearchResult[] = (quartiereData as GeoJSON.FeatureCollection).features
          .filter(f => f.properties?.qname)
          .map(f => {
            const bbox = getGeomBbox(f.geometry);
            return {
              name: f.properties!.qname as string,
              layer: 'quartiere' as const,
              center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2] as [number, number],
              bbox,
            };
          });
        const gemeindenResults: SearchResult[] = (gemeindenPricesData as GeoJSON.FeatureCollection).features
          .filter(f => f.properties?.name && f.properties?.avg_rent != null)
          .map(f => {
            const bbox = getGeomBbox(f.geometry);
            return {
              name: f.properties!.name as string,
              layer: 'gemeinden' as const,
              center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2] as [number, number],
              bbox,
            };
          });
        onSearchDataReady([...quartiereResults, ...gemeindenResults]);
      }

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
            2600, '#f46d43',
            3500, '#d73027',
          ] as mapboxgl.ExpressionSpecification,
          'fill-opacity': 0.65,
        },
      }, 'waterway-label');

      map.addLayer({
        id: 'gemeinden-line',
        type: 'line',
        source: 'gemeinden',
        paint: { 'line-color': '#ffffff', 'line-width': 0.5, 'line-opacity': 0.6 },
      }, 'waterway-label');

      map.addLayer({
        id: 'gemeinden-hover',
        type: 'fill',
        source: 'gemeinden',
        paint: {
          'fill-color': '#ffffff',
          'fill-opacity': [
            'case',
            ['any',
              ['boolean', ['feature-state', 'hovered'], false],
              ['boolean', ['feature-state', 'selected'], false],
            ],
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
        paint: { 'line-color': '#ffffff', 'line-width': 0.5, 'line-opacity': 0.6 },
      });

      map.addLayer({
        id: 'quartiere-hover',
        type: 'fill',
        source: 'quartiere',
        paint: {
          'fill-color': '#ffffff',
          'fill-opacity': [
            'case',
            ['any',
              ['boolean', ['feature-state', 'hovered'], false],
              ['boolean', ['feature-state', 'selected'], false],
            ],
            0.2,
            0,
          ] as mapboxgl.ExpressionSpecification,
        },
      });

      // Label-Layer nach oben verschieben damit sie über den Fill-Layern erscheinen
      const labelLayerIds = ['place-label', 'settlement-label', 'settlement-subdivision-label'];
      labelLayerIds.forEach(id => {
        if (map.getLayer(id)) {
          map.moveLayer(id);
          map.setPaintProperty(id, 'text-color', '#1a1a2e');
          map.setPaintProperty(id, 'text-halo-color', '#ffffff');
          map.setPaintProperty(id, 'text-halo-width', 1.5);
        }
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
        if (!tapActiveRef.current) setTooltip(null);
      });

      // Tap/Click für Touch-Geräte (Gemeinden)
      map.on('click', 'gemeinden-fill', (e) => {
        if (!e.features?.length) return;
        const props = e.features[0].properties ?? {};
        if (props.avg_rent != null) {
          tapActiveRef.current = true;
          setTimeout(() => { tapActiveRef.current = false; }, 600);
          setTooltip(prev =>
            prev?.name === (props.name ?? '') ? null : {
              x: e.point.x,
              y: e.point.y,
              name: props.name ?? '',
              avg_rent: Number(props.avg_rent),
              avg_rent_m2: Number(props.avg_rent_m2),
              sample_size: Number(props.sample_size),
              synthetic: props.source === 'scraper',
            }
          );
        }
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
        if (!tapActiveRef.current) setTooltip(null);
      });

      // Tap/Click für Touch-Geräte (Quartiere)
      map.on('click', 'quartiere-fill', (e) => {
        if (!e.features?.length) return;
        const props = e.features[0].properties ?? {};
        if (props.avg_rent != null) {
          tapActiveRef.current = true;
          setTimeout(() => { tapActiveRef.current = false; }, 600);
          setTooltip(prev =>
            prev?.name === (props.qname ?? '') ? null : {
              x: e.point.x,
              y: e.point.y,
              name: props.qname ?? '',
              avg_rent: Number(props.avg_rent),
              avg_rent_m2: Number(props.avg_rent_m2),
              sample_size: Number(props.sample_size),
            }
          );
        }
      });

      // Tap auf leere Kartenfläche → Tooltip + Selektion löschen
      map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ['quartiere-fill', 'gemeinden-fill'],
        });
        if (!features.length) {
          setTooltip(null);
          if (selectedFeatureRef.current) {
            map.setFeatureState(
              { source: selectedFeatureRef.current.source, id: selectedFeatureRef.current.id },
              { selected: false }
            );
            selectedFeatureRef.current = null;
          }
        }
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

  // Auf gewähltes Suchergebnis zoomen, Tooltip anzeigen und Feature hervorheben
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedResult) return;

    // Vorherige Selektion sofort löschen
    if (selectedFeatureRef.current) {
      map.setFeatureState(
        { source: selectedFeatureRef.current.source, id: selectedFeatureRef.current.id },
        { selected: false }
      );
      selectedFeatureRef.current = null;
    }

    const source = selectedResult.layer === 'quartiere' ? 'quartiere' : 'gemeinden';
    const layerId = selectedResult.layer === 'quartiere' ? 'quartiere-fill' : 'gemeinden-fill';
    const nameField = selectedResult.layer === 'quartiere' ? 'qname' : 'name';

    const showTooltip = () => {
      // querySourceFeatures funktioniert unabhängig vom Viewport
      const features = map.querySourceFeatures(source, {
        sourceLayer: undefined,
        filter: ['==', ['get', nameField], selectedResult.name],
      });
      const feature = features[0];
      if (feature?.properties) {
        if (feature.id != null) {
          map.setFeatureState({ source, id: feature.id }, { selected: true });
          selectedFeatureRef.current = { source, id: feature.id };
        }
        const pt = map.project(selectedResult.center as [number, number]);
        setTooltip({
          x: pt.x,
          y: pt.y,
          name: selectedResult.name,
          avg_rent: Number(feature.properties.avg_rent),
          avg_rent_m2: Number(feature.properties.avg_rent_m2),
          sample_size: Number(feature.properties.sample_size),
          synthetic: feature.properties.source === 'scraper',
        });
      } else {
        // Fallback: nochmal versuchen wenn Source noch lädt
        map.once('idle', showTooltip);
      }
    };

    // Warten bis Map still steht UND Source geladen ist
    map.once('idle', showTooltip);
    const isMobile = window.innerWidth < 768;
    map.fitBounds(
      [[selectedResult.bbox[0], selectedResult.bbox[1]], [selectedResult.bbox[2], selectedResult.bbox[3]]],
      { padding: isMobile ? 40 : 100, duration: 700, maxZoom: 13 }
    );
  }, [selectedResult]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {tooltip && (() => {
        const containerW = containerRef.current?.offsetWidth ?? window.innerWidth;
        const tooltipW = 196;
        const flipLeft = tooltip.x + tooltipW + 24 > containerW;
        const posStyle = flipLeft
          ? { right: containerW - tooltip.x + 8, top: Math.max(8, tooltip.y - 16) }
          : { left: tooltip.x + 16, top: Math.max(8, tooltip.y - 16) };
        return (
        <div
          className="absolute pointer-events-none z-20"
          style={{
            ...posStyle,
            background: 'rgba(15,15,26,0.92)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 14,
            padding: '12px 16px',
            minWidth: 180,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              className="shrink-0 rounded-full"
              style={{
                width: 8,
                height: 8,
                backgroundColor: interpolateColor(tooltip.avg_rent),
                boxShadow: `0 0 6px ${interpolateColor(tooltip.avg_rent)}`,
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 500, letterSpacing: '0.02em' }}>
              {tooltip.name}
            </span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#ffffff', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
            {tooltip.avg_rent.toLocaleString('de-CH')}
            <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>CHF/Mt</span>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6, display: 'flex', gap: 8 }}>
            <span>{tooltip.avg_rent_m2.toFixed(2)} CHF/m²</span>
            {tooltip.sample_size > 0 && <span>n={tooltip.sample_size}</span>}
            {tooltip.synthetic && <span title="Schätzwert">~Schätzwert</span>}
          </div>
        </div>
        );
      })()}

      {/* Legend toggle button — mobile only, top-right */}
      <button
        className="md:hidden absolute top-2 right-2 z-20 flex items-center justify-center"
        onClick={() => setLegendVisible(v => !v)}
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: 'rgba(15,15,26,0.85)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.7)',
          fontSize: 14,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
        aria-label={legendVisible ? 'Legende ausblenden' : 'Legende einblenden'}
      >
        {legendVisible ? '▼' : '▲'}
      </button>

      {/* Legend — mobile: top-right (toggleable); desktop: bottom-left */}
      {legendVisible && (
        <div
          className="absolute top-12 right-2 md:top-auto md:bottom-8 md:left-4 md:right-auto text-xs z-10"
          style={{
            background: 'rgba(15,15,26,0.75)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 14,
            padding: '12px 14px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
          }}
        >
          {/* Close button on mobile */}
          <div className="md:hidden flex items-center justify-between mb-2">
            <div style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 600, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Nettomiete CHF/Mt
            </div>
            <button
              onClick={() => setLegendVisible(false)}
              style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, lineHeight: 1, marginLeft: 12 }}
              aria-label="Legende schliessen"
            >
              ×
            </button>
          </div>
          <div className="hidden md:block" style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 600, marginBottom: 8, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Nettomiete CHF/Mt
          </div>
          {[
            { color: '#4575b4', label: "< 1'600" },
            { color: '#74add1', label: "1'600–2'000" },
            { color: '#fee090', label: "2'000–2'600" },
            { color: '#f46d43', label: "2'600–3'500" },
            { color: '#d73027', label: "> 3'500" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2" style={{ marginTop: 5 }}>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 4,
                  backgroundColor: color,
                  boxShadow: `0 0 6px ${color}80`,
                  flexShrink: 0,
                }}
              />
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</span>
            </div>
          ))}
          <div style={{ color: 'rgba(255,255,255,0.2)', marginTop: 8, fontSize: 10 }}>Statistik Stadt ZH 2024</div>
        </div>
      )}
    </div>
  );
}
