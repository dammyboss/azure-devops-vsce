# Kanban Board Quick Start Guide

## 🚀 Getting Started

### Prerequisites
1. ✅ VSCode installed
2. ✅ Extension compiled (`npm run compile`)
3. ✅ Connected to Azure DevOps
4. ✅ Project selected

### Opening the Board

#### Method 1: Command Palette
1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type "Kanban"
3. Select "Azure DevOps: Open Kanban Board"

#### Method 2: Boards View
1. Open the Azure DevOps sidebar
2. Navigate to the "Boards" section
3. Click the layout icon (📊) in the toolbar

#### Method 3: Keyboard Shortcut (Optional)
Add to your `keybindings.json`:
```json
{
  "key": "ctrl+alt+k",
  "command": "azureDevOps.openKanbanBoard",
  "when": "azureDevOps.connected"
}
```

## 📋 Board Layout

### Columns
The board displays four columns:

1. **To Do** (New, To Do, Proposed)
   - Newly created items
   - Items waiting to be started

2. **In Progress** (Active, In Progress, Committed)
   - Items currently being worked on
   - Active development

3. **Review** (Resolved, Review, Testing)
   - Items awaiting review
   - Items in testing

4. **Done** (Closed, Done, Completed)
   - Completed items
   - Closed work items

### Card Information
Each card displays:
- **ID**: Work item number (e.g., #12345)
- **Type**: User Story, Task, Bug, etc.
- **Title**: Work item title
- **Assignee**: Avatar with initials and name
- **Priority**: High, Medium, or Low

## 🎯 Using the Board

### Viewing Work Items
- **Scroll horizontally**: View all columns
- **Scroll vertically**: View all items in a column
- **Hover over card**: See hover effect
- **Click card**: Open work item details

### Moving Work Items
1. Click and hold on a card
2. Drag to desired column
3. Release to drop
4. Status will update (when backend is connected)

### Understanding Colors

#### Work Item Types
- 🔵 **Blue**: User Story
- 🟠 **Orange**: Task
- 🔴 **Red**: Bug

#### Priority Levels
- 🔴 **Red**: High Priority
- 🟠 **Orange**: Medium Priority
- 🟢 **Green**: Low Priority

## 📊 Board Statistics

The header shows:
- **Total**: Total number of work items
- **In Progress**: Items in active development
- **Completed**: Items that are done

## ⚡ Keyboard Shortcuts

### Navigation (Coming Soon)
- `←/→`: Navigate between columns
- `↑/↓`: Navigate between cards
- `Enter`: Open selected card
- `Esc`: Close board

### Actions (Coming Soon)
- `Space`: Quick actions menu
- `E`: Edit work item
- `A`: Assign work item
- `C`: Add comment

## 🎨 Customization

### Theme
The board uses a dark theme by default, matching GitHub's design.

### Future Customization Options
- Light/dark theme toggle
- Custom column names
- Card field selection
- Color scheme options

## 🔧 Troubleshooting

### Board Not Opening
**Problem**: Command doesn't appear or fails
**Solution**:
1. Ensure you're connected to Azure DevOps
2. Check that a project is selected
3. Verify extension is activated

### No Work Items Showing
**Problem**: Board is empty
**Solution**:
1. Check if project has work items
2. Verify project permissions
3. Try refreshing the board

### Cards Not Moving
**Problem**: Drag and drop doesn't work
**Solution**:
1. Ensure JavaScript is enabled in webview
2. Check browser console for errors
3. Try reloading the board

### Slow Performance
**Problem**: Board is laggy with many items
**Solution**:
1. Reduce number of work items loaded
2. Use filters (coming soon)
3. Close other heavy extensions

## 💡 Tips & Tricks

### Efficient Workflow
1. **Pin the board**: Keep it open in a split view
2. **Use filters**: Focus on your work (coming soon)
3. **Quick updates**: Drag cards to update status
4. **Keyboard navigation**: Faster than mouse (coming soon)

### Best Practices
1. **Keep columns balanced**: Avoid bottlenecks
2. **Update regularly**: Keep board current
3. **Use priorities**: Focus on high-priority items
4. **Assign work**: Clear ownership

### Power User Features (Coming Soon)
- **Bulk operations**: Select multiple cards
- **Quick filters**: Filter by assignee, type, priority
- **Search**: Find specific work items
- **Swimlanes**: Group by different criteria

## 🐛 Known Issues

### Current Limitations
1. ⏳ Backend state updates not yet implemented
2. ⏳ No filters or search yet
3. ⏳ No keyboard navigation yet
4. ⏳ No bulk operations yet

### Planned Fixes
- Backend integration for state updates
- Filter and search functionality
- Keyboard navigation support
- Bulk operations support

## 📚 Additional Resources

### Documentation
- [Full Implementation Guide](./KANBAN_BOARD_IMPLEMENTATION.md)
- [Visual Specifications](./KANBAN_VISUAL_SPECS.md)
- [Main README](./README.md)

### Related Commands
- `Azure DevOps: Open Board (Kanban View)` - Alternative board view
- `Azure DevOps: View Work Item Details` - Detailed work item view
- `Azure DevOps: Filter Work Items` - Filter work items list

### Support
- Report issues on GitHub
- Check documentation for updates
- Join community discussions

## 🎓 Learning Path

### Beginner
1. Open the board
2. View work items
3. Click to see details
4. Understand the layout

### Intermediate
1. Drag and drop cards
2. Use statistics
3. Navigate efficiently
4. Customize view (coming soon)

### Advanced
1. Keyboard shortcuts (coming soon)
2. Bulk operations (coming soon)
3. Custom filters (coming soon)
4. Integration with Git workflow

## 🚦 Quick Reference

### Opening Board
```
Cmd+Shift+P → "Kanban" → Enter
```

### Moving Cards
```
Click + Drag → Drop in column
```

### Viewing Details
```
Click card → Details panel opens
```

### Refreshing
```
Close and reopen board
```

## 📝 Feedback

We'd love to hear from you!
- What features do you want?
- What's working well?
- What needs improvement?

## 🎉 What's Next?

### Coming Soon
- ✨ Filters and search
- ✨ Keyboard navigation
- ✨ Quick actions menu
- ✨ Swimlanes
- ✨ WIP limits
- ✨ Custom themes

### Future Plans
- 🔮 Real-time updates
- 🔮 Collaboration features
- 🔮 Analytics dashboard
- 🔮 Mobile companion

---

**Happy Kanban-ing! 🎯**
