import { useEffect } from 'react';

export default function EnvironmentScanGate({ onApproved }) {
  useEffect(() => {
    onApproved?.();
  }, [onApproved]);

  return null;
}
