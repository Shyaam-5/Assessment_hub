import { useEffect, useState, useCallback, useRef } from 'react';
import { prescanApi } from '../services/prescanApi';
import { useDesktopScanSocket } from '../hooks/useDesktopScanSocket';
import ScanWaitingScreen from './scan/desktop/ScanWaitingScreen';
import ScanResultCard from './scan/desktop/ScanResultCard';
import ScanLivePreview from './scan/desktop/ScanLivePreview';
import ScanProgressBar from './scan/mobile/ScanProgressBar';
import LoadingSpinner from './common/LoadingSpinner';

const MAX_RETRIES = 1;
const DIRS = ['front', 'right', 'back', 'left'];

export default function EnvironmentScanGate({ userId, examTitle, onApproved, onCancel }) {
  const [phase, setPhase] = useState('creating'); // creating | waiting | scanning | verdict | error
  const [session, setSession] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const createSession = useCallback(async () => {
    try {
      // Fetch available prescan exams and use the first one
      const exams = await prescanApi.listExams(userId);
      if (!mountedRef.current) return;
      if (!exams || exams.length === 0) {
        setErrorMsg('No environment scan configuration found. Please contact your administrator.');
        setPhase('error');
        return;
      }
      const data = await prescanApi.createSession(userId, exams[0].id);
      if (!mountedRef.current) return;
      setSession(data);
      setPhase('waiting');
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMsg(`Failed to start environment scan: ${err.message || 'server error'}`);
      setPhase('error');
    }
  }, [userId]);

  useEffect(() => {
    createSession();
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

  // Transition from waiting → scanning when mobile connects
  useEffect(() => {
    if (mobileConnected && phase === 'waiting') {
      setPhase('scanning');
    }
  }, [mobileConnected, phase]);

  // Transition to verdict when AI finishes
  useEffect(() => {
    if (verdict) setPhase('verdict');
  }, [verdict]);

  const handleRetry = useCallback(async () => {
    if (!session || !userId || retryCount >= MAX_RETRIES) return;
    setRetrying(true);
    try {
      const newScan = await prescanApi.retryScan(session.room_scan_id, userId);
      if (!mountedRef.current) return;
      resetForRetry(); // clear mobileConnected so we wait for fresh mobile join
      setSession((prev) => ({ ...prev, room_scan_id: newScan.id }));
      setRetryCount((c) => c + 1);
      setPhase('waiting');
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMsg(`Failed to retry scan: ${err.message || 'server error'}`);
      setPhase('error');
    } finally {
      if (mountedRef.current) setRetrying(false);
    }
  }, [session, userId, retryCount, resetForRetry]);

  // Overlay wrapper
  const Overlay = ({ children }) => (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)',
      zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, boxSizing: 'border-box',
    }}>
      {children}
    </div>
  );

  if (phase === 'creating' || retrying) {
    return (
      <Overlay>
        <div style={{ background: '#f8fafc', borderRadius: 16, padding: 40, textAlign: 'center', maxWidth: 380 }}>
          <LoadingSpinner message={retrying ? 'Setting up retry scan...' : 'Starting environment scan...'} />
        </div>
      </Overlay>
    );
  }

  if (phase === 'error') {
    return (
      <Overlay>
        <div style={{ background: '#f8fafc', borderRadius: 16, padding: 40, textAlign: 'center', maxWidth: 380 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: 18, fontWeight: 700 }}>Scan Error</h2>
          <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>{errorMsg}</p>
          <button onClick={onCancel} style={{ padding: '10px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Back
          </button>
        </div>
      </Overlay>
    );
  }

  if (phase === 'waiting') {
    return (
      <Overlay>
        <div style={{ width: '100%', maxWidth: 560, position: 'relative', background: '#f8fafc', borderRadius: 16, overflowY: 'auto', maxHeight: '90vh' }}>
          <button
            onClick={onCancel}
            style={{ position: 'absolute', top: 12, right: 12, zIndex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#64748b', lineHeight: 1 }}
            title="Cancel scan"
          >
            ×
          </button>
          <ScanWaitingScreen mobileUrl={session?.mobile_url || ''} examTitle={examTitle} inline />
        </div>
      </Overlay>
    );
  }

  if (phase === 'verdict' && verdict) {
    const canRetry = verdict.verdict !== 'approved' && retryCount < MAX_RETRIES;
    return (
      <Overlay>
        <div style={{ background: '#f8fafc', borderRadius: 16, padding: '32px 24px', maxWidth: 520, width: '100%' }}>
          <h2 style={{ margin: '0 0 20px', textAlign: 'center', color: '#0f172a', fontSize: 20, fontWeight: 700 }}>Scan Complete</h2>
          <ScanResultCard
            verdict={verdict}
            onStartExam={verdict.verdict === 'approved' ? onApproved : undefined}
            onRetry={canRetry ? handleRetry : undefined}
          />
          {!canRetry && verdict.verdict !== 'approved' && (
            <p style={{ color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 12 }}>
              Maximum retries used. Please contact your proctor for assistance.
            </p>
          )}
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 14, cursor: 'pointer', textDecoration: 'underline' }}>
              Cancel
            </button>
          </div>
        </div>
      </Overlay>
    );
  }

  // phase === 'scanning'
  return (
    <Overlay>
      <div style={{ background: '#f8fafc', borderRadius: 16, padding: '24px', maxWidth: 680, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Environment Scan</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>{examTitle} — AI analysis running</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: connected ? '#f0fdf4' : '#fef2f2', border: `1px solid ${connected ? '#16a34a' : '#dc2626'}`, borderRadius: 20, padding: '5px 12px' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: connected ? '#16a34a' : '#dc2626' }} />
            <span style={{ color: connected ? '#16a34a' : '#dc2626', fontSize: 12, fontWeight: 600 }}>{connected ? 'Live' : 'Disconnected'}</span>
          </div>
        </div>

        {scanError && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #dc2626', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#7f1d1d', fontSize: 13 }}>
            {scanError}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Frames', value: String(progress?.frames_processed ?? 0), color: '#2563eb' },
            { label: 'Flagged', value: String(progress?.flagged_frames ?? 0), color: (progress?.flagged_frames ?? 0) > 0 ? '#dc2626' : '#16a34a' },
            { label: 'Coverage', value: `${coveragePercent}%`, color: coveragePercent === 100 ? '#16a34a' : '#d97706' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ backgroundColor: '#fff', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
              <div style={{ color, fontSize: 22, fontWeight: 800 }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0', marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Room Coverage</h3>
          <ScanProgressBar percent={coveragePercent} label="Scan Coverage" fillColor={coveragePercent === 100 ? '#16a34a' : '#2563eb'} backgroundColor="#e2e8f0" height={12} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
            {DIRS.map((dir) => {
              const covered = anglesCovered[dir];
              return (
                <div key={dir} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: covered ? '#16a34a' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color 0.4s' }}>
                    {covered ? (
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                        <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                        <circle cx={12} cy={12} r={5} fill="#94a3b8" />
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: covered ? '#16a34a' : '#94a3b8', textTransform: 'capitalize' }}>{dir}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0', marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Flagged Frames Preview</h3>
          <ScanLivePreview thumbnails={recentThumbnails} />
        </div>

        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, margin: 0 }}>
          AI is analyzing your environment. Please wait for results.
        </p>
      </div>
    </Overlay>
  );
}
