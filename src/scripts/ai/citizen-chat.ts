/**
 * Citizen Chat Dialog - Click a citizen to open a conversation powered by Gemini.
 * Each citizen has a unique personality based on their state, age, and workplace.
 * Voice is provided by CitizenVoice (Gemini Live API native audio).
 */
import { GoogleGenAI } from '@google/genai';
import type { Content } from '@google/genai';
import * as CityAPI from './city-api';
import type { CitizenVoice } from './citizen-voice';

const MODEL_ID = 'gemini-3-flash-preview';

interface CitizenInfo {
  id: string;
  name: string;
  age: number;
  state: string;
  workplace: any;
  residence: any;
}

export class CitizenChatDialog {
  private ai: GoogleGenAI | null = null;
  private dialogEl: HTMLElement;
  private messagesEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private nameEl: HTMLElement;
  private chatHistory: Content[] = [];
  private currentCitizen: CitizenInfo | null = null;
  private isProcessing = false;
  private voice: CitizenVoice | null = null;

  constructor() {
    this.dialogEl = this.createDOM();
    document.body.appendChild(this.dialogEl);

    this.messagesEl = this.dialogEl.querySelector('.citizen-chat-messages')!;
    this.inputEl = this.dialogEl.querySelector('.citizen-chat-input') as HTMLInputElement;
    this.nameEl = this.dialogEl.querySelector('.citizen-chat-name')!;

    this.setupEvents();
  }

  initialize(apiKey: string): void {
    this.ai = new GoogleGenAI({ apiKey });
  }

  /** Set the CitizenVoice instance for audio playback */
  setVoice(voice: CitizenVoice): void {
    this.voice = voice;
  }

  /** Speak text aloud using Gemini Live API citizen voice. Can be called externally. */
  async speakAsCitizen(text: string): Promise<void> {
    if (this.voice) {
      await this.voice.speak(text);
    }
  }

  private createDOM(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'citizen-chat-dialog';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="citizen-chat-backdrop"></div>
      <div class="citizen-chat-panel">
        <div class="citizen-chat-header">
          <span class="citizen-chat-name"></span>
          <button class="citizen-chat-close">&times;</button>
        </div>
        <div class="citizen-chat-messages"></div>
        <div class="citizen-chat-input-area">
          <input type="text" class="citizen-chat-input" placeholder="Talk to this citizen..." autocomplete="off" />
          <button class="citizen-chat-send">Send</button>
        </div>
      </div>
    `;
    return el;
  }

  private setupEvents(): void {
    this.dialogEl.querySelector('.citizen-chat-close')!.addEventListener('click', () => this.close());
    this.dialogEl.querySelector('.citizen-chat-backdrop')!.addEventListener('click', () => this.close());
    this.dialogEl.querySelector('.citizen-chat-send')!.addEventListener('click', () => this.handleSend());
    this.inputEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleSend();
      }
    });
    this.inputEl.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  open(citizen: CitizenInfo, building: any): void {
    this.currentCitizen = citizen;
    this.chatHistory = [];
    this.messagesEl.innerHTML = '';
    this.nameEl.textContent = `${citizen.name} (${citizen.state})`;
    this.dialogEl.style.display = '';

    // Show greeting based on state
    const greeting = this.getGreeting(citizen);
    this.addBubble('citizen', greeting);
    this.speakAsCitizen(greeting);

    this.inputEl.focus();
  }

  close(): void {
    this.dialogEl.style.display = 'none';
    this.currentCitizen = null;
    this.chatHistory = [];
  }

  private getGreeting(citizen: CitizenInfo): string {
    switch (citizen.state) {
      case 'unemployed':
        return `Hi, I'm ${citizen.name}. Been looking for work around here but no luck so far...`;
      case 'employed':
        return `Hey there! I'm ${citizen.name}. Just got back from work. What's on your mind?`;
      case 'school':
        return `Hi! I'm ${citizen.name}. I'm ${citizen.age} years old and go to school nearby!`;
      case 'retired':
        return `Hello, dear. I'm ${citizen.name}. I've been watching this city grow for years now.`;
      default:
        return `Hello! I'm ${citizen.name}. Nice to meet you, Mayor!`;
    }
  }

  private buildSystemPrompt(citizen: CitizenInfo): string {
    const cityState = CityAPI.getCityState();
    const workplaceInfo = citizen.workplace
      ? `You work at a ${citizen.workplace.type} building.`
      : '';

    return `You are ${citizen.name}, a ${citizen.age}-year-old citizen living in a simulated city.
Your current status: ${citizen.state}. ${workplaceInfo}

City stats: Population ${cityState.population}, ${cityState.buildingCount} buildings.

Personality guidelines based on your status:
${citizen.state === 'unemployed' ? '- You are frustrated about not having a job. You wish the mayor would build more commercial or industrial zones.' : ''}
${citizen.state === 'employed' ? '- You enjoy your work but sometimes complain about the commute. You appreciate the city infrastructure.' : ''}
${citizen.state === 'school' ? '- You are a young student. You talk about school, friends, and fun things in the neighborhood.' : ''}
${citizen.state === 'retired' ? '- You are nostalgic and wise. You comment on how the city has grown and share life advice.' : ''}

Rules:
- Stay in character as this citizen at all times
- Keep responses short (1-3 sentences)
- Speak casually like a real person
- You can mention other citizens or city features
- If asked about city problems, share your perspective as a resident
- Respond in the same language the user uses (English or Japanese)`;
  }

  private async handleSend(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.isProcessing || !this.currentCitizen) return;

    this.inputEl.value = '';
    this.addBubble('user', text);

    if (!this.ai) {
      this.addBubble('citizen', 'Sorry, the AI service is not available right now.');
      return;
    }

    this.isProcessing = true;

    this.chatHistory.push({ role: 'user', parts: [{ text }] });

    try {
      const response = await this.ai.models.generateContent({
        model: MODEL_ID,
        contents: this.chatHistory,
        config: {
          systemInstruction: this.buildSystemPrompt(this.currentCitizen),
        },
      });

      const reply = response.candidates?.[0]?.content?.parts
        ?.filter((p: any) => p.text)
        .map((p: any) => p.text)
        .join('') || '...';

      this.chatHistory.push({ role: 'model', parts: [{ text: reply }] });
      this.addBubble('citizen', reply);
      this.speakAsCitizen(reply);
    } catch (err: any) {
      this.addBubble('citizen', `(Error: ${err.message})`);
    } finally {
      this.isProcessing = false;
    }
  }

  private addBubble(role: 'user' | 'citizen', text: string): void {
    const el = document.createElement('div');
    el.className = `citizen-bubble citizen-bubble-${role}`;
    el.textContent = text;
    this.messagesEl.appendChild(el);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }
}
