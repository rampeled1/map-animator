import React from 'react';
import { RoutePoint } from '../types';

interface ElevationProfileChartProps {
  points: RoutePoint[];
  color?: string;
}

export const ElevationProfileChart: React.FC<ElevationProfileChartProps> = ({
  points,
  color = '#ff4d2e',
}) => {
  const pointsWithEle = points.filter((p) => p.ele !== undefined && Number.isFinite(p.ele));

  if (pointsWithEle.length < 2) {
    return (
      <div className="p-3 rounded-lg bg-[var(--panel-2)] border border-[var(--border)] text-center text-[11px] text-[var(--muted)]">
        No elevation data in this route
      </div>
    );
  }

  const width = 280;
  const height = 70;
  const padding = { top: 8, bottom: 18, left: 32, right: 8 };

  const eles = pointsWithEle.map((p) => p.ele as number);
  const minEle = Math.floor(Math.min(...eles));
  const maxEle = Math.ceil(Math.max(...eles));
  const eleSpan = Math.max(10, maxEle - minEle);

  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const coords = pointsWithEle.map((p, idx) => {
    const x = padding.left + (idx / (pointsWithEle.length - 1)) * innerW;
    const y = padding.top + innerH - (((p.ele as number) - minEle) / eleSpan) * innerH;
    return [x, y];
  });

  const linePath = coords.map(([x, y], idx) => `${idx ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${coords[coords.length - 1][0].toFixed(1)} ${padding.top + innerH} L${coords[0][0].toFixed(1)} ${padding.top + innerH} Z`;

  return (
    <div className="elevation-chart-card p-3 rounded-xl bg-[var(--panel-2)] border border-[var(--border)] space-y-1.5">
      <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text)]">
        <span>Elevation Profile</span>
        <span className="text-[10px] text-[var(--muted)] font-mono">
          {minEle}m – {maxEle}m
        </span>
      </div>

      <svg width={width} height={height} className="w-full overflow-visible">
        <defs>
          <linearGradient id="ele-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Axis markers */}
        <text x={padding.left - 4} y={padding.top + 7} fill="var(--muted)" fontSize="9" textAnchor="end">
          {maxEle}m
        </text>
        <text x={padding.left - 4} y={padding.top + innerH} fill="var(--muted)" fontSize="9" textAnchor="end">
          {minEle}m
        </text>

        {/* Fill Area */}
        <path d={areaPath} fill="url(#ele-fill)" />

        {/* Contour Stroke */}
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
  );
};
