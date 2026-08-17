/**
 * Worker entry point and request router.
 * ---------------------------------------
 * This is the first code that runs for EVERY request to the deployed site.
 * Cloudflare hands us the incoming `Request`; we decide what to do with it:
 *
 *   - `POST /api/chat`  -> forward to the Anthropic-backed chat handler (chat.ts)
 *   - anything else     -> serve a static file from the /public folder
 *
 * The static-asset serving is provided by Cloudflare's built-in `ASSETS`
 * binding (configured in wrangler.toml). Because `run_worker_first = true`
 * is set there, this Worker sees the request BEFORE the static-asset layer,
 * which is what lets us intercept `/api/chat` instead of it being treated as
 * a (non-existent) static file.
 */

import { handleChat } from "./chat";
import { handleMondayWebhook } from "./monday-webhook";

/**
 * Environment bindings available at runtime.
 * These are injected by Cloudflare based on wrangler.toml and the dashboard
 * secrets — they are NOT hard-coded here.
 */
export interface Env {
  /** Anthropic API key. Set as an encrypted secret, never committed to git. */
  ANTHROPIC_API_KEY: string;
  /** Cloudflare Static Assets binding — serves the files in /public. */
  ASSETS: Fetcher;

  // --- Optional: monday → GitHub auto-rebuild relay (see monday-webhook.ts) ---
  /** Shared secret the incoming monday webhook must present as ?token=. */
  MONDAY_WEBHOOK_SECRET?: string;
  /** GitHub PAT (contents:write) used to trigger the rebuild workflow. */
  GH_DISPATCH_TOKEN?: string;
  /** Target repo as "owner/repo" for the repository_dispatch call. */
  GH_REPO?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // --- API route: the chat endpoint ---
    if (url.pathname === "/api/chat") {
      // The chat endpoint only accepts POST (the browser sends the message
      // history as a JSON body). Reject anything else clearly.
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      return handleChat(request, env);
    }

    // --- Webhook: monday.com change notification → triggers a knowledge rebuild ---
    if (url.pathname === "/api/monday-webhook") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      return handleMondayWebhook(request, env);
    }

    // --- Everything else: static files ---
    // HTML, CSS, JS, the web manifest, icons, etc. are served straight from
    // the bundled /public directory by Cloudflare's asset handler.
    return env.ASSETS.fetch(request);
  },
};
