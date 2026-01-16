# Azure DevOps Boards VSCode Extension

A Visual Studio Code extension that integrates Azure DevOps Boards directly into your development workflow.

## Features

### 🔐 Authentication
- Personal Access Token (PAT) based authentication
- Secure token storage using VSCode's SecretStorage API
- Support for multiple organizations and projects
- Auto-connect on startup

### 📋 Work Item Management
- View work items by type (User Stories, Tasks, Bugs, Epics)
- Create new work items from within VSCode
- Filter work items by state, assigned to, and type
- Quick search and navigation
- Rich work item details with tooltips

### 🎯 Boards & Sprints
- View team boards and columns
- Sprint planning interface
- Capacity planning visualization
- Burndown charts (planned)
- Interactive Kanban-style board views

### 🔗 Git Integration
- Create branches from work items
- Auto-link commits to work items
- Branch naming suggestions
- Pull request creation linked to work items
- Work item tracking in status bar

### 🚀 Development Workflow
- Start/stop work tracking
- Time tracking per work item
- Quick status updates
- Contextual code-work item linking
- Team collaboration features

## Installation

### From Source
1. Clone this repository
2. Run `npm install`
3. Run `npm run compile`
4. Press `F5` to start debugging in Extension Development Host

### From VSIX (when published)
1. Download the `.vsix` file
2. Run `code --install-extension azure-devops-boards.vsix`

## Configuration

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run `Azure DevOps: Connect to Organization`
3. Enter your Azure DevOps organization URL (e.g., `https://dev.azure.com/your-organization`)
4. Enter your Personal Access Token (with Work Items Read & Write scope)

### Optional Configuration
- Set default project and team in settings
- Configure auto-refresh interval
- Enable/disable notifications
- Configure Git integration settings

## Usage

### Basic Commands
- `Azure DevOps: Connect to Organization` - Connect to Azure DevOps
- `Azure DevOps: Create Work Item` - Create a new work item
- `Azure DevOps: Search Work Items` - Search for work items
- `Azure DevOps: Open Board` - Open team board
- `Azure DevOps: Open Sprint` - Open sprint details
- `Azure DevOps: Start Working On...` - Start tracking work on a specific item
- `Azure DevOps: Refresh` - Refresh all data

### Views
The extension adds three views to the Activity Bar:
1. **Azure DevOps Work Items** - Browse and manage work items
2. **Azure DevOps Boards** - View team boards and columns
3. **Azure DevOps Sprints** - Manage sprints and iterations

### Status Bar Integration
- Shows connection status
- Displays current work item being worked on
- Click to connect/disconnect or stop working

## Development

### Project Structure
```
azuredevops-vscode-extension/
├── src/
│   ├── authentication/     # Authentication management
│   ├── commands/          # Command implementations
│   ├── gitIntegration/    # Git integration features
│   ├── models/           # TypeScript interfaces
│   ├── utils/            # Utility classes
│   ├── views/            # Tree view providers
│   └── extension.ts      # Main extension entry point
├── media/                # Icons and assets
├── package.json          # Extension manifest
├── tsconfig.json        # TypeScript configuration
└── README.md            # This file
```

### Building
```bash
npm install
npm run compile
```

### Testing
```bash
npm test
```

### Debugging
1. Open the project in VSCode
2. Press `F5` to start debugging
3. Use the Extension Development Host for testing

## API Integration

The extension uses the Azure DevOps REST API v7.1:
- Work Items API
- Boards API
- Git API
- Core API (Projects, Teams)
- WiQL (Work Item Query Language)

## Security

- Personal Access Tokens are stored securely using VSCode's SecretStorage API
- Tokens are encrypted at rest
- Least privilege principle for token scopes
- No tokens are logged or transmitted unnecessarily

## Roadmap

### Phase 1 (Current)
- Basic authentication
- Work item listing and creation
- Simple board views
- Git integration basics

### Phase 2 (Planned)
- Advanced filtering and queries
- Custom dashboards
- Real-time notifications
- Team collaboration features

### Phase 3 (Future)
- Advanced analytics
- Custom workflows
- Plugin system
- Mobile companion app

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- Report issues on GitHub
- Feature requests welcome
- Documentation improvements appreciated

## Acknowledgments

- Azure DevOps REST API documentation
- VSCode Extension API
- Community contributors

---

**Note**: This is a development version. Features may change as development progresses.