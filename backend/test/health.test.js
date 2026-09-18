// backend/test/health.test.js
const request = require('supertest');
const app = require('../src/server');

test('GET /api/health responde ok', async () => {
  const res = await request(app).get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });
});
