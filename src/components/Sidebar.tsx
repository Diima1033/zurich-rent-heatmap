'use client';

interface SidebarProps {
  rooms: number | undefined;
  onChange: (rooms: number | undefined) => void;
}

const ROOM_OPTIONS = [
  { value: 2, label: '2 Zi.' },
  { value: 3, label: '3 Zi.' },
  { value: 4, label: '4 Zi.' },
];

export default function Sidebar({ rooms, onChange }: SidebarProps) {
  return (
    <aside className="w-56 bg-white shadow-md flex flex-col p-4 gap-4 z-10">
      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
          Zimmerzahl
        </h2>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => onChange(undefined)}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
              rooms === undefined
                ? 'bg-blue-600 text-white font-medium'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Alle Zimmerzahlen
          </button>
          {ROOM_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onChange(rooms === value ? undefined : value)}
              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                rooms === value
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-gray-400 mt-auto">
        Daten: Statistik Stadt Zürich 2024
      </div>
    </aside>
  );
}
