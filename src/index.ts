/**
 * Buche Content Generator Worker - Generates relevant erotic content based on input text and tags
 * 
 * Features:
 * - Accepts text content and tags in request body
 * - Finds relevant tagged content from database
 * - Generates new content maintaining characters and context
 * - Returns generated content that builds on the input
 */

export interface Env {
	CONTENT_BUCKET: R2Bucket;
	CONTENT_DB: D1Database;
	AI: Ai;
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
	error?: string;
}

interface RelatedSnippet {
	id: string;
	title: string;
	author: string;
	tags: string[];
	relevanceScore: number;
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
		
		if (url.pathname === '/status') {
			return handleStatus(env);
		}
		
		return new Response('Buche Content Generator Worker\n\nEndpoints:\n- POST /generate - Generate content based on input\n- GET /status - Check worker status');
	},
} satisfies ExportedHandler<Env>;

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
		
		// Analyze input content to detect relevant tags
		const detectedTags = await analyzeContentForTags(body.content, env.AI);
		
		// Combine detected tags with provided tags
		const allTags = [...(body.tags || []), ...detectedTags];
		const uniqueTags = [...new Set(allTags)];
		
		// Find related snippets based on tags
		const relatedSnippets = await findRelatedSnippets(uniqueTags, env, 5);
		
		// Generate new content
		const generatedContent = await generateContent(
			body.content,
			relatedSnippets,
			uniqueTags,
			env.AI,
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
			detectedTags
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

async function analyzeContentForTags(content: string, ai: Ai): Promise<string[]> {
	try {
		const truncatedContent = content.length > 1500 ? content.substring(0, 1500) + '...' : content;
		
		const prompt = `分析这段内容，提取3-6个最相关的中文标签（每个2-4个字），用于描述内容的主题、场景、情感和风格特点。

内容：${truncatedContent}

只返回标签名称，每行一个，不需要解释。`;
		
		const response = await ai.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
			messages: [
				{
					role: 'user',
					content: prompt
				}
			],
			max_tokens: 100
		}) as any;
		
		const result = response.response as string;
		
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