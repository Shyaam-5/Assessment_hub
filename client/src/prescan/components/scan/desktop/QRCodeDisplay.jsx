import { useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const DOTS_STYLE_ID = 'prescan-dots-style';
const DOTS_CSS = `
@keyframes prescan-dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-6px); opacity: 1; }
}
`;

function injectDotsStyle() {
  if (document.getElementById(DOTS_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = DOTS_STYLE_ID;
  s.textContent = DOTS_CSS;
  document.head.appendChild(s);
}

function WaitingDots() {
  useEffect(() => { injectDotsStyle(); }, []);
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#2563eb', animation: `prescan-dot-bounce 1.4s ease-in-out ${i * 0.16}s infinite` }} />
      ))}
    </div>
  );
}

export default function QRCodeDisplay({ url, size = 220 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <div style={{ backgroundColor: '#ffffff', padding: 20, borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.12)', border: '3px solid #2563eb' }}>
        <QRCodeSVG value={url} size={size} level="H" includeMargin={false} style={{ display: 'block' }} />
      </div>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <p style={{ margin: '0 0 8px', color: '#64748b', fontSize: 13, wordBreak: 'break-all', fontFamily: 'monospace', backgroundColor: '#f1f5f9', padding: '8px 12px', borderRadius: 8 }}>
          {url}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <WaitingDots />
          <span style={{ color: '#64748b', fontSize: 14, fontWeight: 500 }}>Waiting for mobile connection...</span>
        </div>
      </div>
    </div>
  );
}
