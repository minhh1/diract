"use client";

interface Tile { label: string; value: number; fieldType: string }

function formatTileValue(value: number, fieldType: string) {
  if (fieldType === 'currency') {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Single-tile presentation, used directly by DashboardWidgetRenderer (each
// summary_tile is now its own independently-positioned widget rather than an
// entry in one fixed array) -- the array-wrapper component below is now a
// thin wrapper over this for anything still rendering the old fixed layout.
export function SummaryTile({ label, value, fieldType }: Tile) {
  return (
    <div className="p-4 bg-white border border-slate-200 rounded-2xl h-full">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-1">{formatTileValue(value, fieldType)}</p>
    </div>
  );
}

export default function DashboardSummaryTiles({ tiles }: { tiles: Tile[] }) {
  if (tiles.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {tiles.map((tile, i) => <SummaryTile key={i} {...tile} />)}
    </div>
  );
}
