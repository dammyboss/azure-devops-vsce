# Debugging MCP Tool Authorization

## Issue
MCP tools are not prompting for authorization when called.

## Changes Made
1. Added logging to `mcp-client.ts` `callTool` method to track:
   - When authorization is required
   - When permission handler is called
   - Permission decisions

## How to Debug

1. **Open Output Channel**: View → Output → Select "Azure DevOps AI Assistant"

2. **Test MCP Tool**: Send a message that triggers an MCP tool

3. **Check Logs**: Look for these log messages:
   - `[MCP] Tool {toolName} requires authorization`
   - `[MCP] Requesting permission for {toolName}`
   - `[MCP] Permission decision: {decision}`
   - `[MCP] No permission handler provided for {toolName}`

## Expected Flow

1. User sends message → AI decides to use MCP tool
2. `api-client.ts` calls `mcpClient.callTool(toolName, args, callbacks.onToolPrompt)`
3. `mcp-client.ts` checks if tool needs authorization
4. If yes, calls `onToolPrompt` callback
5. `chat-provider.ts` sends `toolPrompt` message to webview
6. Webview shows permission UI with Allow/Deny buttons
7. User clicks button → sends `toolPromptResponse` back
8. Promise resolves with decision
9. Tool executes or is denied

## Common Issues

### Issue: No prompt shown
**Check**: Is `onToolPrompt` callback being passed?
- Look for log: `[MCP] No permission handler provided`
- If yes, the callback isn't being passed correctly

### Issue: Tool already allowed
**Check**: Is tool in allowed list?
- Tool key format: `{serverName}:{toolName}`
- Stored in: `context.globalState` under `mcpAllowedTools`
- Clear with: Delete from VS Code storage

### Issue: Tool marked as read-only
**Check**: Tool schema has `readOnlyHint: true`
- Read-only tools skip authorization
- Check tool definition in MCP server

## Reset Authorization

To reset all MCP tool authorizations:
1. Open Command Palette
2. Run: `Developer: Open User Data Folder`
3. Navigate to storage folder
4. Delete or edit the globalState file
5. Restart VS Code
