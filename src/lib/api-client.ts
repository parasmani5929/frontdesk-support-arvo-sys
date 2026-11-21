export async function safeJsonFetch<T = any>(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      const text = await res.text();
      return {
        ok: false,
        status: res.status,
        error: `Server returned non-JSON response (${res.status}): ${text.slice(0, 100)}`,
      };
    }

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, status: res.status, error: data.error || `Request failed (${res.status})` };
    }

    return { ok: true, status: res.status, data };
  } catch (err: any) {
    return { ok: false, status: 0, error: err.message || 'Network error' };
  }
}
