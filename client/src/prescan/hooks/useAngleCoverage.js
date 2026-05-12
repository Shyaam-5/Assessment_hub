import { useState, useRef, useCallback } from 'react';

const MIN_DWELL = 5;

const defaultCovered = { front: false, left: false, right: false, back: false };
const defaultDwell = { front: 0, left: 0, right: 0, back: 0 };

export function useAngleCoverage() {
  const [anglesCovered, setAnglesCovered] = useState({ ...defaultCovered });
  const [currentAngle, setCurrentAngle] = useState('front');
  const [coveragePercent, setCoveragePercent] = useState(0);

  const anglesCoveredRef = useRef({ ...defaultCovered });
  const currentAngleRef = useRef('front');
  const coveragePercentRef = useRef(0);
  const dwellCounts = useRef({ ...defaultDwell });

  const alphaToAngle = useCallback((alpha) => {
    const normalized = ((alpha % 360) + 360) % 360;
    if (normalized >= 315 || normalized < 45) return 'front';
    if (normalized >= 45 && normalized < 135) return 'right';
    if (normalized >= 135 && normalized < 225) return 'back';
    return 'left';
  }, []);

  const updateAngle = useCallback(
    (alpha) => {
      const angle = alphaToAngle(alpha);
      currentAngleRef.current = angle;
      setCurrentAngle(angle);

      dwellCounts.current[angle] = (dwellCounts.current[angle] ?? 0) + 1;

      if (dwellCounts.current[angle] >= MIN_DWELL && !anglesCoveredRef.current[angle]) {
        const newCovered = { ...anglesCoveredRef.current, [angle]: true };
        anglesCoveredRef.current = newCovered;
        setAnglesCovered(newCovered);

        const coveredCount = Object.values(newCovered).filter(Boolean).length;
        const percent = Math.round((coveredCount / 4) * 100);
        coveragePercentRef.current = percent;
        setCoveragePercent(percent);
      }
    },
    [alphaToAngle],
  );

  const getAnglesCovered = useCallback(() => anglesCoveredRef.current, []);
  const getCurrentAngle = useCallback(() => currentAngleRef.current, []);
  const getCoveragePercent = useCallback(() => coveragePercentRef.current, []);

  const reset = useCallback(() => {
    dwellCounts.current = { ...defaultDwell };
    anglesCoveredRef.current = { ...defaultCovered };
    currentAngleRef.current = 'front';
    coveragePercentRef.current = 0;
    setAnglesCovered({ ...defaultCovered });
    setCurrentAngle('front');
    setCoveragePercent(0);
  }, []);

  return {
    anglesCovered,
    currentAngle,
    coveragePercent,
    updateAngle,
    alphaToAngle,
    getAnglesCovered,
    getCurrentAngle,
    getCoveragePercent,
    reset,
  };
}
