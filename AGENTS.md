## IMPORTANT

- Try to keep things in one function unless composable or reusable
- DO NOT do unnecessary destructuring of variables
- DO NOT use `else` statements unless necessary
- DO NOT use `try`/`catch` if it can be avoided
- AVOID `try`/`catch` where possible
- AVOID `else` statements
- AVOID using `any` type
- AVOID `let` statements
- PREFER single word variable names where possible
- Use as many bun apis as possible like Bun.file()

## Debugging

- To test opencode in the `packages/opencode` directory you can run `bun dev`

## Shell Tools

- **Platform Detection**: Use `process.platform` to detect OS (`win32`, `darwin`, `linux`)
- **PowerShell**: Available via `pwsh` tool on all platforms (requires PowerShell Core on Linux/macOS)
- **Bash**: Available via `bash` tool on Unix-like systems (Linux/macOS), use with caution on Windows
- **Tool Selection**:
  - On Windows: Prefer `pwsh` for system commands
  - On Linux/macOS: Use `bash` for most commands, `pwsh` when PowerShell-specific features needed
  - Both tools share the same permission system (type: "bash")

## Tool Calling

- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE. Here is an example illustrating how to execute 3 parallel file reads in this chat environnement:

json
{
"recipient_name": "multi_tool_use.parallel",
"parameters": {
"tool_uses": [
{
"recipient_name": "functions.read",
"parameters": {
"filePath": "path/to/file.tsx"
}
},
{
"recipient_name": "functions.read",
"parameters": {
"filePath": "path/to/file.ts"
}
},
{
"recipient_name": "functions.read",
"parameters": {
"filePath": "path/to/file.md"
}
}
]
}
}
