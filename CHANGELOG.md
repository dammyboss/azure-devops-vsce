# Changelog

All notable changes to the Azure DevOps Boards extension will be documented in this file.

## [0.2.7] - 2026-02-13

### Added
- **Automatic Tenant Detection**: Enhanced multi-tenant authentication with intelligent auto-discovery
  - Automatically detects all Azure AD tenants the user has access to
  - Shows tenant picker with friendly names and domains instead of manual GUID entry
  - Uses Microsoft Graph API and Azure Management API for comprehensive tenant discovery
  - Loading indicator with progress notification during tenant discovery
  - Graceful fallback to manual tenant ID entry if auto-detection fails
  - Eliminates need to copy/paste tenant IDs from Azure Portal

### Improved
- Enhanced authentication flow for multi-tenant scenarios
- Better user experience when switching between tenants
- Streamlined sign-in process with automatic tenant detection

### Technical Changes
- Implemented Microsoft Graph API integration for organization discovery
- Added Azure Management API integration for comprehensive tenant listing
- Enhanced session management with tenant-specific scopes

## [0.2.6] - 2026-02-10

### Added
- **Automatic Tenant Detection**: Intelligent multi-tenant authentication with auto-discovery
  - Automatically detects all Azure AD tenants the user has access to
  - Shows tenant picker with friendly names and domains instead of manual GUID entry
  - Uses Microsoft Graph API and Azure Management API for comprehensive tenant discovery
  - Loading indicator with progress notification during tenant discovery
  - Graceful fallback to manual tenant ID entry if auto-detection fails
  - Eliminates need to copy/paste tenant IDs from Azure Portal
- **Board TreeView Section**: New sidebar board view with sprint and assignee filtering
  - Hierarchical view showing boards → columns → work items
  - Sprint/iteration filter with current, all, and specific sprint options
  - Assignee filter with @me (current user), all, and specific team member options
  - Collapsible Filters node showing active filter count
  - Default filters set to current sprint and current user (@me)
- **Quick Open Work Item**: Fast work item search and navigation
  - Quick Pick interface for searching work items by ID or title
  - Recently viewed work items with timestamps
  - Opens work item directly in board panel

### Fixed
- **CRITICAL**: Fixed board TreeView work item loading using official Azure DevOps WIQL API
  - Query by System.State instead of undocumented System.BoardColumn field
  - Follow official WIQL syntax with @project and @me macros
  - Filter by exact type+state combination to prevent wrong column assignments
  - Based on official Azure DevOps REST API documentation

### Improved
- Enhanced status bar with active work item tracking and Quick Open integration
- Better work item organization with automatic filtering by sprint and assignee
- Improved board TreeView performance with proper state-based queries

### Technical Changes
- Implemented official Azure DevOps WIQL query patterns for work item filtering
- Added team iterations and team members API integration
- Enhanced filter state management with default filter initialization
- Added Quick Open search service with fuzzy matching and history tracking

## [0.2.5] - 2026-02-07

### Fixed
- **CRITICAL**: Fixed comment avatar showing wrong initials - now correctly displays user's initials instead of "Y"
- Fixed Azure DevOps API integration to use `customDisplayName` field for user display names
- Fixed board filters being reset after work item updates - filters now persist across board refreshes
- Fixed iteration, area, and assignee dropdowns opening outside metadata box boundaries

### Improved
- Enhanced dropdown components with intelligent left/right positioning based on available space
- Converted iteration, area, and assignee selects to custom dropdowns with better UX
- Improved iteration dropdown date text visibility (now white for better contrast)
- Added proper z-index layering to prevent dropdown overlap issues
- Optimized filter state management with automatic restoration after board updates

### Technical Changes
- Implemented filter state persistence across HTML regeneration cycles
- Added dynamic dropdown positioning algorithm to detect optimal opening direction
- Enhanced error handling for `getCurrentUser()` API calls with graceful fallbacks
- Improved dropdown styling consistency across work item detail panel

## [0.2.4] - 2026-02-04

### Fixed
- **CRITICAL**: Fixed session restoration to include stored tenant scope for multi-tenant users
- Session restore now properly includes VSCODE_TENANT scope when VS Code restarts
- Resolved "no organizations found" error for guest users in different tenants
- Fixed loadConfiguration() and getSession() to retrieve tenant-specific tokens

### Improved
- Enhanced session persistence across VS Code restarts for multi-tenant scenarios
- Better tenant scope handling in authentication flow

## [0.2.3] - 2026-02-04

### Fixed
- **CRITICAL**: Fixed extension activation failure that caused "command 'azureDevOps.connect' not found" error after marketplace installation
- **CRITICAL**: Fixed organization discovery when switching tenants - VSCODE_TENANT scope now properly included
- Resolved missing production dependencies (axios, etc.) by including node_modules in extension package

### Improved
- Optimized package size to 8.8MB (down from 41MB) by excluding media files from VSIX
- Enhanced error handling and session management for multi-tenant scenarios
- Improved reliability of authentication flow across different Azure DevOps tenants

### Technical Changes
- Updated .vscodeignore to include production dependencies while excluding dev artifacts
- Modified ConnectionSetupWizard to use AuthenticationManager.getSession() for proper tenant scope handling
- Added What's New panel updates for version tracking

## [0.2.1] - 2026-02-03

### Added
- Effort field display on board cards with inline editing
- Clickable effort values with up/down spinner controls for easy updates
- Comments and Activity Date columns support in work item lists
- Beautiful "What's New" panel with animations and gradient effects
- Demo video in README showcasing extension features

### Fixed
- Event bubbling issue where clicking effort spinner arrows opened work item details
- Board filter UI positioning for more stable interface
- Removed redundant "Clear all filters" button from board view

### Improved
- Enhanced profile icons for unassigned work items
- API performance with parallel calls, intelligent caching, and incremental updates
- Board card interactions with better click handling
- UI polish with refined styling and smoother animations
- Visual feedback across the board interface

## [0.2.0] - 2026-02-03

### Added
- Initial public release
- OAuth 2.0 authentication with Microsoft accounts
- Interactive Kanban-style board views
- Work item management (create, edit, view)
- Sprint planning and management
- Backlog management with hierarchical views
- Git integration for branches and commits
- Status bar integration
- Real-time board updates
- Card styling rules support with automatic contrast colors
- Advanced filtering by assignee, type, priority, state, and area
- Drag-and-drop work items between board columns

### Features
- Secure authentication without PAT requirements
- Rich work item details with inline editing
- Multiple organization and project support
- Auto-connect on startup
- Quick search and navigation
- Work item relationship tracking
- Branch creation from work items

## [0.1.0] - 2026-01-28

### Added
- Initial development version
- Core authentication and API integration
- Basic work item views
- Board and sprint foundations

---

**Note:** This extension is actively maintained and regularly updated with new features and improvements.

For detailed feature information, visit the [GitHub repository](https://github.com/dammyboss/azure-devops-vsce).
