'use client';
// TODO: Schritt 7 — Hover-Info pro Gemeinde/Quartier
import type { PriceData } from '../types';

interface TooltipProps {
  data: PriceData | null;
  x: number;
  y: number;
}

export default function Tooltip({ data, x, y }: TooltipProps) {
  if (!data) return null;
  return (
    <div
      className="absolute bg-white shadow-lg rounded p-2 text-sm pointer-events-none"
      style={{ left: x, top: y }}
    />
  );
}
