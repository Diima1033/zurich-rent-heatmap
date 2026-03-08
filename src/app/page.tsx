'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Sidebar from '@/components/Sidebar';

const Map = dynamic(() => import('@/components/Map'), { ssr: false });

export default function Home() {
  const [rooms, setRooms] = useState<number | undefined>(undefined);

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[#0f0f1a]">
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-6 py-2 md:py-3 bg-[#0f0f1a] border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-2 h-2 rounded-full bg-[#f46d43]" />
          <div>
            <h1 className="text-white font-semibold text-xs md:text-sm leading-tight tracking-wide">
              Mietpreise Kanton Zürich
            </h1>
            <p className="text-white/40 text-[10px] leading-tight">Statistik Stadt ZH 2024</p>
          </div>
        </div>
        <div className="text-white/20 text-xs">Beta</div>
      </header>

      {/* Body */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <Sidebar rooms={rooms} onChange={setRooms} />
        </div>

        {/* Map — takes all remaining space */}
        <div className="flex-1 min-h-0">
          <Map rooms={rooms} />
        </div>

        {/* Mobile bottom bar */}
        <div className="md:hidden shrink-0">
          <Sidebar rooms={rooms} onChange={setRooms} mobile />
        </div>
      </div>
    </div>
  );
}
