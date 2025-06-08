var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-u5IjEb/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// src/index.ts
var GENERATION_PROMPT = `\u4F60\u662F\u4E00\u4E2A\u4E13\u4E1A\u7684\u60C5\u8272\u6587\u5B66\u521B\u4F5C\u52A9\u624B\u3002\u6839\u636E\u63D0\u4F9B\u7684\u5185\u5BB9\u548C\u76F8\u5173\u7247\u6BB5\uFF0C\u7EE7\u7EED\u521B\u4F5C\u7B26\u5408\u4EE5\u4E0B\u8981\u6C42\u7684\u5185\u5BB9\uFF1A

**\u521B\u4F5C\u8981\u6C42\uFF1A**
1. **\u4FDD\u6301\u89D2\u8272\u4E00\u81F4\u6027** - \u7EF4\u6301\u539F\u6587\u4E2D\u7684\u4EBA\u7269\u7279\u5F81\u3001\u6027\u683C\u548C\u5173\u7CFB
2. **\u5EF6\u7EED\u60C5\u8282\u53D1\u5C55** - \u81EA\u7136\u5730\u5EF6\u7EED\u539F\u6587\u7684\u6545\u4E8B\u60C5\u8282\u548C\u60C5\u611F\u53D1\u5C55
3. **\u5339\u914D\u5199\u4F5C\u98CE\u683C** - \u4FDD\u6301\u4E0E\u539F\u6587\u76F8\u4F3C\u7684\u53D9\u8FF0\u98CE\u683C\u3001\u8BED\u8A00\u7279\u70B9\u548C\u6587\u5B57\u98CE\u683C
4. **\u6DF1\u5316\u60C5\u611F\u63CF\u8FF0** - \u52A0\u5F3A\u60C5\u611F\u5C42\u9762\u7684\u63CF\u5199\uFF0C\u5305\u62EC\u5FC3\u7406\u6D3B\u52A8\u548C\u611F\u53D7
5. **\u9002\u5EA6\u7684\u8EAB\u4F53\u63CF\u5199** - \u5305\u542B\u6070\u5F53\u7684\u8EAB\u4F53\u63A5\u89E6\u548C\u611F\u5B98\u63CF\u8FF0

**\u53C2\u8003\u5185\u5BB9\u5206\u6790\uFF1A**
- \u4ECE\u76F8\u5173\u7247\u6BB5\u4E2D\u63D0\u53D6\u9002\u5408\u7684\u60C5\u8282\u5143\u7D20\u3001\u573A\u666F\u8BBE\u7F6E\u548C\u4E92\u52A8\u65B9\u5F0F
- \u5B66\u4E60\u76F8\u5173\u5185\u5BB9\u7684\u53D9\u8FF0\u6280\u5DE7\u548C\u60C5\u611F\u8868\u8FBE\u65B9\u5F0F
- \u4FDD\u6301\u4E0E\u53C2\u8003\u5185\u5BB9\u7C7B\u4F3C\u7684\u6FC0\u60C5\u7A0B\u5EA6\u548C\u8868\u8FBE\u98CE\u683C

**\u8F93\u51FA\u8981\u6C42\uFF1A**
- \u957F\u5EA6\uFF1A300-800\u5B57
- \u8BED\u8A00\uFF1A\u6D41\u7545\u7684\u4E2D\u6587
- \u7ED3\u6784\uFF1A\u5B8C\u6574\u7684\u6BB5\u843D\uFF0C\u6709\u6E05\u6670\u7684\u60C5\u8282\u53D1\u5C55
- \u5185\u5BB9\uFF1A\u5EF6\u7EED\u6027\u5F3A\uFF0C\u4E0E\u539F\u6587\u65E0\u7F1D\u8854\u63A5

**\u539F\u59CB\u5185\u5BB9\uFF1A**
{original_content}

**\u76F8\u5173\u53C2\u8003\u7247\u6BB5\uFF1A**
{related_snippets}

**\u68C0\u6D4B\u5230\u7684\u6807\u7B7E\uFF1A**
{detected_tags}

\u8BF7\u57FA\u4E8E\u4EE5\u4E0A\u4FE1\u606F\u521B\u4F5C\u540E\u7EED\u5185\u5BB9\uFF1A`;
var src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/generate") {
      return handleContentGeneration(request, env);
    }
    if (url.pathname === "/status") {
      return handleStatus(env);
    }
    return new Response("Buche Content Generator Worker\n\nEndpoints:\n- POST /generate - Generate content based on input\n- GET /status - Check worker status");
  }
};
async function handleContentGeneration(request, env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  try {
    const body = await request.json();
    if (!body.content || body.content.trim().length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: "Content is required in request body"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const detectedTags = await analyzeContentForTags(body.content, env.AI);
    const allTags = [...body.tags || [], ...detectedTags];
    const uniqueTags = [...new Set(allTags)];
    const relatedSnippets = await findRelatedSnippets(uniqueTags, env, 5);
    const generatedContent = await generateContent(
      body.content,
      relatedSnippets,
      uniqueTags,
      env.AI,
      body.maxLength || 800
    );
    const response = {
      success: true,
      generatedContent,
      relatedSnippets: relatedSnippets.map((snippet) => ({
        id: snippet.id,
        title: snippet.title,
        author: snippet.author,
        tags: snippet.tagNames || [],
        relevanceScore: snippet.relevanceScore || 0
      })),
      detectedTags
    };
    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Content generation error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(handleContentGeneration, "handleContentGeneration");
async function handleStatus(env) {
  try {
    const [snippetsResult, tagsResult] = await Promise.all([
      env.CONTENT_DB.prepare('SELECT COUNT(*) as count FROM snippets WHERE tags IS NOT NULL AND tags != "[]"').first(),
      env.CONTENT_DB.prepare("SELECT COUNT(*) as count FROM tags").first()
    ]);
    const taggedSnippets = snippetsResult?.count || 0;
    const totalTags = tagsResult?.count || 0;
    return new Response(JSON.stringify({
      status: "active",
      taggedSnippets,
      totalTags,
      capabilities: ["content_generation", "tag_analysis", "snippet_matching"]
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: "Database not initialized",
      status: "inactive"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(handleStatus, "handleStatus");
async function analyzeContentForTags(content, ai) {
  try {
    const truncatedContent = content.length > 1500 ? content.substring(0, 1500) + "..." : content;
    const prompt = `\u5206\u6790\u8FD9\u6BB5\u5185\u5BB9\uFF0C\u63D0\u53D63-6\u4E2A\u6700\u76F8\u5173\u7684\u4E2D\u6587\u6807\u7B7E\uFF08\u6BCF\u4E2A2-4\u4E2A\u5B57\uFF09\uFF0C\u7528\u4E8E\u63CF\u8FF0\u5185\u5BB9\u7684\u4E3B\u9898\u3001\u573A\u666F\u3001\u60C5\u611F\u548C\u98CE\u683C\u7279\u70B9\u3002

\u5185\u5BB9\uFF1A${truncatedContent}

\u53EA\u8FD4\u56DE\u6807\u7B7E\u540D\u79F0\uFF0C\u6BCF\u884C\u4E00\u4E2A\uFF0C\u4E0D\u9700\u8981\u89E3\u91CA\u3002`;
    const response = await ai.run("@cf/meta/llama-4-scout-17b-16e-instruct", {
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 100
    });
    const result = response.response;
    const rawTags = result.split("\n").map((line) => line.trim()).filter((line) => line.length > 0 && !line.includes(":")).slice(0, 6);
    const cleanedTags = rawTags.map((tag) => cleanTag(tag)).filter((tag) => tag.length > 0 && tag.length <= 4).filter((tag) => isValidChineseTag(tag));
    return cleanedTags;
  } catch (error) {
    console.error("Error analyzing content for tags:", error);
    return [];
  }
}
__name(analyzeContentForTags, "analyzeContentForTags");
function cleanTag(tag) {
  return tag.replace(/[\s\u00A0\u3000]/g, "").replace(/[^\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\u2ceb0-\u2ebef\u30000-\u3134f\u4e00-\u9fff\u3400-\u4dbf0-9]/g, "").trim();
}
__name(cleanTag, "cleanTag");
function isValidChineseTag(tag) {
  const chineseRegex = /[\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\u2ceb0-\u2ebef\u30000-\u3134f]/;
  return tag.length > 0 && tag.length <= 4 && chineseRegex.test(tag);
}
__name(isValidChineseTag, "isValidChineseTag");
async function findRelatedSnippets(tags, env, limit = 5) {
  if (tags.length === 0) {
    return [];
  }
  try {
    const tagPlaceholders = tags.map(() => "?").join(",");
    const tagQuery = `SELECT id, name FROM tags WHERE name IN (${tagPlaceholders})`;
    const tagResults = await env.CONTENT_DB.prepare(tagQuery).bind(...tags).all();
    const foundTags = tagResults.results;
    if (foundTags.length === 0) {
      return [];
    }
    const tagIds = foundTags.map((tag) => tag.id);
    const tagIdPlaceholders = tagIds.map(() => "?").join(",");
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
    const snippetResults = await env.CONTENT_DB.prepare(snippetQuery).bind(...tagIds, limit).all();
    const relatedSnippets = [];
    for (const snippet of snippetResults.results) {
      try {
        const r2Object = await env.CONTENT_BUCKET.get(snippet.id);
        if (r2Object) {
          const content = await r2Object.text();
          const tagMatches = snippet.tag_matches || 0;
          const relevanceScore = Math.min(tagMatches / tags.length, 1);
          relatedSnippets.push({
            id: snippet.id,
            title: snippet.title,
            author: snippet.author,
            tags: snippet.tag_names ? snippet.tag_names.split(",") : [],
            content,
            tagNames: snippet.tag_names ? snippet.tag_names.split(",") : [],
            relevanceScore
          });
        }
      } catch (error) {
        console.error(`Error fetching content for snippet ${snippet.id}:`, error);
      }
    }
    return relatedSnippets;
  } catch (error) {
    console.error("Error finding related snippets:", error);
    return [];
  }
}
__name(findRelatedSnippets, "findRelatedSnippets");
async function generateContent(originalContent, relatedSnippets, detectedTags, ai, maxLength = 800) {
  try {
    const snippetsText = relatedSnippets.slice(0, 3).map((snippet, index) => {
      const content = snippet.content && snippet.content.length > 300 ? snippet.content.substring(0, 300) + "..." : snippet.content;
      return `[\u7247\u6BB5${index + 1}] \u300A${snippet.title}\u300B\u4F5C\u8005\uFF1A${snippet.author}
${content}`;
    }).join("\n\n");
    const tagsText = detectedTags.join("\u3001");
    const prompt = GENERATION_PROMPT.replace("{original_content}", originalContent).replace("{related_snippets}", snippetsText || "(\u65E0\u76F8\u5173\u7247\u6BB5)").replace("{detected_tags}", tagsText || "(\u65E0\u68C0\u6D4B\u5230\u7684\u6807\u7B7E)");
    const response = await ai.run("@cf/meta/llama-4-scout-17b-16e-instruct", {
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: Math.min(maxLength * 2, 1500)
      // Allow some buffer for Chinese tokens
    });
    const generatedText = response.response;
    const cleanedContent = generatedText.trim().replace(/^[\"'"""'']+|[\"'"""'']+$/g, "").replace(/\n{3,}/g, "\n\n").substring(0, maxLength);
    return cleanedContent;
  } catch (error) {
    console.error("Error generating content:", error);
    throw new Error("Failed to generate content");
  }
}
__name(generateContent, "generateContent");

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-u5IjEb/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-u5IjEb/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
