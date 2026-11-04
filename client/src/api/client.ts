import type { ApiResponse } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  get isRateLimit(): boolean {
    return this.status === 429 || this.message.toLowerCase().includes('too many');
  }
}

/**
 * Fired on `window` when any request outside `/auth/*` answers 401. The session
 * cookie was checked once on mount, so a later logout in another tab, a cookie
 * swap or an expiry would otherwise leave the app believing it is signed in and
 * showing raw "Authentication required" errors. `AuthProvider` listens and
 * clears the user, which sends protected pages back to the login screen.
 */
export const UNAUTHORIZED_EVENT = 'api:unauthorized';

export function onUnauthorized(listener: () => void): () => void {
  window.addEventListener(UNAUTHORIZED_EVENT, listener);
  return () => window.removeEventListener(UNAUTHORIZED_EVENT, listener);
}

function isAuthEndpoint(endpoint: string): boolean {
  return endpoint.startsWith('/auth/');
}

export function isRateLimitError(error: unknown): boolean {
  if (error instanceof ApiError) return error.isRateLimit;
  return error instanceof Error && error.message.toLowerCase().includes('too many');
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers,
    });

    const responseData = await response.json();

    if (!response.ok) {
      // A 401 from /auth/* is the normal "not signed in" or "wrong password" answer;
      // anywhere else it means the session the app believes in is gone.
      if (response.status === 401 && !isAuthEndpoint(endpoint)) {
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      }
      throw new ApiError(responseData.error || 'An error occurred', response.status);
    }

    // Unwrap the data from the API response structure { success: true, data: T }
    // Return in the expected ApiResponse<T> format
    return {
      success: responseData.success,
      data: responseData.data,
      error: responseData.error,
    };
  }

  async get<T>(endpoint: string, options: { signal?: AbortSignal } = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET', signal: options.signal });
  }

  async post<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async put<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async patch<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
