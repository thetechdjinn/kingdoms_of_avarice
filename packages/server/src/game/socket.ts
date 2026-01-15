import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { parse as parseCookie } from 'cookie';
import { MessageType, GameMessage, Role, VitalsData, ResourceType, PlayerRegenState } from '@koa/shared';
import { verifyToken, COOKIE_NAME } from '../routes/auth.js';
import { GameWorld } from './world.js';
import { processCommand } from './commands.js';
import { getPlayerLocation, setPlayerLocation } from './adminCommands.js';
import * as playerRepo from '../db/repositories/playerRepository.js';
import { initializeProgressionData } from './progressionLoader.js';
import { initializeDefaultRegenConfigs, startRegenLoops } from './regeneration.js';

interface AuthenticatedSocket extends WebSocket {
  playerId: number;
  username: string;
  characterId?: number;
  roles: Role[];
  vitals: VitalsData;
  regenState: PlayerRegenState;
  briefMode: boolean;
  exitTimer?: NodeJS.Timeout;
}

const connectedPlayers = new Map<number, AuthenticatedSocket>();
const gameWorld = new GameWorld();
let worldInitialized = false;

export async function initializeGameWorld(): Promise<void> {
  if (worldInitialized) return;
  await gameWorld.initialize();

  // Initialize progression system from JSON data files
  try {
    await initializeProgressionData();
  } catch (error) {
    console.error('[Progression] CRITICAL: Failed to load progression data - classes/races may be unavailable:', error);
    // Server continues but progression features will be degraded
  }

  // Initialize resource regeneration system
  initializeDefaultRegenConfigs();
  startRegenLoops(connectedPlayers, sendVitals);

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

    // Initialize default vitals (will be replaced when character system is complete)
    authWs.vitals = {
      hp: 100,
      maxHp: 100,
      resource: 50,
      maxResource: 50,
      resourceType: ResourceType.MANA,
    };

    // Initialize regeneration state
    authWs.regenState = {
      enhancedRegen: new Set<string>(),
      inCombat: false,
      isPoisoned: false,
    };
    
    // Load brief mode from database (default to false on error)
    try {
      authWs.briefMode = await playerRepo.getBriefMode(payload.playerId);
    } catch (error) {
      console.error('Failed to load brief mode:', error);
      authWs.briefMode = false;
    }

    connectedPlayers.set(payload.playerId, authWs);
    
    // Load player's saved room location from database (default to room 1 on error)
    let startRoomId = 1;
    try {
      startRoomId = await playerRepo.getCurrentRoomId(payload.playerId);
    } catch (error) {
      console.error('Failed to load player room:', error);
    }
    setPlayerLocation(payload.playerId, startRoomId);

    // Broadcast to all players that someone entered the realm
    broadcastToAll(`${payload.username} entered the realm.`, authWs.playerId);

    sendMessage(authWs, MessageType.SYSTEM, '\r\n=== Welcome to Kingdoms of Avarice ===\r\n');
    
    const room = gameWorld.getRoom(startRoomId);
    if (room) {
      // Get other players in the room (excluding self)
      const otherPlayers: string[] = [];
      for (const [playerId, socket] of connectedPlayers) {
        if (playerId !== payload.playerId && getPlayerLocation(playerId) === startRoomId) {
          otherPlayers.push(socket.username);
        }
      }
      const { getRoomItemsDescription } = await import('./itemCommands.js');
      let itemDescriptions: string | null = null;
      try {
        itemDescriptions = await getRoomItemsDescription(startRoomId);
      } catch (err) {
        console.error('Failed to get room items:', err);
      }
      sendMessage(authWs, MessageType.OUTPUT, gameWorld.formatRoomDescription(room, otherPlayers, authWs.briefMode, itemDescriptions));
    }

    // Send initial vitals
    sendVitals(authWs);

    ws.on('message', async (data) => {
      // Parse JSON separately to distinguish parse errors from command errors
      let message: GameMessage;
      try {
        message = JSON.parse(data.toString());
      } catch {
        sendMessage(authWs, MessageType.ERROR, 'Invalid message format');
        return;
      }

      // Process command in separate try/catch
      try {
        if (message.type === MessageType.COMMAND) {
          const response = await processCommand(message.payload, authWs, gameWorld, connectedPlayers);
          sendMessage(authWs, response.type, response.message);
          // Send vitals after every command
          sendVitals(authWs);
        }
      } catch (error) {
        console.error('Command processing error:', error);
        sendMessage(authWs, MessageType.ERROR, 'An error occurred processing your command');
      }
    });

    ws.on('close', () => {
      // Broadcast to all players that someone left the realm
      broadcastToAll(`${payload.username} left the realm.`, payload.playerId);
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

function sendVitals(ws: AuthenticatedSocket): void {
  const message: GameMessage = {
    type: MessageType.VITALS,
    payload: JSON.stringify(ws.vitals),
    timestamp: Date.now(),
  };
  ws.send(JSON.stringify(message));
}

// Broadcast a system message to all connected players (except excludePlayerId)
function broadcastToAll(text: string, excludePlayerId?: number): void {
  const message: GameMessage = {
    type: MessageType.SYSTEM,
    payload: text,
    timestamp: Date.now(),
  };
  for (const [playerId, socket] of connectedPlayers) {
    if (playerId !== excludePlayerId) {
      socket.send(JSON.stringify(message));
    }
  }
}

// Broadcast to players in a specific room (except excludePlayerId)
export function broadcastToRoom(roomId: number, text: string, excludePlayerId?: number): void {
  const message: GameMessage = {
    type: MessageType.OUTPUT,
    payload: text,
    timestamp: Date.now(),
  };
  for (const [playerId, socket] of connectedPlayers) {
    if (playerId !== excludePlayerId && getPlayerLocation(playerId) === roomId) {
      socket.send(JSON.stringify(message));
    }
  }
}

export { connectedPlayers, AuthenticatedSocket, sendVitals, sendMessage };
