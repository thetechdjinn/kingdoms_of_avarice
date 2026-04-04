# AI Agent Instructions

This file is the shared source of truth for all AI coding agents working in this repository. Harness-specific config files (CLAUDE.md, .cursorrules, etc.) should reference this file.

## Project Overview

Kingdoms of Avarice is a web-based MUD (Multi-User Dungeon) inspired by MajorMUD. TypeScript monorepo with real-time WebSocket communication and a terminal-style xterm.js interface.

## Skills

Reusable agent skills (code review, etc.) are in the `.skills/` directory at the project root. Each skill has its own subdirectory with a `SKILL.md` entry point. Use these when available rather than implementing ad-hoc workflows.

## Rules

- Always ensure any libraries, frameworks, or dependencies are up to date and secure
- Use the latest stable versions of libraries, frameworks, and dependencies
- Do not review or flag changes in game data/seed files (`data/`, `packages/server/src/db/*/`, `areas/`) unless explicitly asked
- Never use em dashes in player-visible text
- Never use native JavaScript dialog boxes (alert/confirm/prompt) in client code
