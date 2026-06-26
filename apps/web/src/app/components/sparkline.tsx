interface Point {
  at: Date;
  priceMinor: number;
}

export function Sparkline({ points, width = 60, height = 20 }: { points: Point[]; width?: number; height?: number }) {
  if (points.length < 2) {
    return <span className="inline-block w-[60px] h-[20px]" />;
  }

  const prices = points.map((p) => p.priceMinor);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p.priceMinor - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block align-middle"
      aria-hidden
    >
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="text-emerald-500"
      />
    </svg>
  );
}
