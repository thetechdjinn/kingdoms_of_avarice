// ANSI color utility for terminal output formatting

const RESET = '\x1b[0m';

const CODES = {
  // Styles
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  
  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // Bright foreground colors
  brightBlack: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
  
  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
} as const;

type ColorCode = keyof typeof CODES;

function applyStyle(text: string, ...styles: ColorCode[]): string {
  const codes = styles.map(s => CODES[s]).join('');
  return `${codes}${text}${RESET}`;
}

export const colors = {
  // Basic colors
  black: (text: string) => applyStyle(text, 'black'),
  red: (text: string) => applyStyle(text, 'red'),
  green: (text: string) => applyStyle(text, 'green'),
  yellow: (text: string) => applyStyle(text, 'yellow'),
  blue: (text: string) => applyStyle(text, 'blue'),
  magenta: (text: string) => applyStyle(text, 'magenta'),
  cyan: (text: string) => applyStyle(text, 'cyan'),
  white: (text: string) => applyStyle(text, 'white'),
  
  // Bright colors
  brightRed: (text: string) => applyStyle(text, 'brightRed'),
  brightGreen: (text: string) => applyStyle(text, 'brightGreen'),
  brightYellow: (text: string) => applyStyle(text, 'brightYellow'),
  brightBlue: (text: string) => applyStyle(text, 'brightBlue'),
  brightCyan: (text: string) => applyStyle(text, 'brightCyan'),
  brightWhite: (text: string) => applyStyle(text, 'brightWhite'),

  // Alias colors
  gray: (text: string) => applyStyle(text, 'brightBlack'),
  grey: (text: string) => applyStyle(text, 'brightBlack'),
  orange: (text: string) => applyStyle(text, 'yellow'), // ANSI doesn't have orange, use yellow
  
  // Bold variants
  boldCyan: (text: string) => applyStyle(text, 'bold', 'cyan'),
  boldGreen: (text: string) => applyStyle(text, 'bold', 'green'),
  boldYellow: (text: string) => applyStyle(text, 'bold', 'yellow'),
  boldRed: (text: string) => applyStyle(text, 'bold', 'red'),
  boldWhite: (text: string) => applyStyle(text, 'bold', 'white'),
  
  // Semantic helpers for game output
  roomName: (text: string) => applyStyle(text, 'bold', 'cyan'),
  roomDesc: (text: string) => applyStyle(text, 'white'),
  alsoHereLabel: (text: string) => applyStyle(text, 'brightMagenta'),
  playerInRoom: (text: string) => applyStyle(text, 'bold', 'brightMagenta'),
  hostileInRoom: (text: string) => applyStyle(text, 'bold', 'red'),
  exits: (text: string) => applyStyle(text, 'yellow'),
  exitLabel: (text: string) => applyStyle(text, 'bold', 'yellow'),
  error: (text: string) => applyStyle(text, 'red'),
  system: (text: string) => applyStyle(text, 'yellow'),
  say: (text: string) => applyStyle(text, 'green'),
  sayName: (text: string) => applyStyle(text, 'bold', 'green'),
  npc: (text: string) => applyStyle(text, 'magenta'),
  item: (text: string) => applyStyle(text, 'brightBlue'),
  player: (text: string) => applyStyle(text, 'brightCyan'),
  combat: (text: string) => applyStyle(text, 'brightRed'),
  health: (text: string) => applyStyle(text, 'brightGreen'),
  mana: (text: string) => applyStyle(text, 'brightBlue'),
  gold: (text: string) => applyStyle(text, 'brightYellow'),

  // Combat-specific colors
  combatAttacker: (text: string) => applyStyle(text, 'bold', 'brightRed'),
  combatDefender: (text: string) => applyStyle(text, 'bold', 'brightYellow'),
  combatHit: (text: string) => applyStyle(text, 'red'),
  combatCritical: (text: string) => applyStyle(text, 'bold', 'red'),
  combatMiss: (text: string) => applyStyle(text, 'brightBlack'),
  combatDodge: (text: string) => applyStyle(text, 'cyan'),
  combatDamage: (text: string) => applyStyle(text, 'brightRed'),

  // Raw style application
  style: applyStyle,
  reset: RESET,
};

export type Colors = typeof colors;
