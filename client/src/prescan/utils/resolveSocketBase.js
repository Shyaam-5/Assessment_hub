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

export function resolveSocketBase(preferredUrl) {
  const envBase = normalizeSocketBase(import.meta.env.VITE_API_URL || '');
  const preferredBase = normalizeSocketBase(preferredUrl);
  const windowBase =
    typeof window !== 'undefined' ? normalizeSocketBase(window.location.origin) : null;

  return preferredBase || envBase || windowBase || 'http://localhost:8000';
}

