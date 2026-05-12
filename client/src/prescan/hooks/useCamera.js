import { useRef, useState, useCallback } from 'react';

export function useCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [streamReady, setStreamReady] = useState(false);
  const [error, setError] = useState(null);

  const isSecureCameraContext = useCallback(() => {
    if (typeof window === 'undefined') return true;
    return (
      window.isSecureContext ||
      ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
    );
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setStreamReady(false);

    if (!isSecureCameraContext()) {
      const msg = 'Camera requires HTTPS on mobile. Open the HTTPS link, not a local http:// IP.';
      setError(msg);
      return msg;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = 'Camera not available. Open this page via an HTTPS link — camera requires a secure connection.';
      setError(msg);
      return msg;
    }

    const waitForVideoElement = async () => {
      let waited = 0;
      while (!videoRef.current && waited < 3000) {
        await new Promise((r) => setTimeout(r, 50));
        waited += 50;
      }
      return videoRef.current;
    };

    const attachStream = async (stream) => {
      streamRef.current = stream;
      const video = await waitForVideoElement();
      if (!video) throw new Error('VIDEO_ELEMENT_NOT_READY');

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('muted', 'true');
      await video.play().catch(() => {});

      const hasFrames = await new Promise((resolve) => {
        const deadline = Date.now() + 8000;
        const check = () => {
          if (video.videoWidth > 0) { resolve(true); return; }
          if (Date.now() >= deadline) { resolve(false); return; }
          requestAnimationFrame(check);
        };
        check();
      });

      if (!hasFrames) throw new Error('CAMERA_NO_FRAMES');
      setStreamReady(true);
    };

    const attempts = [
      { video: { facingMode: { exact: 'environment' } }, audio: false },
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: { facingMode: 'environment' }, audio: false },
      { video: true, audio: false },
    ];

    let lastError = null;

    for (const constraints of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        await attachStream(stream);
        return null;
      } catch (err) {
        lastError = err;
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        if (err instanceof Error) {
          if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
            const msg = 'Camera permission denied. Please allow camera access in browser settings and reload.';
            setError(msg);
            return msg;
          }
          if (err.name === 'NotFoundError') {
            const msg = 'No camera detected on this device.';
            setError(msg);
            return msg;
          }
          if (err.name === 'NotReadableError') {
            const msg = 'Camera is busy in another app. Close other camera apps and try again.';
            setError(msg);
            return msg;
          }
          if (err.message === 'VIDEO_ELEMENT_NOT_READY') {
            const msg = 'Camera preview failed to initialize. Please try again.';
            setError(msg);
            return msg;
          }
          if (err.message === 'CAMERA_NO_FRAMES') {
            const msg = 'Camera opened but no frames arrived. Try reloading the page.';
            setError(msg);
            return msg;
          }
        }
      }
    }

    const msg =
      lastError instanceof Error && lastError.name
        ? `Could not access camera (${lastError.name}). Please check browser permissions.`
        : 'Could not access camera. Please check your browser permissions.';
    setError(msg);
    return msg;
  }, [isSecureCameraContext]);

  const captureFrame = useCallback(
    (width = 320, height = 180) => {
      if (!streamReady || !videoRef.current) return null;
      const video = videoRef.current;
      if (video.videoWidth === 0) return null;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, width, height);
      return canvas.toDataURL('image/jpeg', 0.7);
    },
    [streamReady],
  );

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setStreamReady(false);
  }, []);

  return { videoRef, streamReady, error, startCamera, stopCamera, captureFrame };
}
