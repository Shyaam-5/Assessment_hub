import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDesktopScanSocket } from '../hooks/useDesktopScanSocket';
import { prescanApi } from '../services/prescanApi';
import ScanWaitingScreen from '../components/scan/desktop/ScanWaitingScreen';
import ScanLivePreview from '../components/scan/desktop/ScanLivePreview';
import ScanResultCard from '../components/scan/desktop/ScanResultCard';
import ScanProgressBar from '../components/scan/mobile/ScanProgressBar';
import LoadingSpinner from '../components/common/LoadingSpinner';

function FullPageCenter({ children, bg = '#f8fafc' }) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      {children}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ backgroundColor: '#ffffff', borderRadius: 10, padding: '14px 16px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
      <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ color, fontSize: 24, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function ErrorScreen({ message, onBack }) {
  return (
    <FullPageCenter bg="#f8fafc">
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: 20, fontWeight: 700 }}>Something went wrong</h2>
        <p style={{ color: '#64748b', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>{message}</p>
        <button onClick={onBack} style={{ padding: '12px 24px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          Back to Dashboard
        </button>
      </div>
    </FullPageCenter>
  );
}

const DIRS = ['front', 'right', 'back', 'left'];
const MAX_RETRIES = 1;

export default function ScanDesktopPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state;

  const [desktopState, setDesktopState] = useState('loading');
  const [session, setSession] = useState(locationState?.session ?? null);
  const [examTitle] = useState(locationState?.examTitle ?? 'Exam');
  const [userId] = useState(locationState?.userId ?? null);
  const [loadError, setLoadError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (session) {
      setDesktopState('waiting_for_mobile');
    } else {
      setLoadError('No session found. Please start a new scan from the dashboard.');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sessionToken = session?.session_token ?? null;

  const {
    connected,
    mobileConnected,
    progress,
    verdict,
    anglesCovered,
    coveragePercent,
    recentThumbnails,
    scanError,
    resetForRetry,
  } = useDesktopScanSocket(sessionToken);

  useEffect(() => {
    if (mobileConnected && desktopState === 'waiting_for_mobile') {
      setDesktopState('scanning_in_progress');
    }
  }, [mobileConnected, desktopState]);

  useEffect(() => {
    if (verdict) setDesktopState('verdict_received');
  }, [verdict]);

  const handleStartExam = useCallback(() => {
    navigate('/student', { state: { session } });
  }, [navigate, session]);

  const handleRetry = useCallback(async () => {
    if (!session || !userId || retryCount >= MAX_RETRIES) return;
    setRetrying(true);
    try {
      const newScan = await prescanApi.retryScan(session.room_scan_id, userId);
      const updatedSession = { ...session, room_scan_id: newScan.id };
      resetForRetry(); // clear mobileConnected so we wait for fresh mobile join
      setSession(updatedSession);
      setRetryCount((c) => c + 1);
      setDesktopState('waiting_for_mobile');
    } catch (err) {
      console.error('Retry failed:', err);
      setLoadError('Failed to retry scan. Please go back to the dashboard.');
    } finally {
      setRetrying(false);
    }
  }, [session, userId, retryCount, resetForRetry]);

  if (loadError) {
    return <ErrorScreen message={loadError} onBack={() => navigate('/')} />;
  }

  if (desktopState === 'loading' || retrying) {
    return (
      <FullPageCenter bg="#f8fafc">
        <LoadingSpinner message={retrying ? 'Setting up new scan session...' : 'Initializing scan session...'} />
      </FullPageCenter>
    );
  }

  if (desktopState === 'waiting_for_mobile') {
    return <ScanWaitingScreen mobileUrl={session?.mobile_url || ''} examTitle={examTitle} />;
  }

  if (desktopState === 'verdict_received' && verdict) {
    const canRetry = verdict.verdict !== 'approved' && retryCount < MAX_RETRIES;
    return (
      <FullPageCenter bg="#f8fafc">
        <div style={{ maxWidth: 560, width: '100%', padding: '0 16px' }}>
          <h2 style={{ margin: '0 0 24px', textAlign: 'center', color: '#0f172a', fontSize: 22, fontWeight: 700 }}>Scan Complete</h2>
          <ScanResultCard
            verdict={verdict}
            onStartExam={verdict.verdict === 'approved' ? handleStartExam : undefined}
            onRetry={canRetry ? handleRetry : undefined}
          />
          {!canRetry && verdict.verdict !== 'approved' && (
            <p style={{ color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 12 }}>
              Maximum retries used. Please contact your proctor for assistance.
            </p>
          )}
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 14, cursor: 'pointer', textDecoration: 'underline' }}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </FullPageCenter>
    );
  }

  // SCANNING_IN_PROGRESS
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '32px 24px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Scan In Progress</h1>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>{examTitle} — AI analysis running</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: connected ? '#f0fdf4' : '#fef2f2', border: `1px solid ${connected ? '#16a34a' : '#dc2626'}`, borderRadius: 20, padding: '6px 14px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: connected ? '#16a34a' : '#dc2626' }} />
            <span style={{ color: connected ? '#16a34a' : '#dc2626', fontSize: 13, fontWeight: 600 }}>{connected ? 'Live' : 'Disconnected'}</span>
          </div>
        </div>

        {scanError && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #dc2626', borderRadius: 10, padding: '12px 16px', marginBottom: 20, color: '#7f1d1d', fontSize: 14 }}>
            {scanError}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
          <StatCard label="Frames Processed" value={String(progress?.frames_processed ?? 0)} color="#2563eb" />
          <StatCard label="Flagged Frames" value={String(progress?.flagged_frames ?? 0)} color={(progress?.flagged_frames ?? 0) > 0 ? '#dc2626' : '#16a34a'} />
          <StatCard label="Coverage" value={`${coveragePercent}%`} color={coveragePercent === 100 ? '#16a34a' : '#d97706'} />
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: 12, padding: '20px 24px', border: '1px solid #e2e8f0', marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Room Coverage</h3>
          <ScanProgressBar percent={coveragePercent} label="Scan Coverage" fillColor={coveragePercent === 100 ? '#16a34a' : '#2563eb'} backgroundColor="#e2e8f0" height={14} />
          <div style={{ display: 'flex', gap: 10, marginTop: 14, justifyContent: 'center' }}>
            {DIRS.map((dir) => {
              const covered = anglesCovered[dir];
              return (
                <div key={dir} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: covered ? '#16a34a' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color 0.4s' }}>
                    {covered ? (
                      <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                        <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                        <circle cx={12} cy={12} r={5} fill="#94a3b8" />
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: covered ? '#16a34a' : '#94a3b8', textTransform: 'capitalize' }}>{dir}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: 12, padding: '20px 24px', border: '1px solid #e2e8f0', marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Flagged Frames Preview</h3>
          <ScanLivePreview thumbnails={recentThumbnails} />
        </div>

        {progress?.running_detections && Object.keys(progress.running_detections).length > 0 && (
          <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#92400e' }}>Detected Items</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(progress.running_detections).map(([cls, count]) => (
                <span key={cls} style={{ backgroundColor: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20 }}>
                  {cls}: {count}
                </span>
              ))}
            </div>
          </div>
        )}

        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 8 }}>
          Groq AI is analyzing each frame server-side. Results will appear when the scan is complete.
        </p>
      </div>
    </div>
  );
}
