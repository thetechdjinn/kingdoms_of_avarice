// Ambient declarations for non-code asset imports handled by Vite at build time.
// TypeScript 6 rejects side-effect imports of modules without type declarations
// (TS2882), e.g. `import '@xterm/xterm/css/xterm.css'`. These stubs make such
// asset imports valid to the type-checker; Vite resolves the real assets.
declare module '*.css';
