import { useState, useEffect, useCallback, useRef } from 'react';

export function useDeviceOrientation() {
  const [orientation, setOrientation] = useState({ alpha: 0, beta: 0, gamma: 0 });
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionNeeded, setPermissionNeeded] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const orientationRef = useRef({ alpha: 0, beta: 0, gamma: 0 });
  const hasAbsoluteRef = useRef(false);

  const isSupported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  const isSecureCtx = typeof window === 'undefined' ? true : window.isSecureContext;

  const handleOrientation = useCallback((event) => {
    const hasWebkitHeading =
      typeof event.webkitCompassHeading === 'number' &&
      Number.isFinite(event.webkitCompassHeading);

    const rawAlpha = hasWebkitHeading ? event.webkitCompassHeading ?? 0 : event.alpha;
    if (rawAlpha === null || !Number.isFinite(rawAlpha)) return;

    const isAbsoluteEvent =
      event.type === 'deviceorientationabsolute' ||
      event.absolute === true ||
      hasWebkitHeading;

    if (isAbsoluteEvent) hasAbsoluteRef.current = true;
    if (!isAbsoluteEvent && hasAbsoluteRef.current) return;

    const normalizedAlpha = ((rawAlpha % 360) + 360) % 360;
    const next = { alpha: normalizedAlpha, beta: event.beta ?? 0, gamma: event.gamma ?? 0 };
    orientationRef.current = next;
    setOrientation(next);
  }, []);

  const detachListeners = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
    window.removeEventListener('deviceorientation', handleOrientation, true);
  }, [handleOrientation]);

  const attachListeners = useCallback(() => {
    if (typeof window === 'undefined') return;
    detachListeners();
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    }
    window.addEventListener('deviceorientation', handleOrientation, true);
  }, [detachListeners, handleOrientation]);

  const requestPermission = useCallback(async () => {
    if (!isSupported) return true;

    if (!isSecureCtx) {
      setPermissionGranted(false);
      setPermissionNeeded(false);
      setPermissionDenied(true);
      return false;
    }

    const DOE = window.DeviceOrientationEvent;

    if (typeof DOE?.requestPermission === 'function') {
      try {
        const result = await DOE.requestPermission();
        const granted = result === 'granted';
        setPermissionGranted(granted);
        setPermissionNeeded(!granted);
        setPermissionDenied(!granted);
        if (granted) attachListeners();
        return granted;
      } catch {
        setPermissionGranted(false);
        setPermissionNeeded(true);
        setPermissionDenied(true);
        return false;
      }
    }

    attachListeners();
    setPermissionGranted(true);
    setPermissionNeeded(false);
    setPermissionDenied(false);
    return true;
  }, [attachListeners, isSecureCtx, isSupported]);

  useEffect(() => {
    if (!isSupported) {
      setPermissionGranted(true);
      setPermissionNeeded(false);
      setPermissionDenied(false);
      return;
    }

    if (!isSecureCtx) {
      setPermissionGranted(false);
      setPermissionNeeded(false);
      setPermissionDenied(true);
      return;
    }

    const DOE = window.DeviceOrientationEvent;

    if (typeof DOE?.requestPermission === 'function') {
      setPermissionNeeded(true);
      return;
    }

    attachListeners();
    setPermissionGranted(true);
    setPermissionNeeded(false);
    setPermissionDenied(false);

    return () => detachListeners();
  }, [attachListeners, detachListeners, isSecureCtx, isSupported]);

  useEffect(() => () => detachListeners(), [detachListeners]);

  const getOrientation = useCallback(() => orientationRef.current, []);

  return {
    orientation,
    getOrientation,
    permissionGranted,
    permissionNeeded,
    permissionDenied,
    requestPermission,
    isSupported,
    isSecureContext: isSecureCtx,
  };
}
