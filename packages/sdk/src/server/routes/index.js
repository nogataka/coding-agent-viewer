import { projectRoutes } from './projects.js';
import { taskRoutes } from './tasks.js';
import { executionProcessRoutes } from './executionProcesses.js';
import { frontendRoutes } from './frontend.js';
import { profilesRoutes } from './profiles.js';
import { taskAttemptsRoutes } from './taskAttempts.js';
export function setupRoutes(app) {
    // Project management
    app.use('/api/projects', projectRoutes);
    // Profiles management
    app.use('/api/profiles', profilesRoutes);
    // Tasks management
    app.use('/api/tasks', taskRoutes);
    // Task attempts (execution management)
    app.use('/api/task-attempts', taskAttemptsRoutes);
    // Execution processes
    app.use('/api/execution-processes', executionProcessRoutes);
    // Frontend routes
    app.use('/', frontendRoutes);
    // Catch-all for unhandled API routes
    app.all('/api/*', (req, res) => {
        res.status(404).json({
            error: 'API route not found',
            path: req.path,
            method: req.method
        });
    });
}
//# sourceMappingURL=index.js.map