import { useEffect } from 'react';
import QRCodeDisplay from './QRCodeDisplay';

const PULSE_STYLE_ID = 'prescan-waiting-pulse';
const PULSE_CSS = `
@keyframes prescan-scan-pulse {
  0% { box-shadow: 0 0 0 0 rgba(37,99,235,0.5); }
  70% { box-shadow: 0 0 0 20px rgba(37,99,235,0); }
  100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); }
}
`;

function injectPulseStyle() {
  if (document.getElementById(PULSE_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = PULSE_STYLE_ID;
  s.textContent = PULSE_CSS;
  document.head.appendChild(s);
}

export default function ScanWaitingScreen({ mobileUrl, examTitle, candidateName, inline = false }) {
  useEffect(() => { injectPulseStyle(); }, []);

  return (
    <div style={{ ...(inline ? {} : { minHeight: '100vh', backgroundColor: '#f8fafc' }), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
      <div style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', backgroundColor: '#eff6ff', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'prescan-scan-pulse 2s infinite', border: '2px solid #2563eb' }}>
            <svg width={36} height={36} viewBox="0 0 24 24" fill="none">
              <rect x={3} y={3} width={7} height={7} rx={1} stroke="#2563eb" strokeWidth={2} />
              <rect x={14} y={3} width={7} height={7} rx={1} stroke="#2563eb" strokeWidth={2} />
              <rect x={3} y={14} width={7} height={7} rx={1} stroke="#2563eb" strokeWidth={2} />
              <path d="M14 14h2v2h-2zM14 18h2v2h-2zM18 14h2v2h-2zM18 18h2v2h-2z" fill="#2563eb" />
            </svg>
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 700, color: '#0f172a' }}>Scan QR Code with Your Phone</h1>
          {examTitle && <p style={{ margin: '0 0 4px', color: '#475569', fontSize: 15 }}>Exam: <strong>{examTitle}</strong></p>}
          {candidateName && <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Candidate: {candidateName}</p>}
        </div>

        <QRCodeDisplay url={mobileUrl} size={200} />

        <div style={{ marginTop: 32, backgroundColor: '#ffffff', borderRadius: 12, padding: '20px 24px', border: '1px solid #e2e8f0', textAlign: 'left' }}>
          <h3 style={{ margin: '0 0 14px', color: '#1e293b', fontSize: 15, fontWeight: 700 }}>Instructions for Candidate:</h3>
          <ol style={{ margin: 0, padding: '0 0 0 20px', color: '#475569', fontSize: 14, lineHeight: 2 }}>
            <li>Open your phone's camera app</li>
            <li>Point it at the QR code above</li>
            <li>Tap the link that appears</li>
            <li>Follow the on-screen instructions to scan the room</li>
            <li>Keep this desktop window open while scanning</li>
          </ol>
        </div>

        <p style={{ marginTop: 20, color: '#94a3b8', fontSize: 13 }}>This page will automatically update when your phone connects.</p>
      </div>
    </div>
  );
}
