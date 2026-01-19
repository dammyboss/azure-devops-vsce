# Kanban Board Visual Comparison

## Color Palette

### Background Colors
```
Main Background:     #0d1117  (GitHub dark)
Column Background:   #161b22  (Slightly lighter)
Card Background:     #0d1117  (Same as main)
Border Color:        #30363d  (Subtle gray)
Hover Border:        #58a6ff  (Blue accent)
```

### Text Colors
```
Primary Text:        #f0f6fc  (Almost white)
Secondary Text:      #c9d1d9  (Light gray)
Muted Text:          #8b949e  (Gray)
Link/ID Color:       #58a6ff  (Blue)
```

### Type Badge Colors
```
User Story:          #1f6feb20 background, #58a6ff text
Task:                #f0883e20 background, #f0883e text
Bug:                 #da363320 background, #f85149 text
```

### Priority Colors
```
High Priority:       #da363320 background, #f85149 text
Medium Priority:     #f0883e20 background, #f0883e text
Low Priority:        #3fb95020 background, #3fb950 text
```

## Layout Specifications

### Board Container
```
Padding:             24px
Display:             flex column
Height:              100vh
Background:          #0d1117
```

### Board Header
```
Margin Bottom:       24px
Title Font Size:     24px
Title Font Weight:   600
Stats Font Size:     14px
Stats Color:         #8b949e
```

### Column Layout
```
Display:             flex row
Gap:                 16px
Overflow X:          auto
Min Width:           320px
Max Width:           320px
```

### Column Structure
```
Background:          #161b22
Border Radius:       8px
Border:              1px solid #30363d
Display:             flex column
```

### Column Header
```
Padding:             16px
Border Bottom:       1px solid #30363d
Font Weight:         600
Font Size:           14px
```

### Column Badge
```
Background:          #21262d
Color:               #8b949e
Padding:             2px 8px
Border Radius:       12px
Font Size:           12px
```

### Task Card
```
Background:          #0d1117
Border:              1px solid #30363d
Border Radius:       6px
Padding:             12px
Cursor:              pointer
Transition:          all 0.2s ease
```

### Task Card Hover
```
Border Color:        #58a6ff
Box Shadow:          0 0 0 1px #58a6ff
Transform:           translateY(-1px)
```

### Task Header
```
Display:             flex space-between
Margin Bottom:       8px
```

### Task ID
```
Font Size:           12px
Color:               #58a6ff
Font Weight:         500
```

### Task Type Badge
```
Font Size:           11px
Padding:             2px 6px
Border Radius:       3px
Font Weight:         500
```

### Task Title
```
Font Size:           14px
Color:               #f0f6fc
Margin Bottom:       8px
Line Height:         1.4
```

### Task Footer
```
Display:             flex space-between
Margin Top:          8px
Padding Top:         8px
Border Top:          1px solid #21262d
```

### Avatar
```
Width:               20px
Height:              20px
Border Radius:       50%
Background:          #21262d
Font Size:           10px
Font Weight:         600
Color:               #58a6ff
```

### Assignee Text
```
Font Size:           12px
Color:               #8b949e
```

### Priority Badge
```
Font Size:           11px
Padding:             2px 6px
Border Radius:       3px
Font Weight:         500
```

## Animations & Transitions

### Card Hover
```css
transition: all 0.2s ease;
transform: translateY(-1px);
border-color: #58a6ff;
box-shadow: 0 0 0 1px #58a6ff;
```

### Drag State
```css
opacity: 0.5;
```

### Scrollbar
```css
width: 8px;
track: #161b22;
thumb: #30363d;
thumb-hover: #484f58;
border-radius: 4px;
```

## Typography

### Font Stack
```
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 
             Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
```

### Font Sizes
```
Board Title:         24px
Column Title:        14px
Card Title:          14px
Card ID:             12px
Card Assignee:       12px
Badge Text:          11px
Avatar Text:         10px
```

### Font Weights
```
Board Title:         600
Column Title:        600
Card Title:          400
Badge Text:          500
Avatar Text:         600
```

## Spacing System

### Padding Scale
```
Extra Small:         2px   (badges)
Small:              6px   (badge horizontal)
Medium:             8px   (badge vertical)
Large:              12px  (cards)
Extra Large:        16px  (columns)
XXL:                24px  (container)
```

### Gap Scale
```
Small:              4px   (inline elements)
Medium:             8px   (card elements)
Large:              12px  (cards in column)
Extra Large:        16px  (columns)
```

### Border Radius Scale
```
Small:              3px   (badges)
Medium:             6px   (cards)
Large:              8px   (columns)
Circle:             12px  (badge counters)
Full:               50%   (avatars)
```

## Responsive Behavior

### Horizontal Scrolling
```
Container:           overflow-x: auto
Columns:             min-width: 320px
                    max-width: 320px
                    flex-shrink: 0
```

### Vertical Scrolling
```
Column Content:      overflow-y: auto
                    flex: 1
Custom Scrollbar:    8px width
```

## State Mapping

### Column States
```javascript
To Do:      ['New', 'To Do', 'Proposed']
In Progress: ['Active', 'In Progress', 'Committed']
Review:     ['Resolved', 'Review', 'Testing']
Done:       ['Closed', 'Done', 'Completed']
```

## Interaction States

### Default
```
Border:              1px solid #30363d
Background:          #0d1117
Cursor:              pointer
```

### Hover
```
Border:              1px solid #58a6ff
Box Shadow:          0 0 0 1px #58a6ff
Transform:           translateY(-1px)
```

### Dragging
```
Opacity:             0.5
```

### Drop Zone Active
```
Border:              2px dashed #58a6ff
Color:               #58a6ff
```

## Empty States

### No Items
```
Text:                "No items"
Padding:             32px 16px
Color:               #8b949e
Font Size:           14px
Text Align:          center
```

## Accessibility

### Color Contrast
```
Primary Text:        #f0f6fc on #0d1117 (✓ WCAG AAA)
Secondary Text:      #c9d1d9 on #0d1117 (✓ WCAG AA)
Muted Text:          #8b949e on #0d1117 (✓ WCAG AA)
```

### Interactive Elements
```
Cursor:              pointer (all clickable)
Focus:               (to be implemented)
Keyboard Nav:        (to be implemented)
```

## Performance Optimizations

### Rendering
```
- Template literals for fast HTML generation
- Single render pass
- Event delegation
- No unnecessary re-renders
```

### Scrolling
```
- Hardware-accelerated transforms
- Smooth scrolling enabled
- Custom scrollbar styling
```

## Browser Compatibility

### CSS Features Used
```
✓ Flexbox
✓ CSS Grid (minimal)
✓ CSS Transitions
✓ CSS Custom Scrollbars (webkit)
✓ Border Radius
✓ Box Shadow
✓ Transform
```

### JavaScript Features
```
✓ ES6+ (const, let, arrow functions)
✓ Template literals
✓ Array methods (map, filter, find)
✓ Spread operator
✓ Object destructuring
```

## Comparison with Reference

### Pixel-Perfect Matches
✅ Color scheme (GitHub dark)
✅ Card layout and spacing
✅ Badge styling
✅ Avatar design
✅ Typography hierarchy
✅ Hover effects
✅ Border radius values
✅ Transition timing

### Intentional Differences
- Data source (Azure DevOps vs mock)
- Column names (Azure DevOps states)
- Integration with VSCode
- Message passing architecture

### Future Additions
- Filters and search
- Card quick actions
- Swimlanes
- WIP limits
- Custom themes
