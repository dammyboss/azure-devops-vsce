# API Version Fix

## Problem
Azure DevOps API was rejecting requests with error:
```
The requested version "7.1" of the resource is undefined...
For example: "7.1-preview"
```

## Solution
Changed API version from `7.1` to `7.1-preview.3` in the axios interceptor.

## What Changed

**File**: `src/authentication/authenticationManager.ts`

1. **API Version**: Changed from `7.1` to `7.1-preview.3`
   - Azure DevOps requires `-preview` suffix for many endpoints
   - Version `7.1-preview.3` is more compatible

2. **Configuration Loading**: Made `loadConfiguration()` async
   - Now properly loads stored sessions on startup
   - Loads project/team from workspace configuration

3. **Auto-connect**: Improved to set status bar correctly

## How to Test

1. **Disconnect** if currently connected:
   - Cmd+Shift+P → "Azure DevOps: Disconnect"

2. **Connect again**:
   - Cmd+Shift+P → "Azure DevOps: Connect to Organization"
   - Enter org URL: `https://dev.azure.com/your-org`
   - Enter your PAT token
   - Select project
   - Select team

3. **Verify**:
   - No more "7.1" version errors
   - Work items should load
   - Boards should load
   - Sprints should load

## Why This Works

Azure DevOps REST API has two version formats:
- **Released versions**: `6.0`, `7.0` (limited endpoints)
- **Preview versions**: `7.1-preview.3` (all endpoints)

Using preview versions gives access to all API features and is recommended for development.

## Next Steps

If you still see errors:
1. Check your PAT has correct scopes
2. Verify organization URL format
3. Make sure project and team are selected
4. Check console for specific error messages
