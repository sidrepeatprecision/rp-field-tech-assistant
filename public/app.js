/**
 * Field Tech Assistant — front-end chat logic.
 * --------------------------------------------
 * Runs in the technician's browser. Responsibilities:
 *   - Manage multiple chats, each with its own message history, listed in the
 *     left panel. New chat / switch chat / delete chat.
 *   - Persist chats in this device's localStorage so history survives reloads.
 *   - Send the active chat's history to /api/chat and stream the reply live.
 *   - Light/dark theme toggle.
 *
 * Persistence is per-device (localStorage), not per-account: each tech's own
 * phone/PWA holds their own history. Clearing browser data wipes it, and it
 * does not sync across devices. Everything is wrapped in an IIFE.
 */
(() => {
  // --- Cached DOM references ---
  const messagesEl = document.getElementById("messages"); // scrollable chat area
  const form = document.getElementById("composer");       // the input form
  const textarea = document.getElementById("prompt");     // where the tech types
  const sendBtn = document.getElementById("send");        // send button
  const themeToggle = document.getElementById("theme-toggle"); // light/dark switch
  const sidebar = document.getElementById("sidebar");     // left chat panel
  const chatListEl = document.getElementById("chat-list");// <ul> of chats
  const newChatBtn = document.getElementById("new-chat"); // "+ New" in the panel
  const menuToggle = document.getElementById("menu-toggle"); // opens the panel (mobile)
  const overlay = document.getElementById("overlay");     // dim backdrop (mobile)

  // Profile popover + splash
  const splash = document.getElementById("splash");
  const profileToggle = document.getElementById("profile-toggle");
  const profileMenu = document.getElementById("profile-menu");
  const profileInitials = document.getElementById("profile-initials");
  const profileName = document.getElementById("profile-name");
  const profileEmail = document.getElementById("profile-email");
  const logoutBtn = document.getElementById("logout-btn");

  // Chat storage is namespaced PER USER so no two signed-in techs ever share
  // history on the same device. The suffix is filled in once we know the
  // Cloudflare Access identity (see resolveIdentity); until then it's "local".
  const STORAGE_PREFIX = "rp-chats";
  let STORAGE_KEY = STORAGE_PREFIX + "::local";

  /** The signed-in user, once resolved. */
  let identity = { email: null, name: null };

  /**
   * All chats for this device plus which one is active.
   * @type {{ chats: Chat[], activeId: string|null }}
   * Chat = { id, title, createdAt, updatedAt, messages: {role:"user"|"assistant", content:string}[] }
   */
  let state = { chats: [], activeId: null };

  /** True while a request is in flight — blocks chat switching/creation. */
  let sending = false;

  // ============================================================
  // Chat store (localStorage)
  // ============================================================

  function uid() {
    return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.chats)) {
          state = { chats: parsed.chats, activeId: parsed.activeId || null };
        }
      }
    } catch (e) {
      // Corrupt/unavailable storage — fall back to an in-memory session.
      state = { chats: [], activeId: null };
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Storage full/disabled — the app still works for this session.
    }
  }

  function activeChat() {
    return state.chats.find((c) => c.id === state.activeId) || null;
  }

  /** Create a new empty chat, make it active, and return it (no UI side effects). */
  function createChat() {
    const now = Date.now();
    const chat = { id: uid(), title: "New chat", createdAt: now, updatedAt: now, messages: [] };
    state.chats.unshift(chat);
    state.activeId = chat.id;
    return chat;
  }

  /** Derive a chat title from the first user message. */
  function titleFor(text) {
    const line = (text || "").trim().split("\n")[0];
    if (!line) return "New chat";
    return line.length > 40 ? line.slice(0, 40) + "…" : line;
  }

  // ============================================================
  // Rendering
  // ============================================================

  /** Build the welcome card shown when a chat has no messages yet. */
  function welcomeCard() {
    const div = document.createElement("div");
    div.className = "welcome";
    div.innerHTML =
      "<p>Ask about PurpleSeal™ / PurpleReign™ frac plugs, pumpdown rates, WLAK components, shear ratings, setting tools, or any ENG-TB bulletin.</p>" +
      '<p class="muted">If the docs don\'t cover it, contact your supervisor or engineering.</p>';
    return div;
  }

  /** Render the left panel list of chats (most recently updated first). */
  function renderChatList() {
    chatListEl.innerHTML = "";
    const chats = [...state.chats].sort((a, b) => b.updatedAt - a.updatedAt);

    if (chats.length === 0) {
      const li = document.createElement("li");
      li.className = "chat-empty";
      li.textContent = "No chats yet.";
      chatListEl.appendChild(li);
      return;
    }

    for (const chat of chats) {
      const li = document.createElement("li");
      li.className = "chat-row" + (chat.id === state.activeId ? " active" : "");

      const title = document.createElement("span");
      title.className = "chat-title";
      title.textContent = chat.title || "New chat";

      // "⋮" menu: rename / export / delete.
      const menuWrap = document.createElement("div");
      menuWrap.className = "chat-menu-wrap";

      const menuBtn = document.createElement("button");
      menuBtn.className = "chat-menu-btn";
      menuBtn.type = "button";
      menuBtn.textContent = "⋮";
      menuBtn.setAttribute("aria-label", "Chat options");
      menuBtn.setAttribute("aria-haspopup", "true");

      const menu = document.createElement("div");
      menu.className = "chat-menu";
      menu.hidden = true;

      const mkItem = (label, cls, fn) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        if (cls) b.className = cls;
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          closeAllMenus();
          fn();
        });
        return b;
      };
      menu.appendChild(mkItem("Rename", "", () => beginRename(chat.id, li, title)));
      menu.appendChild(mkItem("Export", "", () => exportChat(chat.id)));
      menu.appendChild(mkItem("Delete", "danger", () => deleteChat(chat.id)));

      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const willOpen = menu.hidden;
        closeAllMenus();
        menu.hidden = !willOpen;
      });

      menuWrap.appendChild(menuBtn);
      menuWrap.appendChild(menu);

      li.appendChild(title);
      li.appendChild(menuWrap);
      li.addEventListener("click", () => selectChat(chat.id));
      chatListEl.appendChild(li);
    }
  }

  /** Close every open "⋮" chat menu and the profile popover. */
  function closeAllMenus() {
    chatListEl.querySelectorAll(".chat-menu").forEach((m) => (m.hidden = true));
    closeProfileMenu();
  }

  /** Render the active chat's messages into the transcript area. */
  function renderMessages() {
    messagesEl.innerHTML = "";
    const chat = activeChat();
    if (!chat || chat.messages.length === 0) {
      messagesEl.appendChild(welcomeCard());
      return;
    }
    for (const m of chat.messages) {
      appendMessage(m.role === "assistant" ? "bot" : "user", m.content);
    }
    scrollToBottom();
  }

  // ============================================================
  // Chat actions
  // ============================================================

  function newChat() {
    if (sending) return;
    const chat = activeChat();
    // If the current chat is already an empty "New chat", just reuse it.
    if (!chat || chat.messages.length > 0) {
      createChat();
      persist();
      renderChatList();
      renderMessages();
    }
    closeSidebar();
    textarea.focus();
  }

  function selectChat(id) {
    if (sending) return;
    state.activeId = id;
    persist();
    renderChatList();
    renderMessages();
    closeSidebar();
    textarea.focus();
  }

  function deleteChat(id) {
    if (sending) return;
    if (!confirm("Delete this chat?")) return;
    state.chats = state.chats.filter((c) => c.id !== id);
    if (state.activeId === id) {
      state.activeId = state.chats.length ? state.chats[0].id : null;
      if (!state.activeId) createChat();
    }
    persist();
    renderChatList();
    renderMessages();
  }

  /**
   * Inline-rename a chat: swap the title span for a text input. Enter or blur
   * commits; Escape cancels. Keeps focus in the sidebar (no modal prompt).
   */
  function beginRename(id, li, titleEl) {
    if (sending) return;
    const chat = state.chats.find((c) => c.id === id);
    if (!chat) return;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "chat-rename-input";
    input.value = chat.title || "";
    input.maxLength = 80;

    // Don't let clicks inside the field select/switch the chat.
    input.addEventListener("click", (e) => e.stopPropagation());

    let done = false;
    const commit = (save) => {
      if (done) return;
      done = true;
      if (save) {
        const v = input.value.trim();
        chat.title = v || "New chat";
        chat.updatedAt = Date.now();
        persist();
      }
      renderChatList();
    };

    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); commit(true); }
      else if (e.key === "Escape") { e.preventDefault(); commit(false); }
    });
    input.addEventListener("blur", () => commit(true));

    li.replaceChild(input, titleEl);
    input.focus();
    input.select();
  }

  /**
   * Export a chat as a human-readable Markdown file with a metadata header
   * followed by the full transcript. Triggers a browser download.
   */
  function exportChat(id) {
    const chat = state.chats.find((c) => c.id === id);
    if (!chat) return;

    const iso = (ms) => (ms ? new Date(ms).toISOString() : "—");
    const lines = [];
    lines.push("# Repeat Precision — Field Tech Assistant");
    lines.push("# Chat Export");
    lines.push("");
    lines.push("## Metadata");
    lines.push(`- Title: ${chat.title || "New chat"}`);
    lines.push(`- Chat ID: ${chat.id}`);
    lines.push(`- User: ${identity.email || identity.name || "local session"}`);
    lines.push(`- Created: ${iso(chat.createdAt)}`);
    lines.push(`- Last updated: ${iso(chat.updatedAt)}`);
    lines.push(`- Message count: ${chat.messages.length}`);
    lines.push(`- Exported: ${new Date().toISOString()}`);
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Transcript");
    lines.push("");

    if (chat.messages.length === 0) {
      lines.push("_(no messages)_");
    } else {
      chat.messages.forEach((m, i) => {
        const who = m.role === "assistant" ? "Assistant" : "Technician";
        lines.push(`### ${i + 1} · ${who}`);
        lines.push("");
        lines.push(m.content);
        lines.push("");
      });
    }

    const text = lines.join("\n");
    const slug = (chat.title || "chat")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "chat";
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `rp-chat-${slug}-${stamp}.md`;

    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

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
   * Append a message bubble to the chat. User messages are inserted as plain
   * text (safe); bot messages are rendered as Markdown. Returns the element so
   * the caller can update it as tokens stream in.
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
   * Render Markdown to HTML via `marked` (CDN in index.html). Falls back to
   * escaped plain text so we never inject raw HTML.
   */
  function renderMarkdown(text) {
    if (window.marked) {
      window.marked.setOptions({ gfm: true, breaks: true });
      return window.marked.parse(text);
    }
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /** Disable/enable the composer + New button while a request is in flight. */
  function setSending(isSending) {
    sending = isSending;
    sendBtn.disabled = isSending;
    textarea.disabled = isSending;
    newChatBtn.disabled = isSending;
  }

  // ============================================================
  // Server-Sent Events (SSE) parsing
  // ============================================================

  /**
   * Read Anthropic's streamed response and call `onText` with each text chunk.
   * The stream is SSE events separated by blank lines; we only act on
   * `text_delta` deltas (the answer text) and ignore the rest.
   */
  async function streamResponse(response, onText) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      // Bytes may arrive mid-event, so buffer and only process whole events.
      buffer += decoder.decode(value, { stream: true });

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
            // Ignore malformed/partial event — the next chunk fixes it.
          }
        }
      }
    }
  }

  // ============================================================
  // Sending a message
  // ============================================================

  async function send(text) {
    const chat = activeChat();
    if (!chat) return;

    const wasEmpty = chat.messages.length === 0;
    chat.messages.push({ role: "user", content: text });
    if (wasEmpty) chat.title = titleFor(text); // name the chat from its first question
    chat.updatedAt = Date.now();
    persist();
    renderChatList();

    // Clear the welcome card (if present) before showing the first message.
    const w = messagesEl.querySelector(".welcome");
    if (w) w.remove();
    appendMessage("user", text);

    const botEl = appendTyping();
    setSending(true);

    let accumulated = "";
    let errored = false;

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: chat.messages }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        botEl.className = "msg bot error";
        botEl.textContent = `Error ${resp.status}: ${errText.slice(0, 400)}`;
        errored = true;
      } else {
        await streamResponse(resp, (chunk) => {
          if (accumulated === "") botEl.innerHTML = ""; // clear typing dots
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
      chat.messages.push({ role: "assistant", content: accumulated });
      chat.updatedAt = Date.now();
      persist();
      renderChatList(); // reflect new "most recent" order
    } else if (errored) {
      // Drop the failed user turn from stored history so a retry starts clean.
      chat.messages.pop();
      persist();
    }
  }

  // ============================================================
  // Sidebar (drawer) open/close
  // ============================================================

  function openSidebar() {
    sidebar.classList.add("open");
    overlay.hidden = false;
  }
  function closeSidebar() {
    sidebar.classList.remove("open");
    overlay.hidden = true;
  }

  // ============================================================
  // Profile popover + identity (Cloudflare Access)
  // ============================================================

  function openProfileMenu() {
    profileMenu.hidden = false;
    profileToggle.setAttribute("aria-expanded", "true");
  }
  function closeProfileMenu() {
    if (!profileMenu.hidden) {
      profileMenu.hidden = true;
      profileToggle.setAttribute("aria-expanded", "false");
    }
  }

  /** Two-letter initials for the avatar button, from name or email. */
  function initialsFor(name, email) {
    const src = (name || "").trim();
    if (src) {
      const parts = src.split(/\s+/);
      const a = parts[0][0] || "";
      const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
      return (a + b).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return "RP";
  }

  function renderProfile() {
    const { name, email } = identity;
    profileName.textContent = name || (email ? email.split("@")[0] : "Signed in");
    profileEmail.textContent = email || "Local session";
    profileInitials.textContent = initialsFor(name, email);
  }

  /**
   * Ask Cloudflare Access who is signed in. When the app runs behind Access,
   * `/cdn-cgi/access/get-identity` returns the user's email/name. Off Access
   * (e.g. local dev) it 404s or errors — we fall back to a "local" session.
   * Resolves once, with a short timeout so boot never hangs on it.
   */
  async function resolveIdentity() {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const resp = await fetch("/cdn-cgi/access/get-identity", {
        credentials: "include",
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (resp.ok) {
        const data = await resp.json();
        identity.email = data.email || null;
        identity.name = data.name || null;
      }
    } catch (e) {
      // Not behind Access, or offline — stay on the local session.
    }
  }

  /** Send the tech to the Cloudflare Access logout, which returns to login. */
  function logout() {
    window.location.href = "/cdn-cgi/access/logout";
  }

  // ============================================================
  // Event wiring
  // ============================================================

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = textarea.value.trim();
    if (!text || sendBtn.disabled) return;
    textarea.value = "";
    autoResize();
    send(text);
  });

  textarea.addEventListener("input", autoResize);

  // Enter sends; Shift+Enter inserts a newline; `isComposing` guards IME input.
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  newChatBtn.addEventListener("click", newChat);
  menuToggle.addEventListener("click", () => {
    sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
  });
  overlay.addEventListener("click", closeSidebar);

  // Profile popover
  profileToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = profileMenu.hidden;
    closeAllMenus();
    if (willOpen) openProfileMenu();
  });
  logoutBtn.addEventListener("click", logout);

  // One global listener closes any open popover on an outside click or Escape.
  document.addEventListener("click", () => closeAllMenus());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllMenus();
  });

  // ============================================================
  // Theme toggle (light / dark)
  // ============================================================
  // The saved choice is applied in index.html before paint. Here we wire the
  // button that flips it and keep the icon in sync. With no saved choice, the
  // effective theme follows the device (prefers-color-scheme).

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

  function resolvedTheme() {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
    return prefersDark.matches ? "dark" : "light";
  }

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

  prefersDark.addEventListener("change", updateThemeButton);
  updateThemeButton();

  // ============================================================
  // Init
  // ============================================================

  /**
   * One-time upgrade: the old build stored all chats under a single unnamespaced
   * "rp-chats" key. On first run of this build, fold those into the current
   * user's namespace (only if that namespace is still empty), then retire the
   * legacy key so it can't leak between users later.
   */
  function migrateLegacyChats() {
    try {
      const legacy = localStorage.getItem(STORAGE_PREFIX); // exact old key
      if (!legacy) return;
      if (!localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, legacy);
      }
      localStorage.removeItem(STORAGE_PREFIX);
    } catch (e) {}
  }

  /** Hide the splash after a short, purely-aesthetic beat. */
  function scheduleSplashHide() {
    if (!splash) return;
    const hide = () => splash.classList.add("hide");
    // Remove from the DOM after the fade so it never traps focus/clicks.
    splash.addEventListener("transitionend", () => splash.remove(), { once: true });
    setTimeout(hide, 1300);
  }

  async function boot() {
    scheduleSplashHide();

    await resolveIdentity();
    STORAGE_KEY = STORAGE_PREFIX + "::" + (identity.email || "local");
    renderProfile();
    migrateLegacyChats();

    load();
    if (!state.chats.length) createChat();
    if (!state.chats.some((c) => c.id === state.activeId)) {
      state.activeId = state.chats[0].id;
    }
    persist();
    renderChatList();
    renderMessages();
    autoResize();
  }

  boot();
})();
