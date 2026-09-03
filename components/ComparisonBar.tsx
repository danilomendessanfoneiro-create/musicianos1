import React from 'react';
import { formatCurrency } from './ui';

export const ComparisonBar: React.FC<{
  label: string;
  value: number;
  max: number;
  colorClass: string;
}> = ({ label, value, max, colorClass }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-zinc-400 mb-1">
        <span>{label}</span>
        <span className="font-semibold text-zinc-200">{formatCurrency(value)}</span>
      </div>
      <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};
