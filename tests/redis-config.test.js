import test from 'node:test';
import assert from 'node:assert/strict';
import { redisConfig, redis } from '../lib/store.js';
import handler from '../lib/sync-core.js';

test('Vercel KV credentials enable sign-in and are used by Redis requests', async () => {
  const saved = { ...process.env }, originalFetch = global.fetch;
  try {
    for (const key of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) delete process.env[key];
    process.env.KV_REST_API_READ_ONLY_TOKEN = 'read-only';
    assert.equal(redisConfig(), null);
    process.env.KV_REST_API_URL = 'https://kv.test';
    assert.equal(redisConfig(), null);
    process.env.KV_REST_API_TOKEN = 'write-token';
    process.env.APP_URL = 'https://runninggem.test';
    process.env.SESSION_SECRET = 'ab'.repeat(32);
    let response;
    await handler({ url: '/api/sync?route=status', method: 'GET', headers: {} }, {
      writeHead(code) { assert.equal(code, 200); },
      end(body) { response = JSON.parse(body); },
    });
    assert.equal(response.configured, true);
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://kv.test');
      assert.equal(options.headers.Authorization, 'Bearer write-token');
      assert.deepEqual(JSON.parse(options.body), ['SET', 'nonce', 'test']);
      return { ok: true, json: async () => ({ result: 'OK' }) };
    };
    assert.equal(await redis('SET', 'nonce', 'test'), 'OK');
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.test';
    assert.equal(redisConfig().url, 'https://kv.test'); // Never mix providers' pairs.
    process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-token';
    assert.deepEqual(redisConfig(), { url: 'https://upstash.test', token: 'upstash-token' });
  } finally {
    global.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
