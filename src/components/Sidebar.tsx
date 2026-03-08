'use client';

import { useState, useRef, useEffect } from 'react';
import { SearchResult } from '@/types';

interface SidebarProps {
  rooms: number | undefined;
  onChange: (rooms: number | undefined) => void;
  mobile?: boolean;
  searchData?: SearchResult[];
  onSelectResult?: (result: SearchResult) => void;
}

const ROOM_OPTIONS = [
  { value: undefined, label: 'Alle' },
  { value: 2, label: '2 Zi.' },
  { value: 3, label: '3 Zi.' },
  { value: 4, label: '4 Zi.' },
];

function RoomButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-150"
      style={{
        background: active
          ? 'linear-gradient(135deg, #f46d43 0%, #d73027 100%)'
          : 'rgba(255,255,255,0.05)',
        color: active ? '#ffffff' : 'rgba(255,255,255,0.55)',
        boxShadow: active ? '0 2px 12px rgba(244,109,67,0.35)' : 'none',
        border: active ? 'none' : '1px solid rgba(255,255,255,0.07)',
      }}
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)';
          (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.85)';
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)';
          (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.55)';
        }
      }}
    >
      {label}
    </button>
  );
}

export default function Sidebar({ rooms, onChange, mobile, searchData = [], onSelectResult }: SidebarProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const results = query.trim().length > 0
    ? searchData
        .filter(r => r.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8)
    : [];

  // Dropdown schliessen bei Klick ausserhalb
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleSelect(result: SearchResult) {
    setQuery('');
    setOpen(false);
    onSelectResult?.(result);
  }
  // Mobile: horizontal scroll bar at bottom
  if (mobile) {
    return (
      <div
        className="flex items-center gap-2 px-4 py-3 overflow-x-auto"
        style={{
          background: '#1a1a2e',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <span className="text-white/40 text-[10px] uppercase tracking-widest font-semibold shrink-0 mr-1">
          Zi.
        </span>
        {ROOM_OPTIONS.map(({ value, label }) => (
          <RoomButton
            key={String(value)}
            active={rooms === value}
            label={label}
            onClick={() => onChange(value)}
          />
        ))}
      </div>
    );
  }

  // Desktop: vertical sidebar
  return (
    <aside
      className="w-52 flex flex-col px-4 py-6 gap-6 z-10 shrink-0"
      style={{ background: '#1a1a2e', borderRight: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Suche */}
      <div ref={searchRef} className="relative">
        <input
          type="text"
          value={query}
          placeholder="Gemeinde suchen…"
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query.trim().length > 0 && setOpen(true)}
          className="w-full text-xs rounded-lg px-3 py-2 outline-none placeholder:text-white/25"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.8)',
          }}
        />
        {open && results.length > 0 && (
          <div
            className="absolute left-0 right-0 top-full mt-1 rounded-lg overflow-hidden z-50"
            style={{
              background: '#1e1e30',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            {results.map(r => (
              <button
                key={`${r.layer}-${r.name}`}
                onMouseDown={() => handleSelect(r)}
                className="w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span className="text-xs text-white/80 truncate">{r.name}</span>
                <span
                  className="text-[9px] shrink-0 px-1.5 py-0.5 rounded-full"
                  style={{
                    background: r.layer === 'quartiere' ? 'rgba(244,109,67,0.2)' : 'rgba(255,255,255,0.08)',
                    color: r.layer === 'quartiere' ? '#f46d43' : 'rgba(255,255,255,0.35)',
                  }}
                >
                  {r.layer === 'quartiere' ? 'Quartier' : 'Gemeinde'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold mb-3">
          Zimmerzahl
        </p>
        <div className="flex flex-col gap-1.5">
          {ROOM_OPTIONS.map(({ value, label }) => (
            <RoomButton
              key={String(value)}
              active={rooms === value}
              label={label}
              onClick={() => onChange(value)}
            />
          ))}
        </div>
      </div>

      <div className="mt-auto">
        <div
          className="rounded-xl p-3 text-[11px] leading-relaxed"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-white/50">Daten</p>
          <p className="text-white/30 mt-0.5">Statistik Stadt Zürich 2024</p>
        </div>
      </div>
    </aside>
  );
}
