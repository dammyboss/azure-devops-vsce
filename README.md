# Azure DevOps Boards for VS Code

[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-007ACC?style=flat&logo=visual-studio-code)](https://marketplace.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/Built%20with-TypeScript-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![GitHub](https://img.shields.io/badge/GitHub-dammyboss-181717?style=flat&logo=github)](https://github.com/dammyboss)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Damilola_Onadeinde-0077B5?style=flat&logo=linkedin)](https://linkedin.com/in/damilola-onadeinde)
[![YouTube](https://img.shields.io/badge/YouTube-DevOps_with_Dami-FF0000?style=flat&logo=youtube)](https://youtube.com/@devopswithdami)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support%20My%20Work-orange?style=flat&logo=buymeacoffee)](https://buymeacoffee.com/devopswithdami)

Manage your Azure DevOps Boards, work items, sprints, and backlogs directly from Visual Studio Code. Plan, track, and collaborate on your projects without leaving your editor.

## Demo

https://github.com/user-attachments/assets/demo.mov

<video src="./media/demo.mov" controls width="100%">
  Your browser does not support the video tag.
</video>

## Features

### Secure Authentication
- OAuth 2.0 authentication using Microsoft accounts
- No Personal Access Token (PAT) required
- Secure token storage using VS Code's SecretStorage API
- Support for multiple organizations and projects
- Auto-connect on startup
- Multi-tenant support

### Work Item Management
- View work items by type (User Stories, Tasks, Bugs, Epics)
- Create new work items from within VS Code
- Edit work item details inline
- Filter work items by state, assigned to, and type
- Quick search and navigation
- Rich work item details with tooltips

### Boards & Sprints
- Interactive Kanban-style board views
- View team boards and columns
- Sprint planning interface
- Drag-and-drop work items between columns
- Real-time board updates
- Card styling rules support (colors based on field criteria)
- Automatic contrast text colors for optimal readability

### Backlogs
- View and manage product backlogs
- Hierarchical backlog views (Epics → Features → Stories)
- Reorder backlog items
- Quick access to work item details

### Git Integration
- Create branches from work items
- Auto-link commits to work items
- Branch naming suggestions
- Pull request creation linked to work items

### Developer Experience
- Intuitive tree view interface
- Status bar integration showing connection status
- Quick access to all work item operations
- Detailed work item panels
- Keyboard shortcuts for common actions

## Getting Started

### Installation

1. Install the extension from the VS Code Marketplace
2. Click the Azure DevOps icon in the Activity Bar
3. Click "Sign In" to authenticate with your Microsoft account
4. Select your Azure DevOps organization
5. Select your project and team
6. Start managing your work items!

## Usage

### Authentication

1. Open the Azure DevOps Boards view from the Activity Bar
2. Click "Sign In" in the Connection section
3. Authenticate with your Microsoft account in the browser
4. Return to VS Code - you're now connected!
5. Complete the setup wizard to select your organization, project, and team

### Managing Work Items

**View Work Items:**
- Browse all work items in the Work Items view
- Filter by type, state, or assignee
- Click on a work item to view details

**Create a Work Item:**
- Right-click in the Work Items view
- Select "Create Work Item"
- Choose the type and enter details
- The work item is created immediately

**Edit Work Items:**
- Click on a work item to open the details panel
- Edit fields inline
- Changes are saved automatically

### Using Boards

**View Boards:**
- Navigate to the Boards view
- Select a board to open the interactive Kanban view
- See all columns and work items

**Move Work Items:**
- Drag and drop cards between columns
- Work item state updates automatically
- Visual feedback during drag operations

**Card Styling:**
- Cards automatically apply colors based on board styling rules
- Tag colors from Azure DevOps are preserved
- Text colors adjust automatically for readability

**Filter Boards:**
- Use the filter bar to narrow down work items
- Filter by assignee, type, priority, state, or area
- Search by ID or title
- Toggle "Hide Done" or "My Items" for quick views

### Managing Sprints

**View Sprints:**
- Browse all sprints in the Sprints view
- See sprint capacity and progress
- View sprint backlog and taskboard

**Sprint Planning:**
- Assign work items to sprints
- Track sprint capacity
- Monitor burndown

### Changing Organization/Project

- Click the status bar item (bottom left) showing your connection
- Or use Command Palette: "Azure DevOps: Setup Wizard"
- Choose a different organization, project, or team

## Commands

Access these commands from the Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`):

- `Azure DevOps: Sign In to Azure DevOps` - Authenticate with Microsoft account
- `Azure DevOps: Sign Out` - Sign out from Azure DevOps
- `Azure DevOps: Setup Wizard` - Configure organization, project, and team
- `Azure DevOps: Create Work Item` - Create a new work item
- `Azure DevOps: Search Work Items` - Search for work items
- `Azure DevOps: Open Board` - Open team board
- `Azure DevOps: Open Sprint` - Open sprint details
- `Azure DevOps: Refresh` - Refresh all data

## Requirements

- Visual Studio Code 1.85.0 or higher
- Azure DevOps account with appropriate permissions
- Microsoft account for authentication

## Features in Detail

### Board View
- **Interactive Kanban Board**: Drag-and-drop work items between columns
- **Card Styling Rules**: Automatic color coding based on Azure DevOps styling rules
- **Smart Text Colors**: Automatic contrast adjustment for tag text (black on light backgrounds, white on dark)
- **Filtering**: Advanced filtering by assignee, type, priority, state, area, and keywords
- **Column Management**: Collapse/expand columns, view WIP limits
- **Quick Actions**: Assign to me, change state, add comments, create branches

### Work Item Details
- **Inline Editing**: Edit title, description, and fields without opening browser
- **Rich Information**: View all fields, tags, comments, and attachments
- **Relationship Tracking**: See parent/child relationships and links
- **History**: View work item history and changes
- **Quick Actions**: Create branches, link pull requests, add tasks

### Sprint Management
- **Sprint Backlog**: View and manage sprint work items
- **Taskboard**: Interactive taskboard for daily standups
- **Capacity Planning**: Track team capacity and allocation
- **Burndown**: Monitor sprint progress (planned)

## Support

For issues, feature requests, or contributions, please visit the [GitHub repository](https://github.com/dammyboss/azure-devops-vsce).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## About the Developer

**Damilola Onadeinde**  
*DevOps/AI Engineer | Cloud Infrastructure Specialist | Open Source Contributor*

Connect with me:

<a href="https://github.com/dammyboss"><img src="https://img.icons8.com/fluent/48/000000/github.png" alt="GitHub" width="40"/></a>
<a href="https://linkedin.com/in/damilola-onadeinde"><img src="https://img.icons8.com/fluent/48/000000/linkedin.png" alt="LinkedIn" width="40"/></a>
<a href="https://devopswithdami.com"><img src="https://img.icons8.com/fluent/48/000000/domain.png" alt="Portfolio" width="40"/></a>
<a href="https://youtube.com/@devopswithdami"><img src="https://img.icons8.com/fluent/48/000000/youtube-play.png" alt="YouTube" width="40"/></a>

## Support the Developer

If you find this project helpful and would like to support my work, consider buying me a coffee!

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support%20My%20Work-orange?style=for-the-badge&logo=buymeacoffee)](https://buymeacoffee.com/devopswithdami)

Your support helps me continue creating open-source tools and improving this project!

## License

MIT License

---

**Enjoy managing your Azure DevOps Boards from VS Code!**
