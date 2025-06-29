/**
 * Buche Content Generator Worker - Generates relevant erotic content based on input text and tags
 * 
 * Features:
 * - Accepts text content and tags in request body
 * - Finds relevant tagged content from database
 * - Generates new content maintaining characters and context
 * - Returns generated content that builds on the input
 * - Supports streaming generation via WebSocket + Durable Objects
 */

import { ContentGeneratorDO } from './content-generator-do';

export interface Env {
	CONTENT_BUCKET: R2Bucket;
	CONTENT_DB: D1Database;
	OPENROUTER_API_KEY: string;
	CONTENT_GENERATOR_DO: DurableObjectNamespace;
}

interface ContentGenerationRequest {
	content: string; // Input text content
	tags?: string[]; // Optional input tags
	maxLength?: number; // Maximum length of generated content
	style?: 'continue' | 'expand' | 'variation'; // Generation style
	characterLimit?: number; // Limit for characters to maintain
}

interface ContentGenerationResponse {
	success: boolean;
	generatedContent?: string;
	relatedSnippets?: RelatedSnippet[];
	detectedTags?: string[];
	extractedCharacters?: CharacterInfo[];
	contentSummary?: string;
	error?: string;
}

interface RelatedSnippet {
	id: string;
	title: string;
	author: string;
	tags: string[];
	relevanceScore: number;
}

interface CharacterInfo {
	name: string;
	relationship?: string;
	attributes: string[];
	role?: string;
}

interface Tag {
	id: number;
	name: string;
	usageCount: number;
}

interface Snippet {
	id: string;
	title: string;
	author: string;
	chapterIndex: number;
	sourceUrl: string;
	createdAt: string;
	tags?: string; // JSON array of tag IDs
}


// Note: RPC entrypoint removed - using traditional service binding for WebSocket support

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		
		// Handle CORS preflight requests
		if (request.method === 'OPTIONS') {
			return handleCORS(request);
		}
		
		if (url.pathname === '/generate-stream') {
			return handleStreamingGeneration(request, env);
		}
		
		if (url.pathname === '/generate-stream-sse') {
			return handleSSEGeneration(request, env);
		}
		
		if (url.pathname === '/status') {
			return handleStatus(env);
		}
		
		return new Response('Buche Content Generator Worker\n\nEndpoints:\n- POST /generate - Generate content based on input\n- GET /generate-stream - Stream content generation via WebSocket\n- GET /status - Check worker status');
	},
} satisfies ExportedHandler<Env>;

// Export the Durable Object class
export { ContentGeneratorDO };

// CORS handler for preflight requests
function handleCORS(request: Request): Response {
	const corsHeaders = {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version, Sec-WebSocket-Protocol',
		'Access-Control-Max-Age': '86400'
	};
	
	return new Response(null, {
		status: 204,
		headers: corsHeaders
	});
}

async function handleStreamingGeneration(request: Request, env: Env): Promise<Response> {
	const upgradeHeader = request.headers.get('Upgrade');
	if (!upgradeHeader || upgradeHeader !== 'websocket') {
		return new Response('Upgrade: websocket required', { status: 426, headers: {
			'Access-Control-Allow-Origin': '*'
		} });
	}

	// Create a unique ID for this generation session
	const sessionId = crypto.randomUUID();
	const durableObjectId = env.CONTENT_GENERATOR_DO.idFromName(sessionId);
	const durableObjectStub = env.CONTENT_GENERATOR_DO.get(durableObjectId);

	// Forward the WebSocket request to the Durable Object with CORS headers
	const newUrl = new URL(request.url);
	newUrl.pathname = '/websocket';
	
	// Add CORS headers to the forwarded request
	const headers = new Headers(request.headers);
	headers.set('Access-Control-Allow-Origin', '*');
	
	const newRequest = new Request(newUrl.toString(), {
		method: request.method,
		headers: headers,
		body: request.body
	});

	const response = await durableObjectStub.fetch(newRequest);
	
	// Add CORS headers to the response if it's a WebSocket upgrade
	if (response.status === 101) {
		const newHeaders = new Headers(response.headers);
		newHeaders.set('Access-Control-Allow-Origin', '*');
		
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: newHeaders,
			webSocket: response.webSocket
		});
	}
	
	return response;
}

async function handleSSEGeneration(request: Request, env: Env): Promise<Response> {
	// Handle SSE (Server-Sent Events) streaming for better service binding compatibility
	if (request.method !== 'POST') {
		return new Response('POST method required', { status: 405 });
	}

	// Create a unique ID for this generation session
	const sessionId = crypto.randomUUID();
	const durableObjectId = env.CONTENT_GENERATOR_DO.idFromName(sessionId);
	const durableObjectStub = env.CONTENT_GENERATOR_DO.get(durableObjectId);

	// Forward the SSE request to the Durable Object
	const newUrl = new URL(request.url);
	newUrl.pathname = '/sse';
	
	const newRequest = new Request(newUrl.toString(), {
		method: request.method,
		headers: request.headers,
		body: request.body
	});

	return durableObjectStub.fetch(newRequest);
}

async function handleStatus(env: Env): Promise<Response> {
	try {
		const [snippetsResult, tagsResult] = await Promise.all([
			env.CONTENT_DB.prepare('SELECT COUNT(*) as count FROM snippets WHERE tags IS NOT NULL AND tags != "[]"').first(),
			env.CONTENT_DB.prepare('SELECT COUNT(*) as count FROM tags').first()
		]);
		
		const taggedSnippets = (snippetsResult?.count as number) || 0;
		const totalTags = (tagsResult?.count as number) || 0;
		
		return new Response(JSON.stringify({
			status: 'active',
			taggedSnippets,
			totalTags,
			capabilities: ['content_generation', 'tag_analysis', 'snippet_matching']
		}), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		return new Response(JSON.stringify({
			error: 'Database not initialized',
			status: 'inactive'
		}), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
}






interface RelatedSnippetWithContent extends RelatedSnippet {
	content?: string;
	tagNames?: string[];
}

// RPC handler removed - using traditional service binding approach




