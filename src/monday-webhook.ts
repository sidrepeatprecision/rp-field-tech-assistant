/**
 * monday.com webhook relay.
 * -------------------------
 * monday POSTs here whenever a watched board changes. This handler authenticates
 * the request and triggers the GitHub Actions "rebuild-knowledge" workflow via a
 * repository_dispatch, which regenerates src/knowledge.ts from monday and
 * redeploys the Worker.
 *
 *   monday board change → POST /api/monday-webhook?token=<secret>
 *       → this relay → GitHub repository_dispatch (event_type: "monday-changed")
 *       → .github/workflows/rebuild-knowledge.yml
 *
 * Why a relay (vs. pointing monday straight at GitHub): it keeps the GitHub
 * token out of monday's config, lets us verify the caller, and reuses the
 * existing Worker + deploy pipeline.
 *
 * Required Worker secrets (see wrangler.toml / the deploy workflows):
 *   MONDAY_WEBHOOK_SECRET — shared secret; must equal the ?token= query param
 *   GH_DISPATCH_TOKEN     — GitHub PAT with contents:write on the repo
 *   GH_REPO               — "owner/repo", e.g. "WGrantMartin/rp-fieldtech-assistant"
 */

import type { Env } from "./index";

export async function handleMondayWebhook(request: Request, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // 1) Subscription handshake. monday's very first POST when a webhook is
  //    registered carries a `challenge` string that we must echo back verbatim
  //    to prove we own the endpoint.
  if (body && typeof body.challenge === "string") {
    return json({ challenge: body.challenge });
  }

  // 2) Authenticate. The registered webhook URL includes ?token=<secret>; reject
  //    anything that doesn't match so the endpoint can't be triggered by others.
  const url = new URL(request.url);
  const provided = url.searchParams.get("token");
  if (!env.MONDAY_WEBHOOK_SECRET || provided !== env.MONDAY_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 3) Make sure the relay is configured.
  if (!env.GH_DISPATCH_TOKEN || !env.GH_REPO) {
    return json({ error: "GitHub dispatch is not configured on the Worker." }, 500);
  }

  // 4) Fire the rebuild workflow. We don't debounce here — a burst of edits
  //    collapses into a single run via the workflow's concurrency group.
  const gh = await fetch(`https://api.github.com/repos/${env.GH_REPO}/dispatches`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "rp-fieldtech-worker", // GitHub API requires a User-Agent
    },
    body: JSON.stringify({ event_type: "monday-changed" }),
  });

  if (!gh.ok) {
    const detail = (await gh.text()).slice(0, 300);
    return json({ error: "GitHub dispatch failed", status: gh.status, detail }, 502);
  }

  return json({ ok: true, triggered: "monday-changed" }, 202);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
