/**
 * Voice Session Manager - Gemini Live API for voice-based mayor interaction.
 * Handles WebSocket session, audio I/O via Web Audio API, and function calling.
 */
import { GoogleGenAI, Modality, Session } from '@google/genai';
import type { LiveServerMessage, FunctionResponse } from '@google/genai';
import { cityTools } from './gemini-service';
import * as CityAPI from './city-api';

const LIVE_MODEL = 'gemini-2.5-flash-native-audio-latest';

const SYSTEM_INSTRUCTION = `You are the AI Mayor of a city-building game. Players talk to you by voice.
You help build and manage the city using the available tools.

The city is an 8x8 grid (0,0 top-left to 7,7 bottom-right).
Always call get_city_state before placing buildings to check what's occupied.
Building types: residential, commercial, industrial, road, power-plant, power-line.

Keep voice responses short and natural (1-2 sentences).
Respond in the same language the user speaks (English or Japanese).`;

export type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'speaking';
type StatusCallback = (status: VoiceStatus) => void;
type TranscriptCallback = (text: string, role: 'user' | 'ai') => void;

export class VoiceSession {
  private ai: GoogleGenAI | null = null;
  private session: Session | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private playbackQueue: Float32Array[] = [];
  private isPlaying = false;
  private status: VoiceStatus = 'idle';
  private onStatus: StatusCallback;
  private onTranscript: TranscriptCallback;
  private isConnected = false;
  private audioChunksSent = 0;

  constructor(onStatus: StatusCallback, onTranscript: TranscriptCallback) {
    this.onStatus = onStatus;
    this.onTranscript = onTranscript;
  }

  initialize(apiKey: string): void {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async toggle(): Promise<void> {
    if (this.status === 'idle') {
      await this.connect();
    } else {
      this.disconnect();
    }
  }

  private async connect(): Promise<void> {
    if (!this.ai) return;

    this.setStatus('connecting');
    this.isConnected = false;
    this.audioChunksSent = 0;

    try {
      // Get mic permission FIRST, before opening the WebSocket
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      this.mediaStream = mediaStream;

      this.session = await this.ai.live.connect({
        model: LIVE_MODEL,
        callbacks: {
          onopen: () => {
            console.log('[Voice] WebSocket opened');
          },
          onmessage: (msg: LiveServerMessage) => {
            if (msg.setupComplete) {
              console.log('[Voice] Setup complete');
            }
            this.handleMessage(msg);
          },
          onerror: (e: ErrorEvent) => {
            console.error('[Voice] WebSocket error:', e.message || e);
          },
          onclose: (e: CloseEvent) => {
            console.log(`[Voice] WebSocket closed: ${e.code} ${e.reason} (sent ${this.audioChunksSent} chunks)`);
            this.isConnected = false;
            this.stopMicrophone();
            this.setStatus('idle');
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: cityTools,
        },
      });

      // Session established - now start sending audio
      this.isConnected = true;
      console.log('[Voice] Session established, starting audio capture');
      this.startAudioCapture();
      this.setStatus('listening');
    } catch (err: any) {
      console.error('[Voice] Connection failed:', err?.message || err);
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(t => t.stop());
        this.mediaStream = null;
      }
      this.setStatus('idle');
    }
  }

  disconnect(): void {
    this.isConnected = false;
    this.stopMicrophone();

    if (this.session) {
      try { this.session.close(); } catch (_) { /* ignore */ }
      this.session = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.playbackQueue = [];
    this.isPlaying = false;
    this.setStatus('idle');
  }

  private startAudioCapture(): void {
    if (!this.mediaStream) return;

    try {
      this.audioContext = new AudioContext({ sampleRate: 16000 });

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.scriptNode = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.scriptNode.onaudioprocess = (e) => {
        if (!this.session || !this.isConnected) return;

        const float32 = e.inputBuffer.getChannelData(0);
        // Convert Float32 to 16-bit PCM
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        const base64 = this.arrayBufferToBase64(int16.buffer);
        try {
          this.session.sendRealtimeInput({
            audio: {
              data: base64,
              mimeType: 'audio/pcm;rate=16000',
            } as any,
          });
          this.audioChunksSent++;
          if (this.audioChunksSent <= 3) {
            console.log(`[Voice] Audio chunk #${this.audioChunksSent} sent (${base64.length} bytes base64)`);
          }
        } catch (sendErr) {
          console.warn('[Voice] Send failed, stopping');
          this.isConnected = false;
        }
      };

      this.sourceNode.connect(this.scriptNode);
      // Connect to destination (required for ScriptProcessorNode to fire)
      this.scriptNode.connect(this.audioContext.destination);
    } catch (err) {
      console.error('[Voice] Audio capture setup failed:', err);
      this.disconnect();
    }
  }

  private stopMicrophone(): void {
    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
  }

  private handleMessage(msg: LiveServerMessage): void {
    // Handle tool calls
    if (msg.toolCall?.functionCalls) {
      console.log('[Voice] Received tool call');
      this.handleToolCalls(msg.toolCall.functionCalls);
      return;
    }

    // Handle server content
    if (msg.serverContent) {
      const parts = msg.serverContent.modelTurn?.parts;
      if (parts) {
        for (const part of parts) {
          // Text transcript
          if ((part as any).text) {
            console.log('[Voice] Received text:', (part as any).text);
            this.onTranscript((part as any).text, 'ai');
          }
          // Audio data
          if ((part as any).inlineData?.data) {
            const audioData = (part as any).inlineData;
            if (audioData.mimeType?.includes('audio')) {
              console.log(`[Voice] Received audio chunk (${audioData.data.length} bytes)`);
              this.setStatus('speaking');
              this.enqueueAudio(audioData.data);
            }
          }
        }
      }

      if (msg.serverContent.interrupted) {
        console.log('[Voice] Interrupted');
        this.playbackQueue = [];
      }

      if (msg.serverContent.turnComplete) {
        console.log('[Voice] Turn complete');
        this.drainPlaybackQueue();
        setTimeout(() => {
          if (this.status === 'speaking' && this.isConnected) {
            this.setStatus('listening');
          }
        }, 500);
      }
    }
  }

  private async handleToolCalls(functionCalls: any[]): Promise<void> {
    const responses: FunctionResponse[] = [];

    for (const fc of functionCalls) {
      const name = fc.name;
      const args = fc.args || {};

      console.log(`[Voice] Tool call: ${name}`, args);
      this.onTranscript(`[Tool: ${name}]`, 'ai');

      let result: any;
      try {
        result = this.executeTool(name, args);
      } catch (e: any) {
        result = { error: e.message };
      }

      responses.push({
        name,
        response: result,
        id: fc.id,
      } as FunctionResponse);
    }

    if (this.session && this.isConnected) {
      try {
        this.session.sendToolResponse({ functionResponses: responses });
      } catch (err) {
        console.warn('[Voice] Failed to send tool response:', err);
      }
    }
  }

  private executeTool(name: string, args: any): any {
    switch (name) {
      case 'get_city_state':
        return CityAPI.getCityState();
      case 'place_building':
        return CityAPI.placeBuilding(args.x, args.y, args.type);
      case 'bulldoze':
        return CityAPI.bulldoze(args.x, args.y);
      case 'zone_area':
        return CityAPI.zoneArea(args.x1, args.y1, args.x2, args.y2, args.type);
      case 'apply_layout':
        return CityAPI.applyLayout({ name: args.name, buildings: args.buildings });
      case 'get_screenshot':
        return { screenshot: CityAPI.getScreenshot() };
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  private enqueueAudio(base64Data: string): void {
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Convert 16-bit PCM to Float32
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
        if (this.session && this.isConnected) {
          this.setStatus('listening');
        }
      }
    };

    source.start();
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private setStatus(status: VoiceStatus): void {
    this.status = status;
    this.onStatus(status);
  }
}
