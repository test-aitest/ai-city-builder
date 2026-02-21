/**
 * Chat UI panel for interacting with the AI Mayor.
 * Renders messages, handles input, displays tool execution progress.
 */

export type SendMessageFn = (message: string) => Promise<void>;

interface ChatMessage {
  role: 'user' | 'ai' | 'system' | 'advisor';
  text: string;
  timestamp: number;
}

export type MicToggleFn = () => Promise<void>;

export class ChatPanel {
  private messagesEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private sendBtn: HTMLElement;
  private micBtn: HTMLElement;
  private quickBtns: NodeListOf<Element>;
  private sendMessageFn: SendMessageFn | null = null;
  private micToggleFn: MicToggleFn | null = null;
  private isProcessing = false;

  constructor() {
    this.messagesEl = document.getElementById('chat-messages')!;
    this.inputEl = document.getElementById('chat-input') as HTMLInputElement;
    this.sendBtn = document.getElementById('chat-send')!;
    this.micBtn = document.getElementById('chat-mic')!;
    this.quickBtns = document.querySelectorAll('.chat-quick-btn');

    this.setupEventListeners();
  }

  setSendMessageFn(fn: SendMessageFn): void {
    this.sendMessageFn = fn;
  }

  setMicToggleFn(fn: MicToggleFn): void {
    this.micToggleFn = fn;
  }

  updateVoiceStatus(status: 'idle' | 'connecting' | 'listening' | 'speaking'): void {
    this.micBtn.classList.remove('voice-connecting', 'voice-listening', 'voice-speaking');
    if (status !== 'idle') {
      this.micBtn.classList.add(`voice-${status}`);
    }
  }

  private setupEventListeners(): void {
    // Send on click
    this.sendBtn.addEventListener('click', () => this.handleSend());

    // Mic toggle
    this.micBtn.addEventListener('click', () => {
      if (this.micToggleFn) this.micToggleFn();
    });

    // Send on Enter
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    // Quick action buttons
    this.quickBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const action = (e.target as HTMLElement).dataset.action;
        this.handleQuickAction(action || '');
      });
    });

    // Prevent game input events when typing in chat
    this.inputEl.addEventListener('mousedown', (e) => e.stopPropagation());
    this.inputEl.addEventListener('keydown', (e) => e.stopPropagation());
  }

  private async handleSend(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.isProcessing) return;

    this.inputEl.value = '';
    this.addMessage('user', text);

    await this.processMessage(text);
  }

  private async handleQuickAction(action: string): Promise<void> {
    if (this.isProcessing) return;

    const messages: Record<string, string> = {
      happiness: 'Check the current happiness score and tell me how to improve it.',
      starter: 'Build me a starter town with roads, power, and mixed zones.',
      requests: 'Show me the current citizen requests and suggest how to address them.',
    };

    const text = messages[action] || action;
    this.addMessage('user', text);
    await this.processMessage(text);
  }

  private async processMessage(text: string): Promise<void> {
    if (!this.sendMessageFn) {
      this.addMessage('system', 'AI not initialized. Please enter your Gemini API key.');
      return;
    }

    this.isProcessing = true;
    this.setInputEnabled(false);
    this.showTypingIndicator();

    try {
      await this.sendMessageFn(text);
    } catch (err: any) {
      this.addMessage('system', `Error: ${err.message}`);
    } finally {
      this.hideTypingIndicator();
      this.isProcessing = false;
      this.setInputEnabled(true);
      this.inputEl.focus();
    }
  }

  addMessage(role: 'user' | 'ai' | 'system' | 'advisor', text: string): void {
    const msg: ChatMessage = { role, text, timestamp: Date.now() };
    const el = document.createElement('div');
    el.className = `chat-message chat-message-${role}`;

    // Parse markdown-style formatting (bold, code)
    const formatted = text
      .replace(/```([\s\S]*?)```/g, '<pre class="chat-code-block">$1</pre>')
      .replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

    el.innerHTML = `
      <div class="chat-bubble chat-bubble-${role}">
        ${formatted}
      </div>
    `;

    // Fade-in animation
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    this.messagesEl.appendChild(el);

    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.3s, transform 0.3s';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });

    this.scrollToBottom();
  }

  showToolExecution(toolName: string, args: any): void {
    const el = document.createElement('div');
    el.className = 'chat-tool-execution';

    const displayName = toolName.replace(/_/g, ' ');
    const argsStr = Object.entries(args)
      .filter(([k, v]) => !(k === 'buildings' && Array.isArray(v)))
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v).substring(0, 50) : v}`)
      .join(', ');

    el.innerHTML = `
      <span class="tool-icon">&#9881;</span>
      <span class="tool-name">${displayName}</span>
      <span class="tool-args">${argsStr}</span>
    `;

    this.messagesEl.appendChild(el);
    this.scrollToBottom();
  }

  private showTypingIndicator(): void {
    let indicator = document.getElementById('typing-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'typing-indicator';
      indicator.className = 'chat-typing';
      indicator.innerHTML = `
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      `;
      this.messagesEl.appendChild(indicator);
    }
    indicator.style.display = 'flex';
    this.scrollToBottom();
  }

  private hideTypingIndicator(): void {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
  }

  private setInputEnabled(enabled: boolean): void {
    this.inputEl.disabled = !enabled;
    (this.sendBtn as HTMLButtonElement).disabled = !enabled;
    this.quickBtns.forEach((btn) => {
      (btn as HTMLButtonElement).disabled = !enabled;
    });
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });
  }

  showWelcome(): void {
    this.addMessage('ai',
      `**AI City Builder** へようこそ！チャットか音声で街づくりしましょう。\n\n` +
      `すべての建設は会話で行います:\n` +
      `- 「スターターの街を作って」\n` +
      `- 「北側に住宅地を追加して」\n` +
      `- 「幸福度をチェックして」\n\n` +
      `市民のリクエストに応えて幸福度を上げてください！`
    );
  }
}
