/**
 * Proactive AI Advisor that periodically analyzes the city
 * using multimodal (screenshot + state) and provides suggestions.
 */
import { GeminiService } from './gemini-service';
import { ChatPanel } from './chat-panel';
import * as CityAPI from './city-api';

const ADVISOR_INTERVAL_MS = 30000; // 30 seconds
const MIN_BUILDINGS_FOR_ADVICE = 1;
const MIN_TIME_BETWEEN_ADVICE_MS = 60000; // 60 seconds

export class Advisor {
  private gemini: GeminiService;
  private chatPanel: ChatPanel;
  private lastAdviceTime = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isAnalyzing = false;

  constructor(gemini: GeminiService, chatPanel: ChatPanel) {
    this.gemini = gemini;
    this.chatPanel = chatPanel;
  }

  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.checkAndAdvise(), ADVISOR_INTERVAL_MS);
    console.log('[Advisor] Started periodic analysis');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async checkAndAdvise(): Promise<void> {
    if (this.isAnalyzing) return;
    if (!this.gemini.isInitialized()) return;

    const now = Date.now();
    if (now - this.lastAdviceTime < MIN_TIME_BETWEEN_ADVICE_MS) return;

    // Check if chat input is focused (user is typing)
    const inputEl = document.getElementById('chat-input');
    if (inputEl && document.activeElement === inputEl) return;

    const state = CityAPI.getCityState();
    if (!state || state.buildingCount < MIN_BUILDINGS_FOR_ADVICE) return;

    this.isAnalyzing = true;

    try {
      const screenshot = CityAPI.getScreenshot();
      if (!screenshot) return;

      const prompt = `You are analyzing this city as an AI advisor.
Current stats: ${state.buildingCount} buildings, population ${state.population}, simTime ${state.simTime}.
Building breakdown: ${JSON.stringify(countByType(state.buildings))}.

Give ONE brief, actionable suggestion (1-2 sentences) to improve the city.
Focus on the most impactful issue (missing power, no roads, unbalanced zones, etc).
Do NOT use any tools. Just give advice.`;

      const response = await this.gemini.sendMessageWithImage(prompt, screenshot);
      this.chatPanel.addMessage('advisor', response);
      this.lastAdviceTime = Date.now();
    } catch (err: any) {
      console.warn('[Advisor] Analysis failed:', err.message);
    } finally {
      this.isAnalyzing = false;
    }
  }
}

function countByType(buildings: Array<{ type: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const b of buildings) {
    counts[b.type] = (counts[b.type] || 0) + 1;
  }
  return counts;
}
