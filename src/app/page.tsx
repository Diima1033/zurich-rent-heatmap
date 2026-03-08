'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Sidebar from '@/components/Sidebar';

const Map = dynamic(() => import('@/components/Map'), { ssr: false });

export default function Home() {
  const [rooms, setRooms] = useState<number | undefined>(undefined);

  return (
    <div className="flex flex-col h-screen w-full bg-[#0f0f1a]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-[#0f0f1a] border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#f46d43]" />
          <div>
            <h1 className="text-white font-semibold text-sm leading-tight tracking-wide">
              Mietpreise Kanton Zürich
            </h1>
            <p className="text-white/40 text-xs leading-tight">Statistik Stadt ZH 2024</p>
          </div>
        </div>
        <div className="text-white/20 text-xs">Beta</div>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        <Sidebar rooms={rooms} onChange={setRooms} />
        <div className="flex-1">
          <Map rooms={rooms} />
        </div>
      </div>
    </div>
  );
}
