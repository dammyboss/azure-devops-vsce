# Authentication Fix Summary

## Problem
The extension was experiencing 401 (Unauthorized) errors when trying to access Azure DevOps APIs. The errors appeared for:
- Loading queries
- Loading work items
- Loading boards
- Loading sprints

## Root Cause
The issue was in how the axios instance was configured in `authenticationManager.ts`:

1. **Global api-version parameter conflict**: The axios instance was created with a global `api-version` parameter in the default params, which could interfere with individual request parameters.

2. **Redundant api-version parameters**: Each API call was explicitly adding `api-version` parameters, which could conflict with the global setting.

## Solution

### 1. Fixed Axios Instance Configuration
**File**: `src/authentication/authenticationManager.ts`

- Removed the global `api-version` parameter from axios defaults
- Added a request interceptor that automatically adds `api-version: '7.1'` to all requests
- This ensures consistent API versioning without conflicts

```typescript
this.axiosInstance = axios.create({
    baseURL: this.config.organizationUrl,
    headers: {
        'Authorization': `Basic ${base64Token}`,
        'Content-Type': 'application/json'
    }
    // Removed: params: { 'api-version': '7.1' }
});

// Added interceptor to handle api-version
this.axiosInstance.interceptors.request.use(
    (config) => {
        if (!config.params) {
            config.params = {};
        }
        if (!config.params['api-version']) {
            config.params['api-version'] = '7.1';
        }
        return config;
    },
    (error) => Promise.reject(error)
);
```

### 2. Simplified autoConnect Method
- Changed to use `/_apis/projects` as the primary connection test (more reliable)
- Falls back to `/_apis/connectionData` for user info
- Simplified error handling

### 3. Cleaned Up API Calls
Removed redundant `api-version` parameters from all provider files since the interceptor now handles it:

**Files Updated**:
- `src/views/workItemProvider.ts`
- `src/views/boardProvider.ts`
- `src/views/sprintProvider.ts`
- `src/views/queryProvider.ts`
- `src/authentication/authenticationManager.ts` (getProjects, getTeams, getCurrentUser methods)

## Testing
After these changes:
1. Compile the extension: `npm run compile` ✅
2. Press F5 to run in Extension Development Host
3. Run command: `Azure DevOps: Connect to Organization`
4. Enter your organization URL (e.g., `https://dev.azure.com/your-org`)
5. Enter your Personal Access Token
6. The extension should now connect successfully without 401 errors

## Key Changes Summary
- ✅ Fixed axios instance configuration to avoid parameter conflicts
- ✅ Centralized api-version handling via request interceptor
- ✅ Simplified connection testing logic
- ✅ Removed redundant api-version parameters from all API calls
- ✅ Maintained proper Basic authentication format

## Notes
- The Personal Access Token must have at least "Work Items (Read & Write)" scope
- The organization URL should be in format: `https://dev.azure.com/your-organization`
- Make sure to remove any trailing slashes from the organization URL (the code handles this automatically)
