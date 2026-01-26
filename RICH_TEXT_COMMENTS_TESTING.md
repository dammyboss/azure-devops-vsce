# Rich Text Comments - Testing Guide

## Pre-Testing Setup

### Requirements
- VSCode with the extension installed
- Active Azure DevOps connection
- Access to a test work item
- Browser access to Azure DevOps

### Test Environment
- Extension version: Latest
- VSCode version: 1.80+
- Azure DevOps: Cloud or Server 2022+

---

## Test Cases

### Test 1: Basic Rich Text Formatting

**Objective:** Verify basic formatting works in VSCode

**Steps:**
1. Open a work item in VSCode
2. Scroll to "Add Comment" section
3. Type: "This is a test"
4. Select "test" and click Bold button
5. Click Add

**Expected Result:**
- ✅ Comment appears with "test" in bold
- ✅ No errors in console
- ✅ Comment saved successfully

**Actual Result:** _____________

---

### Test 2: VSCode to Browser Sync

**Objective:** Verify comments created in VSCode appear formatted in browser

**Steps:**
1. In VSCode, create a comment with:
   - Bold text
   - Italic text
   - A numbered list
2. Click Add
3. Open the same work item in browser
4. Check the comment

**Expected Result:**
- ✅ Bold text appears bold in browser
- ✅ Italic text appears italic in browser
- ✅ List is properly formatted in browser
- ✅ All formatting matches VSCode

**Actual Result:** _____________

---

### Test 3: Browser to VSCode Sync

**Objective:** Verify comments created in browser appear formatted in VSCode

**Steps:**
1. In browser, create a comment with:
   - Bold text: **Important**
   - A bullet list
   - A link
2. Save the comment
3. In VSCode, refresh the work item
4. Check the comment display

**Expected Result:**
- ✅ Bold text renders as bold
- ✅ List shows as formatted list
- ✅ Link is clickable
- ✅ All formatting preserved

**Actual Result:** _____________

---

### Test 4: Multiple Formatting Options

**Objective:** Test all formatting toolbar options

**Steps:**
1. Create a comment with:
   ```
   **Bold text**
   *Italic text*
   Underlined text
   1. Ordered list item
   • Bullet list item
   [Link text](https://example.com)
   `code snippet`
   ```
2. Use toolbar buttons for each format
3. Click Add

**Expected Result:**
- ✅ All formats render correctly
- ✅ Toolbar buttons work as expected
- ✅ No formatting conflicts

**Actual Result:** _____________

---

### Test 5: Code Block Formatting

**Objective:** Verify code blocks work correctly

**Steps:**
1. Click the code block button in toolbar
2. Type:
   ```
   function test() {
     return true;
   }
   ```
3. Click Add
4. Check rendering in VSCode and browser

**Expected Result:**
- ✅ Code block has distinct background
- ✅ Monospace font used
- ✅ Formatting preserved in browser

**Actual Result:** _____________

---

### Test 6: Link Functionality

**Objective:** Test hyperlink creation and clicking

**Steps:**
1. Create a comment with a link
2. Use toolbar link button
3. Enter URL: https://dev.azure.com
4. Enter text: "Azure DevOps"
5. Click Add
6. Click the link in the comment

**Expected Result:**
- ✅ Link appears as blue underlined text
- ✅ Clicking opens URL in browser
- ✅ Link works in both VSCode and browser

**Actual Result:** _____________

---

### Test 7: Long Comment with Mixed Formatting

**Objective:** Test complex comments with multiple formats

**Steps:**
1. Create a comment with:
   - Multiple paragraphs
   - Bold and italic in same sentence
   - Nested lists
   - Multiple links
   - Code snippets
2. Click Add

**Expected Result:**
- ✅ All formatting renders correctly
- ✅ No performance issues
- ✅ Readable and well-formatted

**Actual Result:** _____________

---

### Test 8: Empty and Whitespace Comments

**Objective:** Test edge cases

**Steps:**
1. Try to add empty comment
2. Try to add comment with only spaces
3. Try to add comment with only formatting (no text)

**Expected Result:**
- ✅ Empty comments not allowed
- ✅ Whitespace-only comments not allowed
- ✅ Appropriate validation message

**Actual Result:** _____________

---

### Test 9: Special Characters

**Objective:** Test special character handling

**Steps:**
1. Create comment with:
   - Emojis: 🎉 ✅ ❌
   - Special chars: & < > " '
   - Unicode: 中文 العربية
2. Click Add

**Expected Result:**
- ✅ All characters display correctly
- ✅ No encoding issues
- ✅ HTML properly escaped

**Actual Result:** _____________

---

### Test 10: @Mention Compatibility

**Objective:** Verify @mentions from browser work in VSCode

**Steps:**
1. In browser, create comment with @mention
2. Refresh work item in VSCode
3. Check @mention display

**Expected Result:**
- ✅ @mention displays correctly
- ✅ User name shown
- ✅ No broken HTML

**Actual Result:** _____________

---

### Test 11: Edit and Delete Comments

**Objective:** Verify existing functionality still works

**Steps:**
1. Create a formatted comment
2. Try to edit it (if supported)
3. Try to delete it

**Expected Result:**
- ✅ Edit/delete still works
- ✅ No errors with formatted comments
- ✅ Formatting preserved after edit

**Actual Result:** _____________

---

### Test 12: Performance Test

**Objective:** Test with many comments

**Steps:**
1. Open work item with 20+ comments
2. Add a new formatted comment
3. Scroll through all comments
4. Refresh the work item

**Expected Result:**
- ✅ No lag or slowdown
- ✅ All comments render quickly
- ✅ Smooth scrolling

**Actual Result:** _____________

---

### Test 13: Security Test (XSS Prevention)

**Objective:** Verify HTML sanitization works

**Steps:**
1. Try to add comment with:
   ```html
   <script>alert('XSS')</script>
   <img src=x onerror="alert('XSS')">
   <a href="javascript:alert('XSS')">Click</a>
   ```
2. Click Add
3. Check if scripts execute

**Expected Result:**
- ✅ No scripts execute
- ✅ Dangerous HTML stripped
- ✅ Safe content displayed
- ✅ No security warnings

**Actual Result:** _____________

---

### Test 14: Theme Compatibility

**Objective:** Test with different VSCode themes

**Steps:**
1. Switch to Light theme
2. Add formatted comment
3. Switch to Dark theme
4. Add another formatted comment
5. Switch to High Contrast theme

**Expected Result:**
- ✅ Editor visible in all themes
- ✅ Text readable in all themes
- ✅ Toolbar buttons visible
- ✅ No color contrast issues

**Actual Result:** _____________

---

### Test 15: Keyboard Shortcuts

**Objective:** Test keyboard shortcuts work

**Steps:**
1. Focus comment editor
2. Press Ctrl+B (or Cmd+B on Mac)
3. Type "bold text"
4. Press Ctrl+I for italic
5. Type "italic text"

**Expected Result:**
- ✅ Ctrl+B makes text bold
- ✅ Ctrl+I makes text italic
- ✅ Shortcuts work as expected

**Actual Result:** _____________

---

## Regression Testing

### Verify Existing Features Still Work

- [ ] Work item loading
- [ ] State changes
- [ ] Field updates
- [ ] Attachments
- [ ] Linked items
- [ ] Tags
- [ ] Refresh functionality
- [ ] Save changes
- [ ] Open in browser

---

## Browser Compatibility Testing

Test in multiple browsers:

### Chrome
- [ ] Comments display correctly
- [ ] Formatting preserved
- [ ] Links work

### Firefox
- [ ] Comments display correctly
- [ ] Formatting preserved
- [ ] Links work

### Edge
- [ ] Comments display correctly
- [ ] Formatting preserved
- [ ] Links work

### Safari (if available)
- [ ] Comments display correctly
- [ ] Formatting preserved
- [ ] Links work

---

## Error Scenarios

### Test Error Handling

1. **Network Error During Comment Add**
   - Disconnect network
   - Try to add comment
   - Expected: Error message shown

2. **Invalid HTML in Comment**
   - Try malformed HTML
   - Expected: Sanitized or rejected

3. **API Error Response**
   - Simulate 500 error
   - Expected: User-friendly error message

---

## Acceptance Criteria

### Must Pass
- ✅ All basic formatting works (bold, italic, underline)
- ✅ Lists render correctly
- ✅ Links are clickable
- ✅ VSCode ↔ Browser sync works
- ✅ No XSS vulnerabilities
- ✅ No performance degradation
- ✅ Existing features unaffected

### Should Pass
- ✅ Code blocks formatted nicely
- ✅ @mentions preserved
- ✅ All themes supported
- ✅ Keyboard shortcuts work

### Nice to Have
- ✅ Emoji support
- ✅ Unicode support
- ✅ Nested lists

---

## Bug Report Template

If you find issues, report using this template:

```markdown
**Bug Title:** [Brief description]

**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Behavior:**


**Actual Behavior:**


**Screenshots:**
[Attach if applicable]

**Environment:**
- VSCode Version: 
- Extension Version: 
- OS: 
- Azure DevOps: Cloud/Server

**Console Errors:**
[Paste any errors from Developer Tools]
```

---

## Sign-Off

### Tester Information
- Name: _____________
- Date: _____________
- Environment: _____________

### Test Results Summary
- Total Tests: 15
- Passed: _____
- Failed: _____
- Blocked: _____

### Overall Status
- [ ] ✅ Ready for Production
- [ ] ⚠️ Ready with Minor Issues
- [ ] ❌ Not Ready - Major Issues Found

### Notes:
_____________________________________________
_____________________________________________
_____________________________________________

---

## Next Steps After Testing

1. **If All Tests Pass:**
   - Update README.md with new feature
   - Create release notes
   - Deploy to production

2. **If Issues Found:**
   - Log bugs with details
   - Prioritize fixes
   - Retest after fixes

3. **Documentation:**
   - Update user guide
   - Create video tutorial (optional)
   - Announce feature to users
