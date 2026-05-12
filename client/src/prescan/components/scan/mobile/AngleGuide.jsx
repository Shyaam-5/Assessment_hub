import { useEffect } from 'react';

const ANGLE_STYLE_ID = 'prescan-angle-guide-styles';
const COMPASS_STYLES = `
@keyframes prescan-pulse-ring {
  0% { transform: scale(1); opacity: 1; }
  70% { transform: scale(1.4); opacity: 0; }
  100% { transform: scale(1.4); opacity: 0; }
}
@keyframes prescan-pulse-dot {
  0% { transform: scale(1); }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); }
}
`;

function injectCompassStyles() {
  if (document.getElementById(ANGLE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = ANGLE_STYLE_ID;
  style.textContent = COMPASS_STYLES;
  document.head.appendChild(style);
}

function DirectionDot({ label, shortLabel, covered, isCurrent }) {
  const size = 44;
  if (covered) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={label}>
        <div style={{ width: size, height: size, borderRadius: '50%', backgroundColor: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 3px rgba(22,163,74,0.3)' }}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span style={{ color: '#16a34a', fontSize: 11, fontWeight: 700 }}>{shortLabel}</span>
      </div>
    );
  }
  if (isCurrent) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, position: 'relative' }} title={label}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, borderRadius: '50%', border: '3px solid #2563eb', animation: 'prescan-pulse-ring 1.5s ease-out infinite' }} />
        <div style={{ width: size, height: size, borderRadius: '50%', backgroundColor: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'prescan-pulse-dot 1.5s ease-in-out infinite', boxShadow: '0 0 12px rgba(37,99,235,0.6)' }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <circle cx={12} cy={12} r={5} fill="#fff" />
          </svg>
        </div>
        <span style={{ color: '#2563eb', fontSize: 11, fontWeight: 700 }}>{shortLabel}</span>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={label}>
      <div style={{ width: size, height: size, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <circle cx={12} cy={12} r={5} fill="rgba(255,255,255,0.5)" />
        </svg>
      </div>
      <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 600 }}>{shortLabel}</span>
    </div>
  );
}

const directions = [
  { key: 'front', label: 'Front', short: 'N' },
  { key: 'right', label: 'Right', short: 'E' },
  { key: 'back',  label: 'Back',  short: 'S' },
  { key: 'left',  label: 'Left',  short: 'W' },
];

export default function AngleGuide({ anglesCovered, currentAngle }) {
  useEffect(() => { injectCompassStyles(); }, []);

  return (
    <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
      <div style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, padding: '4px 10px', color: '#fff', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        Compass
      </div>
      <div style={{ width: 180, height: 180, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.55)', border: '2px solid rgba(255,255,255,0.2)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', width: '80%', height: 1, backgroundColor: 'rgba(255,255,255,0.15)' }} />
        <div style={{ position: 'absolute', width: 1, height: '80%', backgroundColor: 'rgba(255,255,255,0.15)' }} />
        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.4)', position: 'absolute' }} />
        <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)' }}>
          <DirectionDot label={directions[0].label} shortLabel={directions[0].short} covered={anglesCovered[directions[0].key]} isCurrent={currentAngle === directions[0].key} />
        </div>
        <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
          <DirectionDot label={directions[1].label} shortLabel={directions[1].short} covered={anglesCovered[directions[1].key]} isCurrent={currentAngle === directions[1].key} />
        </div>
        <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)' }}>
          <DirectionDot label={directions[2].label} shortLabel={directions[2].short} covered={anglesCovered[directions[2].key]} isCurrent={currentAngle === directions[2].key} />
        </div>
        <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
          <DirectionDot label={directions[3].label} shortLabel={directions[3].short} covered={anglesCovered[directions[3].key]} isCurrent={currentAngle === directions[3].key} />
        </div>
      </div>
      <div style={{ backgroundColor: 'rgba(37,99,235,0.85)', borderRadius: 8, padding: '4px 14px', color: '#fff', fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>
        Facing: {currentAngle}
      </div>
    </div>
  );
}
