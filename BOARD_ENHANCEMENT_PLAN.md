# Azure DevOps Boards View Enhancement Plan

## Overview
Transform the current tree-based Boards view into a full-featured, interactive Kanban board with drag-and-drop, matching Azure DevOps browser experience.

---

## Phase 1: Core Kanban Board (CRITICAL - Must Have)
**Goal:** Working drag-and-drop board inside VS Code

### 1.1 Create Board Webview Panel
- [ ] Create `src/views/boardPanel.ts` - Main webview panel class
- [ ] HTML structure for board layout (header, columns, cards)
- [ ] CSS styling with VS Code theme integration
- [ ] Message passing infrastructure (webview ↔ extension)

### 1.2 Board Data Loading
- [ ] Fetch board columns with metadata (WIP limits, column types)
- [ ] Fetch work items per column
- [ ] Map work items to correct columns based on state
- [ ] Cache board state for performance

### 1.3 Work Item Cards
- [ ] Card component with: icon, ID, title, assignee avatar, state pill
- [ ] Card hover effects (lift, shadow)
- [ ] Left border color based on work item type
- [ ] Priority indicator

### 1.4 Drag & Drop Engine
- [ ] HTML5 native drag and drop implementation
- [ ] Drag start: card lifts, ghost element
- [ ] Drag over: column highlights, drop placeholder
- [ ] Drop: card moves to new position
- [ ] Keyboard support (accessibility): M to move, arrows, Enter

### 1.5 State Change on Drop
- [ ] Optimistic UI update (move card immediately)
- [ ] API call to update work item state
- [ ] Success: confirm move, show toast
- [ ] Failure: rollback card position, show error toast

### 1.6 Command Integration
- [ ] Register `azureDevOps.openBoardPanel` command
- [ ] Add to existing board tree view context menu
- [ ] Keyboard shortcut option

---

## Phase 2: Essential UX Polish (HIGH - Should Have)
**Goal:** Professional, production-ready experience

### 2.1 Column Headers
- [ ] Column name display
- [ ] WIP count indicator (current/limit)
- [ ] WIP color coding (green/amber/red)
- [ ] Collapse/expand column

### 2.2 Card Interactions
- [ ] Click card → Open work item detail panel
- [ ] Right-click → Context menu (Open, Edit, Assign, Change State, etc.)
- [ ] Hover → Show quick action buttons

### 2.3 Inline Item Creation
- [ ] "+ New item" button per column
- [ ] Inline text input
- [ ] Enter to create, Esc to cancel
- [ ] Auto-set state based on column

### 2.4 Board Header
- [ ] Board name display
- [ ] Board selector dropdown (switch boards)
- [ ] Refresh button
- [ ] "Open in Browser" button

### 2.5 Toast Notifications
- [ ] Success toasts (item moved, created, etc.)
- [ ] Error toasts with retry option
- [ ] Auto-dismiss after 3 seconds

---

## Phase 3: Filtering & Focus (MEDIUM - Nice to Have)
**Goal:** Developer productivity features

### 3.1 Filter Bar
- [ ] Search by title/ID
- [ ] Filter by assignee (+ "Assigned to me")
- [ ] Filter by priority
- [ ] Filter by tags
- [ ] Clear all filters

### 3.2 Focus Modes
- [ ] "My items only" toggle
- [ ] "Hide Done column" toggle
- [ ] "Today's work" filter

### 3.3 Saved Filters
- [ ] Save current filter as preset
- [ ] Quick filter selection dropdown

---

## Phase 4: Advanced Features (LOW - Future Enhancement)
**Goal:** Beyond browser parity

### 4.1 Swimlanes
- [ ] Group by parent (Epic/Feature)
- [ ] Group by assignee
- [ ] Group by priority
- [ ] Collapsible lanes

### 4.2 Blocked Items & Dependencies
- [ ] Blocked badge on cards
- [ ] Blocked reason tooltip
- [ ] Visual dependency lines (optional)

### 4.3 Column Analytics
- [ ] Average time in column
- [ ] Item count trends
- [ ] Bottleneck indicators

### 4.4 AI Insights (Future)
- [ ] Stuck item detection
- [ ] Workload imbalance warnings
- [ ] Auto-prioritization suggestions

---

## File Structure

```
src/
├── views/
│   ├── boardPanel.ts          # NEW: Main webview panel
│   ├── boardProvider.ts       # EXISTING: Tree view (keep for sidebar)
│   └── workItemPanel.ts       # EXISTING: Reference for webview patterns
├── models/
│   └── models.ts              # ADD: Board-specific interfaces
├── webview/
│   └── board/                 # NEW: Webview assets
│       ├── board.html         # Board HTML template
│       ├── board.css          # Board styles
│       └── board.js           # Board JavaScript (drag & drop logic)
└── commands/
    └── commands.ts            # ADD: Board panel commands
```

---

## API Endpoints Required

| Endpoint | Purpose |
|----------|---------|
| `GET /_apis/work/boards` | List all boards |
| `GET /_apis/work/boards/{board}` | Board details |
| `GET /_apis/work/boards/{board}/columns` | Column definitions |
| `POST /_apis/wit/wiql` | Query work items by column/state |
| `PATCH /_apis/wit/workitems/{id}` | Update work item state |
| `POST /_apis/wit/workitems` | Create new work item |

---

## State Mapping

Azure DevOps maps board columns to work item states:

```
Column "To Do"     → State: "New" or "To Do"
Column "Doing"     → State: "Active" or "In Progress"
Column "Done"      → State: "Closed" or "Done"
```

On drag-drop, we update the work item's `System.State` field to match the target column's mapped state.

---

## Technical Decisions

### Why Webview (not Tree View)?
- Tree views don't support drag-and-drop between items
- Need custom layout (horizontal columns)
- Need rich card rendering
- Need smooth animations

### Why HTML5 Drag & Drop (not library)?
- No external dependencies
- Full control over behavior
- Works in VS Code webview
- Sufficient for our needs

### Optimistic UI Pattern
```
1. User drops card
2. Immediately move card in UI
3. Send API request in background
4. If success: show success toast
5. If failure: revert card position, show error
```

---

## Implementation Order (Per Session)

### Session 1: Foundation
1. Create `boardPanel.ts` skeleton
2. Basic HTML/CSS board layout
3. Load and display columns
4. Load and display cards (static)

### Session 2: Drag & Drop
1. Implement drag start/over/drop
2. Visual feedback (placeholder, highlights)
3. Card position updates

### Session 3: API Integration
1. State change on drop
2. Optimistic updates
3. Error handling & rollback
4. Toast notifications

### Session 4: Polish
1. Card click → open details
2. Context menu
3. Inline creation
4. Column headers with WIP

### Session 5+: Enhancements
- Filters
- Focus modes
- Swimlanes
- etc.

---

## Success Criteria

### Phase 1 Complete When:
- [ ] Can open board in webview panel
- [ ] See columns with work item cards
- [ ] Drag card from one column to another
- [ ] Card state updates in Azure DevOps
- [ ] Smooth visual feedback during drag

### Phase 2 Complete When:
- [ ] WIP limits shown and color-coded
- [ ] Can create items inline
- [ ] Context menu works
- [ ] Professional visual polish

---

## Notes

- Keep existing `boardProvider.ts` tree view as sidebar navigation
- Board panel opens when user clicks on a board in the tree
- Follow patterns from existing `workItemPanel.ts` for webview structure
- Use VS Code CSS variables for theme compatibility

---

## Quick Reference Commands

```bash
# Test the extension
npm run compile && code --extensionDevelopmentPath=.

# Watch mode
npm run watch
```

---

## Progress Tracking

### Session 1: Foundation ✅ COMPLETED
- [x] Created `src/views/boardPanel.ts` - Full webview panel implementation
- [x] HTML/CSS board layout with columns
- [x] Load and display columns with WIP limits
- [x] Load and display work item cards
- [x] Drag and drop implemented with HTML5 DnD
- [x] Optimistic UI updates with rollback on failure
- [x] Toast notifications for feedback
- [x] Inline item creation per column
- [x] Card click opens work item details
- [x] Assign to me quick action
- [x] Command registered: `azureDevOps.openBoardPanel`
- [x] Context menu and title bar integration

**Files Created/Modified:**
- `src/views/boardPanel.ts` (NEW - 700+ lines)
- `src/commands/commandManager.ts` (MODIFIED - added command)
- `package.json` (MODIFIED - added command registration)

### Session 2: Enhanced UX Polish ✅ COMPLETED
- [x] Right-click context menu on cards with full actions
- [x] Keyboard navigation (arrow keys to move between cards/columns)
- [x] Keyboard drag support (M to enter move mode, arrows to move, Enter to confirm)
- [x] Card hover quick actions (Assign, Comment, More)
- [x] Column collapse/expand with vertical text
- [x] Board selector dropdown in header
- [x] Change state via context menu submenu
- [x] Add comment from context menu
- [x] Copy ID/URL from context menu
- [x] Create branch from context menu
- [x] Open in browser from context menu
- [x] Keyboard shortcuts help panel (? to toggle)

**New Features Added:**
- Full context menu: Open, Open in Browser, Assign to Me, Change State (submenu), Add Comment, Create Branch, Copy ID, Copy URL
- Keyboard shortcuts: ↑↓ navigate cards, ←→ navigate columns, M move mode, R refresh, ? help, Esc cancel
- Column collapse: Click header or ◀ button to collapse, shows vertical title
- Board switcher: Dropdown in header to switch between boards without reopening
- Card focus: Tab navigation, visual selection indicator
- Move mode: Orange highlight during keyboard moves

**Files Modified:**
- `src/views/boardPanel.ts` (ENHANCED - now 1900+ lines)

### Session 3: Filtering & Focus Modes ✅ COMPLETED
- [x] Filter bar UI with toggle button (F key)
- [x] Search filter (by ID or title)
- [x] Assignee filter dropdown (All, Assigned to Me, Unassigned)
- [x] Work item type filter dropdown (All, Bug, Task, User Story, Feature)
- [x] Priority filter dropdown (All, 1-4)
- [x] "Hide Done" toggle to hide completed items
- [x] "My Items" toggle to show only items assigned to current user
- [x] Filter count indicator (showing X of Y items)
- [x] Column visible count updates when filters applied
- [x] Clear all filters button
- [x] Keyboard shortcut: F to toggle filter bar
- [x] Current user detection via Azure DevOps API

**New Features Added:**
- Filter bar: Collapsible bar with search, dropdowns, and toggles
- Search: Real-time filtering by work item ID or title
- Assignee filter: "All", "Assigned to Me", "Unassigned" options
- Type filter: Filter by Bug, Task, User Story, Feature, or All
- Priority filter: Filter by priority 1-4 or All
- Focus modes: "Hide Done" hides completed items, "My Items" shows only your work
- Visual feedback: Filter count shows visible/total items
- Clear filters: One-click button to reset all filters

**Files Modified:**
- `src/views/boardPanel.ts` (ENHANCED - now 2260+ lines)

---

*Last Updated: January 2026*
*Status: Session 3 Complete - Ready for Testing*
