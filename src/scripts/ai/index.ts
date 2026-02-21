/**
 * AI system entry point.
 * Initializes Gemini service, chat panel, API bridge, and advisor.
 */
import { GeminiService } from './gemini-service';
import { ChatPanel } from './chat-panel';
import { Advisor } from './advisor';
import { CitizenChatDialog } from './citizen-chat';
import { VoiceSession } from './voice-session';
import { initApiBridge } from '../api-bridge';

let geminiService: GeminiService;
let chatPanel: ChatPanel;
let advisor: Advisor;
let citizenChat: CitizenChatDialog;
let voiceSession: VoiceSession;

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

  // Create citizen chat dialog
  citizenChat = new CitizenChatDialog();
  (window as any).citizenChat = citizenChat;

  // Create voice session
  voiceSession = new VoiceSession(
    (status) => chatPanel.updateVoiceStatus(status),
    (text, role) => chatPanel.addMessage(role === 'ai' ? 'ai' : 'user', text),
  );
  chatPanel.setMicToggleFn(() => voiceSession.toggle());

  // Show welcome message
  chatPanel.showWelcome();

  // Initialize with env variable
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (apiKey) {
    geminiService.initialize(apiKey);
    citizenChat.initialize(apiKey);
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
