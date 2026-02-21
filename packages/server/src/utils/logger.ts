const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

function timestamp(): string {
  return new Date().toISOString();
}

console.log = (...args: unknown[]) => originalLog(`[${timestamp()}]`, ...args);
console.warn = (...args: unknown[]) => originalWarn(`[${timestamp()}]`, ...args);
console.error = (...args: unknown[]) => originalError(`[${timestamp()}]`, ...args);
