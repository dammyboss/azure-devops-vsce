# Multi-Provider AI Implementation Details

## Architecture Overview

The Azure DevOps Boards AI Assistant now supports multiple AI providers with a unified interface, inspired by the Code Pilot AI implementation.

## Key Components

### 1. Provider Type Definition
```typescript
export type Provider = 'anthropic' | 'azure' | 'deepseek' | 'grok' | 'openai';

export interface ProviderConfig {
  provider: Provider;
  anthropicApiKey?: string;
  anthropicModel?: string;
  azureEndpoint?: string;
  azureApiKey?: string;
  azureDeployment?: string;
  azureApiVersion?: string;
  deepseekApiKey?: string;
  deepseekModel?: string;
  grokApiKey?: string;
  grokModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
}
```

### 2. API Client Structure

The `APIClient` class manages all provider interactions:

- **Provider Routing**: Routes requests to the appropriate provider based on configuration
- **Configuration Management**: Loads and updates provider settings
- **Conversation History**: Maintains context across messages
- **Token Tracking**: Tracks input/output tokens for each provider
- **Streaming**: Handles streaming responses from all providers

### 3. Provider-Specific Methods

Each provider has dedicated implementation:

#### Anthropic
- **Endpoint**: https://api.anthropic.com/v1/messages
- **Auth**: Bearer token via `x-api-key` header
- **Stream Format**: Server-Sent Events (SSE)
- **Method**: `callAnthropicAPI()` → `processAnthropicStream()`

#### Azure OpenAI
- **Endpoint**: Azure-managed (custom per deployment)
- **Auth**: API key via `api-key` header
- **Stream Format**: OpenAI-compatible streaming
- **Method**: `callAzureAPI()` → `processOpenAIStream()`

#### OpenAI-Compatible (DeepSeek, Grok, OpenAI)
- **Shared Logic**: All use OpenAI-compatible API format
- **Auth**: Bearer token via `Authorization` header
- **Stream Format**: OpenAI streaming format
- **Method**: `callOpenAICompatible()` → `processOpenAIStream()`

### 4. Configuration Loading

```typescript
private loadConfig() {
  const config = vscode.workspace.getConfiguration('azureDevOps.ai');
  this.provider = config.get('provider', 'anthropic') as Provider;
  
  // Load provider-specific credentials
  this.anthropicApiKey = config.get('anthropic.apiKey', '');
  this.azureEndpoint = config.get('azure.endpoint', '');
  this.deepseekApiKey = config.get('deepseek.apiKey', '');
  // ... etc
}
```

### 5. Provider Routing in runAgentLoop

```typescript
private async runAgentLoop(callbacks: StreamCallbacks): Promise<void> {
  while (iteration < maxIterations) {
    let response;
    
    switch (this.provider) {
      case 'anthropic':
        response = await this.callAnthropicAPI();
        break;
      case 'azure':
        response = await this.callAzureAPI();
        break;
      case 'deepseek':
        response = await this.callDeepSeekAPI();
        break;
      case 'grok':
        response = await this.callGrokAPI();
        break;
      case 'openai':
        response = await this.callOpenAIAPI();
        break;
    }
    // ... process response and continue loop
  }
}
```

## Data Flow

```
User Message
    ↓
chat-editor.ts / chat-provider.ts
    ↓
APIClient.sendMessage()
    ↓
APIClient.runAgentLoop()
    ↓
Provider Router (based on this.provider)
    ├→ callAnthropicAPI() → Anthropic API
    ├→ callAzureAPI() → Azure OpenAI API
    ├→ callDeepSeekAPI() → DeepSeek API
    ├→ callGrokAPI() → Grok API
    └→ callOpenAIAPI() → OpenAI API
    ↓
Stream Processing (provider-specific)
    ├→ processAnthropicStream()
    └→ processOpenAIStream()
    ↓
ContentBlock[] (normalized format)
    ↓
Tool Execution (if needed)
    ↓
Callbacks (onText, onToolUse, onToolResult)
    ↓
UI Updates (chat-editor.ts / chat-provider.ts)
```

## Error Handling

Each provider implementation includes:

1. **Configuration Validation**: Checks required credentials are present
2. **Network Error Handling**: Catches fetch errors
3. **API Error Parsing**: Extracts meaningful error messages from responses
4. **Graceful Degradation**: Falls back to Anthropic if provider unavailable
5. **User-Friendly Messages**: Converts technical errors to user guidance

Example:
```typescript
private async callAnthropicAPI() {
  if (!this.anthropicApiKey) {
    throw new Error('Anthropic API key not configured. 
      Please set azureDevOps.ai.anthropic.apiKey in settings.');
  }
  // ... API call
}
```

## Stream Processing

All providers stream responses, but in different formats:

### Anthropic Format (SSE)
```
data: {"type":"content_block_start","content_block":{"type":"text"}}
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}
data: {"type":"content_block_stop"}
```

### OpenAI Format (SSE)
```
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: [DONE]
```

Both are normalized to a common `ContentBlock[]` format internally.

## Model Configuration

Each provider can have multiple model options configured:

```typescript
// Default models
private anthropicModel: string = 'claude-opus-4-1-20250805';
private deepseekModel: string = 'deepseek-chat';
private grokModel: string = 'grok-beta';
private openaiModel: string = 'gpt-4o';
private azureApiVersion: string = '2024-02-15-preview';
```

Users can override via settings:
```json
"azureDevOps.ai.anthropic.model": "claude-sonnet-4-20250514"
```

## MCP Tools Integration

Tools are loaded once and shared across all providers:

```typescript
public setMCPTools(tools: any[]) {
  this.mcpTools = tools;
}
```

Tools are included in every API call:
```typescript
body: JSON.stringify({
  model: this.anthropicModel,
  messages: this.conversationHistory,
  tools: this.mcpTools, // Shared tools
  stream: true
})
```

## Token Counting

Each response updates token counts:

```typescript
this.totalInputTokens += response.inputTokens;
this.totalOutputTokens += response.outputTokens;

// Reported back via callbacks
callbacks.onComplete(this.totalInputTokens, this.totalOutputTokens);
```

## Extending to New Providers

To add a new provider:

1. **Add to Provider Type**:
   ```typescript
   export type Provider = '...' | 'newprovider';
   ```

2. **Add Configuration Properties**:
   ```typescript
   private newproviderApiKey: string = '';
   private newproviderModel: string = 'default-model';
   ```

3. **Add to loadConfig()**:
   ```typescript
   this.newproviderApiKey = config.get('newprovider.apiKey', '');
   ```

4. **Implement Provider Method**:
   ```typescript
   private async callNewProviderAPI() {
     if (!this.newproviderApiKey) {
       throw new Error('NewProvider API key not configured...');
     }
     // Implement API call
     return this.processNewProviderStream(response);
   }
   ```

5. **Add to Router**:
   ```typescript
   case 'newprovider':
     response = await this.callNewProviderAPI();
     break;
   ```

6. **Add Stream Processor** (if format differs from OpenAI):
   ```typescript
   private async processNewProviderStream(response: Response) {
     // Parse provider-specific format
     // Return normalized ContentBlock[]
   }
   ```

## Testing Different Providers

```bash
# In VS Code, update settings and test:
1. Open AI Chat (Cmd+Shift+P → "Open AI Chat")
2. Ask a test question
3. Observe response and token counts
4. Switch provider via settings
5. Reload window (Cmd+Shift+P → Developer: Reload Window)
6. Test again with same question
7. Compare responses, speed, and costs
```

## Performance Characteristics

| Provider | Speed | Cost | Accuracy | Features |
|----------|-------|------|----------|----------|
| Anthropic | Slow | High | Excellent | Extended thinking |
| OpenAI | Fast | High | Excellent | Latest models |
| Azure | Medium | Medium | Excellent | Enterprise |
| DeepSeek | Fast | Low | Good | Cost-effective |
| Grok | Very Fast | Medium | Good | Real-time data |

## Future Enhancements

1. **Provider UI Selector**: Dropdown in chat interface to switch providers
2. **Model Selector**: Choose models from a provider's available options
3. **Cost Tracking**: Track estimated costs per provider
4. **Fallback Strategy**: Automatic fallback if primary provider fails
5. **Load Balancing**: Distribute requests across multiple providers
6. **Provider Comparison**: Side-by-side responses from different providers

## References

- Code Pilot AI: https://github.com/your-org/code-pilot-ai
- Anthropic API: https://docs.anthropic.com
- OpenAI API: https://platform.openai.com/docs
- Azure OpenAI: https://learn.microsoft.com/azure/cognitive-services/openai
- DeepSeek API: https://platform.deepseek.com/docs
