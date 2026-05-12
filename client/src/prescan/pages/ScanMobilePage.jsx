import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCamera } from '../hooks/useCamera';
import { useDeviceOrientation } from '../hooks/useDeviceOrientation';
import { useAngleCoverage } from '../hooks/useAngleCoverage';
import { useScanSocket } from '../hooks/useScanSocket';
import { prescanApi } from '../services/prescanApi';
import CameraFeed from '../components/scan/mobile/CameraFeed';
import AngleGuide from '../components/scan/mobile/AngleGuide';
import ScanProgressBar from '../components/scan/mobile/ScanProgressBar';
import ScanInstructions from '../components/scan/mobile/ScanInstructions';
import ScanResultCard from '../components/scan/desktop/ScanResultCard';
import LoadingSpinner from '../components/common/LoadingSpinner';

const MAX_RETRIES = 1;

const BASE_STYLE_ID = 'prescan-mobile-global';
const BASE_CSS = `
  @keyframes prescan-timeout-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
`;

function injectMobileGlobalStyles() {
  if (document.getElementById(BASE_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = BASE_STYLE_ID;
  s.textContent = BASE_CSS;
  document.head.appendChild(s);
}

export default function ScanMobilePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [pageState, setPageState] = useState('loading');
  const [config, setConfig] = useState(null);
  const [roomScanId, setRoomScanId] = useState(null);
  const [candidateId, setCandidateId] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [wsUrl, setWsUrl] = useState(null);
  const [scanInfo, setScanInfo] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [frameCount, setFrameCount] = useState(0);
  const [timeoutCountdown, setTimeoutCountdown] = useState(null);
  // retryCount starts from however many scans already exist (scan_count - 1)
  const [retryCount, setRetryCount] = useState(0);
  const [retrying, setRetrying] = useState(false);

  const scanStartTimeRef = useRef(null);
  const intervalRef = useRef(null);
  const completeSentRef = useRef(false);
  const frameIndexRef = useRef(0);

  const { videoRef, streamReady, error: cameraError, startCamera, stopCamera, captureFrame } = useCamera();
  const { getOrientation, permissionNeeded, requestPermission, isSecureContext: orientationSecureContext } = useDeviceOrientation();
  const { anglesCovered, currentAngle, coveragePercent, updateAngle, getAnglesCovered, getCurrentAngle, getCoveragePercent, reset: resetAngles } = useAngleCoverage();

  const { connected, socketRoomScanId, verdict, scanError, timeoutWarning, emitFrameResult, emitAngleUpdate, emitScanComplete } =
    useScanSocket(sessionToken, roomScanId, wsUrl);

  useEffect(() => {
    if (socketRoomScanId && !roomScanId) setRoomScanId(socketRoomScanId);
  }, [socketRoomScanId, roomScanId]);

  useEffect(() => { injectMobileGlobalStyles(); }, []);

  useEffect(() => {
    if (!token) {
      setLoadError('Missing session token. Please scan the QR code again.');
      return;
    }

    prescanApi.validateMobileLink(token)
      .then((data) => {
        setConfig(data.config);
        setRoomScanId(data.room_scan_id);
        setSessionToken(data.session_token);
        setWsUrl(data.websocket_url || null);
        setCandidateId(data.candidate_id);
        // scan_count = total scans for this session; retries used = scan_count - 1
        setRetryCount(Math.max(0, (data.scan_count ?? 1) - 1));
        setScanInfo({ candidate_name: data.candidate_name, exam_title: data.exam_title });
        setPageState('instructions');
      })
      .catch((err) => {
        const msg = err.message?.includes('401') || err.message?.includes('expired')
          ? 'Scan link expired or invalid. Please go back to the exam portal and click "Begin Scan" again.'
          : err.message?.includes('404')
          ? 'Session not found. Please request a new QR code.'
          : err.message?.includes('409')
          ? 'This exam session is already approved. You can start your exam.'
          : `Failed to load scan session. Please try again. (${err.message || 'network error'})`;
        setLoadError(msg);
      });
  }, [token]);

  const stopScanning = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (verdict) {
      stopScanning();
      setPageState('complete');
    }
  }, [verdict, stopScanning]);

  useEffect(() => {
    if (timeoutWarning !== null) setTimeoutCountdown(timeoutWarning);
  }, [timeoutWarning]);

  useEffect(() => {
    if (timeoutCountdown === null || timeoutCountdown <= 0) return;
    const t = setTimeout(() => setTimeoutCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [timeoutCountdown]);

  const startScanning = useCallback(() => {
    if (!config || !roomScanId) return;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const interval = config.frame_interval_ms ?? 1500;
    scanStartTimeRef.current = Date.now();
    frameIndexRef.current = 0;

    intervalRef.current = setInterval(() => {
      const frame = captureFrame(320, 180);
      if (!frame) return;

      const orientation = getOrientation();
      updateAngle(orientation.alpha);

      const angle = getCurrentAngle();
      const covered = getAnglesCovered();
      const pct = getCoveragePercent();
      const coveredPayload = { front: covered.front, right: covered.right, back: covered.back, left: covered.left };
      const idx = frameIndexRef.current++;
      setFrameCount(idx + 1);

      emitFrameResult({
        room_scan_id: roomScanId,
        frame_index: idx,
        captured_at: new Date().toISOString(),
        angle_label: angle,
        device_orientation: { alpha: orientation.alpha, beta: orientation.beta, gamma: orientation.gamma },
        thumbnail_b64: frame,
        processing_ms: 0,
      });

      emitAngleUpdate({
        room_scan_id: roomScanId,
        current_angle: angle,
        angles_covered: coveredPayload,
        device_orientation: { alpha: orientation.alpha, beta: orientation.beta, gamma: orientation.gamma },
        coverage_percent: pct,
      });

      if (pct >= 100 && !completeSentRef.current) {
        completeSentRef.current = true;
        setTimeout(() => {
          const duration = scanStartTimeRef.current ? (Date.now() - scanStartTimeRef.current) / 1000 : 0;
          emitScanComplete({
            room_scan_id: roomScanId,
            total_frames: frameIndexRef.current,
            angles_covered: coveredPayload,
            duration_s: duration,
          });
          stopScanning();
          setPageState('complete');
        }, 2000);
      }
    }, interval);
  }, [config, roomScanId, captureFrame, updateAngle, getOrientation, getAnglesCovered, getCurrentAngle, getCoveragePercent, emitFrameResult, emitAngleUpdate, emitScanComplete, stopScanning]);

  const handleStart = useCallback(async () => {
    if (!orientationSecureContext) {
      setLoadError('This scan must be opened on HTTPS. Please use the HTTPS link and try again.');
      return;
    }

    if (permissionNeeded) {
      const granted = await requestPermission();
      if (!granted) {
        setLoadError('Motion/orientation permission was denied. Please allow motion access in browser settings, then reopen the scan link.');
        return;
      }
    }

    setPageState('scanning');

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const camError = await startCamera();
    if (camError) {
      setLoadError(camError);
      setPageState('instructions');
      return;
    }

    // Do not call startScanning() here: setStreamReady(true) from startCamera is async and has not
    // re-rendered yet, so captureFrame would still see streamReady === false and every tick returns null.
    // startScanning runs from the effect below once streamReady is true.
  }, [orientationSecureContext, permissionNeeded, requestPermission, startCamera]);

  const handleRetry = useCallback(async () => {
    if (!roomScanId || !candidateId || retryCount >= MAX_RETRIES) return;
    setRetrying(true);
    try {
      const newScan = await prescanApi.retryScan(roomScanId, candidateId);
      // Reset all scan state for the new attempt
      setRoomScanId(newScan.id);
      setRetryCount((c) => c + 1);
      setFrameCount(0);
      setTimeoutCountdown(null);
      completeSentRef.current = false;
      frameIndexRef.current = 0;
      resetAngles();
      setPageState('instructions');
    } catch (err) {
      setLoadError(`Could not start retry: ${err.message || 'server error'}. Please reload the QR code.`);
    } finally {
      setRetrying(false);
    }
  }, [roomScanId, candidateId, retryCount, resetAngles]);

  useEffect(() => {
    if (pageState === 'scanning' && roomScanId && streamReady && !intervalRef.current) {
      startScanning();
    }
  }, [roomScanId, pageState, streamReady, startScanning]);

  useEffect(() => () => { stopScanning(); }, [stopScanning]);

  // ----- RENDER -----

  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
        <h2 style={{ color: '#f1f5f9', fontSize: 20, fontWeight: 700, margin: '0 0 12px' }}>Session Error</h2>
        <p style={{ color: '#94a3b8', fontSize: 15, lineHeight: 1.6, maxWidth: 320 }}>{loadError}</p>
      </div>
    );
  }

  if (pageState === 'loading') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSpinner message="Loading scan session..." color="#2563eb" />
      </div>
    );
  }

  if (retrying) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSpinner message="Setting up retry scan..." color="#2563eb" />
      </div>
    );
  }

  if (pageState === 'instructions') {
    return <ScanInstructions onStart={handleStart} examTitle={scanInfo?.exam_title} candidateName={scanInfo?.candidate_name} />;
  }

  if (pageState === 'permissions') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', gap: 20 }}>
        <LoadingSpinner message="Requesting permissions..." color="#2563eb" />
        {cameraError && (
          <div style={{ backgroundColor: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', borderRadius: 10, padding: '12px 16px', maxWidth: 320 }}>
            <p style={{ color: '#fca5a5', fontSize: 14, margin: 0 }}>{cameraError}</p>
          </div>
        )}
      </div>
    );
  }

  if (pageState === 'complete') {
    const canRetry = verdict && verdict.verdict !== 'approved' && retryCount < MAX_RETRIES;
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        {verdict ? (
          <div style={{ width: '100%', maxWidth: 480 }}>
            <ScanResultCard
              verdict={verdict}
              onRetry={canRetry ? handleRetry : undefined}
            />
            {!canRetry && verdict.verdict !== 'approved' && (
              <p style={{ color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 16 }}>
                Maximum retries used. Please contact your proctor.
              </p>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <LoadingSpinner message="Waiting for verdict..." color="#2563eb" />
            <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 16 }}>AI is analyzing your scan...</p>
          </div>
        )}
      </div>
    );
  }

  // SCANNING
  const DIRS = ['front', 'right', 'back', 'left'];
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <CameraFeed videoRef={videoRef}>
          <AngleGuide anglesCovered={anglesCovered} currentAngle={currentAngle} />

          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: connected ? '#16a34a' : '#dc2626' }} />
              <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>{connected ? 'LIVE' : 'CONNECTING'}</span>
            </div>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, backgroundColor: 'rgba(0,0,0,0.5)', padding: '3px 10px', borderRadius: 20 }}>Frame {frameCount}</span>
            {scanInfo && <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>{scanInfo.exam_title}</span>}
          </div>

          {scanError && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: 'rgba(220,38,38,0.9)', borderRadius: 12, padding: '12px 20px', textAlign: 'center', maxWidth: '80%' }}>
              <p style={{ color: '#fff', fontSize: 14, margin: 0, fontWeight: 600 }}>{scanError}</p>
            </div>
          )}

          {timeoutCountdown !== null && timeoutCountdown > 0 && (
            <div style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: 'rgba(217,119,6,0.9)', borderRadius: 12, padding: '14px 20px', textAlign: 'center', animation: 'prescan-timeout-blink 1s infinite' }}>
              <p style={{ color: '#fff', fontSize: 13, margin: '0 0 4px', fontWeight: 600 }}>Time Remaining</p>
              <p style={{ color: '#fff', fontSize: 28, margin: 0, fontWeight: 800 }}>{timeoutCountdown}s</p>
            </div>
          )}
        </CameraFeed>
      </div>

      <div style={{ backgroundColor: 'rgba(0,0,0,0.9)', padding: '14px 16px', paddingBottom: 'max(14px, env(safe-area-inset-bottom, 14px))', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ScanProgressBar percent={coveragePercent} label="Scan Coverage" fillColor={coveragePercent === 100 ? '#16a34a' : '#2563eb'} />
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          {DIRS.map((dir) => {
            const covered = anglesCovered[dir];
            const isCurrent = currentAngle === dir;
            return (
              <div key={dir} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, textTransform: 'capitalize', backgroundColor: covered ? '#16a34a' : isCurrent ? '#2563eb' : 'rgba(255,255,255,0.15)', color: covered || isCurrent ? '#fff' : 'rgba(255,255,255,0.5)', border: isCurrent && !covered ? '2px solid #60a5fa' : '2px solid transparent' }}>
                {covered ? '✓ ' : ''}{dir}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>AI analysis running server-side</span>
        </div>
      </div>
    </div>
  );
}
