import * as vscode from 'vscode';

/**
 * Secure storage for API keys and sensitive credentials
 * Uses VS Code SecretStorage API for encrypted storage
 */
export class SecretsManager {
    private static instance: SecretsManager;
    private context: vscode.ExtensionContext;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public static getInstance(context: vscode.ExtensionContext): SecretsManager {
        if (!SecretsManager.instance) {
            SecretsManager.instance = new SecretsManager(context);
        }
        return SecretsManager.instance;
    }

    /**
     * Store a secret securely
     */
    async storeSecret(key: string, value: string): Promise<void> {
        await this.context.secrets.store(key, value);
    }

    /**
     * Retrieve a secret
     */
    async getSecret(key: string): Promise<string | undefined> {
        return await this.context.secrets.get(key);
    }

    /**
     * Delete a secret
     */
    async deleteSecret(key: string): Promise<void> {
        await this.context.secrets.delete(key);
    }

    /**
     * Check if a secret exists (has non-empty value)
     */
    async hasSecret(key: string): Promise<boolean> {
        const value = await this.getSecret(key);
        return value !== undefined && value !== '';
    }

    // ========== Provider-Specific Methods ==========

    /**
     * Get Anthropic API Key
     */
    async getAnthropicApiKey(): Promise<string | undefined> {
        return this.getSecret('azureDevOps.ai.anthropic.apiKey');
    }

    /**
     * Store Anthropic API Key
     */
    async storeAnthropicApiKey(apiKey: string): Promise<void> {
        await this.storeSecret('azureDevOps.ai.anthropic.apiKey', apiKey);
    }

    /**
     * Get Azure OpenAI API Key
     */
    async getAzureApiKey(): Promise<string | undefined> {
        return this.getSecret('azureDevOps.ai.azure.apiKey');
    }

    /**
     * Store Azure OpenAI API Key
     */
    async storeAzureApiKey(apiKey: string): Promise<void> {
        await this.storeSecret('azureDevOps.ai.azure.apiKey', apiKey);
    }

    /**
     * Get DeepSeek API Key
     */
    async getDeepSeekApiKey(): Promise<string | undefined> {
        return this.getSecret('azureDevOps.ai.deepseek.apiKey');
    }

    /**
     * Store DeepSeek API Key
     */
    async storeDeepSeekApiKey(apiKey: string): Promise<void> {
        await this.storeSecret('azureDevOps.ai.deepseek.apiKey', apiKey);
    }

    /**
     * Get Grok API Key
     */
    async getGrokApiKey(): Promise<string | undefined> {
        return this.getSecret('azureDevOps.ai.grok.apiKey');
    }

    /**
     * Store Grok API Key
     */
    async storeGrokApiKey(apiKey: string): Promise<void> {
        await this.storeSecret('azureDevOps.ai.grok.apiKey', apiKey);
    }

    /**
     * Get OpenAI API Key
     */
    async getOpenAIApiKey(): Promise<string | undefined> {
        return this.getSecret('azureDevOps.ai.openai.apiKey');
    }

    /**
     * Store OpenAI API Key
     */
    async storeOpenAIApiKey(apiKey: string): Promise<void> {
        await this.storeSecret('azureDevOps.ai.openai.apiKey', apiKey);
    }

    /**
     * Migrate API keys from workspace settings to secret storage
     * This should be called once to migrate existing credentials
     */
    async migrateFromSettings(): Promise<{ migrated: string[]; errors: string[] }> {
        const migrated: string[] = [];
        const errors: string[] = [];

        const config = vscode.workspace.getConfiguration('azureDevOps.ai');

        // Migrate Anthropic
        try {
            const anthropicKey = config.get<string>('anthropic.apiKey');
            if (anthropicKey && anthropicKey.trim()) {
                await this.storeAnthropicApiKey(anthropicKey);
                migrated.push('Anthropic API Key');
                // Clear from settings
                await config.update('anthropic.apiKey', undefined, vscode.ConfigurationTarget.Global);
            }
        } catch (error) {
            errors.push(`Anthropic: ${error}`);
        }

        // Migrate Azure
        try {
            const azureKey = config.get<string>('azure.apiKey');
            if (azureKey && azureKey.trim()) {
                await this.storeAzureApiKey(azureKey);
                migrated.push('Azure API Key');
                await config.update('azure.apiKey', undefined, vscode.ConfigurationTarget.Global);
            }
        } catch (error) {
            errors.push(`Azure: ${error}`);
        }

        // Migrate DeepSeek
        try {
            const deepseekKey = config.get<string>('deepseek.apiKey');
            if (deepseekKey && deepseekKey.trim()) {
                await this.storeDeepSeekApiKey(deepseekKey);
                migrated.push('DeepSeek API Key');
                await config.update('deepseek.apiKey', undefined, vscode.ConfigurationTarget.Global);
            }
        } catch (error) {
            errors.push(`DeepSeek: ${error}`);
        }

        // Migrate Grok
        try {
            const grokKey = config.get<string>('grok.apiKey');
            if (grokKey && grokKey.trim()) {
                await this.storeGrokApiKey(grokKey);
                migrated.push('Grok API Key');
                await config.update('grok.apiKey', undefined, vscode.ConfigurationTarget.Global);
            }
        } catch (error) {
            errors.push(`Grok: ${error}`);
        }

        // Migrate OpenAI
        try {
            const openaiKey = config.get<string>('openai.apiKey');
            if (openaiKey && openaiKey.trim()) {
                await this.storeOpenAIApiKey(openaiKey);
                migrated.push('OpenAI API Key');
                await config.update('openai.apiKey', undefined, vscode.ConfigurationTarget.Global);
            }
        } catch (error) {
            errors.push(`OpenAI: ${error}`);
        }

        return { migrated, errors };
    }

    /**
     * Check if migration is needed
     */
    async needsMigration(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('azureDevOps.ai');

        const hasAnthropicInSettings = !!(config.get<string>('anthropic.apiKey') || '').trim();
        const hasAzureInSettings = !!(config.get<string>('azure.apiKey') || '').trim();
        const hasDeepSeekInSettings = !!(config.get<string>('deepseek.apiKey') || '').trim();
        const hasGrokInSettings = !!(config.get<string>('grok.apiKey') || '').trim();
        const hasOpenAIInSettings = !!(config.get<string>('openai.apiKey') || '').trim();

        return hasAnthropicInSettings || hasAzureInSettings || hasDeepSeekInSettings ||
               hasGrokInSettings || hasOpenAIInSettings;
    }

    /**
     * Clear all secrets (for testing or reset)
     */
    async clearAllSecrets(): Promise<void> {
        await this.deleteSecret('azureDevOps.ai.anthropic.apiKey');
        await this.deleteSecret('azureDevOps.ai.azure.apiKey');
        await this.deleteSecret('azureDevOps.ai.deepseek.apiKey');
        await this.deleteSecret('azureDevOps.ai.grok.apiKey');
        await this.deleteSecret('azureDevOps.ai.openai.apiKey');
    }
}
