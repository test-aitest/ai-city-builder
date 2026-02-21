/**
 * Browser-side API bridge that receives commands from the Vite middleware
 * via HMR WebSocket and executes them using the City API.
 */
import { handleCommand } from './ai/city-api';

interface CityCommand {
  id: string;
  route: string;
  method: string;
  body: any;
}

export function initApiBridge(): void {
  if (!import.meta.hot) {
    console.warn('API Bridge: HMR not available, Claude Code API disabled');
    return;
  }

  import.meta.hot.on('city:command', (command: CityCommand) => {
    console.log(`[API Bridge] Received: ${command.method} /api/${command.route}`);

    try {
      const result = handleCommand(command.route, command.method, command.body);
      import.meta.hot!.send('city:response', {
        id: command.id,
        result,
      });
    } catch (err: any) {
      import.meta.hot!.send('city:response', {
        id: command.id,
        result: null,
        error: err.message || 'Unknown error',
      });
    }
  });

  console.log('[API Bridge] Initialized - Claude Code API ready');
}
