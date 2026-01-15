import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { parse as parseCookie } from 'cookie';
import { MessageType, GameMessage, Role, VitalsData, ResourceType, PlayerRegenState } from '@koa/shared';
import { verifyToken, COOKIE_NAME } from '../routes/auth.js';
import { GameWorld } from './world.js';
import { processCommand } from './commands.js';
import { getPlayerLocation, setPlayerLocation } from './adminCommands.js';
import * as playerRepo from '../db/repositories/playerRepository.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import * as progressionRepo from '../db/repositories/progressionRepository.js';
import { initializeProgressionData } from './progressionLoader.js';
import { initializeDefaultRegenConfigs, startRegenLoops } from './regeneration.js';
import { colors } from '../utils/colors.js';

interface AuthenticatedSocket extends WebSocket {
  playerId: number;
  username: string;
  characterId?: number;
  roles: Role[];
  vitals: VitalsData;
  regenState: PlayerRegenState;
  briefMode: boolean;
  exitTimer?: NodeJS.Timeout;
  properlyExited?: boolean; // True if player exited via 'x' command
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

    // Parse characterId from query string
    let characterId: number | null = null;
    try {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const characterIdParam = url.searchParams.get('characterId');
      characterId = characterIdParam ? parseInt(characterIdParam, 10) : null;
    } catch {
      ws.close(1008, 'Invalid request URL');
      return;
    }

    if (!characterId || isNaN(characterId)) {
      ws.close(1008, 'Character selection required');
      return;
    }

    // Verify character exists and belongs to this player
    let character: characterRepo.DbCharacter | null = null;
    try {
      character = await characterRepo.findCharacterById(characterId);
    } catch (error) {
      console.error('Failed to load character:', error);
      ws.close(1008, 'Failed to load character');
      return;
    }

    if (!character) {
      ws.close(1008, 'Character not found');
      return;
    }

    if (character.player_id !== payload.playerId) {
      ws.close(1008, 'Invalid character');
      return;
    }

    // Check if this player already has a connected character - kick the old one
    const existingSocket = connectedPlayers.get(payload.playerId);
    if (existingSocket) {
      console.log(`Player ${payload.playerId} already connected as ${existingSocket.username}, kicking old connection`);

      // Notify the old connection they're being replaced
      const kickMessage: GameMessage = {
        type: MessageType.SYSTEM,
        payload: 'You have been disconnected because you logged in from another location.',
        timestamp: Date.now(),
      };
      existingSocket.send(JSON.stringify(kickMessage));

      // Mark as properly exited so we don't broadcast "hung up"
      existingSocket.properlyExited = true;

      // Clear any exit timer
      if (existingSocket.exitTimer) {
        clearTimeout(existingSocket.exitTimer);
        existingSocket.exitTimer = undefined;
      }

      // Close the old connection
      existingSocket.close(1000, 'Logged in from another location');
    }

    // Determine resource type based on class
    let resourceType = ResourceType.NONE;
    try {
      const classDef = await progressionRepo.getClassById(character.class);
      if (classDef?.resource_type) {
        if (classDef.resource_type === 'mana') {
          resourceType = ResourceType.MANA;
        } else if (classDef.resource_type === 'kai') {
          resourceType = ResourceType.KAI;
        }
      }
    } catch (error) {
      console.error('Failed to load class definition:', error);
      // Default to MANA for spell casters based on class name
      if (['Mage', 'Cleric', 'Paladin'].includes(character.class)) {
        resourceType = ResourceType.MANA;
      }
    }

    const authWs = ws as AuthenticatedSocket;
    authWs.playerId = payload.playerId;
    authWs.username = character.name; // Use character name instead of account username
    authWs.characterId = character.id;
    authWs.roles = payload.roles || [];

    // Initialize vitals from character data
    authWs.vitals = {
      hp: character.health,
      maxHp: character.max_health,
      resource: character.mana,
      maxResource: character.max_mana,
      resourceType: resourceType,
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

    // Use character's room location (default to room 1 if invalid)
    const startRoomId = character.current_room_id || 1;

    // Persist the room if we had to default
    if (!character.current_room_id) {
      characterRepo.updateCharacterRoom(characterId, startRoomId).catch((err) => {
        console.error('Failed to persist default room:', err);
      });
    }

    setPlayerLocation(payload.playerId, startRoomId);

    // Broadcast to all players that someone entered the realm (using character name)
    broadcastToAll(`${character.name} entered the realm.`, authWs.playerId);

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
      // Clear any pending exit timer
      if (authWs.exitTimer) {
        clearTimeout(authWs.exitTimer);
        authWs.exitTimer = undefined;
      }

      // Broadcast appropriate message based on how they disconnected
      if (authWs.properlyExited) {
        broadcastToAll(`${authWs.username} left the realm.`, payload.playerId);
      } else {
        // Player closed browser/tab without proper exit - potential cheating
        broadcastToAll(colors.boldWhite(`** ${authWs.username} just hung up! **`), payload.playerId);
      }

      connectedPlayers.delete(payload.playerId);
      console.log(`Character ${authWs.username} (Player ${payload.playerId}) disconnected${authWs.properlyExited ? '' : ' (hung up)'}`);
    });

    console.log(`Character ${authWs.username} (Player ${payload.playerId}) connected`);
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
