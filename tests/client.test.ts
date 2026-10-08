import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from '../src/api/client.ts';
test('network failures resolve into recoverable API errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('offline'); });
  const result = await apiRequest('/api/classes');
  assert.equal(result.success, false); assert.equal(result.error, 'NETWORK_ERROR');
});
test('import validation errors reach the form', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({success:false,message:'Invalid rows',errors:['Row 2: duplicate roll number']}), {status:400,headers:{'Content-Type':'application/json'}}));
  const result=await apiRequest('/api/import'); assert.deepEqual(result.errors,['Row 2: duplicate roll number']);
});
test('failed CSV downloads are not treated as successful files', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Unavailable', {status:503,headers:{'Content-Type':'text/csv'}}));
  assert.equal((await apiRequest('/api/export')).success,false);
});
