/**
 * ContentGeneratorDO - Durable Object for streaming content generation
 * Handles long-running AI content generation with WebSocket streaming
 */

import { DurableObject } from "cloudflare:workers";

export interface Env {
	CONTENT_BUCKET: R2Bucket;
	CONTENT_DB: D1Database;
	AI: Ai;
	OPENROUTER_API_KEY: string;
}

interface ContentGenerationRequest {
	content: string;
	tags?: string[];
	maxLength?: number;
	style?: 'continue' | 'expand' | 'variation';
	characterLimit?: number;
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

interface RelatedSnippetWithContent {
	id: string;
	title: string;
	author: string;
	tags: string[];
	content?: string;
	tagNames?: string[];
	relevanceScore?: number;
}

export class ContentGeneratorDO extends DurableObject {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		
		if (url.pathname === '/websocket') {
			return this.handleWebSocket(request);
		}
		
		if (url.pathname === '/sse') {
			return this.handleSSE(request);
		}
		
		return new Response('ContentGeneratorDO - Use /websocket or /sse endpoint', { status: 400 });
	}

	async handleWebSocket(request: Request): Promise<Response> {
		const upgradeHeader = request.headers.get('Upgrade');
		if (!upgradeHeader || upgradeHeader !== 'websocket') {
			return new Response('Upgrade: websocket required', { status: 426 });
		}

		const [client, server] = Object.values(new WebSocketPair());
		this.ctx.acceptWebSocket(server);

		return new Response(null, {
			status: 101,
			webSocket: client
		});
	}

	async handleSSE(request: Request): Promise<Response> {
		if (request.method !== 'POST') {
			return new Response('POST method required', { status: 405 });
		}

		try {
			const body = await request.text();
			const requestData = JSON.parse(body) as ContentGenerationRequest;

			// Create a ReadableStream for SSE
			const { readable, writable } = new TransformStream();
			const writer = writable.getWriter();
			const encoder = new TextEncoder();

			// Start the generation process
			this.generateContentSSE(writer, encoder, requestData);

			return new Response(readable, {
				headers: {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					'Connection': 'keep-alive',
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Headers': 'Cache-Control'
				}
			});

		} catch (error) {
			console.error('SSE handler error:', error);
			return new Response(JSON.stringify({
				error: error instanceof Error ? error.message : String(error)
			}), {
				status: 500,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*'
				}
			});
		}
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		try {
			const messageText = typeof message === 'string' ? message : new TextDecoder().decode(message);
			const request = JSON.parse(messageText) as ContentGenerationRequest;
			
			// Send initial acknowledgment
			this.sendMessage(ws, {
				type: 'status',
				message: 'Starting content generation...'
			});

			await this.generateContentStream(ws, request);

		} catch (error) {
			console.error('WebSocket message error:', error);
			this.sendMessage(ws, {
				type: 'error',
				message: error instanceof Error ? error.message : String(error)
			});
		}
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
		console.log('WebSocket closed:', code, reason, wasClean);
	}

	private sendMessage(ws: WebSocket, data: any): void {
		try {
			ws.send(JSON.stringify(data));
		} catch (error) {
			console.error('Error sending WebSocket message:', error);
		}
	}

	private async generateContentSSE(
		writer: WritableStreamDefaultWriter<Uint8Array>,
		encoder: TextEncoder,
		request: ContentGenerationRequest
	): Promise<void> {
		const env = this.env as Env;
		
		try {
			// Helper function to send SSE event
			const sendSSEEvent = async (type: string, data: any) => {
				const message = `data: ${JSON.stringify({ type, ...data })}\n\n`;
				await writer.write(encoder.encode(message));
			};

			// Step 1: Extract characters
			await sendSSEEvent('status', { message: 'Extracting characters from content...' });

			const extractedCharacters = await this.extractCharacters(request.content, env.OPENROUTER_API_KEY);
			
			await sendSSEEvent('progress', {
				step: 'characters',
				data: extractedCharacters
			});

			// Step 2: Summarize content
			await sendSSEEvent('status', { message: 'Creating content summary...' });

			const contentSummary = await this.summarizeContent(request.content, env.OPENROUTER_API_KEY);
			
			await sendSSEEvent('progress', {
				step: 'summary',
				data: contentSummary
			});

			// Step 3: Analyze for tags
			await sendSSEEvent('status', { message: 'Analyzing content for relevant tags...' });

			const detectedTags = await this.analyzeContentForTags(request.content, env.OPENROUTER_API_KEY);
			const allTags = [...(request.tags || []), ...detectedTags];
			const uniqueTags = [...new Set(allTags)];

			await sendSSEEvent('progress', {
				step: 'tags',
				data: uniqueTags
			});

			// Step 4: Find related snippets
			await sendSSEEvent('status', { message: 'Finding related content snippets...' });

			const relatedSnippets = await this.findRelatedSnippetsWithDedup(uniqueTags, env, 2);
			
			await sendSSEEvent('progress', {
				step: 'snippets',
				data: relatedSnippets.map(snippet => ({
					id: snippet.id,
					title: snippet.title,
					author: snippet.author,
					tags: snippet.tagNames || [],
					relevanceScore: snippet.relevanceScore || 0
				}))
			});

			// Step 5: Generate content with streaming
			await sendSSEEvent('status', { message: 'Generating new content...' });

			const generatedContent = await this.generateContentWithSSEStreaming(
				sendSSEEvent,
				extractedCharacters,
				contentSummary,
				relatedSnippets,
				uniqueTags,
				env.OPENROUTER_API_KEY,
				request.maxLength || 800
			);

			// Send final result
			await sendSSEEvent('complete', {
				data: {
					success: true,
					generatedContent,
					extractedCharacters,
					contentSummary,
					detectedTags,
					relatedSnippets: relatedSnippets.map(snippet => ({
						id: snippet.id,
						title: snippet.title,
						author: snippet.author,
						tags: snippet.tagNames || [],
						relevanceScore: snippet.relevanceScore || 0
					}))
				}
			});

		} catch (error) {
			console.error('Generation SSE error:', error);
			const errorMessage = `data: ${JSON.stringify({
				type: 'error',
				message: error instanceof Error ? error.message : String(error)
			})}\n\n`;
			await writer.write(encoder.encode(errorMessage));
		} finally {
			await writer.close();
		}
	}

	private async generateContentStream(ws: WebSocket, request: ContentGenerationRequest): Promise<void> {
		const env = this.env as Env;
		
		try {
			// Step 1: Extract characters
			this.sendMessage(ws, {
				type: 'status',
				message: 'Extracting characters from content...'
			});

			const extractedCharacters = await this.extractCharacters(request.content, env.OPENROUTER_API_KEY);
			
			this.sendMessage(ws, {
				type: 'progress',
				step: 'characters',
				data: extractedCharacters
			});

			// Step 2: Summarize content
			this.sendMessage(ws, {
				type: 'status',
				message: 'Creating content summary...'
			});

			const contentSummary = await this.summarizeContent(request.content, env.OPENROUTER_API_KEY);
			
			this.sendMessage(ws, {
				type: 'progress',
				step: 'summary',
				data: contentSummary
			});

			// Step 3: Analyze for tags
			this.sendMessage(ws, {
				type: 'status',
				message: 'Analyzing content for relevant tags...'
			});

			const detectedTags = await this.analyzeContentForTags(request.content, env.OPENROUTER_API_KEY);
			const allTags = [...(request.tags || []), ...detectedTags];
			const uniqueTags = [...new Set(allTags)];

			this.sendMessage(ws, {
				type: 'progress',
				step: 'tags',
				data: uniqueTags
			});

			// Step 4: Find related snippets
			this.sendMessage(ws, {
				type: 'status',
				message: 'Finding related content snippets...'
			});

			const relatedSnippets = await this.findRelatedSnippetsWithDedup(uniqueTags, env, 2);
			
			this.sendMessage(ws, {
				type: 'progress',
				step: 'snippets',
				data: relatedSnippets.map(snippet => ({
					id: snippet.id,
					title: snippet.title,
					author: snippet.author,
					tags: snippet.tagNames || [],
					relevanceScore: snippet.relevanceScore || 0
				}))
			});

			// Step 5: Generate content with streaming
			this.sendMessage(ws, {
				type: 'status',
				message: 'Generating new content...'
			});

			const generatedContent = await this.generateContentWithStreaming(
				ws,
				extractedCharacters,
				contentSummary,
				relatedSnippets,
				uniqueTags,
				env.OPENROUTER_API_KEY,
				request.maxLength || 800
			);

			// Send final result
			this.sendMessage(ws, {
				type: 'complete',
				data: {
					success: true,
					generatedContent,
					extractedCharacters,
					contentSummary,
					detectedTags,
					relatedSnippets: relatedSnippets.map(snippet => ({
						id: snippet.id,
						title: snippet.title,
						author: snippet.author,
						tags: snippet.tagNames || [],
						relevanceScore: snippet.relevanceScore || 0
					}))
				}
			});

		} catch (error) {
			console.error('Generation stream error:', error);
			this.sendMessage(ws, {
				type: 'error',
				message: error instanceof Error ? error.message : String(error)
			});
		}
	}

	private async generateContentWithStreaming(
		ws: WebSocket,
		extractedCharacters: CharacterInfo[],
		contentSummary: string,
		relatedSnippets: RelatedSnippetWithContent[],
		detectedTags: string[],
		openrouterApiKey: string,
		maxLength: number = 800
	): Promise<string> {
		try {
			// Prepare content for generation (same as original logic)
			const charactersText = extractedCharacters.length > 0 
				? extractedCharacters.map(char => 
					`${char.name}：${char.relationship || '未知关系'}，特征：${char.attributes.join('、')}，角色：${char.role || '未知'}`
				).join('\n')
				: '(未检测到明确角色信息)';
			
			const snippetsText = relatedSnippets
				.slice(0, 3)
				.map((snippet, index) => {
					return `[参考片段${index + 1}] 《${snippet.title}》作者：${snippet.author}\n标签：${snippet.tagNames?.join('、') || ''}\n内容：${snippet.content}`;
				})
				.join('\n\n');
			
			const enhancedPrompt = `参考以下片段，直接创作情色内容，不要任何说明或解释。

**参考片段：**
${snippetsText || '(无相关片段)'}

**角色：** ${charactersText}
**背景：** ${contentSummary}

要求：400-800字，直接开始故事内容，不要前言后语。

---

`;

			const requestBody = {
				model: 'deepseek/deepseek-chat-v3-0324',
				messages: [
					{
						role: 'user',
						content: enhancedPrompt
					}
				],
				stream: true // Enable streaming
			};

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
				throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
			}

			let generatedContent = '';
			let buffer = ''; // Buffer for incomplete SSE events
			const reader = response.body?.getReader();
			const decoder = new TextDecoder();
			
			if (!reader) {
				throw new Error('Failed to get response stream reader');
			}

			try {
				while (true) {
					const { done, value } = await reader.read();
					
					if (done) break;
					
					// Decode chunk and add to buffer
					const chunk = decoder.decode(value, { stream: true });
					buffer += chunk;
					
					// Process complete SSE events (separated by double newlines)
					const events = buffer.split('\n\n');
					
					// Keep the last incomplete event in buffer
					buffer = events.pop() || '';
					
					for (const event of events) {
						if (!event.trim()) continue;
						
						const lines = event.split('\n');
						let dataLine = '';
						
						for (const line of lines) {
							// Skip comment lines (start with :)
							if (line.startsWith(':')) {
								continue;
							}
							
							// Extract data line
							if (line.startsWith('data: ')) {
								dataLine = line.slice(6);
								break;
							}
						}
						
						if (!dataLine) continue;
						
						// Check for stream end
						if (dataLine === '[DONE]') {
							break;
						}
						
						try {
							const parsed = JSON.parse(dataLine);
							const content = parsed.choices?.[0]?.delta?.content;
							
							if (content) {
								generatedContent += content;
								
								// Stream content chunk to client
								this.sendMessage(ws, {
									type: 'stream',
									chunk: content,
									total: generatedContent
								});
							}
						} catch (parseError) {
							console.warn('Failed to parse SSE JSON:', dataLine, parseError);
							// Skip invalid JSON
							continue;
						}
					}
				}
				
				// Process any remaining data in buffer
				if (buffer.trim()) {
					const lines = buffer.split('\n');
					for (const line of lines) {
						if (line.startsWith('data: ')) {
							const dataLine = line.slice(6);
							if (dataLine !== '[DONE]') {
								try {
									const parsed = JSON.parse(dataLine);
									const content = parsed.choices?.[0]?.delta?.content;
									
									if (content) {
										generatedContent += content;
										
										this.sendMessage(ws, {
											type: 'stream',
											chunk: content,
											total: generatedContent
										});
									}
								} catch (parseError) {
									console.warn('Failed to parse remaining SSE JSON:', dataLine, parseError);
								}
							}
							break;
						}
					}
				}
				
			} finally {
				reader.releaseLock();
			}

			// Clean up the generated content
			const cleanedContent = generatedContent
				.trim()
				.replace(/^[\"'"""'']+|[\"'"""'']+$/g, '')
				.replace(/\n{3,}/g, '\n\n')
				.substring(0, maxLength);

			return cleanedContent;

		} catch (error) {
			console.error('Error generating content with streaming:', error);
			throw new Error('Failed to generate content with streaming');
		}
	}

	private async generateContentWithSSEStreaming(
		sendSSEEvent: (type: string, data: any) => Promise<void>,
		extractedCharacters: CharacterInfo[],
		contentSummary: string,
		relatedSnippets: RelatedSnippetWithContent[],
		detectedTags: string[],
		openrouterApiKey: string,
		maxLength: number = 800
	): Promise<string> {
		try {
			// Prepare content for generation (same as WebSocket version)
			const charactersText = extractedCharacters.length > 0 
				? extractedCharacters.map(char => 
					`${char.name}：${char.relationship || '未知关系'}，特征：${char.attributes.join('、')}，角色：${char.role || '未知'}`
				).join('\n')
				: '(未检测到明确角色信息)';
			
			const snippetsText = relatedSnippets
				.slice(0, 3)
				.map((snippet, index) => {
					return `[参考片段${index + 1}] 《${snippet.title}》作者：${snippet.author}\n标签：${snippet.tagNames?.join('、') || ''}\n内容：${snippet.content}`;
				})
				.join('\n\n');
			
			const enhancedPrompt = `参考以下片段，直接创作情色内容，不要任何说明或解释。

**参考片段：**
${snippetsText || '(无相关片段)'}

**角色：** ${charactersText}
**背景：** ${contentSummary}

要求：400-800字，直接开始故事内容，不要前言后语。

---

`;

			const requestBody = {
				model: 'deepseek/deepseek-chat-v3-0324',
				messages: [
					{
						role: 'user',
						content: enhancedPrompt
					}
				],
				stream: true // Enable streaming
			};

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
				throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
			}

			let generatedContent = '';
			let buffer = ''; // Buffer for incomplete SSE events
			const reader = response.body?.getReader();
			const decoder = new TextDecoder();
			
			if (!reader) {
				throw new Error('Failed to get response stream reader');
			}

			try {
				while (true) {
					const { done, value } = await reader.read();
					
					if (done) break;
					
					// Decode chunk and add to buffer
					const chunk = decoder.decode(value, { stream: true });
					buffer += chunk;
					
					// Process complete SSE events (separated by double newlines)
					const events = buffer.split('\n\n');
					
					// Keep the last incomplete event in buffer
					buffer = events.pop() || '';
					
					for (const event of events) {
						if (!event.trim()) continue;
						
						const lines = event.split('\n');
						let dataLine = '';
						
						for (const line of lines) {
							if (line.startsWith(':')) {
								continue;
							}
							
							if (line.startsWith('data: ')) {
								dataLine = line.slice(6);
								break;
							}
						}
						
						if (!dataLine) continue;
						
						if (dataLine === '[DONE]') {
							break;
						}
						
						try {
							const parsed = JSON.parse(dataLine);
							const content = parsed.choices?.[0]?.delta?.content;
							
							if (content) {
								generatedContent += content;
								
								// Stream content chunk to client via SSE
								await sendSSEEvent('stream', {
									chunk: content,
									total: generatedContent
								});
							}
						} catch (parseError) {
							console.warn('Failed to parse SSE JSON:', dataLine, parseError);
							continue;
						}
					}
				}
				
				// Process any remaining data in buffer
				if (buffer.trim()) {
					const lines = buffer.split('\n');
					for (const line of lines) {
						if (line.startsWith('data: ')) {
							const dataLine = line.slice(6);
							if (dataLine !== '[DONE]') {
								try {
									const parsed = JSON.parse(dataLine);
									const content = parsed.choices?.[0]?.delta?.content;
									
									if (content) {
										generatedContent += content;
										
										await sendSSEEvent('stream', {
											chunk: content,
											total: generatedContent
										});
									}
								} catch (parseError) {
									console.warn('Failed to parse remaining SSE JSON:', dataLine, parseError);
								}
							}
							break;
						}
					}
				}
				
			} finally {
				reader.releaseLock();
			}

			// Clean up the generated content
			const cleanedContent = generatedContent
				.trim()
				.replace(/^[\"'"""'']+|[\"'"""'']+$/g, '')
				.replace(/\n{3,}/g, '\n\n')
				.substring(0, maxLength);

			return cleanedContent;

		} catch (error) {
			console.error('Error generating content with SSE streaming:', error);
			throw new Error('Failed to generate content with SSE streaming');
		}
	}

	// Copy all the existing helper methods from index.ts
	private async extractCharacters(content: string, openrouterApiKey: string): Promise<CharacterInfo[]> {
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
			
			try {
				const jsonMatch = result.match(/\[[\s\S]*\]/);
				if (jsonMatch) {
					const characters = JSON.parse(jsonMatch[0]) as CharacterInfo[];
					return Array.isArray(characters) ? characters.slice(0, 5) : [];
				} else {
					const characters = JSON.parse(result) as CharacterInfo[];
					return Array.isArray(characters) ? characters.slice(0, 5) : [];
				}
			} catch (parseError) {
				console.warn('Failed to parse character JSON, attempting manual extraction');
				return this.extractCharactersManually(result);
			}
			
		} catch (error) {
			console.error('Error extracting characters:', error);
			return [];
		}
	}

	private extractCharactersManually(text: string): CharacterInfo[] {
		const characters: CharacterInfo[] = [];
		const lines = text.split('\n').filter(line => line.trim().length > 0);
		
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
		
		return characters.slice(0, 3);
	}

	private async summarizeContent(content: string, openrouterApiKey: string): Promise<string> {
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
			
			const cleanedSummary = result
				.trim()
				.replace(/^[\"'"""'']+|[\"'"""'']+$/g, '')
				.replace(/\n{3,}/g, '\n\n')
				.substring(0, 300);
			
			return cleanedSummary;
			
		} catch (error) {
			console.error('Error summarizing content:', error);
			return '';
		}
	}

	private async analyzeContentForTags(content: string, openrouterApiKey: string): Promise<string[]> {
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
			
			const rawTags = result
				.split('\n')
				.map((line: string) => line.trim())
				.filter((line: string) => line.length > 0 && !line.includes(':'))
				.slice(0, 6);
			
			const cleanedTags = rawTags
				.map((tag: string) => this.cleanTag(tag))
				.filter((tag: string) => tag.length > 0 && tag.length <= 4)
				.filter((tag: string) => this.isValidChineseTag(tag));
			
			return cleanedTags;
		} catch (error) {
			console.error('Error analyzing content for tags:', error);
			return [];
		}
	}

	private cleanTag(tag: string): string {
		return tag
			.replace(/[\s\u00A0\u3000]/g, '')
			.replace(/[^\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\u2ceb0-\u2ebef\u30000-\u3134f\u4e00-\u9fff\u3400-\u4dbf0-9]/g, '')
			.trim();
	}

	private isValidChineseTag(tag: string): boolean {
		const chineseRegex = /[\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\u2ceb0-\u2ebef\u30000-\u3134f]/;
		return tag.length > 0 && tag.length <= 4 && chineseRegex.test(tag);
	}

	private async findRelatedSnippetsWithDedup(tags: string[], env: Env, snippetsPerTag: number = 2): Promise<RelatedSnippetWithContent[]> {
		if (tags.length === 0) {
			return [];
		}
		
		try {
			const tagPlaceholders = tags.map(() => '?').join(',');
			const tagQuery = `SELECT id, name FROM tags WHERE name IN (${tagPlaceholders})`;
			const tagResults = await env.CONTENT_DB.prepare(tagQuery).bind(...tags).all();
			
			const foundTags = tagResults.results as unknown as Tag[];
			if (foundTags.length === 0) {
				return [];
			}

			const allSnippets: RelatedSnippetWithContent[] = [];
			const seenSnippetIds = new Set<string>();
			
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
					.bind(tag.id, snippetsPerTag * 2)
					.all();
				
				for (const snippet of snippetResults.results as any[]) {
					if (seenSnippetIds.has(snippet.id)) {
						continue;
					}
					
					const tagSnippetCount = allSnippets.filter(s => 
						s.tagNames && s.tagNames.includes(tag.name)
					).length;
					if (tagSnippetCount >= snippetsPerTag) {
						continue;
					}
					
					try {
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
								relevanceScore: 1.0
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
}