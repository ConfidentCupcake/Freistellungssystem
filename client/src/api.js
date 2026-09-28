/*
 * Thin wrapper around fetch for the JSON API. Every call sends the session
 * cookie and turns a non-2xx response into a thrown Error carrying the
 * server's message, so callers can just try/catch.
 */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function api(path, options = {}) {
  const { body, method = body ? 'POST' : 'GET', ...rest } = options;

  const response = await fetch('/api' + path, {
    ...rest,
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json', ...rest.headers } : rest.headers,
    body: body ? JSON.stringify(body) : undefined
  });

  // A 304 or an empty body is not JSON; fall back to an empty payload.
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      payload.error?.message || 'Die Anfrage ist fehlgeschlagen.',
      response.status
    );
  }

  return payload;
}
