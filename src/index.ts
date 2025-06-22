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
	AI: Ai;
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

const GENERATION_PROMPT = `你是一个专业的情色文学创作助手。根据提供的内容和相关片段，继续创作符合以下要求的内容：

**创作要求：**
1. **保持角色一致性** - 维持原文中的人物特征、性格和关系
2. **延续情节发展** - 自然地延续原文的故事情节和情感发展
3. **匹配写作风格** - 保持与原文相似的叙述风格、语言特点和文字风格
4. **深化情感描述** - 加强情感层面的描写，包括心理活动和感受
5. **适度的身体描写** - 包含恰当的身体接触和感官描述

**参考内容分析：**
- 从相关片段中提取适合的情节元素、场景设置和互动方式
- 学习相关内容的叙述技巧和情感表达方式
- 保持与参考内容类似的激情程度和表达风格

**输出要求：**
- 长度：300-800字
- 语言：流畅的中文
- 结构：完整的段落，有清晰的情节发展
- 内容：延续性强，与原文无缝衔接

**原始内容：**
{original_content}

**相关参考片段：**
{related_snippets}

**检测到的标签：**
{detected_tags}

请基于以上信息创作后续内容：`;

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		
		if (url.pathname === '/generate') {
			return handleContentGeneration(request, env);
		}
		
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

async function handleContentGeneration(request: Request, env: Env): Promise<Response> {
	if (request.method !== 'POST') {
		return new Response('Method not allowed', { status: 405 });
	}
	
	try {
		const body = await request.json() as ContentGenerationRequest;
		
		if (!body.content || body.content.trim().length === 0) {
			return new Response(JSON.stringify({
				success: false,
				error: 'Content is required in request body'
			}), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		
		// Step 1: Extract characters from input content
		const extractedCharacters = await extractCharacters(body.content, env.OPENROUTER_API_KEY);
		
		// Step 2: Create content summary
		const contentSummary = await summarizeContent(body.content, env.OPENROUTER_API_KEY);
		
		// Step 3: Analyze input content to detect relevant tags
		const detectedTags = await analyzeContentForTags(body.content, env.OPENROUTER_API_KEY);
		
		// Step 4: Combine detected tags with provided tags
		const allTags = [...(body.tags || []), ...detectedTags];
		const uniqueTags = [...new Set(allTags)];
		
		// Step 5: Find related snippets based on tags (1-2 per tag with deduplication)
		const relatedSnippets = await findRelatedSnippetsWithDedup(uniqueTags, env, 2);
		
		// Step 6: Generate new content using summary and context
		const generatedContent = await generateContentWithContext(
			extractedCharacters,
			contentSummary,
			relatedSnippets,
			uniqueTags,
			env.OPENROUTER_API_KEY,
			body.maxLength || 800
		);
		
		const response: ContentGenerationResponse = {
			success: true,
			generatedContent,
			relatedSnippets: relatedSnippets.map(snippet => ({
				id: snippet.id,
				title: snippet.title,
				author: snippet.author,
				tags: snippet.tagNames || [],
				relevanceScore: snippet.relevanceScore || 0
			})),
			detectedTags,
			extractedCharacters,
			contentSummary
		};
		
		return new Response(JSON.stringify(response), {
			headers: { 'Content-Type': 'application/json' }
		});
		
	} catch (error) {
		console.error('Content generation error:', error);
		return new Response(JSON.stringify({
			success: false,
			error: error instanceof Error ? error.message : String(error)
		}), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
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

async function extractCharacters(content: string, openrouterApiKey: string): Promise<CharacterInfo[]> {
	try {
		const truncatedContent = content.length > 1500 ? content.substring(0, 1500) + '...' : content;
		
		const prompt = `分析这段内容，提取其中的主要人物角色信息。对每个人物，提供以下信息：
- 姓名或称呼
- 与其他角色的关系（如：夫妻、恋人、朋友等）
- 外貌或性格特征（3-5个关键词）
- 在故事中的角色定位（如：主角、配角等）

内容：${truncatedContent}

请以JSON格式返回，格式如下：
[
  {
    "name": "角色名",
    "relationship": "关系描述",
    "attributes": ["特征1", "特征2", "特征3"],
    "role": "角色定位"
  }
]`;
		
		// Debug API key
		console.log('extractCharacters - API Key length:', openrouterApiKey?.length || 0);
		
		const requestBody = {
			model: 'mistralai/mistral-large-2411',
			messages: [
				{
					role: 'user',
					content: prompt
				}
			],
			max_tokens: 300
		};
		
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${openrouterApiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody)
		});
		
		if (!response.ok) {
			const errorText = await response.text();
			console.error('extractCharacters OpenRouter API error:', response.status, response.statusText, errorText);
			throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
		}
		
		const responseData = await response.json() as any;
		const result = responseData.choices[0].message.content;
		
		console.log('Character extraction raw result:', result);
		
		try {
			// Try to extract JSON from the response (handle cases where model includes extra text)
			const jsonMatch = result.match(/\[[\s\S]*\]/);
			if (jsonMatch) {
				const characters = JSON.parse(jsonMatch[0]) as CharacterInfo[];
				return Array.isArray(characters) ? characters.slice(0, 5) : []; // Limit to 5 characters max
			} else {
				// Try parsing the whole response as JSON
				const characters = JSON.parse(result) as CharacterInfo[];
				return Array.isArray(characters) ? characters.slice(0, 5) : [];
			}
		} catch (parseError) {
			// If JSON parsing fails, try to extract character info manually
			console.warn('Failed to parse character JSON, attempting manual extraction');
			console.log('Parse error:', parseError);
			return extractCharactersManually(result);
		}
		
	} catch (error) {
		console.error('Error extracting characters:', error);
		return [];
	}
}

function extractCharactersManually(text: string): CharacterInfo[] {
	const characters: CharacterInfo[] = [];
	const lines = text.split('\n').filter(line => line.trim().length > 0);
	
	// Simple pattern matching for character extraction
	for (const line of lines) {
		if (line.includes('name') || line.includes('姓名') || line.includes('角色')) {
			const nameMatch = line.match(/[：:]\s*([^\s，,。]+)/);
			if (nameMatch) {
				characters.push({
					name: nameMatch[1],
					attributes: [],
					relationship: '',
					role: ''
				});
			}
		}
	}
	
	return characters.slice(0, 3); // Limit to 3 characters
}

async function summarizeContent(content: string, openrouterApiKey: string): Promise<string> {
	try {
		const truncatedContent = content.length > 2000 ? content.substring(0, 2000) + '...' : content;
		
		const prompt = `请对以下内容进行总结，包含以下关键信息：
1. 主要场景和环境设定
2. 故事背景和时间点
3. 主要情节发展
4. 人物关系和互动
5. 情感氛围和基调
6. 叙述风格特点

要求：
- 总结长度控制在100-200字
- 保持客观描述
- 突出关键元素以便后续内容生成参考

内容：${truncatedContent}

请提供简洁的总结：`;
		
		const requestBody = {
			model: 'mistralai/mistral-large-2411',
			messages: [
				{
					role: 'user',
					content: prompt
				}
			],
			max_tokens: 250
		};
		
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${openrouterApiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody)
		});
		
		if (!response.ok) {
			const errorText = await response.text();
			console.error('summarizeContent OpenRouter API error:', response.status, response.statusText, errorText);
			throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
		}
		
		const responseData = await response.json() as any;
		const result = responseData.choices[0].message.content;
		
		// Clean up the summary
		const cleanedSummary = result
			.trim()
			.replace(/^[\"'"""'']+|[\"'"""'']+$/g, '') // Remove surrounding quotes
			.replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
			.substring(0, 300); // Ensure length limit
		
		return cleanedSummary;
		
	} catch (error) {
		console.error('Error summarizing content:', error);
		return '';
	}
}

async function analyzeContentForTags(content: string, openrouterApiKey: string): Promise<string[]> {
	try {
		const truncatedContent = content.length > 1500 ? content.substring(0, 1500) + '...' : content;
		
		const prompt = `分析这段内容，提取3-6个最相关的中文标签（每个2-4个字），用于描述内容的主题、场景、情感和风格特点。

内容：${truncatedContent}

只返回标签名称，每行一个，不需要解释。`;
		
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${openrouterApiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: 'mistralai/mistral-large-2411',
				messages: [
					{
						role: 'user',
						content: prompt
					}
				],
				max_tokens: 100
			})
		});
		
		if (!response.ok) {
			const errorText = await response.text();
			console.error('analyzeContentForTags OpenRouter API error:', response.status, response.statusText, errorText);
			throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
		}
		
		const responseData = await response.json() as any;
		const result = responseData.choices[0].message.content;
		
		// Parse the response to extract tag names
		const rawTags = result
			.split('\n')
			.map(line => line.trim())
			.filter(line => line.length > 0 && !line.includes(':'))
			.slice(0, 6);
		
		// Clean and filter tags
		const cleanedTags = rawTags
			.map(tag => cleanTag(tag))
			.filter(tag => tag.length > 0 && tag.length <= 4)
			.filter(tag => isValidChineseTag(tag));
		
		return cleanedTags;
	} catch (error) {
		console.error('Error analyzing content for tags:', error);
		return [];
	}
}

function cleanTag(tag: string): string {
	return tag
		.replace(/[\s\u00A0\u3000]/g, '') // Remove all types of spaces
		.replace(/[^\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\u2ceb0-\u2ebef\u30000-\u3134f\u4e00-\u9fff\u3400-\u4dbf0-9]/g, '') // Keep only Chinese characters and numbers
		.trim();
}

function isValidChineseTag(tag: string): boolean {
	const chineseRegex = /[\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\u2ceb0-\u2ebef\u30000-\u3134f]/;
	return tag.length > 0 && tag.length <= 4 && chineseRegex.test(tag);
}

interface RelatedSnippetWithContent extends RelatedSnippet {
	content?: string;
	tagNames?: string[];
}

async function findRelatedSnippetsWithDedup(tags: string[], env: Env, snippetsPerTag: number = 2): Promise<RelatedSnippetWithContent[]> {
	if (tags.length === 0) {
		return [];
	}
	
	try {
		// Find tag IDs for the given tag names
		const tagPlaceholders = tags.map(() => '?').join(',');
		const tagQuery = `SELECT id, name FROM tags WHERE name IN (${tagPlaceholders})`;
		const tagResults = await env.CONTENT_DB.prepare(tagQuery).bind(...tags).all();
		
		const foundTags = tagResults.results as unknown as Tag[];
		if (foundTags.length === 0) {
			return [];
		}

		const allSnippets: RelatedSnippetWithContent[] = [];
		const seenSnippetIds = new Set<string>();
		
		// For each tag, find random snippets
		for (const tag of foundTags) {
			const snippetQuery = `
				SELECT s.*, t.name as tag_name
				FROM snippets s
				JOIN snippet_tags st ON s.id = st.snippet_id
				JOIN tags t ON st.tag_id = t.id
				WHERE st.tag_id = ?
				ORDER BY RANDOM()
				LIMIT ?
			`;
			
			const snippetResults = await env.CONTENT_DB.prepare(snippetQuery)
				.bind(tag.id, snippetsPerTag * 2) // Get more than needed for deduplication
				.all();
			
			for (const snippet of snippetResults.results as any[]) {
				// Skip if already seen
				if (seenSnippetIds.has(snippet.id)) {
					continue;
				}
				
				// Skip if we have enough for this tag
				const tagSnippetCount = allSnippets.filter(s => 
					s.tagNames && s.tagNames.includes(tag.name)
				).length;
				if (tagSnippetCount >= snippetsPerTag) {
					continue;
				}
				
				try {
					// Get content from R2
					const r2Object = await env.CONTENT_BUCKET.get(snippet.id);
					if (r2Object) {
						const content = await r2Object.text();
						
						allSnippets.push({
							id: snippet.id,
							title: snippet.title,
							author: snippet.author,
							tags: [tag.name],
							content: content,
							tagNames: [tag.name],
							relevanceScore: 1.0 // Equal relevance for random selection
						});
						
						seenSnippetIds.add(snippet.id);
					}
				} catch (error) {
					console.error(`Error fetching content for snippet ${snippet.id}:`, error);
				}
			}
		}
		
		return allSnippets;
	} catch (error) {
		console.error('Error finding related snippets with dedup:', error);
		return [];
	}
}

async function findRelatedSnippets(tags: string[], env: Env, limit: number = 5): Promise<RelatedSnippetWithContent[]> {
	if (tags.length === 0) {
		return [];
	}
	
	try {
		// First, find tag IDs for the given tag names
		const tagPlaceholders = tags.map(() => '?').join(',');
		const tagQuery = `SELECT id, name FROM tags WHERE name IN (${tagPlaceholders})`;
		const tagResults = await env.CONTENT_DB.prepare(tagQuery).bind(...tags).all();
		
		const foundTags = tagResults.results as unknown as Tag[];
		if (foundTags.length === 0) {
			return [];
		}
		
		const tagIds = foundTags.map(tag => tag.id);
		const tagIdPlaceholders = tagIds.map(() => '?').join(',');
		
		// Find snippets that have any of these tags
		const snippetQuery = `
			SELECT s.*, 
				   COUNT(st.tag_id) as tag_matches,
				   GROUP_CONCAT(t.name) as tag_names
			FROM snippets s
			JOIN snippet_tags st ON s.id = st.snippet_id
			JOIN tags t ON st.tag_id = t.id
			WHERE st.tag_id IN (${tagIdPlaceholders})
			GROUP BY s.id
			ORDER BY tag_matches DESC, t.usage_count DESC
			LIMIT ?
		`;
		
		const snippetResults = await env.CONTENT_DB.prepare(snippetQuery)
			.bind(...tagIds, limit)
			.all();
		
		const relatedSnippets: RelatedSnippetWithContent[] = [];
		
		for (const snippet of snippetResults.results as any[]) {
			try {
				// Get content from R2
				const r2Object = await env.CONTENT_BUCKET.get(snippet.id);
				if (r2Object) {
					const content = await r2Object.text();
					
					// Calculate relevance score based on tag matches
					const tagMatches = snippet.tag_matches || 0;
					const relevanceScore = Math.min(tagMatches / tags.length, 1.0);
					
					relatedSnippets.push({
						id: snippet.id,
						title: snippet.title,
						author: snippet.author,
						tags: snippet.tag_names ? snippet.tag_names.split(',') : [],
						content: content,
						tagNames: snippet.tag_names ? snippet.tag_names.split(',') : [],
						relevanceScore: relevanceScore
					});
				}
			} catch (error) {
				console.error(`Error fetching content for snippet ${snippet.id}:`, error);
			}
		}
		
		return relatedSnippets;
	} catch (error) {
		console.error('Error finding related snippets:', error);
		return [];
	}
}

async function generateContentWithContext(
	extractedCharacters: CharacterInfo[],
	contentSummary: string,
	relatedSnippets: RelatedSnippetWithContent[],
	detectedTags: string[],
	openrouterApiKey: string,
	maxLength: number = 800
): Promise<string> {
	try {
		// Prepare character information
		const charactersText = extractedCharacters.length > 0 
			? extractedCharacters.map(char => 
				`${char.name}：${char.relationship || '未知关系'}，特征：${char.attributes.join('、')}，角色：${char.role || '未知'}`
			).join('\n')
			: '(未检测到明确角色信息)';
		
		// Prepare related snippets text (use full content)
		const snippetsText = relatedSnippets
			.slice(0, 3) // Use top 3 most relevant snippets
			.map((snippet, index) => {
				return `[参考片段${index + 1}] 《${snippet.title}》作者：${snippet.author}\n标签：${snippet.tagNames?.join('、') || ''}\n内容：${snippet.content}`;
			})
			.join('\n\n');
		
		const tagsText = detectedTags.join('、');
		
		const enhancedPrompt = `你是情色文学创作助手。参考以下性爱片段创作内容，忽略其他非性爱因素。

**性爱参考片段：**
${snippetsText || '(无相关片段)'}

**角色：** ${charactersText}
**背景：** ${contentSummary}

**任务：直接参考片段中的性爱内容进行创作**
- 使用片段中的性行为、身体描写、情色对话
- 简单过渡后重点写性爱场景
- 忽略非性爱的日常内容

**要求：**
- 400-800字
- 包含具体性爱行为和身体描写
- 参考片段的激情程度

请创作性爱内容：`;
		console.log('enhancedPrompt', enhancedPrompt);
		
		// Debug API key
		console.log('API Key length:', openrouterApiKey?.length || 0);
		console.log('API Key prefix:', openrouterApiKey?.substring(0, 10) || 'undefined');
		
		const requestBody = {
			model: 'deepseek/deepseek-chat-v3-0324',
			messages: [
				{
					role: 'user',
					content: enhancedPrompt
				}
			],
			// max_tokens: Math.min(maxLength * 2, 1500)
		};
		
		console.log('OpenRouter request:', JSON.stringify(requestBody, null, 2));
		
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${openrouterApiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(requestBody)
		});
		
		if (!response.ok) {
			const errorText = await response.text();
			console.error('OpenRouter API error:', response.status, response.statusText, errorText);
			throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
		}
		
		const responseData = await response.json() as any;
		const generatedText = responseData.choices[0].message.content;
		
		// Clean up the generated content
		const cleanedContent = generatedText
			.trim()
			.replace(/^[\"'"""'']+|[\"'"""'']+$/g, '') // Remove surrounding quotes
			.replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
			.substring(0, maxLength); // Ensure length limit
		
		console.log('cleanedContent', cleanedContent);
		return cleanedContent;
		
	} catch (error) {
		console.error('Error generating content with context:', error);
		throw new Error('Failed to generate content with context');
	}
}

async function generateContent(
	originalContent: string,
	relatedSnippets: RelatedSnippetWithContent[],
	detectedTags: string[],
	ai: Ai,
	maxLength: number = 800
): Promise<string> {
	try {
		// Prepare related snippets text (limit to avoid token overflow)
		const snippetsText = relatedSnippets
			.slice(0, 3) // Use top 3 most relevant snippets
			.map((snippet, index) => {
				const content = snippet.content && snippet.content.length > 300 
					? snippet.content.substring(0, 300) + '...' 
					: snippet.content;
				return `[片段${index + 1}] 《${snippet.title}》作者：${snippet.author}\n${content}`;
			})
			.join('\n\n');
		
		const tagsText = detectedTags.join('、');
		
		const prompt = GENERATION_PROMPT
			.replace('{original_content}', originalContent)
			.replace('{related_snippets}', snippetsText || '(无相关片段)')
			.replace('{detected_tags}', tagsText || '(无检测到的标签)');
		
		const response = await ai.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
			messages: [
				{
					role: 'user',
					content: prompt
				}
			],
			max_tokens: Math.min(maxLength * 2, 1500) // Allow some buffer for Chinese tokens
		}) as any;
		
		const generatedText = response.response as string;
		
		// Clean up the generated content
		const cleanedContent = generatedText
			.trim()
			.replace(/^[\"'"""'']+|[\"'"""'']+$/g, '') // Remove surrounding quotes
			.replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
			.substring(0, maxLength); // Ensure length limit
		
		return cleanedContent;
		
	} catch (error) {
		console.error('Error generating content:', error);
		throw new Error('Failed to generate content');
	}
}