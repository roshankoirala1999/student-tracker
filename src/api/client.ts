import { ApiResponse } from '../types/index.ts';

// Helper to get CSRF token from document.cookie
function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)csrf_token=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

let cachedCsrfToken: string | null = null;

export function setMemoryCsrfToken(token: string) {
  cachedCsrfToken = token;
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Include CSRF token for mutating requests
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrf = getCsrfTokenFromCookie() || cachedCsrfToken;
    if (csrf) {
      headers.set('X-CSRF-Token', csrf);
    }
  }

  // Always include credentials so httpOnly cookies are transmitted
  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Handle file download (CSV or Excel)
  const contentType = res.headers.get('Content-Type') || '';
  if (contentType.includes('text/csv') || contentType.includes('spreadsheetml') || contentType.includes('octet-stream')) {
    const blob = await res.blob();
    return {
      success: true,
      data: blob as unknown as T,
    };
  }

  let json: any = {};
  try {
    json = await res.json();
  } catch (err) {
    json = { success: false, message: `Server returned HTTP ${res.status}` };
  }

  if (json.csrfToken) {
    cachedCsrfToken = json.csrfToken;
  }

  if (!res.ok) {
    if (res.status === 401 && !path.includes('/api/auth/me') && !path.includes('/api/auth/login')) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:unauthorized', { detail: json }));
      }
    }
    return {
      success: false,
      error: json.error || `HTTP_${res.status}`,
      message: json.message || `Request failed with status ${res.status}`,
      data: json.data,
    };
  }

  return json;
}
