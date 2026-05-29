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

    // Anything else → serve the static asset (HTML/CSS/JS/manifest/icons).
    return env.ASSETS.fetch(request);
  },
};
