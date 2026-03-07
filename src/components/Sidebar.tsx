'use client';
// TODO: Schritt 8 — Filter (Zimmerzahl, Preis-Range)
import type { MapConfig } from '../types';

interface SidebarProps {
  config: MapConfig;
  onChange: (config: MapConfig) => void;
}

export default function Sidebar({ config, onChange }: SidebarProps) {
  return <aside className="w-64 bg-white shadow-md p-4" />;
}
