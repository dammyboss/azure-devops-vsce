# OAuth Scope Fix

## Problem
The Microsoft OAuth token wasn't working with Azure DevOps API (401 errors).

## Solution
Changed OAuth scope to Azure DevOps specific resource ID:
- **Old**: `https://app.vssps.visualstudio.com/user_impersonation`
- **New**: `499b84ac-1321-427f-aa17-267ca6975798/.default`

This is the **Azure DevOps Services** application ID that requests the correct token.

## Test Again

1. **Disconnect** first: Cmd+Shift+P → "Azure DevOps: Disconnect"
2. **Connect**: Click "Connect to Azure DevOps"
3. **Enter org URL**: `https://dev.azure.com/your-org`
4. **Browser opens** → Sign in with Microsoft
5. **Grant permissions** → Should work now!

The token should now have the correct audience for Azure DevOps API.
