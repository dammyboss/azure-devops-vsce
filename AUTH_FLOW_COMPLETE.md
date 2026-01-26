# Authentication Flow - Complete Replication

## ✅ COMPLETE - Exact Flow Replicated

Successfully replicated the **exact** authentication flow from `ado-pipeline-vsce` to `ado-vscx`.

## Authentication Flow

### 1. **Sign In** (`azureDevOps.connect`)
```
User clicks "Sign In" 
  ↓
Microsoft account picker appears
  ↓
User selects account and signs in
  ↓
Tenant selection prompt:
  • "Use primary tenant" → Continue with current session
  • "Switch to different tenant" → Enter tenant ID
  ↓
Session stored in SecretStorage
  ↓
Setup wizard opens automatically
```

### 2. **Setup Wizard** (`azureDevOps.setupWizard`)
```
Auto-discover organizations using Profile API
  ↓
Show organization picker (NO MANUAL INPUT!)
  ↓
User selects organization from list
  ↓
Auto-load projects from selected organization
  ↓
Show project picker
  ↓
User selects project
  ↓
Optionally select team
  ↓
Configuration saved
```

### 3. **Sign Out** (`azureDevOps.disconnect`)
```
Clear session from SecretStorage
  ↓
Clear configuration
  ↓
Update UI to show "Sign In" button
```

## Key Features Implemented

### ✅ Tenant Selection
- **Primary tenant**: Uses default Microsoft account tenant
- **Different tenant**: Prompts for tenant ID (GUID format with validation)
- Tenant ID stored in SecretStorage for session restoration

### ✅ Auto-Discovery
- **No manual organization input!**
- Uses Azure DevOps Profile API:
  1. GET `https://app.vssps.visualstudio.com/_apis/profile/profiles/me`
  2. GET `https://app.vssps.visualstudio.com/_apis/accounts?memberId={id}`
- Automatically discovers all organizations user has access to
- Shows clean picker with organization names and URLs

### ✅ Project & Team Selection
- Auto-loads projects from selected organization
- Shows project picker
- Optionally shows team picker
- All done through API calls, no manual input

## Files Modified

### 1. `authenticationManager.ts`
- Added tenant selection logic
- Exact same flow as pipeline extension
- Proper session management

### 2. `connectionSetupWizard.ts`
- Removed dependency on `OrganizationManager`
- Direct API calls using axios
- Auto-discovery of organizations
- Clean project and team selection

### 3. `connectionStatusProvider.ts`
- Simplified UI matching pipeline extension
- Shows user info, org, project
- Quick actions for settings and sign out

## API Endpoints Used

### Organization Discovery
```typescript
// Get user profile
GET https://app.vssps.visualstudio.com/_apis/profile/profiles/me
  ?api-version=7.1

// Get organizations
GET https://app.vssps.visualstudio.com/_apis/accounts
  ?memberId={userId}&api-version=7.1
```

### Project Discovery
```typescript
GET https://dev.azure.com/{org}/_apis/projects
  ?api-version=7.1
```

### Team Discovery
```typescript
GET https://dev.azure.com/{org}/_apis/projects/{projectId}/teams
  ?api-version=7.1-preview.3
```

## User Experience

### Before (Old Flow)
1. Sign in
2. **Manually type organization name** ❌
3. Select project
4. Select team

### After (New Flow)
1. Sign in
2. Choose tenant (primary or different)
3. **Auto-discover and select from list** ✅
4. Select project from list
5. Select team from list (optional)

## Testing Checklist

- [ ] Click "Sign In" in Connection view
- [ ] Select Microsoft account
- [ ] Choose "Use primary tenant"
- [ ] Verify organizations appear automatically
- [ ] Select organization from list
- [ ] Verify projects load automatically
- [ ] Select project from list
- [ ] Verify connection status shows correctly
- [ ] Test "Sign Out" clears everything
- [ ] Test with "Switch to different tenant" option

## Technical Details

### Scope
```typescript
'499b84ac-1321-427f-aa17-267ca6975798/.default'
```

### Tenant Selection
```typescript
// Primary tenant
session = await vscode.authentication.getSession('microsoft', SCOPES, {
    clearSessionPreference: true,
    forceNewSession: true
});

// Different tenant
session = await vscode.authentication.getSession('microsoft', [
    SCOPES[0],
    `VSCODE_TENANT:${tenantId}`
], { forceNewSession: true });
```

### Session Storage
- `ado-session-id`: Session ID
- `ado-tenant-id`: Tenant ID (if different tenant selected)

## Success Criteria

✅ No manual organization name input
✅ Auto-discovery using Profile API
✅ Tenant selection with validation
✅ Clean organization/project/team pickers
✅ Exact same flow as pipeline extension
✅ Compiles without errors
✅ Ready for testing

---

**Status**: ✅ COMPLETE
**Compilation**: ✅ SUCCESS
**Ready for**: Runtime Testing
