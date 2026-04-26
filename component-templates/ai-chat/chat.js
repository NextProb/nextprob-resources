/**
 * NoteChat — Drop-in AI chat component for workspace items.
 *
 * Wires up chat UI by class names. Expects the HTML structure from the template
 * to already exist in the container. Handles sending messages, poll-based
 * streaming via read-stream.py, conversation persistence via noteDB,
 * and lightweight markdown rendering.
 *
 * Usage:
 *   const chat = new NoteChat('#my-chat', {
 *     systemPrompt: 'You are a helpful assistant.',
 *     storageKey: 'chat-history',
 *     placeholder: 'Ask something...',
 *   });
 */
class NoteChat {
  constructor(containerSelector, options = {}) {
    this.container = typeof containerSelector === 'string'
      ? document.querySelector(containerSelector)
      : containerSelector;

    if (!this.container) throw new Error(`NoteChat: container "${containerSelector}" not found`);

    this.options = {
      systemPrompt: '',
      storageKey: 'note-chat-history',
      placeholder: 'Type a message...',
      pollInterval: 500,
      scriptName: 'ai-chat.py',
      streamScript: 'read-stream.py',
      context: null,          // function returning context object, or null
      onResponse: null,       // callback after AI responds: (reply) => {}
      provider: null,         // override AI_PROVIDER env var
      allowedTools: null,     // claude-cli only: e.g. "Bash(sqlite3*)"
      maxMessagesPerConv: 200, // trim oldest messages beyond this limit per conversation
      ...options,
    };

    // State
    this.conversations = [];   // [{ id, title, messages, createdAt }]
    this.activeConvId = null;
    this.isStreaming = false;
    this.streamOffset = 0;
    this.pollTimer = null;
    this._requestId = 0;       // incremented per send; polls for stale ids are ignored
    this._streamRequestId = ''; // unique ID per send, used for per-request stream log files
    this._pollTimeout = null;  // safety timeout to kill polling if script hangs
    this._destroyed = false;
    this._observer = null;     // MutationObserver for auto-destroy on DOM removal

    // Bind DOM elements
    this._bindElements();
    this._bindEvents();
    this._setupAutoDestroy();
    this._loadConversations().then(() => {
      if (this.conversations.length === 0) {
        this._newConversation();
      } else {
        this._switchConversation(this.conversations[0].id);
      }
    });
  }

  // ---- DOM Binding ----

  _bindElements() {
    const q = (sel) => this.container.querySelector(sel);
    this.elMessages     = q('.note-chat-messages');
    this.elInput        = q('.note-chat-input');
    this.elSendBtn      = q('.note-chat-send-btn');
    this.elHistoryPanel = q('.note-chat-history');
    this.elHistoryList  = q('.note-chat-history-list');
    this.elNewBtn       = q('[data-chat-action="new"]');
    this.elHistoryBtn   = q('[data-chat-action="history"]');
    this.elHistoryClose = q('[data-chat-action="history-close"]');
    this.elClearBtn     = q('[data-chat-action="clear"]');
    this.elCancelBtn    = q('[data-chat-action="cancel"]');

    if (this.elInput) {
      this.elInput.placeholder = this.options.placeholder;
    }
  }

  _bindEvents() {
    // Send on button click
    if (this.elSendBtn) {
      this.elSendBtn.addEventListener('click', () => this.send());
    }

    // Input: auto-resize + Enter to send
    if (this.elInput) {
      this.elInput.addEventListener('input', () => {
        this.elInput.style.height = 'auto';
        this.elInput.style.height = Math.min(this.elInput.scrollHeight, 120) + 'px';
      });
      this.elInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.send();
        }
      });
    }

    // New conversation
    if (this.elNewBtn) {
      this.elNewBtn.addEventListener('click', () => {
        this._newConversation();
        if (this.elHistoryPanel) this.elHistoryPanel.classList.remove('open');
      });
    }

    // Toggle history panel
    if (this.elHistoryBtn) {
      this.elHistoryBtn.addEventListener('click', () => {
        if (this.elHistoryPanel) {
          this.elHistoryPanel.classList.toggle('open');
          if (this.elHistoryPanel.classList.contains('open')) this._renderHistoryList();
        }
      });
    }

    // Close history panel
    if (this.elHistoryClose) {
      this.elHistoryClose.addEventListener('click', () => {
        if (this.elHistoryPanel) this.elHistoryPanel.classList.remove('open');
      });
    }

    // Cancel in-flight request
    if (this.elCancelBtn) {
      this.elCancelBtn.addEventListener('click', () => this.cancel());
    }

    // Clear current conversation
    if (this.elClearBtn) {
      this.elClearBtn.addEventListener('click', () => {
        const conv = this._activeConversation();
        if (conv) {
          conv.messages = [];
          conv.title = null;
          this._renderMessages();
          this._saveConversations();
        }
      });
    }
  }

  // ---- Public API ----

  async send(text) {
    const message = text || (this.elInput ? this.elInput.value.trim() : '');
    if (!message) return;

    // If already streaming, cancel the in-flight request before starting a new one
    if (this.isStreaming) {
      await this.cancel();
    }

    if (this.elInput) {
      this.elInput.value = '';
      this.elInput.style.height = 'auto';
    }

    const conv = this._activeConversation();
    if (!conv) return;

    // Set title from first message
    if (!conv.title) {
      conv.title = message.length > 50 ? message.slice(0, 50) + '...' : message;
    }

    // Add user message
    conv.messages.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    this._addBubble(message, 'user');
    this._saveConversations();

    // Build payload
    const payload = {
      message,
      history: conv.messages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
      systemPrompt: this.options.systemPrompt,
    };

    if (this.options.context) {
      payload.context = typeof this.options.context === 'function'
        ? this.options.context()
        : this.options.context;
    }
    if (this.options.provider) payload.provider = this.options.provider;
    if (this.options.allowedTools) payload.allowedTools = this.options.allowedTools;

    // Claude CLI session support: pass sessionId for multi-turn
    if (conv.sessionId) {
      payload.sessionId = conv.sessionId;
      payload.isResume = true;
    }

    // Show streaming bubble
    const streamBubble = this._addBubble('...', 'assistant', true);
    streamBubble.setAttribute('data-raw', '');
    this.isStreaming = true;
    this.streamOffset = 0;
    const requestId = ++this._requestId;
    // Unique stream ID for per-request log files (avoids log file conflicts)
    this._streamRequestId = String(Date.now()) + '-' + String(requestId);
    payload.requestId = this._streamRequestId;
    this._setStreamingUI(true);

    try {
      const scriptPromise = noteScripts.run(this.options.scriptName, [JSON.stringify(payload)]);
      this._startPolling(streamBubble, requestId);
      const result = await scriptPromise;
      this._stopPolling();

      // If this request was cancelled/superseded, don't touch the UI
      if (requestId !== this._requestId) return;

      if (result.error === 'not_approved') {
        this._finalizeError(streamBubble, conv, 'Script not approved. Open the Scripts panel and approve it.');
        return;
      }

      if (result.exitCode !== 0) {
        this._finalizeError(streamBubble, conv, result.stderr || 'Script failed');
        return;
      }

      let reply;
      try {
        const data = JSON.parse(result.stdout);
        if (data.error) {
          this._finalizeError(streamBubble, conv, data.error);
          return;
        }
        reply = data.reply;
        // Store sessionId for claude-cli multi-turn
        if (data.sessionId) {
          conv.sessionId = data.sessionId;
        }
      } catch {
        reply = result.stdout || 'No response';
      }

      const rawContent = streamBubble.getAttribute('data-raw') || '';
      const hasTools = rawContent.includes('__TOOL_USE__');
      if (hasTools) {
        streamBubble.innerHTML = this._renderSegments(this._parseSegments(rawContent));
      } else {
        streamBubble.innerHTML = this._renderMarkdown(reply);
      }
      streamBubble.classList.remove('note-chat-msg-streaming');

      const msgData = { role: 'assistant', content: reply, timestamp: new Date().toISOString() };
      if (hasTools) msgData.rawContent = rawContent;
      conv.messages.push(msgData);
      this._trimMessages(conv);
      this._saveConversations();
      this._scrollToBottom();

      if (this.options.onResponse) this.options.onResponse(reply);

    } catch (e) {
      this._stopPolling();
      if (requestId !== this._requestId) return;
      this._finalizeError(streamBubble, conv, e.message || 'Failed');
    } finally {
      if (requestId === this._requestId) {
        this.isStreaming = false;
        this._setStreamingUI(false);
      }
    }
  }

  async cancel() {
    if (!this.isStreaming) return;
    this._stopPolling();
    this._requestId++;  // invalidate any in-flight awaits
    this.isStreaming = false;
    this._setStreamingUI(false);
    // Remove the streaming bubble if present
    const streamingEl = this.elMessages?.querySelector('.note-chat-msg-streaming');
    if (streamingEl) streamingEl.remove();
    // Kill the running backend script process
    await this._killScript(this.options.scriptName);
  }

  async destroy() {
    if (this._destroyed) return;
    this._stopPolling();
    this._destroyed = true;
    this._requestId++;
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    // Kill any running backend script to prevent orphaned processes
    await this._killScript(this.options.scriptName);
  }

  // ---- Process Management ----

  async _killScript(scriptName) {
    try {
      if (typeof noteScripts.stopByName === 'function') {
        await noteScripts.stopByName(scriptName);
      }
    } catch {}
  }

  _setupAutoDestroy() {
    // Auto-destroy when the container is removed from the DOM (e.g., user navigates away)
    const parent = this.container.parentNode;
    if (!parent) return;
    this._observer = new MutationObserver(() => {
      if (!document.contains(this.container)) {
        this.destroy();
      }
    });
    this._observer.observe(parent, { childList: true });
  }

  // ---- Streaming ----

  _startPolling(bubble, requestId) {
    // Safety timeout: stop polling after 5 minutes even if no done/error marker
    this._pollTimeout = setTimeout(() => this._stopPolling(), 5 * 60 * 1000);
    const streamId = this._streamRequestId;

    this.pollTimer = setInterval(async () => {
      if (this._destroyed || requestId !== this._requestId) {
        this._stopPolling();
        return;
      }
      try {
        const r = await noteScripts.run(this.options.streamScript, [String(this.streamOffset), streamId]);
        if (requestId !== this._requestId) return;
        if (r.exitCode !== 0 || r.error === 'not_approved') return;
        const data = JSON.parse(r.stdout);
        if (data.content && data.content.trim()) {
          const prev = bubble.getAttribute('data-raw') || '';
          const full = prev + data.content;
          bubble.setAttribute('data-raw', full);
          if (full.includes('__TOOL_USE__') || full.includes('__TOOL_RESULT__')) {
            bubble.innerHTML = this._renderSegments(this._parseSegments(full));
          } else {
            bubble.innerHTML = this._renderMarkdown(full);
          }
          this.streamOffset = data.offset;
        }
        if (data.status === 'done' || data.status === 'error') {
          this._stopPolling();
        }
      } catch {}
    }, this.options.pollInterval);
  }

  _stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this._pollTimeout) {
      clearTimeout(this._pollTimeout);
      this._pollTimeout = null;
    }
  }

  // ---- Conversation Management ----

  _activeConversation() {
    return this.conversations.find(c => c.id === this.activeConvId) || null;
  }

  _newConversation() {
    const conv = {
      id: this._uuid(),
      title: null,
      messages: [],
      createdAt: new Date().toISOString(),
    };
    this.conversations.unshift(conv);
    this.activeConvId = conv.id;
    this._renderMessages();
    this._saveConversations();
    return conv;
  }

  _switchConversation(id) {
    this.activeConvId = id;
    this._renderMessages();
  }

  _deleteConversation(id) {
    this.conversations = this.conversations.filter(c => c.id !== id);
    if (this.activeConvId === id) {
      if (this.conversations.length > 0) {
        this._switchConversation(this.conversations[0].id);
      } else {
        this._newConversation();
      }
    }
    this._saveConversations();
    this._renderHistoryList();
  }

  _trimMessages(conv) {
    const max = this.options.maxMessagesPerConv;
    if (max > 0 && conv.messages.length > max) {
      conv.messages = conv.messages.slice(-max);
    }
  }

  async _loadConversations() {
    try {
      const data = await noteDB.get(this.options.storageKey);
      if (data && Array.isArray(data)) {
        this.conversations = data;
        if (data.length > 0) this.activeConvId = data[0].id;
      }
    } catch {}
  }

  async _saveConversations() {
    try {
      // Keep at most 50 conversations to prevent unbounded noteDB growth
      const toSave = this.conversations.slice(0, 50);
      await noteDB.set(this.options.storageKey, toSave);
    } catch {}
  }

  // ---- Rendering ----

  _renderMessages() {
    if (!this.elMessages) return;
    this.elMessages.innerHTML = '';
    const conv = this._activeConversation();
    if (!conv || conv.messages.length === 0) return;
    for (const msg of conv.messages) {
      if (msg.role === 'user') {
        this._addBubble(msg.content, 'user');
      } else if (msg.role === 'assistant') {
        if (msg.error) {
          const el = this._addBubble(msg.content, 'assistant');
          if (el) {
            el.classList.remove('note-chat-msg-assistant');
            el.classList.add('note-chat-msg-error');
            el.textContent = msg.content;
          }
        } else if (msg.rawContent) {
          this._addBubbleHtml(this._renderSegments(this._parseSegments(msg.rawContent)), 'assistant');
        } else {
          this._addBubble(msg.content, 'assistant');
        }
      }
    }
  }

  _addBubble(text, role, streaming = false) {
    if (!this.elMessages) return null;
    const el = document.createElement('div');
    el.className = `note-chat-msg note-chat-msg-${role}`;
    if (streaming) el.classList.add('note-chat-msg-streaming');

    if (role === 'assistant' && !streaming) {
      el.innerHTML = this._renderMarkdown(text);
    } else {
      el.textContent = text;
    }

    this.elMessages.appendChild(el);
    this._scrollToBottom();
    return el;
  }

  _addBubbleHtml(html, role) {
    if (!this.elMessages) return null;
    const el = document.createElement('div');
    el.className = `note-chat-msg note-chat-msg-${role}`;
    el.innerHTML = html;
    this.elMessages.appendChild(el);
    this._scrollToBottom();
    return el;
  }

  // ---- Tool Call Parsing & Rendering ----

  _parseSegments(raw) {
    const segments = [];
    const re = /\n?__TOOL_(USE|RESULT)__(.*)/g;
    let lastIdx = 0;
    let match;
    while ((match = re.exec(raw)) !== null) {
      const textBefore = raw.slice(lastIdx, match.index);
      if (textBefore.trim()) {
        segments.push({ type: 'text', content: textBefore.trim() });
      }
      try {
        const data = JSON.parse(match[2]);
        if (match[1] === 'USE') {
          segments.push({ type: 'tool_use', name: data.name, input: data.input });
        } else {
          segments.push({ type: 'tool_result', output: data.output || '' });
        }
      } catch { /* skip malformed markers */ }
      lastIdx = re.lastIndex;
    }
    const remaining = raw.slice(lastIdx);
    if (remaining.trim()) {
      segments.push({ type: 'text', content: remaining.trim() });
    }
    return segments;
  }

  _renderSegments(segments) {
    let html = '';
    for (const seg of segments) {
      if (seg.type === 'text') {
        html += this._renderMarkdown(seg.content);
      } else if (seg.type === 'tool_use') {
        const { label, detail } = this._toolDetail(seg.name, seg.input);
        html += '<div class="note-chat-tool"><span class="note-chat-tool-name">'
          + this._escHtml(label) + '</span>';
        if (detail) {
          html += '<span class="note-chat-tool-detail" title="'
            + this._escHtml(detail) + '">' + this._escHtml(detail) + '</span>';
        }
        html += '</div>';
      } else if (seg.type === 'tool_result') {
        const output = seg.output || '';
        html += '<details class="note-chat-tool-result"><summary>Result</summary><pre>'
          + this._escHtml(output) + '</pre></details>';
      }
    }
    return html;
  }

  _toolDetail(name, input) {
    if (!input) return { label: name || 'Tool', detail: null };
    switch (name) {
      case 'Bash': return { label: input.description || 'Run command', detail: input.command || null };
      case 'Read': return { label: 'Read', detail: input.file_path || null };
      case 'Edit': return { label: 'Edit', detail: input.file_path || null };
      case 'Write': return { label: 'Write', detail: input.file_path || null };
      case 'Glob': return { label: 'Glob', detail: input.pattern || null };
      case 'Grep': return { label: 'Grep', detail: input.pattern || null };
      case 'Agent': return { label: 'Agent', detail: input.description || null };
      case 'WebSearch': return { label: 'Search', detail: input.query || null };
      case 'WebFetch': return { label: 'Fetch', detail: input.url || null };
      default: return { label: name || 'Tool', detail: null };
    }
  }

  _finalizeBubble(bubble, text, isError = false) {
    if (!bubble) return;
    bubble.textContent = text;
    bubble.classList.remove('note-chat-msg-streaming');
    if (isError) {
      bubble.classList.remove('note-chat-msg-assistant');
      bubble.classList.add('note-chat-msg-error');
    }
  }

  _finalizeError(bubble, conv, errorMsg) {
    const text = `Error: ${errorMsg}`;
    this._finalizeBubble(bubble, text, true);
    conv.messages.push({ role: 'assistant', content: text, error: true, timestamp: new Date().toISOString() });
    this._saveConversations();
  }

  _setStreamingUI(streaming) {
    if (this.elSendBtn) this.elSendBtn.disabled = streaming;
    if (this.elCancelBtn) {
      this.elCancelBtn.style.display = streaming ? '' : 'none';
    }
  }

  _scrollToBottom() {
    if (this.elMessages) {
      this.elMessages.scrollTop = this.elMessages.scrollHeight;
    }
  }

  _renderHistoryList() {
    if (!this.elHistoryList) return;
    if (this.conversations.length === 0) {
      this.elHistoryList.innerHTML = '<div style="padding:16px;color:var(--text-tertiary);text-align:center;">No conversations</div>';
      return;
    }
    this.elHistoryList.innerHTML = this.conversations.map(c => {
      const title = this._escHtml(c.title || 'New conversation');
      const date = this._formatDate(c.createdAt);
      return `<div class="note-chat-history-item" data-conv-id="${c.id}">
        <button class="note-chat-history-item-delete" data-delete-id="${c.id}" title="Delete">&times;</button>
        <div class="note-chat-history-item-title">${title}</div>
        <div class="note-chat-history-item-date">${date}</div>
      </div>`;
    }).join('');

    // Bind click events
    this.elHistoryList.querySelectorAll('.note-chat-history-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('note-chat-history-item-delete')) return;
        const id = el.getAttribute('data-conv-id');
        this._switchConversation(id);
        if (this.elHistoryPanel) this.elHistoryPanel.classList.remove('open');
      });
    });
    this.elHistoryList.querySelectorAll('.note-chat-history-item-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-delete-id');
        this._deleteConversation(id);
      });
    });
  }

  // ---- Lightweight Markdown ----

  _renderMarkdown(text) {
    if (!text) return '';
    let html = this._escHtml(text);

    // Code blocks (``` ... ```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Unordered lists
    html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Links — only allow http(s) and anchor hrefs to prevent javascript: XSS
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      if (/^https?:\/\/|^#/.test(href)) {
        return `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
      }
      return label;
    });

    // Paragraphs: convert double newlines
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';

    // Clean up empty paragraphs and paragraphs wrapping block elements
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>(<(?:h[1-3]|pre|ul|ol|blockquote))/g, '$1');
    html = html.replace(/(<\/(?:h[1-3]|pre|ul|ol|blockquote)>)<\/p>/g, '$1');

    return html;
  }

  // ---- Utils ----

  _escHtml(s) {
    if (!s) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
    return s.replace(/[&<>"]/g, c => map[c]);
  }

  _formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  _uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}
