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
		
		
		if (url.pathname === '/generate-stream') {
			return handleStreamingGeneration(request, env);
		}
		
		if (url.pathname === '/status') {
			return handleStatus(env);
		}
		
		return new Response('Buche Content Generator Worker\n\nEndpoints:\n- POST /generate - Generate content based on input\n- GET /generate-stream - Stream content generation via WebSocket\n- GET /status - Check worker status');
	},
} satisfies ExportedHandler<Env>;

// Export the Durable Object class
export { ContentGeneratorDO };

async function handleStreamingGeneration(request: Request, env: Env): Promise<Response> {
	const upgradeHeader = request.headers.get('Upgrade');
	if (!upgradeHeader || upgradeHeader !== 'websocket') {
		return new Response('Upgrade: websocket required', { status: 426 });
	}

	// Create a unique ID for this generation session
	const sessionId = crypto.randomUUID();
	const durableObjectId = env.CONTENT_GENERATOR_DO.idFromName(sessionId);
	const durableObjectStub = env.CONTENT_GENERATOR_DO.get(durableObjectId);

	// Forward the WebSocket request to the Durable Object
	const newUrl = new URL(request.url);
	newUrl.pathname = '/websocket';
	
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




