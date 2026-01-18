# AI Assistant Quick Start Guide

## 🚀 Get Started in 3 Steps

### Step 1: Choose Your AI Provider

Open VS Code Settings (`Ctrl+,` or `Cmd+,`) and search for "Azure DevOps AI"

**Option A: Anthropic Claude (Recommended)**
```json
{
  "azureDevOps.ai.provider": "anthropic",
  "azureDevOps.ai.anthropic.apiKey": "sk-ant-your-key-here",
  "azureDevOps.ai.anthropic.model": "claude-sonnet-4-20250514"
}
```
Get your API key: https://console.anthropic.com/

**Option B: OpenAI**
```json
{
  "azureDevOps.ai.provider": "openai",
  "azureDevOps.ai.openai.apiKey": "sk-your-key-here",
  "azureDevOps.ai.openai.model": "gpt-4o"
}
```
Get your API key: https://platform.openai.com/api-keys

**Option C: Azure OpenAI**
```json
{
  "azureDevOps.ai.provider": "azure",
  "azureDevOps.ai.azure.endpoint": "https://your-resource.openai.azure.com",
  "azureDevOps.ai.azure.apiKey": "your-key",
  "azureDevOps.ai.azure.deployment": "gpt-4o",
  "azureDevOps.ai.azure.model": "gpt-4o"
}
```

### Step 2: Open the AI Assistant

1. Click the **Azure DevOps** icon in the Activity Bar (left sidebar)
2. Find the **AI Assistant** view
3. Start chatting!

### Step 3: Ask Questions

Try these example queries:
- "Show me all my open work items"
- "What's the status of the current sprint?"
- "Create a bug for the login issue"
- "List high-priority tasks"

## 🔧 Optional: Add MCP Servers

MCP servers extend the AI's capabilities with specialized tools.

### Example: Filesystem Access

```json
{
  "azureDevOps.ai.mcp.servers": [
    {
      "name": "filesystem",
      "type": "local",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "${workspaceFolder}"]
    }
  ]
}
```

### Example: GitHub Integration

```json
{
  "azureDevOps.ai.mcp.servers": [
    {
      "name": "github",
      "type": "local",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "your-github-token"
      }
    }
  ]
}
```

### Example: Remote MCP Server

```json
{
  "azureDevOps.ai.mcp.servers": [
    {
      "name": "my-api",
      "type": "remote",
      "url": "https://my-mcp-server.com/api/mcp",
      "headers": {
        "Authorization": "Bearer your-token"
      }
    }
  ]
}
```

## 📝 Complete Settings Example

Here's a complete configuration with Anthropic Claude and two MCP servers:

```json
{
  // AI Provider
  "azureDevOps.ai.provider": "anthropic",
  "azureDevOps.ai.anthropic.apiKey": "sk-ant-your-key",
  "azureDevOps.ai.anthropic.model": "claude-sonnet-4-20250514",
  
  // MCP Servers
  "azureDevOps.ai.mcp.servers": [
    {
      "name": "filesystem",
      "type": "local",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "${workspaceFolder}"]
    },
    {
      "name": "github",
      "type": "local",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token"
      }
    }
  ]
}
```

## 🎯 Tips

1. **Use Workspace Settings** for team configurations
2. **Check the Output Channel** ("Azure DevOps AI") for debugging
3. **Start Simple** - Configure just the AI provider first, add MCP servers later
4. **Secure Your Keys** - Don't commit API keys to version control

## 🆘 Troubleshooting

### AI Not Responding
- ✅ Check your API key is correct
- ✅ Verify internet connection
- ✅ Check "Azure DevOps AI" output channel for errors

### MCP Server Won't Connect
- ✅ Ensure Node.js is installed (for npx commands)
- ✅ Check the command path is correct
- ✅ Review output channel for detailed error messages

### "Invalid API Key" Error
- ✅ Verify the API key format matches your provider
- ✅ Check for extra spaces or quotes in the key
- ✅ Ensure the key has the correct permissions

## 📚 Learn More

- [Full AI Integration Guide](./AI_INTEGRATION.md)
- [MCP Protocol Documentation](https://modelcontextprotocol.io)
- [Anthropic API Docs](https://docs.anthropic.com)
- [OpenAI API Docs](https://platform.openai.com/docs)

## 🎉 You're Ready!

Open the AI Assistant view and start chatting about your Azure DevOps work items!
