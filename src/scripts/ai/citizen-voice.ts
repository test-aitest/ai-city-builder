/**
 * Citizen Voice — Gemini Live API session dedicated to speaking citizen text aloud.
 * Keeps a persistent connection and converts text to native AI audio.
 */
import { GoogleGenAI, Modality, Session } from '@google/genai';
import type { LiveServerMessage } from '@google/genai';
import { waitForSilence, setCitizenSpeaking } from './speech-coordinator';

const LIVE_MODEL = 'gemini-2.5-flash-native-audio-latest';

const SYSTEM_INSTRUCTION = `You are the voice of a city citizen in a city-building game.
Your ONLY job is to read aloud the text the user sends you.
Do NOT add commentary, opinions, or extra words.
Read it naturally and expressively, as a concerned citizen would speak.
Use the same language as the input text.
Keep it short — just read what is given.`;

export class CitizenVoice {
  private ai: GoogleGenAI | null = null;
  private session: Session | null = null;
  private playbackQueue: Float32Array[] = [];
  private isPlaying = false;
  private isConnected = false;
  private connectingPromise: Promise<void> | null = null;
  private turnResolve: (() => void) | null = null;
  private playbackDoneResolve: (() => void) | null = null;

  initialize(apiKey: string): void {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async speak(text: string): Promise<void> {
    if (!this.ai) return;

    // Clear own state, then wait for mayor to finish
    setCitizenSpeaking(false);
    await waitForSilence();
    setCitizenSpeaking(true);

    try {
      await this.ensureConnected();
      if (!this.session || !this.isConnected) {
        setCitizenSpeaking(false);
        return;
      }

      this.playbackQueue = [];
      this.isPlaying = false;

      // Wait for the model to finish its turn (all audio chunks received)
      const turnDone = new Promise<void>(resolve => {
        this.turnResolve = resolve;
      });

      this.session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      });

      await turnDone;

      // Wait for audio playback to finish
      await this.waitForPlaybackDone();
    } catch (err) {
      console.warn('[CitizenVoice] Speak failed:', err);
    } finally {
      setCitizenSpeaking(false);
    }
  }

  disconnect(): void {
    this.isConnected = false;
    if (this.session) {
      try { this.session.close(); } catch (_) { /* ignore */ }
      this.session = null;
    }
    this.playbackQueue = [];
    this.isPlaying = false;
    this.connectingPromise = null;
    setCitizenSpeaking(false);
  }

  private async ensureConnected(): Promise<void> {
    if (this.isConnected && this.session) return;
    if (this.connectingPromise) return this.connectingPromise;

    this.connectingPromise = this.doConnect();
    try {
      await this.connectingPromise;
    } finally {
      this.connectingPromise = null;
    }
  }

  private async doConnect(): Promise<void> {
    if (!this.ai) return;

    try {
      this.session = await this.ai.live.connect({
        model: LIVE_MODEL,
        callbacks: {
          onopen: () => console.log('[CitizenVoice] Connected'),
          onmessage: (msg: LiveServerMessage) => this.handleMessage(msg),
          onerror: (e: ErrorEvent) => console.error('[CitizenVoice] Error:', e.message || e),
          onclose: () => {
            console.log('[CitizenVoice] Disconnected');
            this.isConnected = false;
            this.session = null;
            // Resolve any pending waits so they don't hang
            if (this.turnResolve) { this.turnResolve(); this.turnResolve = null; }
            if (this.playbackDoneResolve) { this.playbackDoneResolve(); this.playbackDoneResolve = null; }
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION,
        },
      });
      this.isConnected = true;
    } catch (err) {
      console.error('[CitizenVoice] Connection failed:', err);
      this.isConnected = false;
    }
  }

  private handleMessage(msg: LiveServerMessage): void {
    if (!msg.serverContent) return;

    const parts = msg.serverContent.modelTurn?.parts;
    if (parts) {
      for (const part of parts) {
        if ((part as any).inlineData?.data) {
          const audioData = (part as any).inlineData;
          if (audioData.mimeType?.includes('audio')) {
            this.enqueueAudio(audioData.data);
          }
        }
      }
    }

    if (msg.serverContent.turnComplete) {
      this.drainPlaybackQueue();
      if (this.turnResolve) {
        this.turnResolve();
        this.turnResolve = null;
      }
    }
  }

  private enqueueAudio(base64Data: string): void {
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    this.playbackQueue.push(float32);
    if (!this.isPlaying) {
      this.drainPlaybackQueue();
    }
  }

  private drainPlaybackQueue(): void {
    if (this.playbackQueue.length === 0) {
      this.isPlaying = false;
      if (this.playbackDoneResolve) {
        this.playbackDoneResolve();
        this.playbackDoneResolve = null;
      }
      return;
    }

    this.isPlaying = true;

    const totalLength = this.playbackQueue.reduce((sum, arr) => sum + arr.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.playbackQueue) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.playbackQueue = [];

    const playCtx = new AudioContext({ sampleRate: 24000 });
    const buffer = playCtx.createBuffer(1, merged.length, 24000);
    buffer.getChannelData(0).set(merged);

    const source = playCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(playCtx.destination);

    source.onended = () => {
      playCtx.close();
      if (this.playbackQueue.length > 0) {
        this.drainPlaybackQueue();
      } else {
        this.isPlaying = false;
        if (this.playbackDoneResolve) {
          this.playbackDoneResolve();
          this.playbackDoneResolve = null;
        }
      }
    };

    source.start();
  }

  private waitForPlaybackDone(): Promise<void> {
    if (!this.isPlaying && this.playbackQueue.length === 0) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this.playbackDoneResolve = resolve;
    });
  }
}
