import React, { useState } from 'react';
import { Key, Eye, EyeOff } from 'lucide-react';
import { AIProvider, AIProviderConfig } from '../../types/settings';
import { vscode } from '../../utils/vscode';

interface APIProviderSettingsProps {
  config: AIProviderConfig;
  onChange: (config: AIProviderConfig) => void;
}

const providers: { value: AIProvider; label: string; requiresApiKey: boolean }[] = [
  { value: 'anthropic', label: 'Anthropic (Claude)', requiresApiKey: true },
  { value: 'openai', label: 'OpenAI (GPT-4, GPT-3.5)', requiresApiKey: true },
  { value: 'deepseek', label: 'DeepSeek', requiresApiKey: true },
  { value: 'openrouter', label: 'OpenRouter', requiresApiKey: true },
  { value: 'ollama', label: 'Ollama (Local)', requiresApiKey: false },
  { value: 'azure', label: 'Azure OpenAI', requiresApiKey: true },
];

const defaultModels: Record<AIProvider, string[]> = {
  anthropic: [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ],
  openai: [
    'gpt-4-turbo-preview',
    'gpt-4-0125-preview',
    'gpt-4',
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-16k',
  ],
  deepseek: ['deepseek-chat', 'deepseek-coder'],
  openrouter: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4-turbo'],
  ollama: ['llama2', 'codellama', 'mistral'],
  azure: ['gpt-4', 'gpt-35-turbo'],
};

const InputField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
  description?: string;
}> = ({ label, value, onChange, placeholder, type = 'text', description }) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && !showPassword ? 'password' : 'text';

  return (
    <div style={{ marginBottom: '16px' }}>
      <label
        style={{
          display: 'block',
          marginBottom: '6px',
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--vscode-foreground)',
        }}
      >
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: '8px 12px',
            paddingRight: isPassword ? '40px' : '12px',
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            border: '1px solid var(--vscode-input-border)',
            borderRadius: '4px',
            fontSize: '13px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => {
            e.currentTarget.style.border = '1px solid var(--vscode-focusBorder)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.border = '1px solid var(--vscode-input-border)';
          }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--vscode-descriptionForeground)',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {description && (
        <p
          style={{
            margin: '6px 0 0 0',
            fontSize: '12px',
            color: 'var(--vscode-descriptionForeground)',
            lineHeight: '1.5',
          }}
        >
          {description}
        </p>
      )}
    </div>
  );
};

const SelectField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  description?: string;
}> = ({ label, value, onChange, options, description }) => {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label
        style={{
          display: 'block',
          marginBottom: '6px',
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--vscode-foreground)',
        }}
      >
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: 'var(--vscode-dropdown-background)',
          color: 'var(--vscode-dropdown-foreground)',
          border: '1px solid var(--vscode-dropdown-border)',
          borderRadius: '4px',
          fontSize: '13px',
          outline: 'none',
          cursor: 'pointer',
          boxSizing: 'border-box',
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {description && (
        <p
          style={{
            margin: '6px 0 0 0',
            fontSize: '12px',
            color: 'var(--vscode-descriptionForeground)',
            lineHeight: '1.5',
          }}
        >
          {description}
        </p>
      )}
    </div>
  );
};

const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
}> = ({ label, value, onChange, min, max, step, description }) => {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label
        style={{
          display: 'block',
          marginBottom: '6px',
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--vscode-foreground)',
        }}
      >
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <input
          type="range"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          min={min}
          max={max}
          step={step}
          style={{
            flex: 1,
            cursor: 'pointer',
          }}
        />
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          min={min}
          max={max}
          step={step}
          style={{
            width: '80px',
            padding: '6px 8px',
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            border: '1px solid var(--vscode-input-border)',
            borderRadius: '4px',
            fontSize: '13px',
            outline: 'none',
            textAlign: 'center',
          }}
        />
      </div>
      {description && (
        <p
          style={{
            margin: '6px 0 0 0',
            fontSize: '12px',
            color: 'var(--vscode-descriptionForeground)',
            lineHeight: '1.5',
          }}
        >
          {description}
        </p>
      )}
    </div>
  );
};

export const APIProviderSettings: React.FC<APIProviderSettingsProps> = ({ config, onChange }) => {
  const selectedProvider = providers.find((p) => p.value === config.provider) || providers[0];
  const availableModels = defaultModels[config.provider] || [];

  const updateConfig = (updates: Partial<AIProviderConfig>) => {
    onChange({ ...config, ...updates });
  };

  const handleProviderChange = (newProvider: string) => {
    const provider = newProvider as AIProvider;
    const models = defaultModels[provider] || [];
    updateConfig({
      provider,
      model: models[0] || '',
      apiKey: '',
      baseUrl: provider === 'ollama' ? 'http://localhost:11434' : '',
    });
  };

  return (
    <div>
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--vscode-textCodeBlock-background)',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: '6px',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Key size={16} style={{ color: 'var(--vscode-descriptionForeground)' }} />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>API Provider Configuration</span>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: '12px',
            color: 'var(--vscode-descriptionForeground)',
            lineHeight: '1.6',
          }}
        >
          Configure your AI provider settings. Your API keys are stored securely and never shared.
        </p>
      </div>

      <SelectField
        label="Provider"
        value={config.provider}
        onChange={handleProviderChange}
        options={providers.map((p) => ({ value: p.value, label: p.label }))}
        description="Choose your AI model provider"
      />

      {selectedProvider.requiresApiKey && (
        <InputField
          label="API Key"
          value={config.apiKey || ''}
          onChange={(value) => updateConfig({ apiKey: value })}
          placeholder={`Enter your ${selectedProvider.label} API key`}
          type="password"
          description="Your API key will be stored securely in VSCode settings"
        />
      )}

      {config.provider === 'ollama' && (
        <InputField
          label="Base URL"
          value={config.baseUrl || 'http://localhost:11434'}
          onChange={(value) => updateConfig({ baseUrl: value })}
          placeholder="http://localhost:11434"
          description="URL of your Ollama server"
        />
      )}

      {config.provider === 'azure' && (
        <>
          <InputField
            label="Azure Endpoint"
            value={config.baseUrl || ''}
            onChange={(value) => updateConfig({ baseUrl: value })}
            placeholder="https://your-resource.openai.azure.com"
            description="Your Azure OpenAI resource endpoint"
          />
        </>
      )}

      <SelectField
        label="Model"
        value={config.model || availableModels[0] || ''}
        onChange={(value) => updateConfig({ model: value })}
        options={availableModels.map((m) => ({ value: m, label: m }))}
        description="Select the model to use for AI interactions"
      />

      <NumberField
        label="Temperature"
        value={config.temperature ?? 0.7}
        onChange={(value) => updateConfig({ temperature: value })}
        min={0}
        max={1}
        step={0.1}
        description="Controls randomness in responses. Higher values make output more random, lower values more focused."
      />

      <NumberField
        label="Max Tokens"
        value={config.maxTokens ?? 4096}
        onChange={(value) => updateConfig({ maxTokens: Math.round(value) })}
        min={256}
        max={8192}
        step={256}
        description="Maximum length of the AI response"
      />

      <div style={{ marginTop: '24px' }}>
        <button
          onClick={() => {
            vscode.postMessage({
              type: 'saveApiConfig',
              config,
            });
          }}
          style={{
            width: '100%',
            padding: '10px 16px',
            background: 'var(--vscode-button-background)',
            color: 'var(--vscode-button-foreground)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--vscode-button-hoverBackground)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--vscode-button-background)';
          }}
        >
          Save Configuration
        </button>
      </div>
    </div>
  );
};
