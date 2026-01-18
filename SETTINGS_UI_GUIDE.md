# Settings UI Guide

## Overview

The Azure DevOps AI extension now includes a beautiful settings UI for configuring AI providers, similar to Code Pilot AI. Instead of manually editing JSON configuration, users can use an intuitive modal interface to:

- Select AI providers (Anthropic, OpenAI, Azure OpenAI, DeepSeek, Grok)
- Enter and manage API keys securely
- Select language models for each provider
- Configure Azure-specific endpoints and deployments
- Test API connections before saving

## Accessing Settings

### From Chat Editor
Click the ⚙️ (settings) button in the top-right corner of the chat header.

### From Sidebar Chat
Click the ⚙️ (settings) button in the sidebar AI Assistant header.

### Via Command Palette
Run the command: **Azure DevOps: Open AI Settings**

## Settings Panel Features

### Model Configuration Tab
The primary tab for configuring AI providers:

**AI Provider Dropdown**
- Select from 5 supported providers:
  - 🧠 **Anthropic (Claude)** - Claude Opus 4.1, Sonnet 4, 3.5 Haiku
  - 🤖 **OpenAI** - GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo
  - ☁️ **Azure OpenAI** - GPT-4o, GPT-4 Turbo with custom endpoint configuration
  - 🔍 **DeepSeek** - DeepSeek Chat, Coder
  - ⚡ **Grok (X.AI)** - Grok Beta

**API Key Input**
- Password-masked input field for secure key entry
- Placeholder shows expected key format (e.g., `sk-...`)
- Help text directs users to provider console

**Model Selection**
- Dropdown showing available models for selected provider
- Models update automatically when provider changes

**Azure-Specific Fields** (only shown for Azure OpenAI)
- **Azure Endpoint**: Your Azure OpenAI resource endpoint
- **Deployment Name**: The deployment name in Azure

### MCP Servers Tab
Configure Model Context Protocol servers to extend AI capabilities:
- Coming soon: Interface for adding and managing MCP servers
- Will allow integration of custom tools and integrations

## Buttons

**Test Connection**
- Validates that your API key works with the selected provider
- Shows spinner while testing
- Success: Green checkmark message
- Error: Red error message with details

**Save Settings**
- Persists configuration to VS Code settings
- Shows success confirmation
- Settings apply immediately to chat interface

## Supported Providers & Models

### Anthropic (Claude)
- **Claude Opus 4.1** - Most capable, best for complex tasks
- **Claude Sonnet 4** - Balanced performance
- **Claude 3.5 Haiku** - Fast, lightweight

### OpenAI
- **GPT-4o** - Latest multimodal model
- **GPT-4 Turbo** - Advanced reasoning
- **GPT-3.5 Turbo** - Fast and cost-effective

### Azure OpenAI
- Same models as OpenAI
- Requires Azure-specific endpoint and deployment configuration
- API key is your Azure API key

### DeepSeek
- **DeepSeek Chat** - General-purpose chat
- **DeepSeek Coder** - Code-focused tasks

### Grok (X.AI)
- **Grok Beta** - Latest Grok model

## Getting API Keys

### Anthropic
1. Visit https://console.anthropic.com
2. Create an API key in the Account section
3. Copy and paste into Settings UI

### OpenAI
1. Visit https://platform.openai.com
2. Go to API keys section
3. Create a new key
4. Copy and paste into Settings UI

### Azure OpenAI
1. Create an Azure OpenAI resource in Azure Portal
2. Get your API key from Keys & Endpoints
3. Copy endpoint URL and deployment name
4. Fill in all three fields in Settings UI

### DeepSeek
1. Visit https://platform.deepseek.com
2. Get your API key from the dashboard
3. Copy and paste into Settings UI

### Grok (X.AI)
1. Visit https://x.ai
2. Create API key through developer console
3. Copy and paste into Settings UI

## Configuration Storage

Settings are stored in VS Code's global configuration:
```json
{
  "azureDevOps.ai": {
    "provider": "anthropic",
    "anthropic": {
      "apiKey": "sk-ant-...",
      "model": "claude-opus-4-1-20250805"
    },
    "openai": {
      "apiKey": "sk-...",
      "model": "gpt-4o"
    },
    "azure": {
      "apiKey": "...",
      "model": "gpt-4o",
      "endpoint": "https://your-resource.openai.azure.com/",
      "deployment": "your-deployment"
    },
    "deepseek": {
      "apiKey": "sk-...",
      "model": "deepseek-chat"
    },
    "grok": {
      "apiKey": "...",
      "model": "grok-beta"
    }
  }
}
```

## Security Notes

- API keys are stored in VS Code's global settings (encrypted on disk)
- Keys are transmitted securely to AI provider APIs
- Never share your API keys or commit them to version control
- Consider using environment variables for sensitive environments
- Test Connection button validates keys but doesn't store test credentials

## Troubleshooting

**Connection Test Fails**
- Verify API key is correct
- Check that provider service is accessible
- Ensure endpoint URL is correct (for Azure OpenAI)
- Check internet connection

**Settings Don't Apply**
- Refresh the chat interface or restart VS Code
- Verify settings were saved (check "✅ Settings saved successfully!" message)

**Missing Models**
- Models are hardcoded per provider
- If a model is deprecated, manually edit settings JSON
- Report missing models as issues

## Using Settings in Chat

After configuring your preferred provider:
1. Settings are applied automatically to both chat interfaces
2. Provider dropdown in chat sidebar shows current selection (feature coming soon)
3. All messages use the selected provider and model
4. Switch providers by returning to Settings UI and selecting a different one

## Future Enhancements

- [ ] MCP Server management UI
- [ ] Provider selector dropdown in chat interface
- [ ] Model temperature/token limit configuration
- [ ] Provider usage statistics dashboard
- [ ] Quick provider switcher in status bar
