import { Express, Request, Response } from 'express';
import { projectRoutes } from './projects';
import { taskRoutes } from './tasks';
import { executionProcessRoutes } from './executionProcesses';
import { frontendRoutes } from './frontend';
import { profilesRoutes } from './profiles';
import { taskAttemptsRoutes } from './taskAttempts';

export function setupRoutes(app: Express): void {
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
  app.all('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      error: 'API route not found',
      path: req.path,
      method: req.method
    });
  });
}
