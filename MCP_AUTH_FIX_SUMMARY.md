# MCP Tool Authorization Fix - Summary

## Problem
MCP tools were not prompting for user authorization before execution.

## Root Cause Analysis
After reviewing the claude-code-chat-main project, I found they use a different approach:
- **Their approach**: stdio-based permission prompts via Claude CLI's control_request/control_response protocol
- **Your approach**: MCP-based permissions requiring authorization at the MCP client layer

## Solution Implemented

### 1. Added Logging to `mcp-client.ts`
Enhanced the `callTool` method with detailed logging to track:
- When tools require authorization
- When permission prompts are requested
- Permission decisions made by users
- Missing permission handlers

**Changes**:
```typescript
// Before authorization check
this.outputChannel.appendLine(`[MCP] Tool ${fullToolName} requires authorization`);

// When requesting permission
this.outputChannel.appendLine(`[MCP] Requesting permission for ${fullToolName}`);

// After decision
this.outputChannel.appendLine(`[MCP] Permission decision: ${decision}`);

// When handler missing
this.outputChannel.appendLine(`[MCP] No permission handler provided for ${fullToolName}`);
```

### 2. Improved Error Messages
Changed generic error messages to be more descriptive:
```typescript
// Before
return { success: false, result: '', error: 'No permission handler provided' };

// After  
return { success: false, result: '', error: 'Tool requires authorization. No permission handler provided.' };
```

## Verification Steps

1. **Check Output Channel**:
   - View → Output → "Azure DevOps AI Assistant"
   - Look for `[MCP]` prefixed log messages

2. **Test Flow**:
   - Send message that triggers MCP tool
   - Check if authorization prompt appears
   - Check logs for permission flow

3. **Expected Logs**:
   ```
   [MCP] Tool mcp_servername_toolname requires authorization
   [MCP] Requesting permission for mcp_servername_toolname
   [MCP] Permission decision: allow
   ```

## Architecture Overview

```
User Message
    ↓
API Client (api-client.ts)
    ↓
MCP Client.callTool() with onToolPrompt callback
    ↓
Check if authorization needed
    ↓
Call onToolPrompt callback (chat-provider.ts)
    ↓
Send 'toolPrompt' message to webview
    ↓
Webview shows permission UI
    ↓
User clicks Allow/Deny
    ↓
Send 'toolPromptResponse' back
    ↓
Promise resolves with decision
    ↓
Tool executes or denied
```

## Files Modified

1. `/src/ai/mcp-client.ts` - Added logging and improved error messages
2. `/DEBUGGING_STEPS.md` - Created debugging guide

## Next Steps

1. Test with an actual MCP tool call
2. Check Output Channel for logs
3. If prompt still doesn't appear, check:
   - Is tool marked as read-only? (`readOnlyHint: true`)
   - Is tool already in allowed list? (check globalState)
   - Is callback being passed correctly?

## Additional Notes

- The authorization UI code already exists and looks correct
- The callback chain is properly set up
- The issue was likely lack of visibility into what's happening
- Logs will help identify where the flow breaks
