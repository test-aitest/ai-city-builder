/**
 * AI system entry point.
 * Initializes Gemini service, chat panel, API bridge, request engine, and advisor.
 */
import { GeminiService } from './gemini-service';
import { ChatPanel } from './chat-panel';
import { Advisor } from './advisor';
import { CitizenChatDialog } from './citizen-chat';
import { CitizenVoice } from './citizen-voice';
import { VoiceSession } from './voice-session';
import { RequestEngine } from './request-engine';
import { initApiBridge } from '../api-bridge';

let geminiService: GeminiService;
let chatPanel: ChatPanel;
let advisor: Advisor;
let citizenChat: CitizenChatDialog;
let citizenVoice: CitizenVoice;
let voiceSession: VoiceSession;
let requestEngine: RequestEngine;

export function initialize(game: any): void {
  // Initialize the API bridge for Claude Code connectivity
  initApiBridge();

  // Create chat panel
  chatPanel = new ChatPanel();

  // Create Gemini service
  geminiService = new GeminiService(
    (text: string, isPartial: boolean) => {
      if (!isPartial) {
        chatPanel.addMessage('ai', text);
      }
    },
    (toolName: string, args: any) => {
      chatPanel.showToolExecution(toolName, args);
    }
  );

  // Create advisor
  advisor = new Advisor(geminiService, chatPanel);

  // Wire up the chat panel to send messages through Gemini
  chatPanel.setSendMessageFn(async (message: string) => {
    if (!geminiService.isInitialized()) {
      chatPanel.addMessage('system', 'VITE_GEMINI_API_KEY が設定されていません。.env ファイルを確認してください。');
      return;
    }

    const response = await geminiService.sendMessage(message);
    chatPanel.addMessage('ai', response);
  });

  // Create citizen voice (Gemini Live API native audio)
  citizenVoice = new CitizenVoice();

  // Create citizen chat dialog
  citizenChat = new CitizenChatDialog();
  citizenChat.setVoice(citizenVoice);
  (window as any).citizenChat = citizenChat;

  // Create voice session
  voiceSession = new VoiceSession(
    (status) => chatPanel.updateVoiceStatus(status),
    (text, role) => chatPanel.addMessage(role === 'ai' ? 'ai' : 'user', text),
  );
  chatPanel.setMicToggleFn(() => voiceSession.toggle());

  // Create request engine with notify callback
  requestEngine = new RequestEngine(game.city, async (message, type, spokenText) => {
    if (type === 'fulfilled') {
      chatPanel.addMessage('system', `\u2705 ${message}`);
    } else if (type === 'failed') {
      chatPanel.addMessage('system', `\u26A0\uFE0F ${message}`);
    } else {
      chatPanel.addMessage('system', message);
    }
    // Speak the citizen's words aloud — await so mayor waits for citizen to finish
    if (spokenText) {
      await citizenChat.speakAsCitizen(spokenText);
    }
    // When a new request arrives, ask the mayor for a proposal (after citizen finishes speaking)
    if (type === 'new' && geminiService.isInitialized()) {
      const req = requestEngine.getCurrentRequest();
      if (req) {
        const proposal = await geminiService.proposeForRequest(req);
        chatPanel.addMessage('ai', proposal);
      }
    }
  });
  (window as any).requestEngine = requestEngine;
  (window as any).chatPanel = chatPanel;
  (window as any).citizenChatDialog = citizenChat;

  // Set the evaluation callback — citizen feedback is already handled by ask_citizen tool
  // This just logs the happiness change
  requestEngine.setEvaluateFn(async (request, _snapshotBefore, _snapshotAfter, happinessDelta) => {
    const deltaStr = happinessDelta >= 0 ? `+${happinessDelta}` : `${happinessDelta}`;
    console.log(`[RequestEngine] Evaluation complete: ${request.citizenName} (happiness ${deltaStr})`);
  });

  // Drive the request engine on a 1-second interval, matching the sim tick rate.
  // NOTE: We cannot patch game.simulate because setInterval already captured a
  // bound reference before ai.initialize() runs.
  setInterval(() => {
    requestEngine.onCityChanged();
  }, 1000);

  // Show welcome message
  chatPanel.showWelcome();

  // Initialize with env variable
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (apiKey) {
    geminiService.initialize(apiKey);
    citizenChat.initialize(apiKey);
    citizenVoice.initialize(apiKey);
    voiceSession.initialize(apiKey);
    chatPanel.addMessage('system', 'Gemini API connected.');
    advisor.start();
  } else {
    chatPanel.addMessage('system', 'VITE_GEMINI_API_KEY が未設定です。.env にキーを追加してサーバーを再起動してください。');
  }

  console.log('[AI] System initialized');
}

export function getGeminiService(): GeminiService {
  return geminiService;
}

export function getChatPanel(): ChatPanel {
  return chatPanel;
}
