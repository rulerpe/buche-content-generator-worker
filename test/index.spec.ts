import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Buche Content Generator Worker', () => {
	it('responds with worker info (unit style)', async () => {
		const request = new IncomingRequest('http://example.com');
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		const text = await response.text();
		expect(text).toContain('Buche Content Generator Worker');
		expect(text).toContain('/generate');
		expect(text).toContain('/status');
	});

	it('responds with worker info (integration style)', async () => {
		const response = await SELF.fetch('https://example.com');
		const text = await response.text();
		expect(text).toContain('Buche Content Generator Worker');
	});

	it('requires POST method for /generate endpoint', async () => {
		const request = new IncomingRequest('http://example.com/generate', {
			method: 'GET'
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(405);
	});

	it('requires content in request body for /generate', async () => {
		const request = new IncomingRequest('http://example.com/generate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
		const result = await response.json();
		expect(result.success).toBe(false);
		expect(result.error).toContain('Content is required');
	});
});