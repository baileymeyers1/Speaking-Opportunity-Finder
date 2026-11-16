/**
 * What the request logger may write about a request and its response.
 *
 * An allow-list, not a redact list: the default pino-http serializers log
 * every header, which put the cron's `Authorization: Bearer <CRON_SECRET>`,
 * Vercel's OIDC token and users' JWT cookie into the runtime logs. A new
 * sensitive header stays out of the logs without anyone remembering to add it.
 */

/** Headers that carry no credentials and help trace a request. */
const LOGGED_REQUEST_HEADERS = ['user-agent', 'x-vercel-id', 'x-vercel-cron-schedule'] as const;

/** The shape pino-std-serializers hands a custom request serializer. */
export interface SerializedRequestInput {
  id?: unknown;
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
}

export interface LoggedRequest {
  id?: unknown;
  method?: string;
  url?: string;
  headers: Partial<Record<(typeof LOGGED_REQUEST_HEADERS)[number], unknown>>;
}

export function serializeRequestForLog(request: SerializedRequestInput): LoggedRequest {
  const headers: LoggedRequest['headers'] = {};
  for (const name of LOGGED_REQUEST_HEADERS) {
    const value = request.headers?.[name];
    if (value !== undefined) headers[name] = value;
  }
  return { id: request.id, method: request.method, url: request.url, headers };
}

/** Response headers include `set-cookie` (the JWT on login); log the status only. */
export function serializeResponseForLog(response: { statusCode?: number }): { statusCode?: number } {
  return { statusCode: response.statusCode };
}
