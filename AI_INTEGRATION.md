# AI Assistant Integration

The Azure DevOps Boards extension includes an AI assistant powered by multiple LLM providers with MCP (Model Context Protocol) support.

## Features

### Multi-Provider LLM Support
- **Anthropic Claude** - Claude Sonnet 4, Opus 4, 3.5 Sonnet, 3.5 Haiku
- **Azure OpenAI** - GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo
- **DeepSeek** - DeepSeek Chat, Coder, Reasoner
- **Grok** - Grok Beta, Grok 2
- **OpenAI** - GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo

### MCP Client Support
Connect to local or remote MCP servers to extend AI capabilities:
- **Local MCP Servers** - Run stdio-based MCP servers (Node.js, Python, etc.)
- **Remote MCP Servers** - Connect to HTTP-based MCP servers
- **Tool Integration** - AI can use MCP tools for specialized tasks

## Configuration

### AI Provider Settings

Open VS Code settings and configure your preferred AI provider:

```json
{
  "azureDevOps.ai.provider": "anthropic",
  "azureDevOps.ai.anthropic.apiKey": "your-api-key",
  "azureDevOps.ai.anthropic.model": "claude-sonnet-4-20250514"
}
```

#### Anthropic Claude
```json
{
  "azureDevOps.ai.provider": "anthropic",
  "azureDevOps.ai.anthropic.apiKey": "sk-ant-...",
  "azureDevOps.ai.anthropic.model": "claude-sonnet-4-20250514"
}
```

#### Azure OpenAI
```json
{
  "azureDevOps.ai.provider": "azure",
  "azureDevOps.ai.azure.endpoint": "https://your-resource.openai.azure.com",
  "azureDevOps.ai.azure.apiKey": "your-api-key",
  "azureDevOps.ai.azure.deployment": "gpt-4o",
  "azureDevOps.ai.azure.apiVersion": "2024-02-15-preview",
  "azureDevOps.ai.azure.model": "gpt-4o"
}
```

#### DeepSeek
```json
{
  "azureDevOps.ai.provider": "deepseek",
  "azureDevOps.ai.deepseek.apiKey": "your-api-key",
  "azureDevOps.ai.deepseek.model": "deepseek-chat"
}
```

#### Grok
```json
{
  "azureDevOps.ai.provider": "grok",
  "azureDevOps.ai.grok.apiKey": "your-api-key",
  "azureDevOps.ai.grok.model": "grok-beta"
}
```

#### OpenAI
```json
{
  "azureDevOps.ai.provider": "openai",
  "azureDevOps.ai.openai.apiKey": "sk-...",
  "azureDevOps.ai.openai.model": "gpt-4o"
}
```

### MCP Server Configuration

Configure MCP servers in your VS Code settings:

#### Local MCP Server Example
```json
{
  "azureDevOps.ai.mcp.servers": [
    {
      "name": "filesystem",
      "type": "local",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/workspace"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  ]
}
```

#### Remote MCP Server Example
```json
{
  "azureDevOps.ai.mcp.servers": [
    {
      "name": "my-remote-server",
      "type": "remote",
      "url": "https://my-mcp-server.com/api/mcp",
      "headers": {
        "Authorization": "Bearer your-token"
      }
    }
  ]
}
```

#### Multiple MCP Servers
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
    },
    {
      "name": "database",
      "type": "remote",
      "url": "https://db-mcp.example.com/mcp",
      "headers": {
        "X-API-Key": "your-api-key"
      }
    }
  ]
}
```

## Usage

### Opening the AI Assistant

1. Click on the Azure DevOps icon in the Activity Bar
2. Find the "AI Assistant" view
3. Type your question or request in the input box
4. Press Enter or click Send

### Example Queries

- "Show me all open work items assigned to me"
- "Create a new bug for the login issue"
- "What's the status of sprint 23?"
- "List all high-priority tasks"
- "Update work item 1234 to In Progress"

### Using MCP Tools

When MCP servers are configured, the AI can automatically use their tools:

- "Search for files containing 'authentication'"
- "Query the database for user records"
- "Create a GitHub issue for this bug"

## Commands

- **Azure DevOps: Open AI Assistant** - Open the AI chat interface
- **Azure DevOps: Configure MCP Servers** - Open MCP server configuration

## MCP Server Examples

### Official MCP Servers

```bash
# Filesystem access
npx -y @modelcontextprotocol/server-filesystem /path/to/workspace

# GitHub integration
npx -y @modelcontextprotocol/server-github

# PostgreSQL database
npx -y @modelcontextprotocol/server-postgres postgresql://localhost/mydb

# Google Drive
npx -y @modelcontextprotocol/server-gdrive
```

### Custom MCP Server

Create your own MCP server for Azure DevOps-specific operations:

```typescript
// Example: Custom Azure DevOps MCP server
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'azure-devops-mcp',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {}
  }
});

server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'get_work_item',
      description: 'Get work item details by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'Work item ID' }
        },
        required: ['id']
      }
    }
  ]
}));

server.setRequestHandler('tools/call', async (request) => {
  // Implement tool logic
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

## Security

- API keys are stored in VS Code settings (consider using workspace settings for team configurations)
- MCP servers run with the same permissions as VS Code
- Remote MCP servers should use HTTPS and authentication
- Review MCP server permissions before connecting

## Troubleshooting

### AI Not Responding
1. Check your API key is configured correctly
2. Verify internet connection
3. Check the "Azure DevOps AI" output channel for errors

### MCP Server Connection Failed
1. Verify the command/URL is correct
2. Check the "Azure DevOps AI" output channel for detailed errors
3. Ensure required dependencies are installed (Node.js, Python, etc.)
4. For remote servers, verify the URL is accessible

### Tool Execution Errors
1. Check MCP server logs in the output channel
2. Verify tool parameters are correct
3. Ensure MCP server has necessary permissions

## Architecture

```
┌─────────────────────────────────────────┐
│         VS Code Extension               │
│  ┌───────────────────────────────────┐  │
│  │      AI Chat Provider             │  │
│  │  (Webview UI)                     │  │
│  └───────────────────────────────────┘  │
│              │                           │
│  ┌───────────▼───────────────────────┐  │
│  │      API Client                   │  │
│  │  - Anthropic                      │  │
│  │  - Azure OpenAI                   │  │
│  │  - DeepSeek                       │  │
│  │  - Grok                           │  │
│  │  - OpenAI                         │  │
│  └───────────────────────────────────┘  │
│              │                           │
│  ┌───────────▼───────────────────────┐  │
│  │      MCP Client                   │  │
│  │  - Local servers (stdio)          │  │
│  │  - Remote servers (HTTP)          │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
              │
    ┌─────────┴─────────┐
    │                   │
┌───▼────┐      ┌───────▼────────┐
│  LLM   │      │  MCP Servers   │
│  APIs  │      │  (Local/Remote)│
└────────┘      └────────────────┘
```

## Future Enhancements

- [ ] Voice input support
- [ ] Code generation for work items
- [ ] Automated sprint planning
- [ ] Team velocity predictions
- [ ] Custom prompt templates
- [ ] Chat history persistence
- [ ] Multi-turn conversations with context
- [ ] Integration with Azure DevOps REST API tools
