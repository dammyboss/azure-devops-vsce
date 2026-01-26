# Rich Text Comments - Quick Start Guide

## What's New? 🎉

Your work item comments now support **rich text formatting** just like in the Azure DevOps browser!

## How to Use

### Adding Formatted Comments

1. **Open a work item** in VSCode
2. **Scroll to the "Add Comment" section**
3. **Use the formatting toolbar**:
   - **B** = Bold
   - **I** = Italic  
   - **U** = Underline
   - **List icons** = Ordered/Bullet lists
   - **Link icon** = Add hyperlinks
   - **Code icon** = Code blocks

4. **Click "Add"** to post your comment

### Example Use Cases

#### 1. Highlight Important Information
```
This is **critical** for the release!
```
Renders as: This is **critical** for the release!

#### 2. Create Action Lists
```
Next steps:
1. Review the PR
2. Update documentation
3. Deploy to staging
```

#### 3. Share Code Snippets
```
Try this fix:
`npm install --legacy-peer-deps`
```

#### 4. Add Links
```
See the design doc: [Link to Figma]
```

## Viewing Comments

### From VSCode
- All comments display with proper formatting
- Bold, italic, lists, and links render correctly
- Comments from browser appear formatted

### From Browser
- Comments created in VSCode appear with full formatting
- All rich text features preserved
- @mentions work seamlessly

## Tips & Tricks

✅ **DO**:
- Use bold for emphasis
- Use lists for action items
- Add links to related resources
- Use code blocks for technical details

❌ **DON'T**:
- Overuse formatting (keep it readable)
- Use all caps (use bold instead)
- Forget to preview before posting

## Keyboard Shortcuts

- **Ctrl/Cmd + B** = Bold
- **Ctrl/Cmd + I** = Italic
- **Ctrl/Cmd + U** = Underline

## Compatibility

✅ **Fully compatible** with:
- Azure DevOps browser interface
- Azure DevOps mobile app
- Other VSCode users
- API integrations

## Troubleshooting

**Q: My formatting isn't showing up**
A: Make sure you're using the toolbar buttons, not markdown syntax

**Q: Can I use Markdown?**
A: The editor uses rich text (HTML). Use the toolbar for formatting.

**Q: Are old comments affected?**
A: No, existing comments display as-is. Only new comments use rich text.

**Q: Is this secure?**
A: Yes! All HTML is sanitized to prevent security issues.

## Need Help?

- Check the main README.md
- Report issues on GitHub
- Contact the development team

---

**Enjoy better communication with rich text comments!** 🚀
