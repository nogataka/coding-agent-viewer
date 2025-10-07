import { Router, Request, Response } from 'express';
import * as fs from 'fs/promises';
import { resolveFrontendPath } from '../../../utils/src/runtimePaths';

const router = Router();

router.get('*', async (req: Request, res: Response) => {
  // API paths should not be handled by frontend router
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({
      error: 'API endpoint not found',
      path: req.originalUrl
    });
  }

  const isDevelopment = process.env.NODE_ENV !== 'production';

  if (isDevelopment) {
    const frontendPort = process.env.FRONTEND_PORT || '3000';
    res.redirect(`http://localhost:${frontendPort}${req.originalUrl}`);
  } else {
    const indexPath = resolveFrontendPath('index.html');

    try {
      await fs.access(indexPath);
      res.sendFile(indexPath);
    } catch {
      res.status(404).json({
        error: 'Frontend not built. Run npm run build in the frontend directory.'
      });
    }
  }
});

export const frontendRoutes = router;
