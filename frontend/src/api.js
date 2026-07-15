let onUnauthorized = null;

export function setOnUnauthorized(handler) {
  onUnauthorized = handler;
}

function getToken() {
  return localStorage.getItem('token');
}

export async function api(url, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const method = (options.method || 'GET').toUpperCase();
  if (!headers['Content-Type'] && !(options.body instanceof FormData) && method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401 || res.status === 403) {
    if (onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, 'Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error || `Request failed with status ${res.status}`);
  }

  return res;
}

export async function apiJson(url, options = {}) {
  const res = await api(url, options);
  return res.json();
}

export async function apiGet(url) {
  return apiJson(url);
}

export async function apiPost(url, data) {
  return apiJson(url, { method: 'POST', body: JSON.stringify(data) });
}

export async function apiPut(url, data) {
  return apiJson(url, { method: 'PUT', body: JSON.stringify(data) });
}

export async function apiDelete(url) {
  return apiJson(url, { method: 'DELETE' });
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
