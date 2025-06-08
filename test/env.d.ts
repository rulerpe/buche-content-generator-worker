declare module 'cloudflare:test' {
	// Controls the type of `import("cloudflare:test").env`
	interface ProvidedEnv extends Env {
		// Example binding from `wrangler.jsonc`
		// CONTENT_BUCKET: R2Bucket;
		// CONTENT_DB: D1Database;
		// AI: Ai;
	}
}