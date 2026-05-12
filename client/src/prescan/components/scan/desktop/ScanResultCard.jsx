const VERDICT_CONFIG = {
  approved: { bg: '#f0fdf4', border: '#16a34a', headerBg: '#16a34a', title: 'Environment Approved', subtitle: 'You may start the exam', textColor: '#14532d', accentColor: '#16a34a' },
  rejected: { bg: '#fef2f2', border: '#dc2626', headerBg: '#dc2626', title: 'Environment Not Approved', subtitle: 'Remove detected items and rescan', textColor: '#7f1d1d', accentColor: '#dc2626' },
  incomplete: { bg: '#fffbeb', border: '#d97706', headerBg: '#d97706', title: 'Room Scan Incomplete', subtitle: 'Please scan the entire room', textColor: '#78350f', accentColor: '#d97706' },
};

function CheckIcon() {
  return (
    <svg width={52} height={52} viewBox="0 0 24 24" fill="none">
      <circle cx={12} cy={12} r={12} fill="rgba(255,255,255,0.2)" />
      <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg width={52} height={52} viewBox="0 0 24 24" fill="none">
      <circle cx={12} cy={12} r={12} fill="rgba(255,255,255,0.2)" />
      <path d="M8 8l8 8M16 8l-8 8" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}
function WarnIcon() {
  return (
    <svg width={52} height={52} viewBox="0 0 24 24" fill="none">
      <path d="M12 3L2 21h20L12 3z" fill="rgba(255,255,255,0.2)" stroke="#fff" strokeWidth={2} strokeLinejoin="round" />
      <path d="M12 9v5" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={12} cy={17} r={1} fill="#fff" />
    </svg>
  );
}

function StatBox({ label, value, accent }) {
  return (
    <div style={{ backgroundColor: '#ffffff', borderRadius: 8, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
      <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ color: accent, fontSize: 20, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function ActionButton({ label, onClick, primary, color }) {
  return (
    <button
      onClick={onClick}
      style={{ padding: '12px 24px', backgroundColor: primary ? color : 'transparent', color: primary ? '#ffffff' : color, border: `2px solid ${color}`, borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.15s', letterSpacing: '0.02em' }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
    >
      {label}
    </button>
  );
}

const ICONS = { approved: <CheckIcon />, rejected: <XIcon />, incomplete: <WarnIcon /> };

export default function ScanResultCard({ verdict, onStartExam, onRetry }) {
  const config = VERDICT_CONFIG[verdict.verdict] ?? VERDICT_CONFIG.incomplete;
  const details = verdict.details ?? { total_frames: 0, flagged_frames: 0, missing_angles: [] };
  const totalFrames = Number.isFinite(details.total_frames) ? details.total_frames : 0;
  const flaggedFrames = Number.isFinite(details.flagged_frames) ? details.flagged_frames : 0;
  const durationS = Number.isFinite(details.duration_s) ? details.duration_s : undefined;
  const missingAngles = Array.isArray(details.missing_angles) ? details.missing_angles : [];
  const reasonText =
    typeof verdict.reason === 'string' && verdict.reason.trim().length > 0
      ? verdict.reason
      : verdict.verdict === 'rejected'
      ? 'Scan rejected due to policy violations.'
      : verdict.verdict === 'incomplete'
      ? 'Scan incomplete. Please cover all required angles.'
      : 'Scan approved.';

  return (
    <div style={{ backgroundColor: config.bg, border: `2px solid ${config.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', maxWidth: 520, width: '100%' }} role="alert" aria-live="polite">
      <div style={{ backgroundColor: config.headerBg, padding: '24px 28px', display: 'flex', alignItems: 'center', gap: 16 }}>
        {ICONS[verdict.verdict]}
        <div>
          <h2 style={{ margin: 0, color: '#ffffff', fontSize: 20, fontWeight: 800 }}>{config.title}</h2>
          <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.85)', fontSize: 14 }}>{config.subtitle}</p>
        </div>
      </div>

      <div style={{ padding: '20px 28px' }}>
        {reasonText && (
          <div style={{ backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 8, padding: '12px 14px', marginBottom: 16, borderLeft: `4px solid ${config.accentColor}` }}>
            <p style={{ margin: 0, color: config.textColor, fontSize: 14, lineHeight: 1.6 }}>{reasonText}</p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <StatBox label="Total Frames" value={String(totalFrames)} accent={config.accentColor} />
          <StatBox label="Flagged Frames" value={String(flaggedFrames)} accent={flaggedFrames > 0 ? '#dc2626' : '#16a34a'} />
          {durationS !== undefined && <StatBox label="Scan Duration" value={`${durationS.toFixed(1)}s`} accent={config.accentColor} />}
          <StatBox label="Flag Rate" value={totalFrames > 0 ? `${Math.round((flaggedFrames / totalFrames) * 100)}%` : '0%'} accent={config.accentColor} />
        </div>

        {missingAngles.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: '0 0 8px', color: config.textColor, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Missing Coverage</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {missingAngles.map((angle) => (
                <span key={angle} style={{ backgroundColor: config.headerBg, color: '#fff', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, textTransform: 'capitalize' }}>{angle}</span>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {verdict.verdict === 'approved' && onStartExam && <ActionButton label="Start Exam" onClick={onStartExam} primary color="#16a34a" />}
          {(verdict.verdict === 'incomplete' || verdict.verdict === 'rejected') && onRetry && <ActionButton label="Retry Scan" onClick={onRetry} primary color={config.accentColor} />}
          {verdict.verdict === 'rejected' && !onRetry && (
            <div style={{ width: '100%', padding: '12px 16px', backgroundColor: 'rgba(220,38,38,0.08)', borderRadius: 8, color: '#7f1d1d', fontSize: 14, fontWeight: 500 }}>
              Please contact your proctor for assistance.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
