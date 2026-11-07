// Shared Recharts styling so every chart reads as one system.
export const CHART = {
  axis: { stroke: 'var(--color-faint)', tick: { fill: 'var(--color-faint)', fontSize: 11 }, tickLine: false, axisLine: false },
  grid: { stroke: 'var(--color-line)', strokeDasharray: '2 4', vertical: false },
  tooltip: {
    contentStyle: { background: 'var(--color-raised)', border: '1px solid var(--color-line)', borderRadius: 8, fontSize: 12 },
    labelStyle: { color: 'var(--color-muted)' },
    itemStyle: { color: 'var(--color-fg)' },
    cursor: { fill: 'var(--color-line)', opacity: 0.4 },
  },
  series: ['var(--color-accent)', 'oklch(0.78 0.11 230)', 'oklch(0.8 0.13 150)', 'oklch(0.83 0.14 85)'],
}
