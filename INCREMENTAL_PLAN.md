# WorkItemPanel Enhancement Plan - Incremental Approach

## Current State
✅ Base version (901 lines) - **CLICKING WORKS**
- Basic work item display
- Title and description editing
- State changes
- Comments
- Assign to me
- Open in browser
- Linked items display

## Features to Add (From 2286-line version)

### Phase 1: Backend Data Fetching (Low Risk)
1. Add interfaces: `IterationInfo`, `AreaInfo`, `TeamMemberInfo`
2. Add private fields for data storage
3. Add methods:
   - `getIterations()` - Fetch sprints
   - `getAreas()` - Fetch area paths
   - `getTeamMembers()` - Fetch team members
   - `getExistingTags()` - Fetch tags
   - `getAttachments()` - Fetch attachments

**Test after Phase 1**: Verify clicking still works

### Phase 2: Simple Inline Editing (Medium Risk)
1. Add message handlers:
   - `updateField` - Generic field update
   - `assignTo` - Change assignee
2. Add backend methods:
   - `updateField()`
   - `assignTo()`
3. Add UI: Dropdown for assignee selection

**Test after Phase 2**: Verify clicking still works

### Phase 3: Metadata Editing (Medium Risk)
1. Add UI for:
   - Priority selector (buttons)
   - Effort/Story Points input
   - Sprint dropdown
   - Area dropdown
2. Add JavaScript functions:
   - `updatePriority()`
   - `updateEffort()`
   - `updateSprint()`
   - `updateArea()`

**Test after Phase 3**: Verify clicking still works

### Phase 4: Tags Management (Medium Risk)
1. Add message handler: `updateTags`
2. Add backend: `updateTags()`
3. Add UI: Tag chips with add/remove
4. Add JavaScript:
   - `addTag()`
   - `removeTag()`
   - `renderTags()`
   - Tag suggestions (optional)

**Test after Phase 4**: Verify clicking still works

### Phase 5: Attachments (Medium Risk)
1. Add message handlers:
   - `uploadAttachment`
   - `downloadAttachment`
   - `deleteAttachment`
2. Add backend methods
3. Add UI: Attachment list with actions
4. Add JavaScript functions

**Test after Phase 5**: Verify clicking still works

### Phase 6: Rich Text Editor (HIGH RISK - This likely broke it)
⚠️ **SKIP THIS OR DO LAST**
- Markdown toolbar
- Preview pane
- `markdownToHtml()` with regex
- This is where the backtick issues were

## Strategy
- Add one phase at a time
- Compile after each phase
- Test clicking after each phase
- If clicking breaks, we know exactly what caused it
- Commit after each successful phase

## Current Task
Ready to start **Phase 1**?
