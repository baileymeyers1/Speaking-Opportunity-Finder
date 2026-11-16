import { describe, expect, it } from 'vitest';
import { serializeRequestForLog, serializeResponseForLog } from './requestLogSerializers.js';

describe('serializeRequestForLog', () => {
  const cronRequest = {
    id: 16,
    method: 'GET',
    url: '/api/cron/enrichment',
    headers: {
      authorization: 'Bearer cron-secret',
      cookie: 'token=user-jwt',
      'x-vercel-oidc-token': 'oidc-token',
      'x-vercel-proxy-signature': 'Bearer proxy-signature',
      'x-api-key': 'some-key',
      'user-agent': 'vercel-cron/1.0',
      'x-vercel-id': 'iad1::abc',
      'x-vercel-cron-schedule': '*/5 * * * *',
    },
  };

  it('keeps the method, url, id and allow-listed headers', () => {
    expect(serializeRequestForLog(cronRequest)).toEqual({
      id: 16,
      method: 'GET',
      url: '/api/cron/enrichment',
      headers: {
        'user-agent': 'vercel-cron/1.0',
        'x-vercel-id': 'iad1::abc',
        'x-vercel-cron-schedule': '*/5 * * * *',
      },
    });
  });

  it('never writes credentials, whatever header carries them', () => {
    const logged = JSON.stringify(serializeRequestForLog(cronRequest));
    for (const secret of ['cron-secret', 'user-jwt', 'oidc-token', 'proxy-signature', 'some-key']) {
      expect(logged).not.toContain(secret);
    }
  });

  it('copes with a request that has no headers', () => {
    expect(serializeRequestForLog({ method: 'GET', url: '/' })).toEqual({
      id: undefined,
      method: 'GET',
      url: '/',
      headers: {},
    });
  });
});

describe('serializeResponseForLog', () => {
  it('logs the status code without headers such as set-cookie', () => {
    const response = { statusCode: 200, headers: { 'set-cookie': 'token=user-jwt' } };
    expect(serializeResponseForLog(response)).toEqual({ statusCode: 200 });
  });
});
