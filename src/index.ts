import { handleChat } from "./chat";

export interface Env {
  ANTHROPIC_API_KEY: string;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/chat") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      return handleChat(request, env);
    }

    // TEMPORARY — remove once secrets are confirmed working.
    if (url.pathname === "/api/debug") {
      const key = env.ANTHROPIC_API_KEY;
      const body = {
        envKeys: Object.keys(env),
        apiKeyType: typeof key,
        apiKeyLength: key ? key.length : 0,
        apiKeyPrefix: key ? key.slice(0, 13) : null,
      };
      return new Response(JSON.stringify(body, null, 2), {
        headers: { "content-type": "application/json" },
      });
    }

    // Anything else → serve the static asset (HTML/CSS/JS/manifest/icons).
    return env.ASSETS.fetch(request);
  },
};
