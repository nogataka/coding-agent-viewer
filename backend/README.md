# Vibe Kanban Backend

A TypeScript/Node.js backend for the Vibe Kanban project management system with AI-powered task execution capabilities.

## Features

### Core Functionality
- 📋 **Task Management**: Create, organize, and track tasks with status updates
- 🔄 **Task Attempts**: Multiple attempts per task with isolated execution environments
- 🚀 **AI Integration**: Support for multiple AI executors (Claude Code, AMP, Gemini, etc.)
- 📊 **Execution Monitoring**: Real-time log streaming and process monitoring
- 🌳 **Git Worktrees**: Isolated development environments using git worktrees
- 🐙 **GitHub Integration**: Automatic PR creation and status tracking

### AI Executors
- **Claude Code**: Anthropic's Claude with code execution capabilities
- **AMP**: Sourcegraph's coding agent
- **Gemini**: Google's AI coding assistant
- **Extensible**: Easy to add new executor profiles

### Infrastructure
- 🛠 **Container Management**: Lightweight container system using worktrees
- 📡 **Real-time Updates**: Server-Sent Events for live log streaming
- 🗄️ **SQLite Database**: Reliable local storage with migrations
- 🔧 **REST API**: Comprehensive API for all operations

## Quick Start

### Prerequisites
- Node.js 18+ 
- Git
- Optional: GitHub Personal Access Token for GitHub integration

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd coding-agent-mgr/backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env file with your configuration
# Add GitHub token, API keys, etc.

# Start development server
npm run dev
```

The server will start on `http://localhost:3001` by default.

### Environment Configuration

Key environment variables in `.env`:

```bash
# GitHub Integration
GITHUB_TOKEN=your_github_personal_access_token

# AI API Keys (choose your preferred executor)
ANTHROPIC_API_KEY=your_claude_api_key
OPENAI_API_KEY=your_openai_api_key  
GOOGLE_AI_API_KEY=your_gemini_api_key

# Default executor profile
DEFAULT_EXECUTOR_PROFILE=claude-code
```

## API Documentation

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create a new project
- `GET /api/projects/:id` - Get project details
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Tasks
- `GET /api/tasks?project_id=:id` - List tasks for a project
- `POST /api/tasks` - Create a new task
- `GET /api/tasks/:id` - Get task details
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Task Attempts
- `GET /api/task-attempts?task_id=:id` - List attempts for a task
- `POST /api/task-attempts/:task_id/attempts` - Create new attempt
- `POST /api/task-attempts/:id/execute` - Start AI execution
- `POST /api/task-attempts/:id/follow-up` - Continue with follow-up prompt
- `GET /api/task-attempts/:id/execution-processes` - Get execution history

### Execution Processes
- `GET /api/execution-processes/:id` - Get execution details
- `GET /api/execution-processes/:id/raw-logs` - Real-time log stream (SSE)
- `GET /api/execution-processes/:id/normalized-logs` - Normalized log stream (SSE)
- `POST /api/execution-processes/:id/stop` - Stop execution

### GitHub Integration
- `GET /api/github/user` - Get authenticated user info
- `GET /api/github/status` - Check GitHub integration status
- `POST /api/github/task-attempts/:id/pr` - Create PR for task attempt
- `GET /api/github/task-attempts/:id/pr` - Get PR info for task attempt
- `POST /api/github/refresh-prs` - Refresh PR statuses

### Configuration
- `GET /api/config/profiles` - Get executor profiles
- `PUT /api/config/profiles` - Update executor profiles
- `GET /api/config/profiles/:label` - Get specific profile
- `GET /api/config/system-info` - Get system information

### Containers
- `GET /api/containers` - List all containers
- `GET /api/containers/running` - List running containers  
- `POST /api/containers` - Create container
- `POST /api/containers/:id/start` - Start container
- `POST /api/containers/:id/stop` - Stop container
- `POST /api/containers/:id/exec` - Execute command in container
- `DELETE /api/containers/:id` - Remove container

## Development

### Project Structure

```
src/
├── actions/           # Executor action types
├── models/           # Database models and types
├── routes/           # API route handlers
├── services/         # Core business logic
│   └── logs/         # Filesystem log sources & processors
├── utils/            # Utility functions
└── index.ts          # Application entry point
```

### Database Migrations

The application automatically creates and migrates the SQLite database on startup. Database file is stored in `./data/coding-agent-mgr.db`.

Reset database:
```bash
npm run db:reset
```

### Scripts

```bash
npm run dev           # Start development server
npm run build         # Build for production
npm run start         # Start production server
npm run check         # Run type checking, linting, formatting
npm run clean         # Clean build artifacts
npm run db:reset      # Reset database
```

## Architecture

### Execution Flow

1. **Task Creation**: Create a task with description and requirements
2. **Task Attempt**: Create an isolated attempt with executor profile
3. **Worktree Setup**: Create git worktree for isolated environment
4. **AI Execution**: Run selected AI executor with task context
5. **Real-time Monitoring**: Stream logs and monitor execution
6. **Results**: Review changes, create PR if needed

### Container System

Instead of Docker containers, the system uses git worktrees for isolation:
- Each task attempt gets its own worktree
- Changes are isolated from main branch
- Easy cleanup and resource management
- Works seamlessly with git workflows

### Real-time Updates

Server-Sent Events provide real-time updates for:
- Execution logs (raw and normalized)
- Process status changes
- Container events
- GitHub PR status updates

## Troubleshooting

### Common Issues

**GitHub Integration Not Working**
- Verify `GITHUB_TOKEN` in `.env`
- Check token has `repo` permissions
- Ensure repository has remote origin

**Executor Not Found**
- Check profile exists in `/api/config/profiles`
- Verify executor dependencies installed (e.g., `@anthropic-ai/claude-code`)
- Check API keys in environment

**Database Issues**
- Delete `data/coding-agent-mgr.db` and restart server
- Check file permissions on data directory

**Port Already in Use**
- Change `PORT=3001` in `.env` to different port
- Kill existing process on port 3001

### Logs

Application logs include:
- Server startup and initialization
- Database queries and migrations
- Executor communications
- GitHub API calls
- Container operations

Check console output for detailed error messages.

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Code Style

- TypeScript with strict type checking
- ESLint for code quality
- Prettier for formatting
- Run `npm run check` before committing

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions or issues:
1. Check the troubleshooting section
2. Review API documentation
3. Create an issue on GitHub

---

Built with ❤️ using TypeScript, Express, and modern web technologies.
