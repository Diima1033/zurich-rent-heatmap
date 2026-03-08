'use client';

interface SidebarProps {
  rooms: number | undefined;
  onChange: (rooms: number | undefined) => void;
  mobile?: boolean;
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

export default function Sidebar({ rooms, onChange, mobile }: SidebarProps) {
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
