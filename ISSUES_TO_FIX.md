# Issues Fixed

## 1. ✅ Kanban Board - "No items" message persists after moving cards
**Status:** FIXED
**Issue:** When moving items to an empty column, the "No items" message stays visible underneath the work item.
**Fix:** Changed the column body rendering order so cards render first, then the empty message conditionally.

## 2. ✅ Tags Error - Bad Request when saving work item
**Status:** FIXED
**Error:** `The specified operator cannot be used with l…he error is caused by «[System.Tags] <> ''».`
**Location:** Work item panel when loading existing tags
**Fix:** Removed the `<> ''` operator from the WIQL query and added a check to filter empty tags in JavaScript instead.

## 3. ✅ Rich Text Editor for Comments
**Status:** FIXED
**Issue:** Comments should use a rich text editor
**Fix:** Added HTML toolbar with formatting buttons (Bold, Italic, Underline, Lists, Links, Code) for comments.

## 4. ✅ Description Field - Markdown not rendering as HTML
**Status:** FIXED
**Issue:** When writing "**hello**" in description, it shows as `**hello**` in Azure DevOps browser instead of bold text
**Root Cause:** Azure DevOps expects HTML format, not Markdown
**Fix:** 
- Changed description editor from Markdown to HTML
- Updated toolbar buttons to insert HTML tags instead of Markdown syntax
- Removed preview mode (no longer needed since we're using HTML directly)
- Description now saves as HTML which Azure DevOps renders correctly

## Summary
All issues have been fixed:
1. Board "No items" display issue - FIXED
2. Tags query error - FIXED  
3. HTML editor for description - IMPLEMENTED
4. HTML toolbar for comments - IMPLEMENTED
