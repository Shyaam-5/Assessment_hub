function normalizeSocketBase(rawUrl) {
  const value = (rawUrl || '').trim();
  if (!value) return null;

  try {
    const base =
      typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:8000';
    const url = new URL(value, base);

    let pathname = url.pathname.replace(/\/+$/, '');
    if (pathname.toLowerCase().endsWith('/api')) {
      pathname = pathname.slice(0, -4);
    }

    if (!pathname || pathname === '/') {
      return url.origin;
    }

    return `${url.origin}${pathname}`;
  } catch {
    return null;
  }
}

// When the page is served over HTTPS (e.g. Render), upgrade http:// → https://
// so the browser doesn't block mixed-content WebSocket connections to EC2.
function upgradeProtocol(url) {
  if (
    url &&
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    url.startsWith('http://')
  ) {
    return url.replace(/^http:\/\//, 'https://');
  }
  return url;
}

export function resolveSocketBase(preferredUrl) {
  const envBase = normalizeSocketBase(import.meta.env.VITE_API_URL || '');
  const preferredBase = normalizeSocketBase(preferredUrl);

  // In production (Render → EC2), frontend and backend are on different hosts.
  // Never fall back to window.location.origin — that is the Render URL, not the backend.
  // VITE_API_URL must be set at build time. Only fall back to window origin in local dev
  // where the Vite proxy forwards /api and /socket.io to localhost:8000.
  const isDev =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const windowBase =
    isDev && typeof window !== 'undefined'
      ? normalizeSocketBase(window.location.origin)
      : null;

  if (!envBase && !preferredBase && !isDev) {
    console.warn('[prescan] VITE_API_URL is not set. WebSocket will not connect to the EC2 backend.');
  }

  return upgradeProtocol(preferredBase || envBase || windowBase || 'http://localhost:8000');
}

