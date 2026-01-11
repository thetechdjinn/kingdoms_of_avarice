import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { parse as parseCookie } from 'cookie';
import { MessageType, GameMessage, Role } from '@koa/shared';
import { verifyToken, COOKIE_NAME } from '../routes/auth.js';
import { GameWorld } from './world.js';
import { processCommand } from './commands.js';

interface AuthenticatedSocket extends WebSocket {
  playerId: number;
  username: string;
  characterId?: number;
  roles: Role[];
}

const connectedPlayers = new Map<number, AuthenticatedSocket>();
const gameWorld = new GameWorld();
let worldInitialized = false;

export async function initializeGameWorld(): Promise<void> {
  if (worldInitialized) return;
  await gameWorld.initialize();
  worldInitialized = true;
}

export function setupGameSocket(wss: WebSocketServer): void {
  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const cookies = parseCookie(req.headers.cookie || '');
    const token = cookies[COOKIE_NAME];

    if (!token) {
      ws.close(1008, 'Authentication required');
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      ws.close(1008, 'Invalid token');
      return;
    }

    const authWs = ws as AuthenticatedSocket;
    authWs.playerId = payload.playerId;
    authWs.username = payload.username;
    authWs.roles = payload.roles || [];

    connectedPlayers.set(payload.playerId, authWs);

    sendMessage(authWs, MessageType.SYSTEM, '\r\n=== Welcome to Kingdoms of Avarice ===\r\n');
    
    const room = gameWorld.getRoom(1);
    if (room) {
      sendMessage(authWs, MessageType.OUTPUT, gameWorld.formatRoomDescription(room));
    }

    ws.on('message', async (data) => {
      try {
        const message: GameMessage = JSON.parse(data.toString());
        if (message.type === MessageType.COMMAND) {
          const response = await processCommand(message.payload, authWs, gameWorld, connectedPlayers);
          sendMessage(authWs, response.type, response.message);
        }
      } catch {
        sendMessage(authWs, MessageType.ERROR, 'Invalid message format');
      }
    });

    ws.on('close', () => {
      connectedPlayers.delete(payload.playerId);
      console.log(`Player ${payload.username} disconnected`);
    });

    console.log(`Player ${payload.username} connected`);
  });
}

function sendMessage(ws: AuthenticatedSocket, type: MessageType, payload: string): void {
  const message: GameMessage = { type, payload, timestamp: Date.now() };
  ws.send(JSON.stringify(message));
}

export { connectedPlayers, AuthenticatedSocket };
