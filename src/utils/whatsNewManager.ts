import * as vscode from 'vscode';

export class WhatsNewManager {
    private static readonly LAST_ANNOUNCEMENT_ID = 'feb-2026-v0.2.1-ui-performance';
    private static readonly ANNOUNCEMENT_ID_KEY = 'azureDevOps.lastShownAnnouncementId';

    constructor(private context: vscode.ExtensionContext) {}

    async checkAndShowWhatsNew(): Promise<void> {
        const lastShownId = this.context.globalState.get<string>(
            WhatsNewManager.ANNOUNCEMENT_ID_KEY,
            ''
        );

        if (lastShownId !== WhatsNewManager.LAST_ANNOUNCEMENT_ID) {
            await this.showWhatsNew();
        }
    }

    async forceShow(): Promise<void> {
        await this.showWhatsNew();
    }

    private async showWhatsNew(): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'azureDevOpsWhatsNew',
            "🎉 What's New",
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'dismiss':
                        await this.context.globalState.update(
                            WhatsNewManager.ANNOUNCEMENT_ID_KEY,
                            WhatsNewManager.LAST_ANNOUNCEMENT_ID
                        );
                        panel.dispose();
                        break;
                    case 'openUrl':
                        if (message.url) {
                            vscode.env.openExternal(vscode.Uri.parse(message.url));
                        }
                        break;
                }
            }
        );

        panel.webview.html = this.getWhatsNewHtml();
    }

    private getWhatsNewHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>What's New</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            overflow-x: hidden;
        }

        /* Backdrop & Modal Container */
        .backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            animation: backdropFadeIn 0.3s ease-out;
            z-index: 1000;
        }

        .modal {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 12px;
            max-width: 700px;
            width: 100%;
            max-height: 85vh;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            animation: modalSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        /* Header */
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 30px 40px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }

        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            animation: shimmer 3s infinite;
        }

        .header-content {
            position: relative;
            z-index: 1;
        }

        .icon {
            font-size: 48px;
            margin-bottom: 10px;
            display: inline-block;
            animation: iconBounce 0.6s ease-out 0.3s;
        }

        .version-badge {
            display: inline-block;
            background: rgba(255, 255, 255, 0.2);
            color: white;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            margin-top: 8px;
            animation: badgePop 0.5s ease-out 0.5s both;
        }

        h1 {
            color: white;
            font-size: 28px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        /* Content */
        .content {
            flex: 1;
            overflow-y: auto;
            padding: 32px 40px;
        }

        .section {
            margin-bottom: 32px;
        }

        .section-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 16px;
            animation: slideInFromRight 0.5s ease-out;
        }

        .section-icon {
            font-size: 24px;
            animation: iconBounce 0.6s ease-out;
        }

        .section-title {
            font-size: 20px;
            font-weight: 600;
            color: var(--vscode-textLink-foreground);
        }

        .feature-list {
            list-style: none;
        }

        .feature-item {
            padding: 14px 16px;
            margin-bottom: 10px;
            background: var(--vscode-input-background);
            border-left: 3px solid var(--vscode-textLink-foreground);
            border-radius: 6px;
            animation: slideInFromRight 0.5s ease-out;
            animation-fill-mode: both;
        }

        .feature-item:nth-child(1) { animation-delay: 0.1s; }
        .feature-item:nth-child(2) { animation-delay: 0.2s; }
        .feature-item:nth-child(3) { animation-delay: 0.3s; }
        .feature-item:nth-child(4) { animation-delay: 0.4s; }
        .feature-item:nth-child(5) { animation-delay: 0.5s; }
        .feature-item:nth-child(6) { animation-delay: 0.6s; }

        .feature-title {
            font-weight: 600;
            margin-bottom: 4px;
            color: var(--vscode-foreground);
        }

        .feature-description {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.5;
        }

        /* Footer */
        .footer {
            padding: 24px 40px;
            border-top: 1px solid var(--vscode-panel-border);
            background: var(--vscode-input-background);
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
        }

        .footer-links {
            display: flex;
            gap: 16px;
            flex-wrap: wrap;
        }

        .footer-link {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            font-size: 13px;
            cursor: pointer;
            transition: opacity 0.2s;
        }

        .footer-link:hover {
            opacity: 0.8;
            text-decoration: underline;
        }

        .dismiss-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 10px 24px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            position: relative;
            overflow: hidden;
        }

        .dismiss-btn::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
            transition: left 0.5s;
        }

        .dismiss-btn:hover::before {
            left: 100%;
        }

        .dismiss-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .dismiss-btn:active {
            transform: translateY(0);
        }

        /* Scrollbar */
        .content::-webkit-scrollbar {
            width: 10px;
        }

        .content::-webkit-scrollbar-track {
            background: var(--vscode-editor-background);
        }

        .content::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 5px;
        }

        .content::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
        }

        /* Animations */
        @keyframes backdropFadeIn {
            from {
                opacity: 0;
            }
            to {
                opacity: 1;
            }
        }

        @keyframes modalSlideIn {
            from {
                opacity: 0;
                transform: translateY(-20px) scale(0.95);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        @keyframes slideInFromRight {
            from {
                opacity: 0;
                transform: translateX(20px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }

        @keyframes iconBounce {
            0%, 100% {
                transform: scale(1);
            }
            50% {
                transform: scale(1.2);
            }
        }

        @keyframes badgePop {
            0% {
                transform: scale(0);
            }
            50% {
                transform: scale(1.1);
            }
            100% {
                transform: scale(1);
            }
        }

        @keyframes shimmer {
            to {
                left: 100%;
            }
        }
    </style>
</head>
<body>
    <div id="backdrop" class="backdrop">
        <div class="modal">
            <div class="header">
                <div class="header-content">
                    <div class="icon">🎉</div>
                    <h1>What's New in Azure DevOps Boards</h1>
                    <div class="version-badge">v0.2.1</div>
                </div>
            </div>

            <div class="content">
                <!-- New Features -->
                <div class="section">
                    <div class="section-header">
                        <span class="section-icon">✨</span>
                        <h2 class="section-title">New Features</h2>
                    </div>
                    <ul class="feature-list">
                        <li class="feature-item">
                            <div class="feature-title">Effort Field on Board Cards</div>
                            <div class="feature-description">
                                Board cards now display the effort/story points field with clickable inline editing.
                                Click the effort value to open a number input with up/down arrows for easy adjustments.
                            </div>
                        </li>
                        <li class="feature-item">
                            <div class="feature-title">Comments Column</div>
                            <div class="feature-description">
                                View comment counts directly in the work items list with a clean icon and count display.
                            </div>
                        </li>
                        <li class="feature-item">
                            <div class="feature-title">Activity Date Column</div>
                            <div class="feature-description">
                                Track when work items were last modified with full datetime display in a readable format.
                            </div>
                        </li>
                        <li class="feature-item">
                            <div class="feature-title">Unassigned Work Item Icon</div>
                            <div class="feature-description">
                                Unassigned work items now show a professional profile icon with a grey circular background instead of a question mark.
                            </div>
                        </li>
                    </ul>
                </div>

                <!-- Performance Improvements -->
                <div class="section">
                    <div class="section-header">
                        <span class="section-icon">⚡</span>
                        <h2 class="section-title">Performance Improvements</h2>
                    </div>
                    <ul class="feature-list">
                        <li class="feature-item">
                            <div class="feature-title">Parallel API Calls</div>
                            <div class="feature-description">
                                Bulk operations now execute in parallel instead of sequentially, reducing operation time from 5-10 seconds to under 1 second - 10x faster!
                            </div>
                        </li>
                        <li class="feature-item">
                            <div class="feature-title">Smart Caching</div>
                            <div class="feature-description">
                                Implemented intelligent caching for team members (5 min TTL) and work item states (60 min TTL), reducing API calls by 70%.
                            </div>
                        </li>
                        <li class="feature-item">
                            <div class="feature-title">Incremental Updates</div>
                            <div class="feature-description">
                                Work item changes now update locally without full page reloads, providing instant feedback and smoother interactions.
                            </div>
                        </li>
                        <li class="feature-item">
                            <div class="feature-title">Debounced Filtering</div>
                            <div class="feature-description">
                                Added 250ms debouncing to filter inputs for better performance with large work item lists (200+ items).
                            </div>
                        </li>
                    </ul>
                </div>

                <!-- Bug Fixes & UI Improvements -->
                <div class="section">
                    <div class="section-header">
                        <span class="section-icon">🐛</span>
                        <h2 class="section-title">Bug Fixes & UI Improvements</h2>
                    </div>
                    <ul class="feature-list">
                        <li class="feature-item">
                            <div class="feature-title">Board Filter Dropdown Stability</div>
                            <div class="feature-description">
                                Fixed UI shift when checking board filter checkboxes by changing dropdown positioning from right-anchored to left-anchored.
                            </div>
                        </li>
                        <li class="feature-item">
                            <div class="feature-title">Removed Redundant Clear Filters Button</div>
                            <div class="feature-description">
                                Removed the "Clear all filters" button that was causing UI shifts when appearing/disappearing on the board panel.
                            </div>
                        </li>
                        <li class="feature-item">
                            <div class="feature-title">Uppercase Assignee Initials</div>
                            <div class="feature-description">
                                Avatar initials now display in uppercase for better consistency and readability.
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

            <div class="footer">
                <div class="footer-links">
                    <a href="#" class="footer-link" onclick="openUrl('https://github.com/dammyboss/azure-devops-vsce'); return false;">
                        GitHub
                    </a>
                    <a href="#" class="footer-link" onclick="openUrl('https://github.com/dammyboss/azure-devops-vsce/issues'); return false;">
                        Report Issues
                    </a>
                </div>
                <button class="dismiss-btn" onclick="dismiss()">Got it!</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function dismiss() {
            vscode.postMessage({ command: 'dismiss' });
        }

        function openUrl(url) {
            vscode.postMessage({ command: 'openUrl', url: url });
        }

        // Close on backdrop click
        document.getElementById('backdrop').addEventListener('click', function(e) {
            if (e.target === this) {
                dismiss();
            }
        });

        // Close on ESC key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                dismiss();
            }
        });
    </script>
</body>
</html>`;
    }
}
