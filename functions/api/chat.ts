import { SYSTEM_INSTRUCTIONS } from "../_system-prompt";
import { KNOWLEDGE_BASE } from "../_knowledge";

interface Env {
  ANTHROPIC_API_KEY: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
}

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!ctx.env.ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY secret is not configured." }, 500);
  }

  let body: ChatRequestBody;
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: "Body must be valid JSON." }, 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: "Body must include a non-empty `messages` array." }, 400);
  }

  for (const m of body.messages) {
    if ((m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") {
      return json({ error: "Each message needs {role: 'user'|'assistant', content: string}." }, 400);
    }
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ctx.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      stream: true,
      system: [
        {
          type: "text",
          text: `${SYSTEM_INSTRUCTIONS}\n\n${KNOWLEDGE_BASE}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: body.messages,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text();
    return new Response(errText, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
    },
  });
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
