/**
 * Gemini 3 SDK wrapper with Function Calling tools for city operations.
 * Uses @google/genai SDK.
 */
import { GoogleGenAI, Type } from '@google/genai';
import type { Content, FunctionCall, Tool } from '@google/genai';
import * as CityAPI from './city-api';
import type { CitizenRequest } from './request-engine';

const MODEL_ID = 'gemini-3-flash-preview';

const SYSTEM_INSTRUCTION = `You are an AI Mayor assistant for a conversational city-building game.
The player builds and manages their city ENTIRELY through natural language (chat and voice). There is NO toolbar — you are the only way to build.

The city is an 8x8 grid with compass directions and labeled coordinates:
- Columns: X0 (West) → X7 (East), where X0=0, X1=1, ..., X7=7
- Rows: Y0 (North) → Y7 (South), where Y0=0, Y1=1, ..., Y7=7
- Example: "X0Y0" = northwest corner (0,0), "X7Y7" = southeast corner (7,7), "X3Y3" = (3,3)
- Players may refer to locations by label (e.g. "X3Y2"), compass direction (e.g. "北側" = Y0-Y1, "南東" = high X + high Y), or by axis (e.g. "X5列" = column x:5, "Y3行" = row y:3). The label number directly equals the coordinate value.

## CRITICAL RULE: Always check before building
**BEFORE placing ANY buildings, you MUST call get_city_state first** to see which tiles are already occupied.
- The grid shows: "." = empty, "R" = road, "H" = residential, "C" = commercial, "I" = industrial, "P" = power-plant, "L" = power-line.
- You can ONLY place buildings on empty tiles (marked ".").

## Building types
- residential: Housing zones where citizens live
- commercial: Business zones that provide jobs
- industrial: Factory zones for industry
- road: Roads for transportation (buildings need road access)
- power-plant: Generates electricity (buildings need power)
- power-line: Distributes electricity

## Game mechanics
- Buildings need both power and road access to develop
- Place power plants first, then connect with roads
- Zones develop over time when powered and road-connected

## Citizen Requests
Citizens send requests when they detect problems (housing shortage, unemployment, power outages, etc.).
- Use get_requests to see current citizen requests
- Proactively suggest solutions to the player based on requests
- When requests are fulfilled, happiness increases automatically

## Happiness System
- Use get_happiness to check the city's happiness score (0-100) and contributing factors
- Happiness is affected by: employment, power supply, population, and pending requests
- Guide the player to maximize happiness

## Building strategy
1. Call get_city_state to see the current grid
2. Build from the CENTER outward
3. Plan placement only on empty tiles, adjacent to existing roads
4. Use apply_layout for bulk placement

## Citizen Request Handling
When you receive a citizen request:
1. Call get_city_state to check the current situation
2. Create a specific construction proposal (what to build, where) and present it to the player. **Always wait for the player to approve** (e.g. "お願い", "いいよ", "yes", "OK") before executing any construction.
3. After building, call **ask_citizen** to check if the citizen is satisfied.
   - If the citizen says the problem is resolved → call **mark_request_resolved**
   - If the citizen says it's not enough → build more to address the remaining issue, then ask_citizen again
4. **CRITICAL: Once the citizen is satisfied, you MUST call mark_request_resolved.** This is mandatory — without it, the citizen cannot give their final evaluation and the system will stall.

Respond concisely. Use both English and Japanese as appropriate for the user's language.`;

export const cityTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'get_city_state',
        description: 'Get the current state of the city including all buildings, population, and statistics',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: 'place_building',
        description: 'Place a single building at the specified coordinates',
        parameters: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER, description: 'X coordinate (0-7)' },
            y: { type: Type.NUMBER, description: 'Y coordinate (0-7)' },
            type: { type: Type.STRING, description: 'Building type: residential, commercial, industrial, road, power-plant, power-line' },
          },
          required: ['x', 'y', 'type'],
        },
      },
      {
        name: 'bulldoze',
        description: 'Remove/demolish a building at the specified coordinates',
        parameters: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER, description: 'X coordinate' },
            y: { type: Type.NUMBER, description: 'Y coordinate' },
          },
          required: ['x', 'y'],
        },
      },
      {
        name: 'zone_area',
        description: 'Place buildings in a rectangular area from (x1,y1) to (x2,y2)',
        parameters: {
          type: Type.OBJECT,
          properties: {
            x1: { type: Type.NUMBER, description: 'Start X' },
            y1: { type: Type.NUMBER, description: 'Start Y' },
            x2: { type: Type.NUMBER, description: 'End X' },
            y2: { type: Type.NUMBER, description: 'End Y' },
            type: { type: Type.STRING, description: 'Building type' },
          },
          required: ['x1', 'y1', 'x2', 'y2', 'type'],
        },
      },
      {
        name: 'apply_layout',
        description: 'Apply a JSON layout to build multiple buildings at once. Supports range placement with to_x/to_y.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: 'Layout name' },
            buildings: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, description: 'Building type' },
                  x: { type: Type.NUMBER, description: 'X coordinate' },
                  y: { type: Type.NUMBER, description: 'Y coordinate' },
                  to_x: { type: Type.NUMBER, description: 'Optional end X for range placement' },
                  to_y: { type: Type.NUMBER, description: 'Optional end Y for range placement' },
                },
                required: ['type', 'x', 'y'],
              },
              description: 'Array of building placements',
            },
          },
          required: ['buildings'],
        },
      },
      {
        name: 'get_screenshot',
        description: 'Take a screenshot of the current city view for visual analysis',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: 'get_happiness',
        description: 'Get the current happiness score and contributing factors (employment, power, density, pending requests)',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: 'get_requests',
        description: 'Get active citizen requests that need to be addressed',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: 'ask_citizen',
        description: 'Ask the citizen if their request has been addressed. Checks the current city state against the request and returns whether the problem is resolved and what is still needed. Use this after building to confirm before calling mark_request_resolved.',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: 'mark_request_resolved',
        description: 'MANDATORY: Call this immediately after completing construction for a citizen request. Without this call, the citizen cannot evaluate the result and the request system stalls. Always call this as the last step after building.',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
    ],
  },
];

type MessageCallback = (text: string, isPartial: boolean) => void;
type ToolCallCallback = (toolName: string, args: any) => void;

export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private chatHistory: Content[] = [];
  private onMessage: MessageCallback;
  private onToolCall: ToolCallCallback;
  private _isBusy = false;

  get isBusy(): boolean {
    return this._isBusy;
  }

  constructor(onMessage: MessageCallback, onToolCall: ToolCallCallback) {
    this.onMessage = onMessage;
    this.onToolCall = onToolCall;
  }

  initialize(apiKey: string): boolean {
    try {
      this.ai = new GoogleGenAI({ apiKey });
      return true;
    } catch (e) {
      console.error('Failed to initialize Gemini:', e);
      return false;
    }
  }

  isInitialized(): boolean {
    return this.ai !== null;
  }

  async sendMessage(userMessage: string): Promise<string> {
    if (!this.ai) throw new Error('Gemini not initialized');

    this._isBusy = true;
    this.chatHistory.push({
      role: 'user',
      parts: [{ text: userMessage }],
    });

    try {
      return await this.generateAndHandleTools();
    } finally {
      this._isBusy = false;
    }
  }

  async sendMessageWithImage(userMessage: string, imageBase64: string): Promise<string> {
    if (!this.ai) throw new Error('Gemini not initialized');

    // Strip data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    this.chatHistory.push({
      role: 'user',
      parts: [
        { text: userMessage },
        { inlineData: { mimeType: 'image/png', data: base64Data } },
      ],
    });

    return this.generateAndHandleTools();
  }

  private async generateAndHandleTools(): Promise<string> {
    if (!this.ai) throw new Error('Gemini not initialized');

    let maxIterations = 10;

    while (maxIterations-- > 0) {
      let response;
      try {
        response = await this.ai.models.generateContent({
          model: MODEL_ID,
          contents: this.chatHistory,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: cityTools,
          },
        });
      } catch (apiErr: any) {
        console.error('[Gemini] API call failed:', apiErr);
        return `API Error: ${apiErr.message || apiErr}`;
      }

      console.log('[Gemini] Response:', JSON.stringify(response).substring(0, 500));

      const candidate = response.candidates?.[0];
      if (!candidate?.content?.parts) {
        console.warn('[Gemini] No candidates in response:', response);
        return 'No response from AI';
      }

      // Add the model's response to history
      this.chatHistory.push(candidate.content);

      // Check for function calls
      const functionCalls = candidate.content.parts.filter(
        (p: any) => p.functionCall
      );

      if (functionCalls.length === 0) {
        // Pure text response
        const text = candidate.content.parts
          .filter((p: any) => p.text)
          .map((p: any) => p.text)
          .join('');
        return text || 'Done!';
      }

      // Execute function calls
      const functionResponses: any[] = [];

      for (const part of functionCalls) {
        const fc = (part as any).functionCall as FunctionCall;
        const name = fc.name!;
        const args = fc.args || {};

        this.onToolCall(name, args);

        let result: any;
        try {
          result = this.executeTool(name, args);
        } catch (e: any) {
          result = { error: e.message };
        }

        functionResponses.push({
          functionResponse: {
            name,
            response: result,
          },
        });
      }

      // Add tool results to history
      this.chatHistory.push({
        role: 'user',
        parts: functionResponses,
      });
    }

    return 'Reached maximum tool call iterations';
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
      case 'get_happiness':
        return CityAPI.getHappiness();
      case 'get_requests':
        return CityAPI.getActiveRequests();
      case 'ask_citizen': {
        const engine = (window as any).requestEngine;
        if (!engine) return { error: 'Request engine not available' };
        const status = engine.checkRequestStatus();
        if (!status.request) return { message: status.detail };
        // Use suggestion directly — no nested API call, fast and reliable
        const citizenMsg = status.resolved
          ? `市長、ありがとうございます！おかげで改善されました。`
          : status.suggestion;
        // Show citizen response in chat (voice is NOT triggered here to avoid blocking the tool loop)
        const panel = (window as any).chatPanel;
        if (panel) panel.addMessage('system', `🗣️ ${status.request.citizenName}: ${citizenMsg}`);
        return {
          citizenName: status.request.citizenName,
          requestType: status.request.type,
          resolved: status.resolved,
          citizenResponse: citizenMsg,
          detail: status.detail,
          hint: status.resolved
            ? 'The citizen is satisfied. You should now call mark_request_resolved.'
            : `Not resolved yet. Citizen says: ${status.suggestion}`,
        };
      }
      case 'mark_request_resolved':
        (window as any).requestEngine?.markResolved();
        return { success: true, message: 'Request marked as resolved. Citizen evaluation will follow.' };
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  /**
   * Send a citizen request to the mayor for a construction proposal.
   * The message enters the chat history so the mayor can follow up.
   */
  async proposeForRequest(request: CitizenRequest): Promise<string> {
    const prompt = `市民から以下のリクエストがありました。都市の現状を確認し、具体的な建設提案をプレイヤーに提示してください。
プレイヤーが承認するまで建設を実行しないでください。
承認後に建設を実行し、ask_citizen で市民に確認してください。
市民が満足したら mark_request_resolved を呼んでください。まだ不十分なら追加で建設してください。

リクエスト:
- 市民名: ${request.citizenName}
- 種類: ${request.type}
- メッセージ: 「${request.message}」`;

    return this.sendMessage(prompt);
  }

  clearHistory(): void {
    this.chatHistory = [];
  }
}
