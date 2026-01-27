import * as vscode from 'vscode';

export class WelcomeViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'azureDevOpsWelcome';

    private view?: vscode.WebviewView;

    constructor(
        private readonly extensionUri: vscode.Uri
    ) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this.getHtmlContent(webviewView.webview);

        webviewView.webview.onDidReceiveMessage((message) => {
            if (message.type === 'signIn') {
                vscode.commands.executeCommand('azureDevOps.connect');
            }
        });
    }

    private getHtmlContent(_webview: vscode.Webview): string {
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Welcome</title>
    <style>
        body {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 300px;
            padding: 20px;
            margin: 0;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: transparent;
        }

        .welcome-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            max-width: 260px;
            gap: 16px;
        }

        .welcome-icon {
            width: 48px;
            height: 48px;
            margin-bottom: 4px;
            color: var(--vscode-foreground);
        }

        .welcome-icon svg {
            width: 100%;
            height: 100%;
        }

        .welcome-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--vscode-foreground);
            margin: 0;
        }

        .welcome-description {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.4;
            margin: 0;
        }

        .sign-in-button {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            width: 100%;
            padding: 10px 20px;
            font-size: 13px;
            font-weight: 600;
            font-family: var(--vscode-font-family);
            color: #ffffff;
            background-color: #0078d4;
            border: none;
            border-radius: 2px;
            cursor: pointer;
            min-height: 40px;
            letter-spacing: 0.02em;
        }

        .sign-in-button:hover {
            background-color: #106ebe;
        }

        .sign-in-button:active {
            background-color: #005a9e;
        }

        .sign-in-button:focus-visible {
            outline: 2px solid var(--vscode-focusBorder);
            outline-offset: 2px;
        }
    </style>
</head>
<body>
    <div class="welcome-container">
        <div class="welcome-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48">
                <rect x="1" y="1" width="14" height="17" rx="2" fill="currentColor" opacity="0.3"/>
                <rect x="3" y="3" width="3.5" height="2.5" rx="0.5" fill="currentColor"/>
                <rect x="7.5" y="3" width="3.5" height="2.5" rx="0.5" fill="currentColor" opacity="0.6"/>
                <rect x="12" y="3" width="2" height="2.5" rx="0.5" fill="currentColor" opacity="0.8"/>
                <rect x="3" y="7" width="3.5" height="2.5" rx="0.5" fill="currentColor" opacity="0.6"/>
                <rect x="7.5" y="7" width="3.5" height="2.5" rx="0.5" fill="currentColor"/>
                <rect x="3" y="11" width="3.5" height="2.5" rx="0.5" fill="currentColor" opacity="0.8"/>
                <path fill="#0078d4" fill-rule="evenodd" d="M17 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm-1.5 9.94l-2.78-2.78 1.06-1.06 1.72 1.72 3.94-3.94 1.06 1.06-5 5z"/>
            </svg>
        </div>
        <h2 class="welcome-title">Azure DevOps Boards</h2>
        <p class="welcome-description">
            Connect with your Microsoft account to manage work items, boards, and sprints.
        </p>
        <button class="sign-in-button" id="signInBtn">
            Sign In to Azure DevOps
        </button>
    </div>
    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();
            document.getElementById('signInBtn').addEventListener('click', function() {
                vscode.postMessage({ type: 'signIn' });
            });
        })();
    </script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
