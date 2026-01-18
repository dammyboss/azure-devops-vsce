# Settings UI Visual Overview

## Settings Modal Interface

```
┌─────────────────────────────────────────────────────────────┐
│ ⚙️  Azure DevOps AI Settings                               │
└─────────────────────────────────────────────────────────────┘

[ Model Configuration ] [ MCP Servers ]

AI Provider
┌─────────────────────────────────────┐
│ 🧠 Anthropic (Claude)              ▼│
└─────────────────────────────────────┘
Get your API key from the Anthropic console

API Key
┌─────────────────────────────────────┐
│ ••••••••••••••••••••••••••••••••••  │
└─────────────────────────────────────┘
Get your API key from the Anthropic console

Model
┌─────────────────────────────────────┐
│ Claude Opus 4.1 (Latest)           ▼│
│ Claude Sonnet 4                     │
│ Claude 3.5 Haiku                    │
└─────────────────────────────────────┘

                    [ Test Connection ] [ Save Settings ]
```

## Chat Interface with Settings Button

### Editor Chat
```
┌────────────────────────────────────────────┐
│ 🤖 Azure DevOps AI Assistant       [⚙️]   │
├────────────────────────────────────────────┤
│                                            │
│ You: What sprints are active?              │
│                                            │
│ Assistant: The following sprints are...    │
│                                            │
│ Tokens: 250 in / 120 out                   │
├────────────────────────────────────────────┤
│ [  Ask about work items, sprints...      ]│
│                               [ Send ]    │
└────────────────────────────────────────────┘
```

### Sidebar Chat
```
┌──────────────────────────────┐
│ 🤖 AI Assistant      [⚙️]    │
├──────────────────────────────┤
│                              │
│ You: Show me all bugs        │
│                              │
│ Assistant: Here are the...   │
│                              │
├──────────────────────────────┤
│ [ Ask about work items...  ]│
│                   [ Send ]  │
└──────────────────────────────┘
```

## Provider Selection Flow

```
User clicks ⚙️ settings button
           ↓
Settings panel opens
           ↓
User selects AI Provider:
  - 🧠 Anthropic (Claude)
  - 🤖 OpenAI
  - ☁️ Azure OpenAI
  - 🔍 DeepSeek
  - ⚡ Grok
           ↓
Form updates with provider-specific fields
  - API Key input
  - Model selector (dynamic per provider)
  - Azure fields (if Azure OpenAI selected)
           ↓
User enters API key
           ↓
User clicks "Test Connection"
           ↓
Connection validated ✅ or Error ❌
           ↓
User clicks "Save Settings"
           ↓
Settings saved to VS Code global config
           ↓
Chat uses new provider immediately
```

## Supported Providers & Models

```
ANTHROPIC
├── Claude Opus 4.1 ⭐ (Most capable)
├── Claude Sonnet 4
└── Claude 3.5 Haiku

OPENAI
├── GPT-4o ⭐ (Latest)
├── GPT-4 Turbo
└── GPT-3.5 Turbo

AZURE OPENAI
├── GPT-4o ⭐ (with Azure endpoint)
└── GPT-4 Turbo
    (Requires endpoint URL & deployment name)

DEEPSEEK
├── DeepSeek Chat ⭐
└── DeepSeek Coder

GROK
└── Grok Beta ⭐
```

## Configuration Structure

```
VS Code Settings
└── azureDevOps.ai
    ├── provider: "anthropic" (currently selected)
    │
    ├── anthropic
    │   ├── apiKey: "sk-ant-..."
    │   └── model: "claude-opus-4-1-20250805"
    │
    ├── openai
    │   ├── apiKey: "sk-..."
    │   └── model: "gpt-4o"
    │
    ├── azure
    │   ├── apiKey: "..."
    │   ├── model: "gpt-4o"
    │   ├── endpoint: "https://your-resource.openai.azure.com/"
    │   └── deployment: "your-deployment"
    │
    ├── deepseek
    │   ├── apiKey: "sk-..."
    │   └── model: "deepseek-chat"
    │
    └── grok
        ├── apiKey: "..."
        └── model: "grok-beta"
```

## User Workflow Example

### First Time Setup

1. Open Chat (⚙️ button visible in header)
2. Click ⚙️ Settings button
3. Settings modal opens
4. Select "🧠 Anthropic (Claude)" from dropdown
5. Enter API key from console.anthropic.com
6. Click "Test Connection" → ✅ Success
7. Click "Save Settings" → ✅ Settings saved
8. Close settings modal
9. Start chatting with Claude!

### Switching Providers

1. Click ⚙️ Settings button
2. Change provider dropdown from "Anthropic" to "🤖 OpenAI"
3. Enter OpenAI API key
4. Select "GPT-4o" model
5. Click "Test Connection" → ✅ Success
6. Click "Save Settings"
7. Subsequent messages use OpenAI automatically

## Status Messages

```
Success (Green)
✅ Connection successful!
✅ Settings saved successfully!

Error (Red)
❌ Please enter an API key
❌ Connection test failed: 401 Unauthorized

Info (Blue)
ℹ️ MCP Server configuration coming soon
```

## Keyboard Shortcuts

- **Tab** - Move between form fields
- **Shift+Tab** - Move to previous field
- **Enter** - Submit form (Save Settings)
- **Ctrl/Cmd+Enter** - (In future) Quick test connection

## Accessibility Features

- Clear labels for all form fields
- Color-coded status messages (with icons)
- Proper contrast ratios for readability
- Keyboard navigation support
- Loading indicators for async operations
- Error messages include actionable guidance

## Theme Support

Settings UI automatically adapts to VS Code theme:
- Light theme: Clean white backgrounds, dark text
- Dark theme: Dark backgrounds, light text
- High contrast: Enhanced colors and borders
- All colors use VS Code theme variables for consistency

## Security

✅ **Password Field**
- API key input uses type="password" for masking

✅ **Global Storage**
- Settings stored in VS Code global configuration
- Encrypted by VS Code on disk
- Not committed to workspace/version control

✅ **No Local Logging**
- API keys never logged to console
- Test Connection validates without storing test data

⚠️ **Best Practices**
- Don't share VS Code settings file
- Use environment-specific configs
- Rotate API keys periodically
- Never commit settings to git
