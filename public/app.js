(() => {
  const messagesEl = document.getElementById("messages");
  const form = document.getElementById("composer");
  const textarea = document.getElementById("prompt");
  const sendBtn = document.getElementById("send");
  const newChatBtn = document.getElementById("new-chat");

  /** @type {{role: "user"|"assistant", content: string}[]} */
  let history = [];

  // ---------- UI helpers ----------

  function autoResize() {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 140) + "px";
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

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

  function appendTyping() {
    const div = document.createElement("div");
    div.className = "msg bot";
    div.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
    messagesEl.appendChild(div);
    scrollToBottom();
    return div;
  }

  function renderMarkdown(text) {
    if (window.marked) {
      window.marked.setOptions({ gfm: true, breaks: true });
      return window.marked.parse(text);
    }
    // Fallback: text only
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function setSending(sending) {
    sendBtn.disabled = sending;
    textarea.disabled = sending;
  }

  // ---------- SSE parsing ----------

  /**
   * Parse Anthropic SSE stream, invoking onText for each delta.
   * Stream format example:
   *   event: content_block_delta
   *   data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}
   */
  async function streamResponse(response, onText) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by blank lines.
      let nlIdx;
      while ((nlIdx = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, nlIdx);
        buffer = buffer.slice(nlIdx + 2);

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
            // Ignore malformed event
          }
        }
      }
    }
  }

  // ---------- Send ----------

  async function send(text) {
    history.push({ role: "user", content: text });
    appendMessage("user", text);

    const botEl = appendTyping();
    setSending(true);

    let accumulated = "";
    let errored = false;

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        botEl.className = "msg bot error";
        botEl.textContent = `Error ${resp.status}: ${errText.slice(0, 400)}`;
        errored = true;
      } else {
        await streamResponse(resp, (chunk) => {
          if (accumulated === "") {
            botEl.innerHTML = ""; // clear typing dots on first token
          }
          accumulated += chunk;
          botEl.innerHTML = renderMarkdown(accumulated);
          scrollToBottom();
        });
      }
    } catch (err) {
      botEl.className = "msg bot error";
      botEl.textContent = "Network error. Check your connection and try again.";
      errored = true;
    } finally {
      setSending(false);
      textarea.focus();
    }

    if (!errored && accumulated) {
      history.push({ role: "assistant", content: accumulated });
    } else if (errored) {
      // Don't keep the failed turn in history — let the user retry cleanly.
      history.pop();
    }
  }

  // ---------- Events ----------

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = textarea.value.trim();
    if (!text || sendBtn.disabled) return;
    textarea.value = "";
    autoResize();
    send(text);
  });

  textarea.addEventListener("input", autoResize);

  textarea.addEventListener("keydown", (e) => {
    // Enter sends; Shift+Enter inserts newline. Mobile keyboards send via the
    // form submit button instead.
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

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

  autoResize();
})();
