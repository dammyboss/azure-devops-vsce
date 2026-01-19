import * as vscode from 'vscode';
import { aiChatProvider } from '../extension';

export interface ProviderSettings {
    provider: 'anthropic' | 'azure' | 'deepseek' | 'grok' | 'openai';
    apiKey: string;
    model?: string;
    azureEndpoint?: string;
    azureDeployment?: string;
    azureVersion?: string;
}

export class SettingsUIProvider {
    private static currentPanel?: vscode.WebviewPanel;
    private outputChannel: vscode.OutputChannel;
    private panel?: vscode.WebviewPanel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    public static createSettingsPanel(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): vscode.WebviewPanel {
        // If panel already exists, reveal it instead of creating a new one
        if (SettingsUIProvider.currentPanel) {
            SettingsUIProvider.currentPanel.reveal(vscode.ViewColumn.One);
            return SettingsUIProvider.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'azureDevOpsSettingsPanel',
            'Azure DevOps AI Settings',
            vscode.ViewColumn.One,
            { 
                enableScripts: true,
                localResourceRoots: [context.extensionUri],
                retainContextWhenHidden: true
            }
        );

        SettingsUIProvider.currentPanel = panel;

        const provider = new SettingsUIProvider(outputChannel);
        provider.panel = panel;
        panel.webview.html = provider.getHtmlContent(panel.webview, context);

        panel.webview.onDidReceiveMessage(async (message) => {
            await provider.handleMessage(message, context);
        });

        // Reset when panel is closed
        panel.onDidDispose(() => {
            SettingsUIProvider.currentPanel = undefined;
        });

        return panel;
    }

    private getHtmlContent(webview: vscode.Webview, context: vscode.ExtensionContext): string {
        // Create URIs for all icons
        const claudeIconUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'claude-color.svg'));
        const azureIconUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'azureai-color.svg'));
        const openaiIconUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'openai.svg'));
        const deepseekIconUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'deepseek-color.svg'));
        const grokIconUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'grok.svg'));

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Azure DevOps AI Settings</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .tools-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            animation: modalFadeIn 0.2s ease forwards;
        }

        .tools-modal.closing {
            animation: modalFadeOut 0.2s ease forwards;
        }

        @keyframes modalFadeIn {
            to {
                background-color: rgba(0, 0, 0, 0.5);
                opacity: 1;
            }
        }

        @keyframes modalFadeOut {
            from {
                background-color: rgba(0, 0, 0, 0.5);
                opacity: 1;
            }
            to {
                background-color: rgba(0, 0, 0, 0);
                opacity: 0;
            }
        }

        .tools-modal-content {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            width: 500px;
            max-width: 90vw;
            min-height: 420px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
            overflow: hidden;
            transform: scale(0.9) translateY(-20px);
            opacity: 0;
            animation: modalSlideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        .tools-modal.closing .tools-modal-content {
            animation: modalSlideOut 0.2s ease forwards;
        }

        @keyframes modalSlideIn {
            to {
                transform: scale(1) translateY(0);
                opacity: 1;
            }
        }

        @keyframes modalSlideOut {
            from {
                transform: scale(1) translateY(0);
                opacity: 1;
            }
            to {
                transform: scale(0.9) translateY(-20px);
                opacity: 0;
            }
        }

        .tools-modal-header {
            padding: 16px 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }

        .tools-modal-header span {
            font-weight: 600;
            font-size: 14px;
            color: var(--vscode-foreground);
        }

        .tools-close-btn {
            background: none;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 16px;
            padding: 4px;
        }

        .tools-close-btn:hover {
            opacity: 0.7;
        }

        .tools-modal-body {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
        }

        .settings-tabs {
            display: flex;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding: 0 16px;
            background: transparent;
            flex-shrink: 0;
        }

        .settings-tab {
            background: transparent;
            border: none;
            padding: 10px 16px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            border-bottom: 2px solid transparent;
            margin-bottom: -1px;
            transition: all 0.2s ease;
        }

        .settings-tab:hover {
            color: var(--vscode-foreground);
            background: var(--vscode-list-hoverBackground);
        }

        .settings-tab.active {
            color: var(--vscode-foreground);
            border-bottom-color: var(--vscode-focusBorder);
            font-weight: 500;
        }

        .tools-list {
            padding: 20px;
            min-height: 280px;
            max-height: 280px;
            overflow-y: auto;
            background: transparent;
        }

        .settings-tab-content {
            display: none;
            animation: fadeIn 0.2s ease;
        }

        .settings-tab-content.active {
            display: block;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .form-group {
            margin-bottom: 16px;
        }

        label {
            display: block;
            margin-bottom: 6px;
            font-size: 12px;
            font-weight: 600;
        }

        .description {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 6px;
        }

        /* Custom Dropdown */
        .custom-dropdown {
            position: relative;
            width: 100%;
        }

        .custom-dropdown-selected {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            position: relative;
        }

        .custom-dropdown-selected:hover {
            border-color: var(--vscode-focusBorder);
        }

        .custom-dropdown-selected.open {
            border-color: var(--vscode-focusBorder);
        }

        .custom-dropdown-icon {
            width: 16px;
            height: 16px;
            flex-shrink: 0;
        }

        .custom-dropdown-icon img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }

        .custom-dropdown-text {
            flex: 1;
        }

        .custom-dropdown-arrow {
            margin-left: auto;
            width: 12px;
            height: 12px;
            transition: transform 0.2s;
        }

        .custom-dropdown-selected.open .custom-dropdown-arrow {
            transform: rotate(180deg);
        }

        .custom-dropdown-list {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            margin-top: 4px;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 1000;
            max-height: 200px;
            overflow-y: auto;
            display: none;
        }

        .custom-dropdown-list.open {
            display: block;
        }

        .custom-dropdown-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            cursor: pointer;
            font-size: 11px;
            transition: background 0.1s;
        }

        .custom-dropdown-item:hover,
        .custom-dropdown-item.focused {
            background: var(--vscode-list-hoverBackground);
        }

        .custom-dropdown-item.selected {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }

        .file-search-input,
        input[type="text"],
        input[type="password"],
        select {
            width: 100%;
            padding: 6px 8px;
            font-size: 13px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            font-family: var(--vscode-font-family);
            outline: none;
        }

        .file-search-input:focus,
        input:focus,
        select:focus {
            border-color: var(--vscode-focusBorder);
        }

        .provider-config-section {
            display: none;
        }

        .provider-config-section.active {
            display: block;
        }

        .button-group {
            display: flex;
            gap: 8px;
            align-items: center;
            margin-top: 12px;
        }

        button {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            font-size: 11px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s;
        }

        .btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-panel-border);
        }

        .btn:hover {
            background-color: var(--vscode-button-background);
            border-color: var(--vscode-focusBorder);
        }

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .test-result {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .test-result.success {
            color: #4ade80;
        }

        .test-result.error {
            color: #ef4444;
        }

        .loading-spinner {
            display: inline-block;
            width: 12px;
            height: 12px;
            border: 2px solid var(--vscode-descriptionForeground);
            border-top-color: var(--vscode-button-background);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .settings-footer {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            background: transparent;
            flex-shrink: 0;
        }

        .save-status {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            transition: all 0.2s ease;
        }

        .save-status.success {
            color: #4ade80;
        }

        .save-status.error {
            color: #ef4444;
        }

        /* MCP Server Styles */
        .mcp-servers-list {
            padding: 4px;
        }

        .mcp-server-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 20px 24px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            margin-bottom: 16px;
            background: var(--vscode-editor-background);
            transition: all 0.2s ease;
        }

        .mcp-server-item:hover {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .mcp-server-type-badge {
            font-size: 9px;
            padding: 2px 6px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 3px;
        }

        .mcp-add-form {
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            padding: 16px;
            margin-top: 16px;
            background: var(--vscode-list-hoverBackground);
        }

        .mcp-type-btn {
            flex: 1;
            padding: 8px;
            font-size: 11px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s;
        }

        .mcp-type-btn.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-background);
        }

        /* MCP Toggle Switch Styles */
        .mcp-toggle-switch {
            position: relative;
            display: inline-block;
            width: 40px;
            height: 20px;
        }

        .mcp-toggle-input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .mcp-toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 20px;
            transition: 0.3s;
        }

        .mcp-toggle-slider:before {
            position: absolute;
            content: "";
            height: 14px;
            width: 14px;
            left: 2px;
            bottom: 2px;
            background-color: var(--vscode-foreground);
            border-radius: 50%;
            transition: 0.3s;
        }

        .mcp-toggle-input:checked + .mcp-toggle-slider {
            background-color: var(--vscode-button-background);
            border-color: var(--vscode-button-background);
        }

        .mcp-toggle-input:checked + .mcp-toggle-slider:before {
            transform: translateX(20px);
            background-color: var(--vscode-button-foreground);
        }

        .mcp-toggle-slider:hover {
            border-color: var(--vscode-focusBorder);
        }
    </style>
</head>
<body>
    <div class="tools-modal">
        <div class="tools-modal-content">
            <div class="tools-modal-header">
                <span>Azure DevOps AI Settings</span>
                <button class="tools-close-btn" onclick="closeModal()">✕</button>
            </div>

            <div class="settings-tabs">
                <button class="settings-tab active" onclick="switchTab('model')">Model Configuration</button>
                <button class="settings-tab" onclick="switchTab('mcp')">MCP Servers</button>
            </div>

            <div class="tools-modal-body">
                <div class="tools-list">
                    <!-- Model Configuration Tab -->
                    <div id="modelTab" class="settings-tab-content active">
                    <div class="form-group">
                        <label>AI Provider</label>
                        <div id="provider-dropdown" class="custom-dropdown">
                            <div class="custom-dropdown-selected" tabindex="0">
                                <div class="custom-dropdown-icon">
                                    <img src="${claudeIconUri}" alt="">
                                </div>
                                <span class="custom-dropdown-text">Anthropic (Claude)</span>
                                <svg class="custom-dropdown-arrow" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M4 6l4 4 4-4"/>
                                </svg>
                            </div>
                            <div class="custom-dropdown-list">
                                <div class="custom-dropdown-item selected" data-value="anthropic" data-icon="${claudeIconUri}">
                                    <div class="custom-dropdown-icon">
                                        <img src="${claudeIconUri}" alt="">
                                    </div>
                                    <span>Anthropic (Claude)</span>
                                </div>
                                <div class="custom-dropdown-item" data-value="azure" data-icon="${azureIconUri}">
                                    <div class="custom-dropdown-icon">
                                        <img src="${azureIconUri}" alt="">
                                    </div>
                                    <span>Azure OpenAI</span>
                                </div>
                                <div class="custom-dropdown-item" data-value="deepseek" data-icon="${deepseekIconUri}">
                                    <div class="custom-dropdown-icon">
                                        <img src="${deepseekIconUri}" alt="">
                                    </div>
                                    <span>DeepSeek</span>
                                </div>
                                <div class="custom-dropdown-item" data-value="openai" data-icon="${openaiIconUri}">
                                    <div class="custom-dropdown-icon">
                                        <img src="${openaiIconUri}" alt="">
                                    </div>
                                    <span>OpenAI</span>
                                </div>
                                <div class="custom-dropdown-item" data-value="grok" data-icon="${grokIconUri}">
                                    <div class="custom-dropdown-icon">
                                        <img src="${grokIconUri}" alt="">
                                    </div>
                                    <span>Grok (xAI)</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Anthropic Configuration -->
                    <div id="anthropicConfigSection" class="provider-config-section active">
                        <div class="form-group">
                            <label>API Key</label>
                            <input type="password" id="anthropic-api-key" placeholder="sk-ant-api03-...">
                        </div>
                        <div class="button-group">
                            <button class="btn" onclick="testAnthropicConnection()" id="testAnthropicBtn">Test Connection</button>
                            <span id="anthropicTestResult" class="test-result"></span>
                        </div>
                    </div>

                    <!-- Azure OpenAI Configuration -->
                    <div id="azureConfigSection" class="provider-config-section">
                        <div class="form-group">
                            <label>Endpoint URL</label>
                            <input type="text" id="azure-endpoint" placeholder="https://your-resource.openai.azure.com">
                        </div>
                        <div class="form-group">
                            <label>API Key</label>
                            <input type="password" id="azure-api-key" placeholder="Your Azure API key">
                        </div>
                        <div class="form-group">
                            <label>Deployment Name</label>
                            <input type="text" id="azure-deployment" placeholder="gpt-4">
                        </div>
                        <div class="form-group">
                            <label>API Version</label>
                            <input type="text" id="azure-version" placeholder="2024-02-15-preview" value="2024-02-15-preview">
                        </div>
                        <div class="button-group">
                            <button class="btn" onclick="testAzureConnection()" id="testAzureBtn">Test Connection</button>
                            <span id="azureTestResult" class="test-result"></span>
                        </div>
                    </div>

                    <!-- DeepSeek Configuration -->
                    <div id="deepseekConfigSection" class="provider-config-section">
                        <div class="form-group">
                            <label>API Key</label>
                            <input type="password" id="deepseek-api-key" placeholder="sk-...">
                        </div>
                        <div class="button-group">
                            <button class="btn" onclick="testDeepSeekConnection()" id="testDeepSeekBtn">Test Connection</button>
                            <span id="deepseekTestResult" class="test-result"></span>
                        </div>
                    </div>

                    <!-- Grok Configuration -->
                    <div id="grokConfigSection" class="provider-config-section">
                        <div class="form-group">
                            <label>API Key</label>
                            <input type="password" id="grok-api-key" placeholder="xai-...">
                        </div>
                        <div class="button-group">
                            <button class="btn" onclick="testGrokConnection()" id="testGrokBtn">Test Connection</button>
                            <span id="grokTestResult" class="test-result"></span>
                        </div>
                    </div>

                    <!-- OpenAI Configuration -->
                    <div id="openaiConfigSection" class="provider-config-section">
                        <div class="form-group">
                            <label>API Key</label>
                            <input type="password" id="openai-api-key" placeholder="sk-...">
                        </div>
                        <div class="button-group">
                            <button class="btn" onclick="testOpenAIConnection()" id="testOpenAIBtn">Test Connection</button>
                            <span id="openaiTestResult" class="test-result"></span>
                        </div>
                    </div>
                </div>

                    <!-- MCP Servers Tab -->
                    <div id="mcpTab" class="settings-tab-content">
                    <div class="form-group">
                        <p class="description">Manage Model Context Protocol (MCP) servers to extend capabilities with specialized tools and integrations.</p>
                    </div>

                    <!-- Server List -->
                    <div id="mcpServerList" class="mcp-server-list" style="margin-bottom: 16px;">
                        <div style="text-align: center; padding: 20px; color: var(--vscode-descriptionForeground); font-size: 11px;">
                            Loading MCP servers...
                        </div>
                    </div>

                    <!-- Add Server Section -->
                    <div class="mcp-add-server-section">
                        <button id="showAddMCPServerBtn" class="btn outlined" onclick="showAddMCPServerForm()" style="font-size: 11px; width: 100%;">
                            + Add New MCP Server
                        </button>

                        <div id="addMCPServerForm" class="mcp-add-form" style="display: none; margin-top: 16px; border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 16px;">
                            <h4 style="margin: 0 0 12px 0; font-size: 12px;">Add MCP Server</h4>

                            <!-- Server Type Selection -->
                            <div style="margin-bottom: 12px;">
                                <label style="display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600;">Server Type</label>
                                <div style="display: flex; gap: 8px;">
                                    <button class="mcp-type-btn active" id="mcpTypeRemote" onclick="selectMCPType('remote')" style="flex: 1; padding: 8px; font-size: 11px; border: 1px solid var(--vscode-button-background); border-radius: 4px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); cursor: pointer;">
                                        Remote (HTTP)
                                    </button>
                                    <button class="mcp-type-btn" id="mcpTypeLocal" onclick="selectMCPType('local')" style="flex: 1; padding: 8px; font-size: 11px; border: 1px solid var(--vscode-widget-border); border-radius: 4px; background: transparent; cursor: pointer;">
                                        Local (stdio)
                                    </button>
                                </div>
                            </div>

                            <!-- Server Name -->
                            <div style="margin-bottom: 12px;">
                                <label style="display: block; margin-bottom: 4px; font-size: 11px; color: var(--vscode-descriptionForeground);">Server Name *</label>
                                <input type="text" class="file-search-input" id="mcpServerName" placeholder="e.g., my-mcp-server">
                            </div>

                            <!-- Remote Server Fields -->
                            <div id="mcpRemoteFields">
                                <div style="margin-bottom: 12px;">
                                    <label style="display: block; margin-bottom: 4px; font-size: 11px; color: var(--vscode-descriptionForeground);">Server URL *</label>
                                    <input type="text" class="file-search-input" id="mcpServerURL" placeholder="https://my-server.com/api/mcp or my-server.com/api/mcp">
                                    <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 4px;">
                                        Protocol (https://) will be added automatically if not specified
                                    </div>
                                </div>
                            </div>

                            <!-- Local Server Fields -->
                            <div id="mcpLocalFields" style="display: none;">
                                <div style="margin-bottom: 12px;">
                                    <label style="display: block; margin-bottom: 4px; font-size: 11px; color: var(--vscode-descriptionForeground);">Command *</label>
                                    <input type="text" class="file-search-input" id="mcpServerCommand" placeholder="e.g., node, python, dotnet">
                                </div>

                                <div style="margin-bottom: 12px;">
                                    <label style="display: block; margin-bottom: 4px; font-size: 11px; color: var(--vscode-descriptionForeground);">Arguments (comma-separated)</label>
                                    <input type="text" class="file-search-input" id="mcpServerArgs" placeholder="e.g., /path/to/server.js, --port, 3000">
                                </div>

                                <div style="margin-bottom: 12px;">
                                    <label style="display: block; margin-bottom: 4px; font-size: 11px; color: var(--vscode-descriptionForeground);">Environment Variables (KEY=VALUE, comma-separated)</label>
                                    <textarea class="file-search-input" id="mcpServerEnv" placeholder="API_KEY=your-key, DEBUG=true" style="min-height: 60px; font-family: monospace;"></textarea>
                                </div>
                            </div>

                            <!-- Action Buttons -->
                            <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;">
                                <button class="btn" onclick="cancelAddMCPServer()" style="font-size: 11px; padding: 6px 16px; background: transparent; border: 1px solid var(--vscode-widget-border); color: var(--vscode-foreground);">Cancel</button>
                                <button class="btn" onclick="saveMCPServer()" style="font-size: 11px; padding: 6px 16px;">Add Server</button>
                            </div>
                        </div>
                    </div>
                    </div>
                </div>
            </div>

            <div class="settings-footer">
                <span id="saveStatus" class="save-status"></span>
                <button class="btn" onclick="saveSettings()">Save Settings</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentProvider = 'anthropic';

        // Initialize dropdown (only once)
        let dropdownInitialized = false;
        function initProviderDropdown() {
            const providerDropdown = document.getElementById('provider-dropdown');
            if (!providerDropdown) return;

            // Check if already initialized to prevent duplicate listeners
            if (dropdownInitialized) return;

            const providerSelected = providerDropdown.querySelector('.custom-dropdown-selected');
            const providerList = providerDropdown.querySelector('.custom-dropdown-list');
            const providerItems = providerDropdown.querySelectorAll('.custom-dropdown-item');

            let focusedIndex = -1;

            // Custom dropdown toggle
            providerSelected.addEventListener('click', () => {
                const isOpen = providerList.classList.contains('open');
                if (isOpen) {
                    closeProviderDropdown();
                } else {
                    openProviderDropdown();
                }
            });

            // Keyboard navigation
            providerSelected.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openProviderDropdown();
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    openProviderDropdown();
                    focusedIndex = 0;
                    updateFocus();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    openProviderDropdown();
                    focusedIndex = providerItems.length - 1;
                    updateFocus();
                }
            });

            providerDropdown.addEventListener('keydown', (e) => {
                if (!providerList.classList.contains('open')) return;
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    focusedIndex = Math.min(focusedIndex + 1, providerItems.length - 1);
                    updateFocus();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    focusedIndex = Math.max(focusedIndex - 1, 0);
                    updateFocus();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (focusedIndex >= 0) {
                        selectProvider(providerItems[focusedIndex]);
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    closeProviderDropdown();
                }
            });

            // Item selection
            providerItems.forEach((item, index) => {
                item.addEventListener('click', () => {
                    selectProvider(item);
                });

                item.addEventListener('mouseenter', () => {
                    focusedIndex = index;
                    updateFocus();
                });
            });

            // Close on outside click
            document.addEventListener('click', (e) => {
                if (!providerDropdown.contains(e.target)) {
                    closeProviderDropdown();
                }
            });

            function openProviderDropdown() {
                providerList.classList.add('open');
                providerSelected.classList.add('open');
                focusedIndex = Array.from(providerItems).findIndex(item => item.classList.contains('selected'));
                updateFocus();
            }

            function closeProviderDropdown() {
                providerList.classList.remove('open');
                providerSelected.classList.remove('open');
                focusedIndex = -1;
                updateFocus();
            }

            function updateFocus() {
                providerItems.forEach((item, index) => {
                    item.classList.toggle('focused', index === focusedIndex);
                });
            }

            function selectProvider(item) {
                const value = item.dataset.value;
                const icon = item.dataset.icon;
                const text = item.querySelector('span').textContent;

                // Update selected display
                providerSelected.querySelector('.custom-dropdown-icon img').src = icon;
                providerSelected.querySelector('.custom-dropdown-text').textContent = text;

                // Update selected state
                providerItems.forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');

                // Update provider and show/hide config sections
                currentProvider = value;
                updateProviderConfig(value);

                closeProviderDropdown();
            }

            dropdownInitialized = true;
        }

        function updateProviderConfig(provider) {
            const sections = document.querySelectorAll('.provider-config-section');
            sections.forEach(s => s.classList.remove('active'));

            const activeSection = document.getElementById(provider + 'ConfigSection');
            if (activeSection) {
                activeSection.classList.add('active');
            }
        }

        function switchTab(tab) {
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));

            // Find the clicked tab button
            const tabButtons = document.querySelectorAll('.settings-tab');
            tabButtons.forEach(btn => {
                if (btn.getAttribute('onclick').includes(tab)) {
                    btn.classList.add('active');
                }
            });

            document.getElementById(tab + 'Tab').classList.add('active');

            // Load MCP servers when switching to MCP tab
            if (tab === 'mcp') {
                loadMCPServers();
            }
        }

        function loadMCPServers() {
            vscode.postMessage({ type: 'getMCPServers' });
        }

        function testAnthropicConnection() {
            const apiKey = document.getElementById('anthropic-api-key').value.trim();
            const resultSpan = document.getElementById('anthropicTestResult');
            const testBtn = document.getElementById('testAnthropicBtn');

            if (!apiKey) {
                resultSpan.textContent = 'Please enter an API key';
                resultSpan.className = 'test-result error';
                return;
            }

            testBtn.disabled = true;
            resultSpan.textContent = 'Testing...';
            resultSpan.className = 'test-result loading';

            vscode.postMessage({
                type: 'testConnection',
                provider: 'anthropic',
                apiKey
            });
        }

        function testAzureConnection() {
            const apiKey = document.getElementById('azure-api-key').value.trim();
            const endpoint = document.getElementById('azure-endpoint').value.trim();
            const deployment = document.getElementById('azure-deployment').value.trim();
            const version = document.getElementById('azure-version').value.trim();
            const resultSpan = document.getElementById('azureTestResult');
            const testBtn = document.getElementById('testAzureBtn');

            if (!apiKey || !endpoint || !deployment) {
                resultSpan.textContent = 'Please fill all required fields';
                resultSpan.className = 'test-result error';
                return;
            }

            testBtn.disabled = true;
            resultSpan.textContent = 'Testing...';
            resultSpan.className = 'test-result loading';

            vscode.postMessage({
                type: 'testConnection',
                provider: 'azure',
                apiKey,
                endpoint,
                deployment,
                version
            });
        }

        function testDeepSeekConnection() {
            const apiKey = document.getElementById('deepseek-api-key').value.trim();
            const resultSpan = document.getElementById('deepseekTestResult');
            const testBtn = document.getElementById('testDeepSeekBtn');

            if (!apiKey) {
                resultSpan.textContent = 'Please enter an API key';
                resultSpan.className = 'test-result error';
                return;
            }

            testBtn.disabled = true;
            resultSpan.textContent = 'Testing...';
            resultSpan.className = 'test-result loading';

            vscode.postMessage({
                type: 'testConnection',
                provider: 'deepseek',
                apiKey
            });
        }

        function testGrokConnection() {
            const apiKey = document.getElementById('grok-api-key').value.trim();
            const resultSpan = document.getElementById('grokTestResult');
            const testBtn = document.getElementById('testGrokBtn');

            if (!apiKey) {
                resultSpan.textContent = 'Please enter an API key';
                resultSpan.className = 'test-result error';
                return;
            }

            testBtn.disabled = true;
            resultSpan.textContent = 'Testing...';
            resultSpan.className = 'test-result loading';

            vscode.postMessage({
                type: 'testConnection',
                provider: 'grok',
                apiKey
            });
        }

        function testOpenAIConnection() {
            const apiKey = document.getElementById('openai-api-key').value.trim();
            const resultSpan = document.getElementById('openaiTestResult');
            const testBtn = document.getElementById('testOpenAIBtn');

            if (!apiKey) {
                resultSpan.textContent = 'Please enter an API key';
                resultSpan.className = 'test-result error';
                return;
            }

            testBtn.disabled = true;
            resultSpan.textContent = 'Testing...';
            resultSpan.className = 'test-result loading';

            vscode.postMessage({
                type: 'testConnection',
                provider: 'openai',
                apiKey
            });
        }

        function saveSettings() {
            // Collect all settings
            const settings = {
                provider: currentProvider
            };

            if (currentProvider === 'anthropic') {
                settings.anthropic = {
                    apiKey: document.getElementById('anthropic-api-key').value
                };
            } else if (currentProvider === 'azure') {
                settings.azure = {
                    apiKey: document.getElementById('azure-api-key').value,
                    endpoint: document.getElementById('azure-endpoint').value,
                    deployment: document.getElementById('azure-deployment').value,
                    version: document.getElementById('azure-version').value
                };
            } else if (currentProvider === 'deepseek') {
                settings.deepseek = {
                    apiKey: document.getElementById('deepseek-api-key').value
                };
            } else if (currentProvider === 'grok') {
                settings.grok = {
                    apiKey: document.getElementById('grok-api-key').value
                };
            } else if (currentProvider === 'openai') {
                settings.openai = {
                    apiKey: document.getElementById('openai-api-key').value
                };
            }

            vscode.postMessage({
                type: 'saveSettings',
                settings
            });

            // Close modal immediately
            closeModal();
        }

        function closeModal() {
            const modal = document.querySelector('.tools-modal');
            modal.classList.add('closing');
            setTimeout(() => {
                vscode.postMessage({ type: 'closeSettings' });
            }, 200);
        }

        let currentMCPServerType = 'remote';

        function showAddMCPServerForm() {
            document.getElementById('showAddMCPServerBtn').style.display = 'none';
            document.getElementById('addMCPServerForm').style.display = 'block';
            // Clear form
            document.getElementById('mcpServerName').value = '';
            document.getElementById('mcpServerURL').value = '';
            document.getElementById('mcpServerCommand').value = '';
            document.getElementById('mcpServerArgs').value = '';
            document.getElementById('mcpServerEnv').value = '';
        }

        function cancelAddMCPServer() {
            document.getElementById('showAddMCPServerBtn').style.display = 'block';
            document.getElementById('addMCPServerForm').style.display = 'none';
            // Reset form state
            document.getElementById('mcpServerName').disabled = false;
            document.querySelector('#addMCPServerForm h4').textContent = 'Add MCP Server';
            document.querySelector('#addMCPServerForm .btn').textContent = 'Add Server';
            document.getElementById('addMCPServerForm').removeAttribute('data-edit-mode');
            document.getElementById('addMCPServerForm').removeAttribute('data-original-name');
        }

        function selectMCPType(type) {
            currentMCPServerType = type;
            
            // Update button states
            document.getElementById('mcpTypeRemote').className = type === 'remote' ? 'mcp-type-btn active' : 'mcp-type-btn';
            document.getElementById('mcpTypeLocal').className = type === 'local' ? 'mcp-type-btn active' : 'mcp-type-btn';

            // Update button styles
            const remoteBtn = document.getElementById('mcpTypeRemote');
            const localBtn = document.getElementById('mcpTypeLocal');

            if (type === 'remote') {
                remoteBtn.style.background = 'var(--vscode-button-background)';
                remoteBtn.style.color = 'var(--vscode-button-foreground)';
                remoteBtn.style.border = '1px solid var(--vscode-button-background)';
                localBtn.style.background = 'transparent';
                localBtn.style.color = 'inherit';
                localBtn.style.border = '1px solid var(--vscode-widget-border)';
            } else {
                localBtn.style.background = 'var(--vscode-button-background)';
                localBtn.style.color = 'var(--vscode-button-foreground)';
                localBtn.style.border = '1px solid var(--vscode-button-background)';
                remoteBtn.style.background = 'transparent';
                remoteBtn.style.color = 'inherit';
                remoteBtn.style.border = '1px solid var(--vscode-widget-border)';
            }

            // Show/hide fields
            document.getElementById('mcpRemoteFields').style.display = type === 'remote' ? 'block' : 'none';
            document.getElementById('mcpLocalFields').style.display = type === 'local' ? 'block' : 'none';
        }

        function saveMCPServer() {
            const name = document.getElementById('mcpServerName').value.trim();
            const formEl = document.getElementById('addMCPServerForm');
            const isEditMode = formEl.getAttribute('data-edit-mode') === 'true';
            const originalName = formEl.getAttribute('data-original-name');
            
            if (!name) {
                alert('Server name is required');
                return;
            }

            let serverConfig = { name, type: currentMCPServerType };

            if (currentMCPServerType === 'remote') {
                const url = document.getElementById('mcpServerURL').value.trim();
                if (!url) {
                    alert('Server URL is required');
                    return;
                }
                serverConfig.url = url;
            } else {
                const command = document.getElementById('mcpServerCommand').value.trim();
                if (!command) {
                    alert('Command is required');
                    return;
                }
                serverConfig.command = command;
                const args = document.getElementById('mcpServerArgs').value.trim();
                if (args) {
                    serverConfig.args = args.split(',').map(a => a.trim());
                }
                const env = document.getElementById('mcpServerEnv').value.trim();
                if (env) {
                    const envPairs = env.split(',').map(e => e.trim());
                    serverConfig.env = {};
                    envPairs.forEach(pair => {
                        const [key, value] = pair.split('=');
                        if (key && value) {
                            serverConfig.env[key.trim()] = value.trim();
                        }
                    });
                }
            }

            vscode.postMessage({
                type: isEditMode ? 'updateMCPServer' : 'saveMCPServer',
                server: serverConfig,
                originalName: originalName
            });

            cancelAddMCPServer();
        }

        // Render MCP servers
        function renderMCPServers(data) {
            const serverList = document.getElementById('mcpServerList');
            if (!serverList) return;

            const servers = data.servers || {};
            const statuses = data.statuses || {};
            const serverNames = Object.keys(servers);

            if (serverNames.length === 0) {
                serverList.innerHTML = '<div style="text-align: center; padding: 30px 20px; color: var(--vscode-descriptionForeground);"><div style="font-size: 32px; margin-bottom: 12px;">🔌</div><div style="font-size: 12px; margin-bottom: 8px;">No MCP servers configured</div><div style="font-size: 10px; color: var(--vscode-descriptionForeground);">Add a server to extend capabilities</div></div>';
                return;
            }

            let html = '';
            serverNames.forEach(name => {
                const server = servers[name];
                const status = statuses[name] || { connected: false, toolCount: 0, enabled: true };
                const isEnabled = status.enabled !== undefined ? status.enabled : (server.enabled !== false);
                const isConnected = status.connected && isEnabled;
                const statusText = isEnabled ? (isConnected ? 'Connected' : 'Disconnected') : 'Disabled';
                const statusIcon = isConnected ? '🟢' : (isEnabled ? '🔴' : '⚫');
                const serverType = server.url ? 'Remote' : 'Local';
                const serverInfo = server.url || (server.command ? \`\${server.command}\${server.args ? ' ' + server.args.join(' ') : ''}\` : 'MCP Server');
                const serverNameEscaped = name.replace(/'/g, "\\'");
                const serverJsonEscaped = JSON.stringify(server).replace(/"/g, '&quot;');

                html += \`
                    <div class="mcp-server-item" style="border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 12px; margin-bottom: 8px; background: var(--vscode-editor-background);">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap;">
                                    <span style="font-weight: 600; font-size: 12px;">\${name}</span>
                                    <span class="mcp-server-type-badge" style="font-size: 9px; padding: 2px 6px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 3px;">\${serverType}</span>
                                </div>
                                <div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 6px; word-break: break-all; font-family: monospace;">\${serverInfo}</div>
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="font-size: 10px; display: flex; align-items: center; gap: 4px;">\${statusIcon} \${statusText}</span>
                                    \${isConnected ? \`<span style="font-size: 10px; color: var(--vscode-descriptionForeground);">• \${status.toolCount} tools</span>\` : ''}
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <label class="mcp-toggle-switch" style="position: relative; display: inline-block; width: 40px; height: 20px;">
                                    <input type="checkbox" class="mcp-toggle-input" data-server-name="\${serverNameEscaped}" \${isEnabled ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
                                    <span class="mcp-toggle-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--vscode-input-background); border: 1px solid var(--vscode-widget-border); border-radius: 20px; transition: 0.3s;"></span>
                                </label>
                                <button class="btn outlined" onclick="editMCPServer('\${serverNameEscaped}', \${serverJsonEscaped})" title="Edit server" style="font-size: 10px; padding: 4px 12px; background: transparent; border: 1px solid var(--vscode-widget-border); color: var(--vscode-foreground); cursor: pointer; transition: all 0.2s ease;">Edit</button>
                                <button class="btn outlined" onclick="removeMCPServer('\${serverNameEscaped}')" title="Remove server" style="font-size: 10px; padding: 4px 12px; background: transparent; border: 1px solid var(--vscode-errorForeground); color: var(--vscode-errorForeground); cursor: pointer; transition: all 0.2s ease;">Remove</button>
                            </div>
                        </div>
                    </div>
                \`;
            });

            serverList.innerHTML = html;
        }

        function editMCPServer(serverName, server) {
            // Populate the form with server data
            document.getElementById('mcpServerName').value = server.name;
            document.getElementById('mcpServerName').disabled = true; // Can't change name during edit

            if (server.url) {
                // Remote server
                currentMCPServerType = 'remote';
                document.getElementById('mcpServerURL').value = server.url;
                selectMCPType('remote');
            } else {
                // Local server
                currentMCPServerType = 'local';
                document.getElementById('mcpServerCommand').value = server.command || '';
                document.getElementById('mcpServerArgs').value = server.args ? server.args.join(', ') : '';

                if (server.env) {
                    const envString = Object.entries(server.env).map(([k, v]) => \`\${k}=\${v}\`).join(', ');
                    document.getElementById('mcpServerEnv').value = envString;
                }
                selectMCPType('local');
            }

            // Show the form in edit mode
            document.getElementById('showAddMCPServerBtn').style.display = 'none';
            document.getElementById('addMCPServerForm').style.display = 'block';

            // Change the form title and button text
            document.querySelector('#addMCPServerForm h4').textContent = 'Edit MCP Server';
            const submitBtn = document.querySelector('#addMCPServerForm .btn:last-child');
            if (submitBtn) submitBtn.textContent = 'Save Changes';

            // Store that we're in edit mode
            document.getElementById('addMCPServerForm').setAttribute('data-edit-mode', 'true');
            document.getElementById('addMCPServerForm').setAttribute('data-original-name', serverName);
        }

        function removeMCPServer(serverName) {
            vscode.postMessage({ type: 'removeMCPServer', serverName });
        }

        // Add event delegation for MCP server toggle
        document.addEventListener('change', function(event) {
            const target = event.target;

            // Handle toggle switch
            if (target.classList.contains('mcp-toggle-input')) {
                const serverName = target.getAttribute('data-server-name');
                if (serverName) {
                    vscode.postMessage({
                        type: 'toggleMCPServer',
                        serverName: serverName,
                        enabled: target.checked
                    });
                }
            }
        });

        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'mcpServersData':
                    renderMCPServers(message);
                    break;
                case 'testConnectionResult':
                    handleTestConnectionResult(message);
                    break;
            }
        });

        function handleTestConnectionResult(message) {
            const provider = message.provider;
            const btnId = 'test' + provider.charAt(0).toUpperCase() + provider.slice(1) + 'Btn';
            const resultId = provider + 'TestResult';
            const btn = document.getElementById(btnId);
            const resultSpan = document.getElementById(resultId);

            if (btn && resultSpan) {
                btn.textContent = 'Test Connection';
                btn.disabled = false;

                if (message.success) {
                    resultSpan.className = 'test-result success';
                    resultSpan.textContent = '✓ Connection successful';
                } else {
                    resultSpan.className = 'test-result error';
                    resultSpan.textContent = '✕ ' + (message.error || 'Connection failed');
                }
            }
        }

        // Initialize on load
        function initialize() {
            initProviderDropdown();
        }

        window.addEventListener('DOMContentLoaded', initialize);
        initialize();
    </script>
</body>
</html>`;
    }

    private async handleMessage(message: any, context: vscode.ExtensionContext) {
        switch (message.type) {
            case 'saveSettings':
                await this.saveSettings(message, context);
                break;
            case 'testConnection':
                await this.testConnection(message);
                break;
            case 'closeSettings':
                if (this.panel) {
                    this.panel.dispose();
                    this.panel = undefined;
                    SettingsUIProvider.currentPanel = undefined;
                }
                break;
            case 'getMCPServers':
                await this.sendMCPServers(context);
                break;
            case 'saveMCPServer':
                await this.saveMCPServer(message.server, context);
                break;
            case 'updateMCPServer':
                await this.updateMCPServer(message.server, message.originalName, context);
                break;
            case 'removeMCPServer':
                await this.removeMCPServer(message.serverName, context);
                break;
            case 'toggleMCPServer':
                await this.toggleMCPServer(message.serverName, message.enabled, context);
                break;
        }
    }

    private async saveSettings(message: any, context: vscode.ExtensionContext) {
        const config = vscode.workspace.getConfiguration('azureDevOps.ai');
        
        try {
            const settings = message.settings;
            
            // Save provider
            await config.update('provider', settings.provider, vscode.ConfigurationTarget.Global);
            
            // Save provider-specific settings
            for (const provider of ['anthropic', 'azure', 'deepseek', 'grok', 'openai']) {
                if (settings[provider]) {
                    const providerSettings = settings[provider];
                    if (providerSettings.apiKey) {
                        await config.update(`${provider}.apiKey`, providerSettings.apiKey, vscode.ConfigurationTarget.Global);
                    }
                    if (providerSettings.model) {
                        await config.update(`${provider}.model`, providerSettings.model, vscode.ConfigurationTarget.Global);
                    }
                    if (providerSettings.endpoint) {
                        await config.update(`${provider}.endpoint`, providerSettings.endpoint, vscode.ConfigurationTarget.Global);
                    }
                    if (providerSettings.deployment) {
                        await config.update(`${provider}.deployment`, providerSettings.deployment, vscode.ConfigurationTarget.Global);
                    }
                    if (providerSettings.version) {
                        await config.update(`${provider}.version`, providerSettings.version, vscode.ConfigurationTarget.Global);
                    }
                }
            }

            this.outputChannel.appendLine(`✅ Settings saved for provider: ${settings.provider}`);
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ Error saving settings: ${error.message}`);
        }
    }

    private async testConnection(message: any) {
        try {
            this.outputChannel.appendLine(`Testing connection for ${message.provider}...`);

            if (message.provider === 'anthropic') {
                await this.testAnthropicConnection(message.apiKey);
            } else if (message.provider === 'openai') {
                await this.testOpenAIConnection(message.apiKey);
            } else if (message.provider === 'azure') {
                await this.testAzureConnection(message);
            } else if (message.provider === 'deepseek') {
                await this.testDeepSeekConnection(message.apiKey);
            } else if (message.provider === 'grok') {
                await this.testGrokConnection(message.apiKey);
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ Connection test failed: ${error.message}`);
            this.sendTestResult(message.provider, false, error.message);
        }
    }

    private async testAnthropicConnection(apiKey: string) {
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-3-5-sonnet-20241022',
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 10
                })
            });

            if (response.ok) {
                this.outputChannel.appendLine('✅ Anthropic API key validated');
                this.sendTestResult('anthropic', true);
            } else {
                const errorData: any = await response.json().catch(() => ({}));
                const errorMessage = errorData?.error?.message || `HTTP ${response.status}`;
                this.outputChannel.appendLine(`⚠️ Anthropic test failed: ${errorMessage}`);
                this.sendTestResult('anthropic', false, errorMessage);
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ Anthropic test error: ${error.message}`);
            this.sendTestResult('anthropic', false, error.message);
        }
    }

    private async testOpenAIConnection(apiKey: string) {
        try {
            const response = await fetch('https://api.openai.com/v1/models', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (response.ok) {
                this.outputChannel.appendLine('✅ OpenAI API key validated');
                this.sendTestResult('openai', true);
            } else {
                const errorData: any = await response.json().catch(() => ({}));
                const errorMessage = errorData?.error?.message || `HTTP ${response.status}`;
                this.outputChannel.appendLine(`⚠️ OpenAI test failed: ${errorMessage}`);
                this.sendTestResult('openai', false, errorMessage);
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ OpenAI test error: ${error.message}`);
            this.sendTestResult('openai', false, error.message);
        }
    }

    private async testAzureConnection(message: any) {
        try {
            if (!message.endpoint || !message.deployment) {
                this.sendTestResult('azure', false, 'Azure endpoint and deployment required');
                return;
            }

            const response = await fetch(
                `${message.endpoint}/openai/deployments/${message.deployment}/chat/completions?api-version=${message.version || '2024-02-15-preview'}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': message.apiKey
                    },
                    body: JSON.stringify({
                        messages: [{ role: 'user', content: 'Hi' }],
                        max_tokens: 10
                    })
                }
            );

            if (response.ok) {
                this.outputChannel.appendLine('✅ Azure OpenAI validated');
                this.sendTestResult('azure', true);
            } else {
                const errorData: any = await response.json().catch(() => ({}));
                const errorMessage = errorData?.error?.message || `HTTP ${response.status}`;
                this.outputChannel.appendLine(`⚠️ Azure test failed: ${errorMessage}`);
                this.sendTestResult('azure', false, errorMessage);
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ Azure test error: ${error.message}`);
            this.sendTestResult('azure', false, error.message);
        }
    }

    private async testDeepSeekConnection(apiKey: string) {
        try {
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 10
                })
            });

            if (response.ok) {
                this.outputChannel.appendLine('✅ DeepSeek API key validated');
                this.sendTestResult('deepseek', true);
            } else {
                const errorData: any = await response.json().catch(() => ({}));
                const errorMessage = errorData?.error?.message || `HTTP ${response.status}`;
                this.outputChannel.appendLine(`⚠️ DeepSeek test failed: ${errorMessage}`);
                this.sendTestResult('deepseek', false, errorMessage);
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ DeepSeek test error: ${error.message}`);
            this.sendTestResult('deepseek', false, error.message);
        }
    }

    private async testGrokConnection(apiKey: string) {
        try {
            const response = await fetch('https://api.x.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'grok-beta',
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 10,
                    temperature: 0
                })
            });

            if (response.ok) {
                this.outputChannel.appendLine('✅ Grok API key validated');
                this.sendTestResult('grok', true);
            } else {
                const errorData: any = await response.json().catch(() => ({}));
                const errorMessage = typeof errorData?.error === 'string'
                    ? errorData.error
                    : errorData?.error?.message || `HTTP ${response.status}`;
                this.outputChannel.appendLine(`⚠️ Grok test failed: ${errorMessage}`);
                this.sendTestResult('grok', false, errorMessage);
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ Grok test error: ${error.message}`);
            this.sendTestResult('grok', false, error.message);
        }
    }

    private sendTestResult(provider: string, success: boolean, error?: string) {
        if (this.panel) {
            this.panel.webview.postMessage({
                type: 'testConnectionResult',
                provider,
                success,
                error
            });
        }
    }

    private async sendMCPServers(context: vscode.ExtensionContext) {
        try {
            const config = vscode.workspace.getConfiguration('azureDevOps.ai');
            const serversArray = config.get<any[]>('mcp.servers', []);

            // Convert array to object for UI display
            const servers: any = {};
            serversArray.forEach((server: any) => {
                if (server.name) {
                    servers[server.name] = server;
                }
            });

            // Get actual tool counts from MCP client
            const statuses: any = {};
            
            if (aiChatProvider) {
                const mcpClient = aiChatProvider.getMCPClient();
                const allTools = mcpClient.getAllTools();
                serversArray.forEach((server: any) => {
                    if (server.name) {
                        const serverTools = allTools.filter((t: any) => t.serverName === server.name);
                        const isEnabled = server.enabled !== false;
                        const isConnected = serverTools.length > 0 && isEnabled;
                        statuses[server.name] = {
                            connected: isConnected,
                            toolCount: serverTools.length,
                            enabled: isEnabled
                        };
                    }
                });
            } else {
                // Fallback to basic status
                serversArray.forEach((server: any) => {
                    if (server.name) {
                        statuses[server.name] = {
                            connected: false,
                            toolCount: 0,
                            enabled: server.enabled !== false
                        };
                    }
                });
            }

            // Send servers to webview
            if (this.panel) {
                this.panel.webview.postMessage({
                    type: 'mcpServersData',
                    servers: servers,
                    statuses: statuses
                });
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ Error loading MCP servers: ${error.message}`);
        }
    }

    private async saveMCPServer(server: any, context: vscode.ExtensionContext) {
        try {
            const config = vscode.workspace.getConfiguration('azureDevOps.ai');
            const serversArray = config.get<any[]>('mcp.servers', []);

            // Check for duplicate names
            if (serversArray.some((s: any) => s.name === server.name)) {
                vscode.window.showErrorMessage(`MCP server '${server.name}' already exists`);
                return;
            }

            // Add protocol to URL if missing
            if (server.type === 'remote' && server.url && !server.url.startsWith('http')) {
                server.url = 'https://' + server.url;
            }

            // Add new server with enabled flag
            serversArray.push({
                name: server.name,
                type: server.type,
                enabled: true, // Default to enabled
                ...(server.url && { url: server.url }),
                ...(server.command && { command: server.command }),
                ...(server.args && { args: server.args }),
                ...(server.env && { env: server.env })
            });

            await config.update('mcp.servers', serversArray, vscode.ConfigurationTarget.Global);

            this.outputChannel.appendLine(`✅ MCP server saved: ${server.name}`);
            vscode.window.showInformationMessage(`MCP server '${server.name}' added successfully`);

            // Refresh the server list
            await this.sendMCPServers(context);

            // Reload MCP servers in the chat providers
            vscode.commands.executeCommand('azureDevOps.reloadMCPServers');
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ Error saving MCP server: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to save MCP server: ${error.message}`);
        }
    }

    private async updateMCPServer(server: any, originalName: string, context: vscode.ExtensionContext) {
        try {
            const config = vscode.workspace.getConfiguration('azureDevOps.ai');
            const serversArray = config.get<any[]>('mcp.servers', []);

            // Find and update the server
            const serverIndex = serversArray.findIndex((s: any) => s.name === originalName);
            if (serverIndex === -1) {
                vscode.window.showErrorMessage(`MCP server '${originalName}' not found`);
                return;
            }

            // Add protocol to URL if missing
            if (server.type === 'remote' && server.url && !server.url.startsWith('http')) {
                server.url = 'https://' + server.url;
            }

            // Preserve enabled state and other fields
            const existingServer = serversArray[serverIndex];

            // Update server while preserving existing fields
            serversArray[serverIndex] = {
                ...existingServer,
                name: server.name,
                type: server.type,
                ...(server.url !== undefined && { url: server.url }),
                ...(server.command !== undefined && { command: server.command }),
                ...(server.args !== undefined && { args: server.args }),
                ...(server.env !== undefined && { env: server.env }),
                ...(server.headers !== undefined && { headers: server.headers })
            };

            await config.update('mcp.servers', serversArray, vscode.ConfigurationTarget.Global);

            this.outputChannel.appendLine(`✅ MCP server updated: ${server.name}`);
            vscode.window.showInformationMessage(`MCP server '${server.name}' updated successfully`);

            // Refresh the server list
            await this.sendMCPServers(context);

            // Reload MCP servers in the chat providers
            vscode.commands.executeCommand('azureDevOps.reloadMCPServers');
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ Error updating MCP server: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to update MCP server: ${error.message}`);
        }
    }

    private async toggleMCPServer(serverName: string, enabled: boolean, context: vscode.ExtensionContext) {
        try {
            const config = vscode.workspace.getConfiguration('azureDevOps.ai');
            const serversArray = config.get<any[]>('mcp.servers', []);

            // Find and toggle the server
            const server = serversArray.find((s: any) => s.name === serverName);
            if (server) {
                server.enabled = enabled;
                await config.update('mcp.servers', serversArray, vscode.ConfigurationTarget.Global);

                this.outputChannel.appendLine(`✅ MCP server ${enabled ? 'enabled' : 'disabled'}: ${serverName}`);

                // Reload MCP servers in the chat providers
                await vscode.commands.executeCommand('azureDevOps.reloadMCPServers', serverName, enabled);

                // Refresh the server list
                await this.sendMCPServers(context);
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ Error toggling MCP server: ${error.message}`);
        }
    }

    private async removeMCPServer(serverName: string, context: vscode.ExtensionContext) {
        try {
            const config = vscode.workspace.getConfiguration('azureDevOps.ai');
            const serversArray = config.get<any[]>('mcp.servers', []);

            // Remove server
            const filteredServers = serversArray.filter((s: any) => s.name !== serverName);

            await config.update('mcp.servers', filteredServers, vscode.ConfigurationTarget.Global);

            this.outputChannel.appendLine(`✅ MCP server removed: ${serverName}`);
            vscode.window.showInformationMessage(`MCP server '${serverName}' removed successfully`);

            // Refresh the server list
            await this.sendMCPServers(context);

            // Reload MCP servers in the chat providers
            vscode.commands.executeCommand('azureDevOps.reloadMCPServers');
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ Error removing MCP server: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to remove MCP server: ${error.message}`);
        }
    }
}
