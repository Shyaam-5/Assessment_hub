export default function LoadingSpinner({ size = 40, color = '#2563eb', message }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <svg width={size} height={size} viewBox="0 0 50 50">
        <circle cx={25} cy={25} r={20} fill="none" stroke={color} strokeWidth={4} strokeDasharray="80 120" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite" />
        </circle>
      </svg>
      {message && <span style={{ color: '#64748b', fontSize: 14 }}>{message}</span>}
    </div>
  );
}
