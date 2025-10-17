# opencode agent guidelines

## Build/Test Commands

- **Install**: `bun install`
- **Run**: `bun run index.ts`
- **Typecheck**: `bun run typecheck` (npm run typecheck)
- **Test**: `bun test` (runs all tests)
- **Single test**: `bun test test/tool/tool.test.ts` (specific test file)

## Shell Tools

### Available Tools

- **bash**: Unix shell command execution (Linux, macOS, Windows with WSL/Git Bash)
- **pwsh**: PowerShell command execution (cross-platform, requires PowerShell Core)

### Platform Detection & Tool Selection

- Detect platform: `process.platform` (`win32`, `darwin`, `linux`)
- **Windows**: Prefer `pwsh` for system commands, cmdlets, and Windows-specific tasks
- **Linux/macOS**: Use `bash` for most commands; use `pwsh` when PowerShell features needed
- Both tools use the same permission system (`agent.permission.bash`)

### PowerShell Tool

- **Detection**: Auto-detects `pwsh` (PowerShell Core) or falls back to `powershell` on Windows
- **Syntax**: Use PowerShell cmdlets (e.g., `Get-ChildItem`, `Remove-Item -Path file.txt`)
- **Aliases**: Common aliases supported (rm→Remove-Item, cp→Copy-Item, etc.)
- **Permissions**: Dangerous cmdlets (Remove-Item, Invoke-Expression, etc.) require approval
- **Error Messages**: If PowerShell unavailable, tool returns clear error message

## Code Style

- **Runtime**: Bun with TypeScript ESM modules
- **Imports**: Use relative imports for local modules, named imports preferred
- **Types**: Zod schemas for validation, TypeScript interfaces for structure
- **Naming**: camelCase for variables/functions, PascalCase for classes/namespaces
- **Error handling**: Use Result patterns, avoid throwing exceptions in tools
- **File structure**: Namespace-based organization (e.g., `Tool.define()`, `Session.create()`)

## Architecture

- **Tools**: Implement `Tool.Info` interface with `execute()` method
- **Context**: Pass `sessionID` in tool context, use `App.provide()` for DI
- **Validation**: All inputs validated with Zod schemas
- **Logging**: Use `Log.create({ service: "name" })` pattern
- **Storage**: Use `Storage` namespace for persistence
- **API Client**: Go TUI communicates with TypeScript server via stainless SDK. When adding/modifying server endpoints in `packages/opencode/src/server/server.ts`, ask the user to generate a new client SDK to proceed with client-side changes.
