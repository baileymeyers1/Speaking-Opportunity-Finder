import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, ApiError, onUnauthorized } from './client';

function mockResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('apiClient unauthorized handling', () => {
  let listener: ReturnType<typeof vi.fn<() => void>>;
  let unsubscribe: () => void;

  beforeEach(() => {
    listener = vi.fn<() => void>();
    unsubscribe = onUnauthorized(listener);
  });

  afterEach(() => {
    unsubscribe();
    vi.restoreAllMocks();
  });

  it('dispatches the unauthorized event when a protected endpoint answers 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      mockResponse(401, { success: false, error: 'Authentication required' })
    );

    await expect(apiClient.get('/admin/analytics/sources')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Authentication required',
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not treat a 401 from /auth/* as a lost session', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      mockResponse(401, { success: false, error: 'Invalid credentials' })
    );

    await expect(apiClient.post('/auth/login', { email: 'a@b.c', password: 'x' })).rejects.toBeInstanceOf(ApiError);
    await expect(apiClient.get('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(listener).not.toHaveBeenCalled();
  });

  it('stays quiet on other failures and on success', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockImplementationOnce(() => mockResponse(403, { success: false, error: 'Admin access required' }));
    await expect(apiClient.get('/admin/analytics/sources')).rejects.toMatchObject({ status: 403 });

    fetchSpy.mockImplementationOnce(() => mockResponse(200, { success: true, data: { ok: true } }));
    await expect(apiClient.get('/admin/analytics/sources')).resolves.toMatchObject({ data: { ok: true } });

    expect(listener).not.toHaveBeenCalled();
  });
});
