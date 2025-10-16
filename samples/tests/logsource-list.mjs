import { LogSourceFactory } from '../../packages/sdk/dist/esm/services/logs/index.js';

(async () => {
  const factory = new LogSourceFactory();
  const projects = await factory.getAllProjects();
  const claudeProjects = await factory.getAllProjects('CLAUDE_CODE');

  console.log(JSON.stringify({
    totalProjects: projects.length,
    claudeProjects
  }, null, 2));
})();
