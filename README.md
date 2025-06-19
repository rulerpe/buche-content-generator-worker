# Buche Content Generator Worker

AI-powered content generation worker that creates relevant erotic content based on input text and related tagged content from the database. Integrates with the **queue-based tagging system** from buche-tag-worker.

## Features

- **Content Analysis**: Automatically analyzes input text to detect relevant tags
- **Smart Content Matching**: Finds related content from database based on tags
- **Character Consistency**: Maintains characters and context from input text
- **Style Preservation**: Generates content that matches the original writing style
- **Chinese Language Focus**: Optimized for Chinese erotic content generation

## API Endpoints

### POST /generate

Generates new content based on input text and optional tags.

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

## Usage Example

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
- Cloudflare D1 database with tagged content
- Cloudflare R2 bucket with content snippets  
- Cloudflare AI binding for content generation
- Existing content from buche-data-collect-worker
- **Tags from buche-tag-worker** (preferably processed via the new queue-based system)

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

# 4. Generate content once tagging is complete
curl -X POST https://buche-content-generator-worker.workers.dev/generate \
  -H "Content-Type: application/json" \
  -d '{"content": "你的输入文本..."}'
```

The queue-based system ensures that all content is properly tagged before content generation, providing better matching and more relevant results.