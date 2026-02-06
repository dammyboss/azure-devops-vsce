import * as vscode from 'vscode';

/**
 * WhatsNewPanel - Shows a fancy update notification modal when extension is updated
 * Displays release notes, new features, and improvements
 */
export class WhatsNewPanel {
    public static currentPanel: WhatsNewPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];

    // Current announcement ID - UPDATE THIS FOR EACH NEW RELEASE
    public static readonly LATEST_ANNOUNCEMENT_ID = 'feb-2026-v0.2.4-session-restore-fix';

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly context: vscode.ExtensionContext
    ) {
        this.panel = panel;
        this.panel.webview.html = this.getHtmlContent();

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'dismiss':
                        // Update global state to mark announcement as seen
                        await this.context.globalState.update(
                            'lastShownAnnouncementId',
                            WhatsNewPanel.LATEST_ANNOUNCEMENT_ID
                        );
                        this.panel.dispose();
                        break;
                    case 'openUrl':
                        if (message.url) {
                            vscode.env.openExternal(vscode.Uri.parse(message.url));
                        }
                        break;
                }
            },
            null,
            this.disposables
        );

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    /**
     * Show the What's New panel
     */
    public static async show(context: vscode.ExtensionContext): Promise<void> {

        // Check if we should show the announcement
        const lastShownId = context.globalState.get<string>('lastShownAnnouncementId', '');

        if (lastShownId === WhatsNewPanel.LATEST_ANNOUNCEMENT_ID) {
            // User has already seen this announcement
            return;
        }

        // If panel already exists, focus it
        if (WhatsNewPanel.currentPanel) {
            WhatsNewPanel.currentPanel.panel.reveal();
            return;
        }

        // Create new panel
        const panel = vscode.window.createWebviewPanel(
            'azureDevOpsBoardsWhatsNew',
            "🎉 What's New",
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [context.extensionUri]
            }
        );

        WhatsNewPanel.currentPanel = new WhatsNewPanel(panel, context);
    }

    /**
     * Force show the What's New panel (for testing or manual trigger)
     */
    public static async forceShow(context: vscode.ExtensionContext): Promise<void> {

        // Create new panel
        const panel = vscode.window.createWebviewPanel(
            'azureDevOpsBoardsWhatsNew',
            "🎉 What's New",
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [context.extensionUri]
            }
        );

        WhatsNewPanel.currentPanel = new WhatsNewPanel(panel, context);
    }

    private getHtmlContent(): string {
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https://img.icons8.com; script-src 'nonce-${nonce}';">
            <title>What's New - Azure DevOps Pipelines</title>
            <style>
                /* Reset & Base */
                *, *::before, *::after {
                    box-sizing: border-box;
                    margin: 0;
                    padding: 0;
                }

                :root {
                    --bg-base: #1e1e1e;
                    --bg-card: #252526;
                    --bg-secondary: #2d2d30;
                    --text-primary: #cccccc;
                    --text-secondary: #858585;
                    --accent-blue: #0078d4;
                    --accent-blue-hover: #006cbd;
                    --border: #3c3c3c;
                    --success: #4ade80;
                    --warning: #fbbf24;
                    --error: #f87171;
                }

                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                    background: var(--vscode-editor-background, var(--bg-base));
                    color: var(--text-primary);
                    line-height: 1.5;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 1rem;
                }

                /* ===== Animations ===== */
                @keyframes backdropFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                @keyframes modalSlideIn {
                    from {
                        opacity: 0;
                        transform: translateY(30px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }

                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
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

                @keyframes contentFadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                @keyframes iconBounce {
                    0% { opacity: 0; transform: scale(0.5) rotate(-10deg); }
                    50% { transform: scale(1.1) rotate(5deg); }
                    100% { opacity: 1; transform: scale(1) rotate(0deg); }
                }

                @keyframes rocketWobble {
                    0%, 100% { transform: rotate(-3deg) translateY(0); }
                    25% { transform: rotate(3deg) translateY(-2px); }
                    50% { transform: rotate(-2deg) translateY(0); }
                    75% { transform: rotate(2deg) translateY(-1px); }
                }

                @keyframes badgePop {
                    from { opacity: 0; transform: scale(0); }
                    50% { transform: scale(1.2); }
                    to { opacity: 1; transform: scale(1); }
                }

                @keyframes shimmerMove {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }

                @keyframes gradientShift {
                    0%, 100% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                }

                @keyframes floatUp {
                    0% {
                        opacity: 0;
                        transform: translateY(0) scale(0);
                    }
                    10% {
                        opacity: 1;
                        transform: scale(1);
                    }
                    90% {
                        opacity: 1;
                    }
                    100% {
                        opacity: 0;
                        transform: translateY(-80px) scale(0.5);
                    }
                }

                @keyframes slideUpFade {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }

                /* ===== Backdrop ===== */
                .backdrop {
                    position: fixed;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 1rem;
                    animation: backdropFadeIn 0.4s ease-out forwards;
                    z-index: 1000;
                }

                .backdrop-bg {
                    position: absolute;
                    inset: 0;
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    background: radial-gradient(circle at 50% 30%, rgba(0, 120, 212, 0.15) 0%, rgba(0,0,0,0.7) 100%);
                }

                /* ===== Modal ===== */
                .modal {
                    position: relative;
                    width: 100%;
                    max-width: 650px;
                    max-height: 90vh;
                    background: var(--bg-card);
                    border-radius: 12px;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 0 80px rgba(0, 120, 212, 0.3), 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                    animation: modalSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }

                /* ===== Header ===== */
                .modal-header {
                    position: relative;
                    padding: 1.25rem 1.5rem;
                    background: linear-gradient(135deg, #0078d4 0%, #3b4f82 50%, #0078d4 100%);
                    background-size: 200% 200%;
                    animation: gradientShift 8s ease infinite;
                    overflow: hidden;
                }

                /* Floating particles */
                .particle {
                    position: absolute;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.2);
                    pointer-events: none;
                    bottom: -10px;
                }
                .particle-1 { width: 4px; height: 4px; left: 10%; animation: floatUp 3s ease-out 0s infinite; }
                .particle-2 { width: 6px; height: 6px; left: 25%; animation: floatUp 4s ease-out 0.5s infinite; }
                .particle-3 { width: 3px; height: 3px; left: 40%; animation: floatUp 3.5s ease-out 1s infinite; }
                .particle-4 { width: 5px; height: 5px; left: 60%; animation: floatUp 4.5s ease-out 1.5s infinite; }
                .particle-5 { width: 4px; height: 4px; left: 75%; animation: floatUp 3s ease-out 0.3s infinite; }
                .particle-6 { width: 3px; height: 3px; left: 90%; animation: floatUp 4s ease-out 0.8s infinite; }

                /* Shimmer sweep */
                .header-shimmer {
                    position: absolute;
                    inset: 0;
                    opacity: 0.4;
                    pointer-events: none;
                    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%);
                    animation: shimmerMove 3s ease-in-out infinite;
                }

                /* Glow orbs */
                .glow-orb-1 {
                    position: absolute;
                    top: -80px;
                    right: -80px;
                    width: 160px;
                    height: 160px;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.1);
                    filter: blur(48px);
                    animation: pulse 2s ease-in-out infinite;
                    pointer-events: none;
                }
                .glow-orb-2 {
                    position: absolute;
                    bottom: -40px;
                    left: -40px;
                    width: 128px;
                    height: 128px;
                    border-radius: 50%;
                    background: rgba(0, 120, 212, 0.2);
                    filter: blur(32px);
                    animation: pulse 2s ease-in-out 1s infinite;
                    pointer-events: none;
                }

                .close-btn {
                    position: absolute;
                    top: 1rem;
                    right: 1rem;
                    width: 32px;
                    height: 32px;
                    border-radius: 6px;
                    border: none;
                    background: transparent;
                    color: rgba(255, 255, 255, 0.7);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s;
                    z-index: 2;
                }

                .close-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                    transform: rotate(90deg) scale(1.1);
                }

                .close-btn svg {
                    width: 20px;
                    height: 20px;
                }

                .header-content {
                    position: relative;
                    z-index: 1;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    animation: contentFadeIn 0.6s ease-out 0.2s both;
                }

                .header-icon {
                    width: 56px;
                    height: 56px;
                    border-radius: 12px;
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: transform 0.3s;
                    animation: iconBounce 0.6s ease-out 0.3s both;
                }

                .header-icon:hover {
                    transform: scale(1.05);
                }

                .header-icon svg {
                    width: 28px;
                    height: 28px;
                    color: white;
                    animation: rocketWobble 2s ease-in-out infinite;
                }

                .header-text h1 {
                    font-size: 1.25rem;
                    font-weight: 600;
                    color: white;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-bottom: 0.25rem;
                }

                .version-badge {
                    padding: 0.125rem 0.5rem;
                    font-size: 0.75rem;
                    font-weight: 500;
                    background: rgba(255, 255, 255, 0.2);
                    color: white;
                    border-radius: 9999px;
                    cursor: default;
                    transition: background 0.3s;
                    animation: badgePop 0.4s ease-out 0.5s both;
                }

                .version-badge:hover {
                    background: rgba(255, 255, 255, 0.3);
                }

                .header-text p {
                    font-size: 0.875rem;
                    color: rgba(255, 255, 255, 0.8);
                }

                /* ===== Content ===== */
                .modal-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 1.25rem 1.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1.25rem;
                }

                /* ===== Section ===== */
                .section {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    opacity: 0;
                }
                .section.s1 { animation: fadeInUp 0.6s ease-out 0.2s both; }
                .section.s2 { animation: fadeInUp 0.6s ease-out 0.4s both; }
                .section.s3 { animation: fadeInUp 0.6s ease-out 0.6s both; }

                .section-header {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0 0.25rem;
                }

                .section-icon {
                    width: 20px;
                    height: 20px;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: pulse 2s ease-in-out infinite;
                }

                .section-icon.features { background: rgba(74, 222, 128, 0.2); }
                .section-icon.features svg { color: #4ade80; }

                .section-icon.fixes { background: rgba(248, 113, 113, 0.2); }
                .section-icon.fixes svg { color: #f87171; }

                .section-icon.improvements { background: rgba(251, 191, 36, 0.2); }
                .section-icon.improvements svg { color: #fbbf24; }

                .section-icon svg {
                    width: 12px;
                    height: 12px;
                }

                .section-title {
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--text-secondary);
                }

                .section-content {
                    background: rgba(37, 37, 38, 0.5);
                    border-radius: 8px;
                    border: 1px solid rgba(60, 60, 60, 0.5);
                    overflow: hidden;
                    backdrop-filter: blur(4px);
                    -webkit-backdrop-filter: blur(4px);
                    transition: border-color 0.5s;
                }

                .section-content:hover {
                    border-color: rgba(0, 120, 212, 0.3);
                }

                /* ===== Feature Item ===== */
                .feature-item {
                    display: flex;
                    gap: 0.75rem;
                    padding: 0.75rem;
                    transition: all 0.3s;
                    cursor: default;
                    opacity: 0;
                }

                .feature-item:hover {
                    background: rgba(45, 45, 48, 0.5);
                    transform: translateX(4px);
                }

                .feature-item + .feature-item {
                    border-top: 1px solid rgba(60, 60, 60, 0.3);
                }

                /* Staggered slide-in animations for each feature item */
                .feature-item.fi-0 { animation: slideInFromRight 0.5s ease-out 0.0s both; }
                .feature-item.fi-1 { animation: slideInFromRight 0.5s ease-out 0.1s both; }
                .feature-item.fi-2 { animation: slideInFromRight 0.5s ease-out 0.2s both; }
                .feature-item.fi-3 { animation: slideInFromRight 0.5s ease-out 0.3s both; }
                .feature-item.fi-4 { animation: slideInFromRight 0.5s ease-out 0.4s both; }
                .feature-item.fi-5 { animation: slideInFromRight 0.5s ease-out 0.5s both; }
                .feature-item.fi-6 { animation: slideInFromRight 0.5s ease-out 0.6s both; }
                .feature-item.fi-7 { animation: slideInFromRight 0.5s ease-out 0.7s both; }

                .feature-icon {
                    flex-shrink: 0;
                    width: 32px;
                    height: 32px;
                    border-radius: 6px;
                    background: rgba(0, 120, 212, 0.1);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s;
                }

                .feature-item:hover .feature-icon {
                    background: rgba(0, 120, 212, 0.2);
                    transform: scale(1.1) rotate(3deg);
                }

                .feature-icon svg {
                    width: 16px;
                    height: 16px;
                    color: var(--accent-blue);
                }

                .feature-text {
                    flex: 1;
                    min-width: 0;
                }

                .feature-text h4 {
                    font-size: 0.875rem;
                    font-weight: 500;
                    color: var(--text-primary);
                    margin-bottom: 0.125rem;
                    transition: color 0.3s;
                }

                .feature-item:hover .feature-text h4 {
                    color: var(--accent-blue);
                }

                .feature-text p {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                    line-height: 1.5;
                }

                /* Hover indicator dot */
                .hover-dot {
                    display: flex;
                    align-items: center;
                    opacity: 0;
                    transition: opacity 0.3s;
                }

                .feature-item:hover .hover-dot {
                    opacity: 1;
                }

                .hover-dot-inner {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: var(--accent-blue);
                    animation: pulse 1s ease-in-out infinite;
                }

                /* ===== Footer ===== */
                .modal-footer {
                    padding: 1rem 1.5rem;
                    background: rgba(45, 45, 48, 0.5);
                    border-top: 1px solid var(--border);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 1rem;
                    flex-wrap: wrap;
                    animation: slideUpFade 0.5s ease-out 0.5s both;
                }

                .footer-links {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }

                .footer-link {
                    display: flex;
                    align-items: center;
                    gap: 0.375rem;
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                    text-decoration: none;
                    background: none;
                    border: none;
                    cursor: pointer;
                    transition: all 0.3s;
                    padding: 0;
                }

                .footer-link:hover {
                    color: var(--text-primary);
                    transform: scale(1.05);
                }

                .footer-link svg, .footer-link-img {
                    width: 16px;
                    height: 16px;
                    transition: transform 0.3s, filter 0.3s;
                }

                .footer-link-img {
                    filter: invert(1) brightness(0.522);
                }

                .footer-link:hover svg, .footer-link:hover .footer-link-img {
                    transform: rotate(12deg);
                }

                .footer-link:hover .footer-link-img {
                    filter: invert(1) brightness(0.8);
                }

                .footer-divider {
                    color: var(--border);
                }

                .dismiss-btn {
                    position: relative;
                    padding: 0.5rem 1.25rem;
                    background: var(--accent-blue);
                    color: white;
                    font-size: 0.875rem;
                    font-weight: 500;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.3s;
                    overflow: hidden;
                }

                .dismiss-btn:hover {
                    background: var(--accent-blue-hover);
                    box-shadow: 0 4px 12px rgba(0, 120, 212, 0.3);
                    transform: scale(1.05);
                }

                .dismiss-btn:focus {
                    outline: none;
                    box-shadow: 0 0 0 2px var(--bg-card), 0 0 0 4px var(--accent-blue);
                }

                .dismiss-btn .btn-text {
                    position: relative;
                    z-index: 1;
                }

                .dismiss-btn .btn-shimmer {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
                    transform: translateX(-100%);
                    transition: transform 0.7s;
                }

                .dismiss-btn:hover .btn-shimmer {
                    transform: translateX(100%);
                }

                /* ===== Scrollbar ===== */
                .modal-content::-webkit-scrollbar {
                    width: 8px;
                }

                .modal-content::-webkit-scrollbar-track {
                    background: transparent;
                }

                .modal-content::-webkit-scrollbar-thumb {
                    background: var(--border);
                    border-radius: 4px;
                }

                .modal-content::-webkit-scrollbar-thumb:hover {
                    background: #4a4a4a;
                }

                /* ===== Mobile responsive ===== */
                @media (max-width: 480px) {
                    .modal-footer {
                        flex-direction: column;
                        align-items: stretch;
                    }

                    .footer-links {
                        justify-content: center;
                    }

                    .dismiss-btn {
                        width: 100%;
                    }
                }
            </style>
        </head>
        <body>
            <div class="backdrop" id="backdrop">
                <!-- Animated backdrop -->
                <div class="backdrop-bg"></div>

                <div class="modal" onclick="event.stopPropagation()">
                    <!-- Header with animated gradient and particles -->
                    <div class="modal-header">
                        <!-- Floating particles -->
                        <div class="particle particle-1"></div>
                        <div class="particle particle-2"></div>
                        <div class="particle particle-3"></div>
                        <div class="particle particle-4"></div>
                        <div class="particle particle-5"></div>
                        <div class="particle particle-6"></div>

                        <!-- Shimmer sweep -->
                        <div class="header-shimmer"></div>

                        <!-- Glow orbs -->
                        <div class="glow-orb-1"></div>
                        <div class="glow-orb-2"></div>

                        <button class="close-btn" onclick="dismiss()" aria-label="Close">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                        <div class="header-content">
                            <div class="header-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                                </svg>
                            </div>
                            <div class="header-text">
                                <h1>
                                    Azure DevOps Boards
                                    <span class="version-badge">v0.2.4</span>
                                </h1>
                                <p>What's new in this release</p>
                            </div>
                        </div>
                    </div>

                    <!-- Content -->
                    <div class="modal-content">
                        <!-- Critical Fixes -->
                        <div class="section s2">
                            <div class="section-header">
                                <div class="section-icon fixes">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0112 12.75zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 01-1.152 6.06M12 12.75c-2.883 0-5.647.508-8.208 1.44.125 2.104.52 4.136 1.153 6.06M12 12.75a2.25 2.25 0 002.248-2.354M12 12.75a2.25 2.25 0 01-2.248-2.354M12 8.25c.995 0 1.971-.08 2.922-.236.403-.066.74-.358.795-.762a3.778 3.778 0 00-.399-2.25M12 8.25c-.995 0-1.97-.08-2.922-.236-.402-.066-.74-.358-.795-.762a3.734 3.734 0 01.4-2.253M12 8.25a2.25 2.25 0 00-2.248 2.146M12 8.25a2.25 2.25 0 012.248 2.146M8.683 5a6.032 6.032 0 01-1.155-1.002c.07-.63.27-1.222.574-1.747m.581 2.749A3.75 3.75 0 0115.318 5m0 0c.427-.283.815-.62 1.155-.999a4.471 4.471 0 00-.575-1.752M4.921 6a24.048 24.048 0 00-.392 3.314c1.668.546 3.416.914 5.223 1.082M19.08 6c.205 1.08.337 2.187.392 3.314a23.882 23.882 0 01-5.223 1.082" />
                                    </svg>
                                </div>
                                <span class="section-title">Critical Fixes</span>
                            </div>
                            <div class="section-content">
                                <div class="feature-item fi-0">
                                    <div class="feature-icon">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                        </svg>
                                    </div>
                                    <div class="feature-text">
                                        <h4>Extension Activation Fixed</h4>
                                        <p>Resolved "command not found" error that prevented extension from loading after marketplace install. Production dependencies now properly bundled.</p>
                                    </div>
                                    <div class="hover-dot"><div class="hover-dot-inner"></div></div>
                                </div>
                                <div class="feature-item fi-1">
                                    <div class="feature-icon">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                        </svg>
                                    </div>
                                    <div class="feature-text">
                                        <h4>Session Restoration Fixed</h4>
                                        <p>Fixed session restoration to include stored tenant scope. Multi-tenant users now stay connected across VS Code restarts without losing organization access.</p>
                                    </div>
                                    <div class="hover-dot"><div class="hover-dot-inner"></div></div>
                                </div>
                            </div>
                        </div>

                        <!-- Improvements -->
                        <div class="section s3">
                            <div class="section-header">
                                <div class="section-icon improvements">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                                    </svg>
                                </div>
                                <span class="section-title">Improvements</span>
                            </div>
                            <div class="section-content">
                                <div class="feature-item fi-2">
                                    <div class="feature-icon">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                        </svg>
                                    </div>
                                    <div class="feature-text">
                                        <h4>Optimized Package Size</h4>
                                        <p>Extension package optimized to 8.8MB (down from 41MB) by excluding media files while maintaining full functionality.</p>
                                    </div>
                                    <div class="hover-dot"><div class="hover-dot-inner"></div></div>
                                </div>
                                <div class="feature-item fi-3">
                                    <div class="feature-icon">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                                        </svg>
                                    </div>
                                    <div class="feature-text">
                                        <h4>Enhanced Reliability</h4>
                                        <p>Improved error handling and session management for more stable connections across different Azure DevOps tenants.</p>
                                    </div>
                                    <div class="hover-dot"><div class="hover-dot-inner"></div></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="modal-footer">
                        <div class="footer-links">
                            <button class="footer-link" onclick="openUrl('https://github.com/dammyboss/azure-devops-vsce')">
                                <img src="https://img.icons8.com/fluency-systems-regular/48/github.png" alt="GitHub" class="footer-link-img">
                                GitHub
                            </button>
                            <span class="footer-divider">&bull;</span>
                            <button class="footer-link" onclick="openUrl('https://github.com/dammyboss/azure-devops-vsce/issues')">
                                <img src="https://img.icons8.com/fluency-systems-regular/48/topic.png" alt="Report Issues" class="footer-link-img">
                                Report Issues
                            </button>
                            <span class="footer-divider">&bull;</span>
                            <button class="footer-link" onclick="openUrl('https://github.com/dammyboss/azure-devops-vsce/blob/main/CHANGELOG.md')">
                                <img src="https://img.icons8.com/ios/50/document--v1.png" alt="Full Changelog" class="footer-link-img">
                                Full Changelog
                            </button>
                        </div>
                        <button class="dismiss-btn" onclick="dismiss()">
                            <span class="btn-text">Got it!</span>
                            <div class="btn-shimmer"></div>
                        </button>
                    </div>
                </div>
            </div>

            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();

                function dismiss() {
                    vscode.postMessage({ command: 'dismiss' });
                }

                function openUrl(url) {
                    vscode.postMessage({ command: 'openUrl', url: url });
                }

                // Close on backdrop click
                document.getElementById('backdrop').addEventListener('click', function(e) {
                    if (e.target === this || e.target.classList.contains('backdrop-bg')) {
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

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    public dispose(): void {
        WhatsNewPanel.currentPanel = undefined;

        this.panel.dispose();

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
