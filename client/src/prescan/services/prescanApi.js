/** Same base resolution as App.jsx / StudentPortal: tunnel/backend URL wins, else Dev server origin (Vite /api proxy). */
function apiOrigin() {
  const fromEnv = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'http://localhost:8000';
}

function toErrorMessage(body, status) {
  const detail = body?.detail ?? body?.message ?? body?.error;
  if (typeof detail === 'string' && detail.trim()) return detail;

  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first === 'string' && first.trim()) return first;
    if (first && typeof first === 'object') {
      const msg = first.msg || first.message;
      const loc = Array.isArray(first.loc) ? first.loc.join('.') : '';
      if (typeof msg === 'string' && msg.trim()) {
        return loc ? `${loc}: ${msg}` : msg;
      }
    }
  }

  if (detail && typeof detail === 'object') {
    try {
      return JSON.stringify(detail);
    } catch {
      // fall through
    }
  }

  return `HTTP ${status}`;
}

async function request(path, options = {}) {
  const res = await fetch(`${apiOrigin()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...(options.headers || {}),
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(toErrorMessage(body, res.status));
  }
  return res.json();
}

export const prescanApi = {
  listExams: (userId) =>
    request(`/api/prescan/exams?userId=${encodeURIComponent(userId)}`),

  createSession: (userId, examId) =>
    request('/api/prescan/sessions', {
      method: 'POST',
      body: JSON.stringify({ userId, exam_id: examId }),
    }),

  listSessions: (userId) =>
    request(`/api/prescan/sessions?userId=${encodeURIComponent(userId)}`),

  getSession: (sessionId, userId) =>
    request(`/api/prescan/sessions/${sessionId}?userId=${encodeURIComponent(userId)}`),

  getScan: (scanId, userId) =>
    request(`/api/prescan/scans/${scanId}?userId=${encodeURIComponent(userId)}`),

  retryScan: (scanId, userId) =>
    request(`/api/prescan/scans/${scanId}/retry`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),

  listFrames: (scanId, userId, params = {}) => {
    const qs = new URLSearchParams({ userId, ...params }).toString();
    return request(`/api/prescan/scans/${scanId}/frames?${qs}`);
  },

  validateMobileLink: (token) =>
    request(`/api/prescan/mobile/${token}`),
};
