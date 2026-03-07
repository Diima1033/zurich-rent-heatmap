'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Sidebar from '@/components/Sidebar';

const Map = dynamic(() => import('@/components/Map'), { ssr: false });

export default function Home() {
  const [rooms, setRooms] = useState<number | undefined>(undefined);

  return (
    <main className="flex h-screen w-full">
      <Sidebar rooms={rooms} onChange={setRooms} />
      <div className="flex-1">
        <Map rooms={rooms} />
      </div>
    </main>
  );
}
