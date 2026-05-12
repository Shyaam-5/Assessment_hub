import { useEffect, useRef, useState, useCallback } from 'react';
import { prescanSocketManager } from '../services/prescanSocketManager';
import { normalizeFinalVerdict } from '../utils/normalizeVerdict';

const DEFAULT_ANGLES = { front: false, left: false, right: false, back: false };
const MAX_THUMBNAILS = 5;

// Safety check for React hooks in case of bundling issues
const safeUseState = (initialValue) => {
  try {
    return useState(initialValue);
  } catch (error) {
    console.error('React useState error:', error);
    // Fallback for when React is not available
    let value = initialValue;
    const setValue = (newValue) => {
      value = typeof newValue === 'function' ? newValue(value) : newValue;
    };
    return [value, setValue];
  }
};

const safeUseEffect = (effect, deps) => {
  try {
    return useEffect(effect, deps);
  } catch (error) {
    console.error('React useEffect error:', error);
    // Fallback - just run the effect immediately
    effect();
  }
};

const safeUseCallback = (callback, deps) => {
  try {
    return useCallback(callback, deps);
  } catch (error) {
    console.error('React useCallback error:', error);
    // Fallback - just return the callback
    return callback;
  }
};

const safeUseRef = (initialValue) => {
  try {
    return useRef(initialValue);
  } catch (error) {
    console.error('React useRef error:', error);
    // Fallback - simple object with current property
    return { current: initialValue };
  }
};

export function useDesktopScanSocket(sessionToken, wsUrl) {
  const [connected, setConnected] = safeUseState(false);
  const [mobileConnected, setMobileConnected] = safeUseState(false);
  const [status, setStatus] = safeUseState('pending');
  const [progress, setProgress] = safeUseState(null);
  const [verdict, setVerdict] = safeUseState(null);
  const [anglesCovered, setAnglesCovered] = safeUseState({ ...DEFAULT_ANGLES });
  const [coveragePercent, setCoveragePercent] = safeUseState(0);
  const [currentAngle, setCurrentAngle] = safeUseState('front');
  const [recentThumbnails, setRecentThumbnails] = safeUseState([]);
  const [scanError, setScanError] = safeUseState(null);

  const socketRef = safeUseRef(null);

  const updateAngles = safeUseCallback((covered, percent, angle) => {
    setAnglesCovered(covered);
    setCoveragePercent(percent);
    setCurrentAngle(angle);
  }, []);

  const updateProgress = safeUseCallback((update) => {
    // Backend sends frame_index (0-based) and is_flagged; accumulate locally
    setProgress((prev) => {
      const framesProcessed = typeof update.frame_index === 'number'
        ? update.frame_index + 1
        : (prev?.frames_processed ?? 0);
      const flaggedFrames = update.is_flagged
        ? (prev?.flagged_frames ?? 0) + 1
        : (prev?.flagged_frames ?? 0);
      const runningDetections = update.detections
        ? update.detections.reduce((acc, d) => {
            acc[d.class_name] = (acc[d.class_name] ?? 0) + 1;
            return acc;
          }, { ...(prev?.running_detections ?? {}) })
        : (prev?.running_detections ?? {});
      return {
        ...update,
        frames_processed: framesProcessed,
        flagged_frames: flaggedFrames,
        running_detections: runningDetections,
      };
    });
    if (update.angles_covered) setAnglesCovered(update.angles_covered);
    if (typeof update.coverage_percent === 'number') setCoveragePercent(update.coverage_percent);
    // Backend sends thumbnail_b64 (full data URL from mobile captureFrame) on flagged frames
    if (update.thumbnail_b64) {
      setRecentThumbnails((prev) =>
        [update.thumbnail_b64, ...prev].slice(0, MAX_THUMBNAILS),
      );
    }
  }, []);

  const emitJoinSession = safeUseCallback(
    (socket) => {
      if (!sessionToken) return;
      socket.emit('join_scan_session', {
        session_token: sessionToken,
        role: 'desktop',
        device_info: {
          userAgent: navigator.userAgent,
          screen: `${window.screen.width}x${window.screen.height}`,
        },
      });
    },
    [sessionToken],
  );

  const requestStatus = safeUseCallback((socket) => {
    socket.emit('request_scan_status', {});
  }, []);

  const handleConnect = safeUseCallback(() => {
    setConnected(true);
    if (socketRef.current) {
      emitJoinSession(socketRef.current);
    }
  }, [emitJoinSession]);

  safeUseEffect(() => {
    if (!sessionToken) return;

    const socket = prescanSocketManager.connect(wsUrl || undefined);
    socketRef.current = socket;

    const onDisconnect = () => setConnected(false);

    const onSessionJoined = (data) => {
      console.log('[Desktop] Session joined:', data);
      requestStatus(socket);
    };

    const onMobileConnected = () => {
      setMobileConnected(true);
      setStatus('scanning');
    };

    const onMobileDisconnected = () => {
      setMobileConnected(false);
      requestStatus(socket);
    };

    const onScanProgressUpdate = (data) => {
      updateProgress(data);
    };

    const onAngleCoverageUpdate = (data) => {
      updateAngles(data.angles_covered, data.coverage_percent, data.current_angle);
    };

    const onVerdictIssued = (data) => {
      setVerdict(normalizeFinalVerdict(data));
    };

    const onScanError = (data) => {
      setScanError(data.error);
    };

    const onScanStatusResponse = (data) => {
      const mobileNow = Boolean(data.mobile_connected);
      setMobileConnected(mobileNow);

      if (data.session_status === 'scanning' || mobileNow) setStatus('scanning');
      if (data.session_status === 'pending') setStatus('pending');

      if (data.scan) {
        setProgress((prev) => ({
          ...(prev ?? {}),
          frames_processed: Number(data.scan.total_frames ?? prev?.frames_processed ?? 0),
          flagged_frames: Number(data.scan.flagged_frames ?? prev?.flagged_frames ?? 0),
          running_detections: prev?.running_detections ?? {},
        }));
      }

      const serverAngles = data.scan?.angles_covered ?? {};
      const normalizedAngles = {
        front: Boolean(serverAngles.front),
        right: Boolean(serverAngles.right),
        back: Boolean(serverAngles.back),
        left: Boolean(serverAngles.left),
      };
      const coveredCount = Object.values(normalizedAngles).filter(Boolean).length;
      const percent = Math.round((coveredCount / 4) * 100);
      const angle =
        ['front', 'right', 'back', 'left'].find((d) => !normalizedAngles[d]) ?? 'front';
      updateAngles(normalizedAngles, percent, angle);

      const finalVerdict = data.scan?.final_verdict;
      if (finalVerdict) {
        const missingAngles = ['front', 'right', 'back', 'left'].filter(
          (d) => !normalizedAngles[d],
        );
        setVerdict(
          normalizeFinalVerdict({
            verdict: finalVerdict,
            reason: data.scan?.verdict_reason || null,
            details: {
              total_frames: data.scan?.total_frames ?? 0,
              flagged_frames: data.scan?.flagged_frames ?? 0,
              missing_angles: missingAngles,
            },
          }),
        );
      } else if (['approved', 'rejected', 'incomplete'].includes(data.session_status)) {
        setStatus(data.session_status);
      }
    };

    if (socket.connected) handleConnect();

    socket.on('connect', handleConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('session_joined', onSessionJoined);
    socket.on('mobile_connected', onMobileConnected);
    socket.on('mobile_disconnected', onMobileDisconnected);
    socket.on('scan_progress_update', onScanProgressUpdate);
    socket.on('angle_coverage_update', onAngleCoverageUpdate);
    socket.on('verdict_issued', onVerdictIssued);
    socket.on('scan_status_response', onScanStatusResponse);
    socket.on('scan_error', onScanError);

    // Keep desktop status in sync even if a realtime event is missed.
    const statusPoll = setInterval(() => {
      if (socket.connected) {
        requestStatus(socket);
      }
    }, 3000);

    return () => {
      clearInterval(statusPoll);
      socket.off('connect', handleConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('session_joined', onSessionJoined);
      socket.off('mobile_connected', onMobileConnected);
      socket.off('mobile_disconnected', onMobileDisconnected);
      socket.off('scan_progress_update', onScanProgressUpdate);
      socket.off('angle_coverage_update', onAngleCoverageUpdate);
      socket.off('verdict_issued', onVerdictIssued);
      socket.off('scan_status_response', onScanStatusResponse);
      socket.off('scan_error', onScanError);
    };
  }, [sessionToken, wsUrl, handleConnect, updateProgress, updateAngles, requestStatus]);

  const resetForRetry = safeUseCallback(() => {
    setMobileConnected(false);
    setVerdict(null);
    setProgress(null);
    setAnglesCovered({ ...DEFAULT_ANGLES });
    setCoveragePercent(0);
    setCurrentAngle('front');
    setRecentThumbnails([]);
    setScanError(null);
    setStatus('pending');
  }, []);

  return {
    connected,
    mobileConnected,
    status,
    progress,
    verdict,
    anglesCovered,
    coveragePercent,
    currentAngle,
    recentThumbnails,
    scanError,
    resetForRetry,
  };
}
