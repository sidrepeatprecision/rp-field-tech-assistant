/**
 * Field Tech Assistant — front-end chat logic.
 * --------------------------------------------
 * Runs in the technician's browser. Responsibilities:
 *   - Capture the question typed into the composer.
 *   - POST the full conversation history to /api/chat.
 *   - Read the streamed (Server-Sent Events) reply and render it live,
 *     token-by-token, as Markdown.
 *   - Keep a client-side `history` array so follow-up questions have context.
 *
 * There is no persistence: refreshing the page or tapping "New" clears the
 * conversation. Everything is wrapped in an IIFE so nothing leaks to the
 * global scope.
 */
(() => {
  // --- Cached DOM references ---
  const messagesEl = document.getElementById("messages"); // scrollable chat area
  const form = document.getElementById("composer");       // the input form
  const textarea = document.getElementById("prompt");     // where the tech types
  const sendBtn = document.getElementById("send");        // send button
  const newChatBtn = document.getElementById("new-chat"); // clears the chat
  const themeToggle = document.getElementById("theme-toggle"); // light/dark switch

  /**
   * The conversation so far, sent to the API on every request so the model
   * has context for follow-up questions.
   * @type {{role: "user"|"assistant", content: string}[]}
   */
  let history = [];

  // ============================================================
  // UI helpers
  // ============================================================

  /** Grow/shrink the textarea to fit its content, capped at 140px. */
  function autoResize() {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 140) + "px";
  }

  /** Keep the newest message in view. */
  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  /**
   * Append a message bubble to the chat.
   * User messages are inserted as plain text (safe); bot messages are rendered
   * as Markdown. Returns the created element so the caller can update it later
   * (used to fill in the bot bubble as tokens stream in).
   */
  function appendMessage(role, text) {
    const div = document.createElement("div");
    div.className = `msg ${role}`;
    if (role === "bot") {
      div.innerHTML = renderMarkdown(text);
    } else {
      div.textContent = text;
    }
    messagesEl.appendChild(div);
    scrollToBottom();
    return div;
  }

  /** Show an animated "typing…" bubble while we wait for the first token. */
  function appendTyping() {
    const div = document.createElement("div");
    div.className = "msg bot";
    div.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
    messagesEl.appendChild(div);
    scrollToBottom();
    return div;
  }

  /**
   * Render Markdown to HTML using the `marked` library (loaded via CDN in
   * index.html). If it hasn't loaded, fall back to escaped plain text so we
   * never inject raw HTML.
   */
  function renderMarkdown(text) {
    if (window.marked) {
      window.marked.setOptions({ gfm: true, breaks: true });
      return window.marked.parse(text);
    }
    // Fallback: render as plain text (textContent escapes any HTML).
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /** Disable/enable the composer while a request is in flight. */
  function setSending(sending) {
    sendBtn.disabled = sending;
    textarea.disabled = sending;
  }

  // ============================================================
  // Server-Sent Events (SSE) parsing
  // ============================================================

  /**
   * Read Anthropic's streamed response and call `onText` with each text chunk.
   *
   * The stream is a sequence of SSE events separated by blank lines, e.g.:
   *   event: content_block_delta
   *   data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}
   *
   * We only care about `text_delta` deltas — those carry the answer text.
   * Everything else (message_start, ping, usage, etc.) is ignored.
   */
  async function streamResponse(response, onText) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      // Bytes may arrive mid-event, so accumulate into a buffer and only
      // process whole events (delimited by a blank line).
      buffer += decoder.decode(value, { stream: true });

      let nlIdx;
      while ((nlIdx = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, nlIdx);
        buffer = buffer.slice(nlIdx + 2);

        // Each event has one or more lines; the payload is on the `data:` line.
        for (const line of rawEvent.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const evt = JSON.parse(data);
            if (
              evt.type === "content_block_delta" &&
              evt.delta &&
              evt.delta.type === "text_delta" &&
              typeof evt.delta.text === "string"
            ) {
              onText(evt.delta.text);
            }
          } catch {
            // Ignore any malformed/partial event — the next chunk will fix it.
          }
        }
      }
    }
  }

  // ============================================================
  // Sending a message
  // ============================================================

  /**
   * Send `text` as the next user turn: update history + UI, call the API,
   * and stream the reply into a bot bubble.
   */
  async function send(text) {
    // Optimistically add the user's turn to history and the UI.
    history.push({ role: "user", content: text });
    appendMessage("user", text);

    const botEl = appendTyping();
    setSending(true);

    let accumulated = ""; // the full bot answer as it streams in
    let errored = false;

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!resp.ok) {
        // Server/API error: show the status and a snippet of the body.
        const errText = await resp.text();
        botEl.className = "msg bot error";
        botEl.textContent = `Error ${resp.status}: ${errText.slice(0, 400)}`;
        errored = true;
      } else {
        // Success: stream tokens into the bubble as they arrive.
        await streamResponse(resp, (chunk) => {
          if (accumulated === "") {
            botEl.innerHTML = ""; // clear the typing dots on the first token
          }
          accumulated += chunk;
          botEl.innerHTML = renderMarkdown(accumulated);
          scrollToBottom();
        });
      }
    } catch (err) {
      // Network failure (offline, dropped connection, etc.).
      botEl.className = "msg bot error";
      botEl.textContent = "Network error. Check your connection and try again.";
      errored = true;
    } finally {
      setSending(false);
      textarea.focus();
    }

    if (!errored && accumulated) {
      // Keep the successful answer in history for follow-up context.
      history.push({ role: "assistant", content: accumulated });
    } else if (errored) {
      // Roll back the user turn we added optimistically so a retry starts clean.
      history.pop();
    }
  }

  // ============================================================
  // Event wiring
  // ============================================================

  // Submit the composer -> send the trimmed text (ignore empty / mid-send).
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = textarea.value.trim();
    if (!text || sendBtn.disabled) return;
    textarea.value = "";
    autoResize();
    send(text);
  });

  // Resize the textarea as the tech types.
  textarea.addEventListener("input", autoResize);

  // Enter sends; Shift+Enter inserts a newline. Mobile keyboards use the
  // form's submit button instead. `isComposing` avoids sending mid-IME input.
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  // "New" button: confirm, then clear history and restore the welcome message.
  newChatBtn.addEventListener("click", () => {
    if (history.length === 0) return;
    if (!confirm("Start a new chat? Current conversation will be cleared.")) return;
    history = [];
    messagesEl.innerHTML = "";
    const welcome = document.createElement("div");
    welcome.className = "welcome";
    welcome.innerHTML =
      "<p>New chat started. Ask about PurpleSeal™ / PurpleReign™ frac plugs, pumpdown rates, WLAK components, shear ratings, setting tools, or any ENG-TB bulletin.</p>" +
      "<p class=\"muted\">If the docs don't cover it, contact your supervisor or engineering.</p>";
    messagesEl.appendChild(welcome);
    textarea.focus();
  });

  // ============================================================
  // Theme toggle (light / dark)
  // ============================================================
  // The saved choice is applied in index.html before paint. Here we wire the
  // button that flips it and keep the icon in sync. With no saved choice, the
  // effective theme follows the device (prefers-color-scheme).

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

  /** The theme actually in effect right now: explicit choice, else system. */
  function resolvedTheme() {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
    return prefersDark.matches ? "dark" : "light";
  }

  /** Show the icon of the theme the button will switch TO. */
  function updateThemeButton() {
    const isDark = resolvedTheme() === "dark";
    themeToggle.textContent = isDark ? "☀" : "🌙";
    themeToggle.setAttribute(
      "aria-label",
      isDark ? "Switch to light theme" : "Switch to dark theme"
    );
  }

  themeToggle.addEventListener("click", () => {
    const next = resolvedTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("rp-theme", next);
    } catch (e) {}
    updateThemeButton();
  });

  // If the device theme changes and the user hasn't overridden it, keep the
  // button icon accurate.
  prefersDark.addEventListener("change", updateThemeButton);
  updateThemeButton();

  // Set the initial textarea height on load.
  autoResize();
})();
