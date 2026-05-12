import { useEffect, useRef, useState, useCallback } from 'react';
import { prescanSocketManager } from '../services/prescanSocketManager';
import { normalizeFinalVerdict } from '../utils/normalizeVerdict';

export function useScanSocket(sessionToken, _roomScanId, wsUrl) {
  const [connected, setConnected] = useState(false);
  const [socketRoomScanId, setSocketRoomScanId] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [timeoutWarning, setTimeoutWarning] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!sessionToken) return;

    const socket = prescanSocketManager.connect(wsUrl || undefined);
    socketRef.current = socket;

    const onConnect = () => {
      setConnected(true);
      socket.emit('join_scan_session', {
        session_token: sessionToken,
        role: 'mobile',
        device_info: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
        },
      });
    };

    const onDisconnect = () => setConnected(false);

    const onSessionJoined = (data) => {
      if (data.room_scan_id) setSocketRoomScanId(data.room_scan_id);
    };

    const onFrameAck = (data) => {
      console.debug('[Mobile] Frame ack:', data.frame_index);
    };

    const onVerdictIssued = (data) => {
      setVerdict(normalizeFinalVerdict(data));
    };

    const onScanError = (data) => {
      setScanError(data.error);
    };

    const onTimeoutWarning = (data) => {
      setTimeoutWarning(data.seconds_remaining);
    };

    if (socket.connected) onConnect();

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('session_joined', onSessionJoined);
    socket.on('frame_ack', onFrameAck);
    socket.on('verdict_issued', onVerdictIssued);
    socket.on('scan_error', onScanError);
    socket.on('scan_timeout_warning', onTimeoutWarning);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('session_joined', onSessionJoined);
      socket.off('frame_ack', onFrameAck);
      socket.off('verdict_issued', onVerdictIssued);
      socket.off('scan_error', onScanError);
      socket.off('scan_timeout_warning', onTimeoutWarning);
    };
  }, [sessionToken, wsUrl]);

  const emitFrameResult = useCallback((payload) => {
    socketRef.current?.emit('frame_result', payload);
  }, []);

  const emitAngleUpdate = useCallback((payload) => {
    socketRef.current?.emit('angle_update', payload);
  }, []);

  const emitScanComplete = useCallback((payload) => {
    socketRef.current?.emit('scan_complete', payload);
  }, []);

  const requestScanStatus = useCallback((id) => {
    socketRef.current?.emit('request_scan_status', { room_scan_id: id });
  }, []);

  return {
    connected,
    socketRoomScanId,
    verdict,
    scanError,
    timeoutWarning,
    emitFrameResult,
    emitAngleUpdate,
    emitScanComplete,
    requestScanStatus,
  };
}
