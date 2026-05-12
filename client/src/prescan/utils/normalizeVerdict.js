const VALID_VERDICTS = ['approved', 'rejected', 'incomplete'];

const DEFAULT_REASONS = {
  approved: 'Room scan approved.',
  rejected: 'Room scan rejected.',
  incomplete: 'Room scan incomplete.',
};

function isValidVerdict(value) {
  return typeof value === 'string' && VALID_VERDICTS.includes(value);
}

function toSafeNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

function toSafeDuration(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  return undefined;
}

function toSafeMissingAngles(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((a) => typeof a === 'string' && a.trim().length > 0);
}

export function normalizeFinalVerdict(payload, detailsFallback) {
  const verdict = isValidVerdict(payload.verdict) ? payload.verdict : 'incomplete';
  const mergedDetails = { ...(detailsFallback ?? {}), ...(payload.details ?? {}) };

  const totalFrames = Math.max(0, toSafeNumber(mergedDetails.total_frames, 0));
  const flaggedFrames = Math.max(0, toSafeNumber(mergedDetails.flagged_frames, 0));
  const durationS = toSafeDuration(mergedDetails.duration_s);
  const missingAngles = toSafeMissingAngles(mergedDetails.missing_angles);

  const reasonText =
    typeof payload.reason === 'string' && payload.reason.trim().length > 0
      ? payload.reason.trim()
      : DEFAULT_REASONS[verdict];

  return {
    verdict,
    reason: reasonText,
    details: {
      total_frames: totalFrames,
      flagged_frames: flaggedFrames,
      missing_angles: missingAngles,
      ...(durationS !== undefined ? { duration_s: durationS } : {}),
    },
  };
}
