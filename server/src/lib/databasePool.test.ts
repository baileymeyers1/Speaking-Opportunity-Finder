import { describe, it, expect } from 'vitest';
import { databasePoolConfig } from './databasePool.js';

describe('databasePoolConfig', () => {
  it('leaves a local database on plaintext', () => {
    expect(databasePoolConfig('postgresql://postgres:postgres@localhost:5433/speaking_finder')).toEqual({
      connectionString: 'postgresql://postgres:postgres@localhost:5433/speaking_finder',
    });
    expect(databasePoolConfig('postgresql://postgres@127.0.0.1/x').ssl).toBeUndefined();
    expect(databasePoolConfig('postgresql://postgres@db/x').ssl).toBeUndefined();
  });

  it('turns verified TLS on for a remote host', () => {
    const url = 'postgresql://user:secret@dpg-abc.oregon-postgres.render.com/speaking_opportunities';
    expect(databasePoolConfig(url)).toEqual({ connectionString: url, ssl: true });
  });

  it('passes an unparseable or missing URL through for pg to reject', () => {
    expect(databasePoolConfig(undefined)).toEqual({ connectionString: undefined });
    expect(databasePoolConfig('not a url')).toEqual({ connectionString: 'not a url' });
  });

  it('sets the search path when given a schema (the demo)', () => {
    expect(databasePoolConfig('postgresql://u:p@ep-x.neon.tech/db?sslmode=require', { schema: 'speaking_demo' })).toMatchObject({
      ssl: true,
      options: '-c search_path=speaking_demo',
    });
    expect(databasePoolConfig('postgresql://localhost/db', { schema: 'speaking_demo' }).options).toBe('-c search_path=speaking_demo');
    expect(databasePoolConfig('postgresql://localhost/db').options).toBeUndefined();
  });
});
