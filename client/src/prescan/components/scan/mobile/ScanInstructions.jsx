const STEPS = [
  { icon: '📷', title: 'Grant Camera Access', description: 'Allow camera access when prompted. This is required to scan your exam environment.' },
  { icon: '📡', title: 'Allow Motion Sensors', description: 'On iOS, tap "Allow" when asked for motion & orientation access. Required for angle tracking.' },
  { icon: '📱', title: 'Hold Phone Upright', description: 'Keep your phone in portrait mode throughout the scan.' },
  { icon: '🔄', title: 'Rotate 360°', description: 'Slowly rotate your phone around your desk — cover Front, Right, Back, and Left directions.' },
  { icon: '🖥️', title: 'Show Surroundings', description: 'Include your desk, walls, under the table, computer screen, and nearby surfaces in the scan.' },
];

export default function ScanInstructions({ onStart, examTitle, candidateName }) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#0f172a', display: 'flex', flexDirection: 'column', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)', padding: '32px 24px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
        <h1 style={{ margin: 0, color: '#ffffff', fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}>Pre-Exam Room Scan</h1>
        {examTitle && <p style={{ margin: '8px 0 0', color: '#93c5fd', fontSize: 14 }}>{examTitle}</p>}
        {candidateName && <p style={{ margin: '4px 0 0', color: '#bfdbfe', fontSize: 13 }}>Candidate: {candidateName}</p>}
      </div>

      <div style={{ padding: '24px 20px', flex: 1 }}>
        <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 20, textAlign: 'center' }}>
          Follow these steps to complete your environment check
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {STEPS.map((step, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, backgroundColor: '#1e293b', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ minWidth: 36, height: 36, borderRadius: '50%', backgroundColor: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                {step.icon}
              </div>
              <div>
                <div style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{index + 1}. {step.title}</div>
                <div style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>{step.description}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, backgroundColor: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
          <p style={{ margin: 0, color: '#fca5a5', fontSize: 13, lineHeight: 1.5 }}>
            Your scan is recorded and reviewed by AI. Ensure no prohibited items (phones, notes, books) are visible during the scan.
          </p>
        </div>
      </div>

      <div style={{ padding: '20px 24px', paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))', backgroundColor: '#0f172a' }}>
        <button
          onClick={onStart}
          style={{ width: '100%', padding: '16px 24px', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em', boxShadow: '0 4px 20px rgba(37,99,235,0.4)', transition: 'opacity 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          Start Scanning
        </button>
      </div>
    </div>
  );
}
