export default function ScanProgressBar({
  percent,
  label,
  showLabel = true,
  height = 12,
  backgroundColor = 'rgba(255,255,255,0.2)',
  fillColor = '#16a34a',
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div style={{ width: '100%' }}>
      {showLabel && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600 }}>{label ?? 'Scan Coverage'}</span>
          <span style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 700 }}>{clamped}%</span>
        </div>
      )}
      <div
        style={{ width: '100%', height, backgroundColor, borderRadius: height / 2, overflow: 'hidden' }}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Scan Coverage'}
      >
        <div style={{ height: '100%', width: `${clamped}%`, backgroundColor: fillColor, borderRadius: height / 2, transition: 'width 0.4s ease-in-out' }} />
      </div>
    </div>
  );
}
