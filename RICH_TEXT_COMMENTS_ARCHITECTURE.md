# Rich Text Comments - Architecture Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         VSCode Extension                         │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              Work Item Panel (Webview)                  │    │
│  │                                                          │    │
│  │  ┌──────────────────────────────────────────────┐      │    │
│  │  │         Rich Text Editor (Quill.js)          │      │    │
│  │  │  ┌────────────────────────────────────┐     │      │    │
│  │  │  │  [B] [I] [U] [List] [Link] [Code]  │     │      │    │
│  │  │  └────────────────────────────────────┘     │      │    │
│  │  │  ┌────────────────────────────────────┐     │      │    │
│  │  │  │  User types formatted text here... │     │      │    │
│  │  │  │                                     │     │      │    │
│  │  │  └────────────────────────────────────┘     │      │    │
│  │  │              │                               │      │    │
│  │  │              │ Converts to HTML              │      │    │
│  │  │              ▼                               │      │    │
│  │  │  <p>Text with <strong>bold</strong></p>     │      │    │
│  │  └──────────────────────────────────────────────┘      │    │
│  │                     │                                   │    │
│  │                     │ postMessage()                     │    │
│  │                     ▼                                   │    │
│  │  ┌──────────────────────────────────────────────┐      │    │
│  │  │         workItemPanel.ts                      │      │    │
│  │  │                                               │      │    │
│  │  │  addComment(commentHtml) {                   │      │    │
│  │  │    1. Receive HTML from editor               │      │    │
│  │  │    2. Validate & sanitize                    │      │    │
│  │  │    3. Send to Azure DevOps API               │      │    │
│  │  │  }                                            │      │    │
│  │  │                                               │      │    │
│  │  │  sanitizeHtml(html) {                        │      │    │
│  │  │    - Remove <script> tags                    │      │    │
│  │  │    - Strip event handlers                    │      │    │
│  │  │    - Block javascript: URLs                  │      │    │
│  │  │    - Return safe HTML                        │      │    │
│  │  │  }                                            │      │    │
│  │  └──────────────────────────────────────────────┘      │    │
│  │                     │                                   │    │
│  └─────────────────────┼───────────────────────────────────┘    │
│                        │                                        │
└────────────────────────┼────────────────────────────────────────┘
                         │
                         │ HTTPS POST
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Azure DevOps REST API                          │
│                                                                  │
│  POST /{project}/_apis/wit/workItems/{id}/comments              │
│  API Version: 7.0-preview.3                                      │
│                                                                  │
│  Request Body:                                                   │
│  {                                                               │
│    "text": "<p>Text with <strong>bold</strong></p>"            │
│  }                                                               │
│                                                                  │
│  Response:                                                       │
│  {                                                               │
│    "id": 123,                                                    │
│    "text": "<p>Text with <strong>bold</strong></p>",           │
│    "createdBy": { ... },                                         │
│    "createdDate": "2024-01-15T10:30:00Z"                        │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
                         │
                         │ Stored in database
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Azure DevOps Database                          │
│                                                                  │
│  Work Item Comments Table:                                       │
│  ┌──────┬─────────────────────────────────────────────────┐    │
│  │ ID   │ Text (HTML)                                      │    │
│  ├──────┼─────────────────────────────────────────────────┤    │
│  │ 123  │ <p>Text with <strong>bold</strong></p>         │    │
│  │ 124  │ <ul><li>Item 1</li><li>Item 2</li></ul>        │    │
│  │ 125  │ <p>See <a href="...">link</a></p>              │    │
│  └──────┴─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                         │
                         │ Retrieved by
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Azure DevOps Browser UI                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              Work Item Discussion Section               │    │
│  │                                                          │    │
│  │  💬 John Doe        2 hours ago                         │    │
│  │     Text with bold                                      │    │
│  │                                                          │    │
│  │  💬 Jane Smith      1 hour ago                          │    │
│  │     • Item 1                                            │    │
│  │     • Item 2                                            │    │
│  │                                                          │    │
│  │  💬 Bob Wilson      30 min ago                          │    │
│  │     See link                                            │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  HTML is rendered with formatting preserved                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

### Creating a Comment (VSCode → Azure DevOps)

```
User Types in Editor
        │
        ▼
Quill.js Converts to HTML
        │
        ▼
JavaScript postMessage()
        │
        ▼
workItemPanel.ts receives message
        │
        ▼
sanitizeHtml() cleans HTML
        │
        ▼
addComment() sends to API
        │
        ▼
Azure DevOps API stores HTML
        │
        ▼
Comment saved in database
        │
        ▼
Success message to user
```

### Viewing Comments (Azure DevOps → VSCode)

```
User opens work item
        │
        ▼
getComments() API call
        │
        ▼
Azure DevOps returns HTML comments
        │
        ▼
sanitizeHtml() cleans HTML
        │
        ▼
HTML rendered in webview
        │
        ▼
User sees formatted comments
```

---

## Component Interaction

```
┌─────────────────┐
│   Quill.js      │  Rich text editor library
│   (CDN)         │  Provides formatting toolbar
└────────┬────────┘
         │
         │ Generates HTML
         ▼
┌─────────────────┐
│   Webview       │  VSCode webview panel
│   JavaScript    │  Handles user interactions
└────────┬────────┘
         │
         │ postMessage()
         ▼
┌─────────────────┐
│ workItemPanel   │  TypeScript extension code
│ .ts             │  Business logic
└────────┬────────┘
         │
         │ sanitizeHtml()
         ▼
┌─────────────────┐
│ HTML Sanitizer  │  Security layer
│                 │  Removes dangerous code
└────────┬────────┘
         │
         │ Safe HTML
         ▼
┌─────────────────┐
│ Azure DevOps    │  REST API
│ API             │  Stores/retrieves comments
└────────┬────────┘
         │
         │ HTTP Response
         ▼
┌─────────────────┐
│ Comment         │  Rendered in webview
│ Display         │  Shows formatted text
└─────────────────┘
```

---

## Security Flow

```
User Input (Potentially Malicious)
        │
        ▼
┌─────────────────────────────────────┐
│  <script>alert('XSS')</script>      │
│  <img src=x onerror="alert('XSS')"> │
│  <a href="javascript:alert('XSS')"> │
└─────────────────────────────────────┘
        │
        ▼
sanitizeHtml() Function
        │
        ├─► Remove <script> tags
        ├─► Strip event handlers (onerror, onclick, etc.)
        ├─► Block javascript: URLs
        └─► Allow safe tags only
        │
        ▼
┌─────────────────────────────────────┐
│  (removed)                           │
│  <img src=x>                         │
│  <a href="#">                        │
└─────────────────────────────────────┘
        │
        ▼
Safe HTML sent to API
```

---

## State Management

```
┌──────────────────────────────────────────────────────────┐
│                    Extension State                        │
│                                                           │
│  _workItem: WorkItem                                      │
│    ├─ id: number                                          │
│    ├─ fields: { ... }                                     │
│    └─ comments: Comment[]                                 │
│         ├─ id: number                                     │
│         ├─ text: string (HTML)                            │
│         ├─ createdBy: User                                │
│         └─ createdDate: Date                              │
│                                                           │
│  When comment added:                                      │
│  1. Send to API                                           │
│  2. Refresh work item                                     │
│  3. Update _workItem state                                │
│  4. Re-render webview                                     │
└──────────────────────────────────────────────────────────┘
```

---

## Error Handling Flow

```
User Adds Comment
        │
        ▼
Try to send to API
        │
        ├─► Success
        │   └─► Show success message
        │       └─► Refresh work item
        │           └─► Update display
        │
        └─► Error
            ├─► Network error
            │   └─► Show "Failed to add comment: Network error"
            │
            ├─► API error (500)
            │   └─► Show "Failed to add comment: Server error"
            │
            └─► Validation error
                └─► Show "Comment cannot be empty"
```

---

## Performance Optimization

```
┌─────────────────────────────────────────────────────────┐
│                   Performance Strategy                   │
│                                                          │
│  1. CDN Loading                                          │
│     ├─ Quill.js loaded from CDN (cached by browser)     │
│     └─ No impact on extension bundle size               │
│                                                          │
│  2. Lazy Initialization                                  │
│     ├─ Quill initialized only when webview opens        │
│     └─ Not loaded for other extension features          │
│                                                          │
│  3. HTML Sanitization                                    │
│     ├─ Simple regex-based (fast)                        │
│     └─ No heavy parsing libraries                       │
│                                                          │
│  4. Rendering                                            │
│     ├─ Native browser HTML rendering                    │
│     └─ No custom rendering engine needed                │
└─────────────────────────────────────────────────────────┘
```

---

## Integration Points

```
┌─────────────────────────────────────────────────────────┐
│              Extension Integration Points                │
│                                                          │
│  1. Authentication                                       │
│     └─ Uses existing AuthenticationManager              │
│                                                          │
│  2. API Client                                           │
│     └─ Uses existing Axios instance                     │
│                                                          │
│  3. Work Item Events                                     │
│     └─ Triggers WorkItemEventManager on comment add     │
│                                                          │
│  4. Webview                                              │
│     └─ Integrates with existing webview panel           │
│                                                          │
│  5. Configuration                                        │
│     └─ Uses existing config (project, team, etc.)       │
└─────────────────────────────────────────────────────────┘
```

---

## Deployment Architecture

```
Development
    │
    ├─► npm run compile
    │   └─► TypeScript → JavaScript
    │
    ├─► F5 (Debug)
    │   └─► Extension Development Host
    │       └─► Test in isolated VSCode instance
    │
    └─► npm run package
        └─► Create .vsix file
            │
            ▼
Production
    │
    ├─► Install .vsix
    │   └─► VSCode Extension Manager
    │
    └─► Runtime
        ├─► Load extension
        ├─► Initialize webview
        ├─► Load Quill.js from CDN
        └─► Ready for use
```

---

## Summary

This architecture provides:

✅ **Separation of Concerns**
- UI (Quill.js) separate from logic (TypeScript)
- Security layer (sanitization) isolated
- API communication abstracted

✅ **Scalability**
- CDN-based loading (no bundle bloat)
- Lazy initialization (load only when needed)
- Efficient HTML rendering

✅ **Security**
- Input sanitization
- XSS prevention
- Safe HTML allowlist

✅ **Maintainability**
- Clear component boundaries
- Well-defined data flow
- Minimal dependencies

✅ **Performance**
- Lightweight (~43KB)
- Browser-native rendering
- Cached CDN resources
