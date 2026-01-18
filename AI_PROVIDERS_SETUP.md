# Multi-Provider AI Assistant Setup Guide

The Azure DevOps Boards extension now supports multiple AI providers and models for the AI Assistant. This guide will help you configure your preferred provider.

## Supported Providers

1. **Anthropic Claude** (Default)
   - Model: claude-opus-4-1-20250805
   - Website: https://console.anthropic.com

2. **Azure OpenAI**
   - Model: Depends on your deployment
   - Website: https://portal.azure.com

3. **DeepSeek**
   - Model: deepseek-chat
   - Website: https://platform.deepseek.com

4. **Grok (X.AI)**
   - Model: grok-beta
   - Website: https://console.x.ai

5. **OpenAI**
   - Model: gpt-4o
   - Website: https://platform.openai.com

## Configuration

### Option 1: VS Code Settings (Recommended)

Open VS Code settings (Cmd+, or Ctrl+,) and search for `azureDevOps.ai`, then add the following:

#### For Anthropic Claude:

```json
{
  "azureDevOps.ai.provider": "anthropic",
  "azureDevOps.ai.anthropic.apiKey": "your-anthropic-api-key",
  "azureDevOps.ai.anthropic.model": "claude-opus-4-1-20250805"
}
```

#### For Azure OpenAI:

```json
{
  "azureDevOps.ai.provider": "azure",
  "azureDevOps.ai.azure.endpoint": "https://your-resource.openai.azure.com/",
  "azureDevOps.ai.azure.apiKey": "your-azure-api-key",
  "azureDevOps.ai.azure.deployment": "your-deployment-name",
  "azureDevOps.ai.azure.apiVersion": "2024-02-15-preview"
}
```

#### For DeepSeek:

```json
{
  "azureDevOps.ai.provider": "deepseek",
  "azureDevOps.ai.deepseek.apiKey": "your-deepseek-api-key",
  "azureDevOps.ai.deepseek.model": "deepseek-chat"
}
```

#### For Grok:

```json
{
  "azureDevOps.ai.provider": "grok",
  "azureDevOps.ai.grok.apiKey": "your-grok-api-key",
  "azureDevOps.ai.grok.model": "grok-beta"
}
```

#### For OpenAI:

```json
{
  "azureDevOps.ai.provider": "openai",
  "azureDevOps.ai.openai.apiKey": "your-openai-api-key",
  "azureDevOps.ai.openai.model": "gpt-4o"
}
```

### Option 2: Workspace Settings

Create or edit `.vscode/settings.json` in your workspace:

```json
{
  "azureDevOps.ai": {
    "provider": "anthropic",
    "anthropic": {
      "apiKey": "sk-...",
      "model": "claude-opus-4-1-20250805"
    }
  }
}
```

## Getting API Keys

### Anthropic
1. Go to https://console.anthropic.com
2. Sign up or log in
3. Navigate to API keys section
4. Create a new API key
5. Copy and paste into VS Code settings

### Azure OpenAI
1. Create an Azure OpenAI resource in Azure Portal
2. Deploy a model (e.g., gpt-4)
3. Get the endpoint URL and API key
4. Configure in settings

### DeepSeek
1. Go to https://platform.deepseek.com
2. Create an account
3. Generate API key
4. Copy and paste into VS Code settings

### Grok (X.AI)
1. Go to https://console.x.ai
2. Create account
3. Generate API key
4. Copy and paste into VS Code settings

### OpenAI
1. Go to https://platform.openai.com
2. Create API key in account settings
3. Copy and paste into VS Code settings

## Switching Providers

To switch providers:

1. Open VS Code settings
2. Update `azureDevOps.ai.provider` to your desired provider
3. Ensure the required API key and configuration are set for that provider
4. Reload VS Code (Cmd+Shift+P → Developer: Reload Window)
5. Open the AI Chat and test

## Using the AI Chat

### Sidebar Chat
- Click on the **AI Assistant** panel in the Activity Bar
- Type your question or request
- Press Enter or click Send

### Editor Chat Window
- Run command: `Azure DevOps: Open AI Chat`
- Or press Cmd+Shift+P and search for "Open AI Chat"
- Chat opens in a new editor tab

## Features

- **Multi-Provider Support**: Easily switch between different AI providers
- **Stream Responses**: Real-time streaming of responses
- **MCP Tools Integration**: Access Azure DevOps data through tools
- **Conversation History**: Maintains context across messages
- **Token Counting**: Tracks input/output tokens

## Troubleshooting

### "API key not configured" Error
- Verify the API key is correctly set in settings
- Check the provider name matches the active provider
- Ensure no typos in configuration

### "Request cancelled" Error
- This usually means the request took too long
- Try a simpler query
- Check your internet connection

### "Parse error" Messages
- These are typically harmless and indicate minor parsing issues
- The assistant should still function correctly

### Provider Not Responding
- Verify your API key is valid
- Check if the API service is online (check provider's status page)
- Ensure your account has remaining quota

## Model Selection

Each provider has different models available:

- **Anthropic**: claude-opus-4-1-20250805, claude-sonnet-4-20250514, etc.
- **OpenAI**: gpt-4o, gpt-4-turbo, gpt-3.5-turbo, etc.
- **Azure**: Depends on your deployment
- **DeepSeek**: deepseek-chat
- **Grok**: grok-beta

Update the `model` setting to use different models from your chosen provider.

## Performance Tips

1. **Use Streaming**: Always enabled for faster response times
2. **Shorter Context**: Clearer shorter questions get faster responses
3. **Provider Selection**: Different providers have different speeds
   - Anthropic: Generally slowest but most accurate
   - OpenAI: Balanced speed and quality
   - DeepSeek: Fast and cost-effective
   - Grok: Experimental, fastest
4. **Close Other Tabs**: Reduces system resource usage

## Security

- API keys are stored in VS Code settings
- Consider using workspace settings for sensitive keys
- Never commit API keys to version control
- Use `.gitignore` to exclude `.vscode/settings.json` if using workspace settings

## Support

For issues with specific providers:
- **Anthropic**: https://support.anthropic.com
- **Azure OpenAI**: Azure Support Portal
- **DeepSeek**: https://platform.deepseek.com/support
- **Grok**: https://x.ai/support
- **OpenAI**: https://help.openai.com
