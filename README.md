# Buche Content Generator Worker

AI-powered content generation worker with **WebSocket streaming support** that creates relevant erotic content based on input text and related tagged content from the database. Features real-time generation progress and handles long-running AI operations with Durable Objects.

## Features

### Core Generation
- **Content Analysis**: Automatically analyzes input text to detect relevant tags
- **Smart Content Matching**: Finds related content from database based on tags
- **Character Consistency**: Maintains characters and context from input text
- **Style Preservation**: Generates content that matches the original writing style
- **Chinese Language Focus**: Optimized for Chinese erotic content generation

### WebSocket Streaming (NEW)
- **Real-time Generation**: Stream content as it's generated with progress updates
- **Long-running Operations**: Handles 26+ second generation times with Durable Objects
- **Timeout Resolution**: Solves Cloudflare Workers 15-second timeout limitations
- **Live Progress**: See character extraction, summarization, tagging, and generation steps
- **Proper UTF-8 Handling**: Robust Chinese character streaming without corruption

### Technical Features
- **Durable Objects**: Hibernating objects for efficient long-running operations
- **OpenRouter Integration**: Advanced AI models (DeepSeek Chat v3, Mistral Large)
- **SSE Parsing**: Proper Server-Sent Events parsing with buffering and error handling
- **Backward Compatibility**: Traditional REST API still available alongside streaming

## API Endpoints

### WebSocket /generate-stream (NEW)

**Real-time streaming content generation via WebSocket connection.**

Connect to WebSocket endpoint and send generation request:

```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:8787/generate-stream');

// Send generation request
ws.onopen = () => {
  ws.send(JSON.stringify({
    "content": "你的输入文本内容...",
    "tags": ["标签1", "标签2"],
    "maxLength": 800
  }));
};

// Receive real-time updates
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'status':
      console.log('Progress:', data.message);
      break;
    case 'stream':
      console.log('Content chunk:', data.chunk);
      break;
    case 'complete':
      console.log('Final result:', data.data);
      break;
    case 'error':
      console.error('Error:', data.message);
      break;
  }
};
```

**Streaming Messages:**
- `status`: Progress updates ("Extracting characters...", "Generating content...")  
- `stream`: Real-time content chunks as they're generated
- `complete`: Final result with all metadata
- `error`: Error messages if generation fails

### POST /generate

**Traditional API endpoint for non-streaming generation.**

**Request Body:**
```json
{
  "content": "你的输入文本内容...",
  "tags": ["标签1", "标签2"],        // Optional: additional tags
  "maxLength": 800,                // Optional: max length (default: 800)
  "style": "continue"              // Optional: generation style
}
```

**Response:**
```json
{
  "success": true,
  "generatedContent": "生成的内容...",
  "relatedSnippets": [
    {
      "id": "snippet_id",
      "title": "标题",
      "author": "作者",
      "tags": ["标签"],
      "relevanceScore": 0.8
    }
  ],
  "detectedTags": ["检测到的标签"]
}
```

### GET /status

Returns worker status and database statistics.

**Response:**
```json
{
  "status": "active",
  "taggedSnippets": 1234,
  "totalTags": 567,
  "capabilities": ["content_generation", "tag_analysis", "snippet_matching"]
}
```

## Usage Examples

### WebSocket Streaming (Recommended)

```javascript
// Real-time streaming generation
const ws = new WebSocket('ws://localhost:8787/generate-stream');

ws.onopen = () => {
  ws.send(JSON.stringify({
    "content": "她轻抚着他的脸颊，眼中满含温柔...",
    "maxLength": 600
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(`[${data.type}]`, data.message || data.chunk);
};
```

### Traditional REST API

```bash
# Generate content based on input text
curl -X POST http://localhost:8787/generate \
  -H "Content-Type: application/json" \
  -d '{
    "content": "她轻抚着他的脸颊，眼中满含温柔...",
    "maxLength": 600
  }'

# Generate with specific tags
curl -X POST http://localhost:8787/generate \
  -H "Content-Type: application/json" \
  -d '{
    "content": "月光洒在窗台上，两人相拥而眠...",
    "tags": ["浪漫", "温柔"],
    "maxLength": 500
  }'
```

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm run test

# Deploy to Cloudflare worker
npm run deploy

# Generate TypeScript types
npm run cf-typegen
```

## Dependencies

This worker requires:
- **Cloudflare D1 database** with tagged content
- **Cloudflare R2 bucket** with content snippets  
- **OpenRouter API key** for advanced AI model access (DeepSeek, Mistral)
- **Durable Objects** binding for WebSocket streaming support
- Existing content from buche-data-collect-worker
- **Tags from buche-tag-worker** (preferably processed via the queue-based system)

### Configuration

Set up your OpenRouter API key:
```bash
# Set OpenRouter API key as secret
wrangler secret put OPENROUTER_API_KEY

# Or set in wrangler.jsonc for development
"vars": {
  "OPENROUTER_API_KEY": "your-openrouter-api-key"
}
```

## Integration with Queue-Based Tagging

This worker works best when content has been processed through the new **queue-based tagging system**:

1. **Data Collection**: Use `buche-data-collect-worker` to collect and automatically queue content
2. **Queue Processing**: Use `buche-tag-worker/tag-queue` to process all content with AI tags
3. **Content Generation**: Use this worker to generate content based on the tagged corpus

### Recommended Workflow

```bash
# 1. Collect content (auto-queues for tagging)
curl -X POST https://buche-data-collect-worker.workers.dev/collect -d '{"startPage": 1, "endPage": 10}'

# 2. Process all content with queue-based tagging
curl -X POST https://buche-tag-worker.workers.dev/tag-queue

# 3. Monitor tagging progress
curl https://buche-tag-worker.workers.dev/queue-status

# 4. Generate content with streaming (recommended)
# Connect WebSocket to: wss://buche-content-generator-worker.workers.dev/generate-stream

# Or use traditional API
curl -X POST https://buche-content-generator-worker.workers.dev/generate \
  -H "Content-Type: application/json" \
  -d '{"content": "你的输入文本..."}'
```

The queue-based system ensures that all content is properly tagged before content generation, providing better matching and more relevant results.

## Performance Notes

- **WebSocket Streaming**: Recommended for production use, handles long generation times gracefully
- **Traditional API**: May timeout on complex generations (15-second Cloudflare Workers limit)
- **Generation Time**: Typically 26+ seconds for full content generation with multiple AI calls
- **Durable Objects**: Automatically hibernate during AI API calls to minimize costs