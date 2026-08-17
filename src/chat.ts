/**
 * Chat handler — the bridge between the browser and the Anthropic API.
 * -------------------------------------------------------------------
 * Responsibilities:
 *   1. Validate the incoming request body (a list of chat messages).
 *   2. Build the Anthropic request, attaching:
 *        - the system instructions (bot rules/tone, from system-prompt.ts)
 *        - the training-guide corpus (from knowledge.ts, auto-generated)
 *      Both are sent as a single cached "system" block so Anthropic only
 *      re-reads them from cache on repeat questions (keeps cost low).
 *   3. Stream Anthropic's Server-Sent Events (SSE) response straight back to
 *      the browser without buffering, so answers appear token-by-token.
 *
 * The corpus is large but static, so `cache_control: ephemeral` lets Anthropic
 * charge the full price only on the first request in a ~5-minute window and a
 * fraction of that on subsequent ones.
 */

import { SYSTEM_INSTRUCTIONS } from "./system-prompt";
import { KNOWLEDGE_BASE } from "./knowledge";
import type { Env } from "./index";

/** A single turn in the conversation, as sent by the browser. */
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Shape of the JSON body the browser POSTs to /api/chat. */
interface ChatRequestBody {
  messages: ChatMessage[];
}

// --- Model configuration ---
// To switch models, change MODEL here and redeploy. See README section 7 for
// the cost/quality tradeoffs between Haiku, Sonnet, and Opus.
const MODEL = "claude-sonnet-5";
// Upper bound on the length of a single answer. Field answers are short, so a
// modest cap keeps responses fast and costs predictable.
const MAX_TOKENS = 1024;

export async function handleChat(request: Request, env: Env): Promise<Response> {
  // The Worker can't talk to Anthropic without a key. This happens when the
  // ANTHROPIC_API_KEY secret wasn't set on the deploy (see README troubleshooting).
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY secret is not configured." }, 500);
  }

  // --- Parse and validate the request body ---
  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be valid JSON." }, 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: "Body must include a non-empty `messages` array." }, 400);
  }

  // Guard against malformed turns before we spend a request on Anthropic.
  for (const m of body.messages) {
    if ((m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") {
      return json({ error: "Each message needs {role: 'user'|'assistant', content: string}." }, 400);
    }
  }

  // --- Call the Anthropic Messages API ---
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Sonnet 5 runs "adaptive" thinking by default when the field is omitted.
      // We disable it to keep answers fast for on-rig lookups. Remove this line
      // to let the model reason more deeply on hard spec questions.
      thinking: { type: "disabled" },
      // Stream the answer so the UI can render tokens as they arrive.
      stream: true,
      // The system block = bot rules + the whole training corpus. Marking it
      // `ephemeral` caches it between requests so we don't pay to re-send ~75K
      // tokens on every question.
      system: [
        {
          type: "text",
          text: `${SYSTEM_INSTRUCTIONS}\n\n${KNOWLEDGE_BASE}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      // The actual conversation history (validated above).
      messages: body.messages,
    }),
  });

  // If Anthropic rejected the request (bad key, rate limit, etc.), pass the
  // error body and status straight through so the browser can show it.
  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text();
    return new Response(errText, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  }

  // --- Stream the SSE response back to the browser unchanged ---
  // We hand Anthropic's response body directly to the client. `app.js` parses
  // the SSE events on the other end.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
}

/** Small helper: build a JSON response with the given status code. */
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
