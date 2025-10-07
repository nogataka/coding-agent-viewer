import { Router, Request, Response } from 'express';
import { ExecutionService } from '../../services/execution/index.js';
import { logger } from '../../utils/logger.js';

const router = Router();

const EXECUTOR_PROFILE_MAP: Record<string, string> = {
  CLAUDE_CODE: 'claude-code',
  CURSOR: 'cursor',
  GEMINI: 'gemini',
  CODEX: 'codex',
  OPENCODE: 'opencode'
};

const executionService = new ExecutionService();

const decodeProjectId = (
  projectId: string
): { executorType: string; actualProjectId: string } | null => {
  const [executorType, ...rest] = projectId.split(':');
  if (!executorType || rest.length === 0) {
    return null;
  }
  return { executorType, actualProjectId: rest.join(':') };
};

const decodeSessionId = (
  sessionId: string
): { executorType: string; actualProjectId: string } | null => {
  const [executorType, projectPart, ...rest] = sessionId.split(':');
  if (!executorType || !projectPart || rest.length === 0) {
    return null;
  }
  return {
    executorType,
    actualProjectId: projectPart
  };
};

const resolveProfileLabel = (executorType: string): string => {
  return EXECUTOR_PROFILE_MAP[executorType] ?? executorType.toLowerCase();
};

const toWorkspacePath = (encodedPath: string): string => {
  try {
    return Buffer.from(encodedPath, 'base64url').toString('utf-8');
  } catch (error) {
    logger.warn(`Failed to decode workspace path: ${encodedPath}`);
    return encodedPath;
  }
};

router.post('/', async (req: Request, res: Response) => {
  try {
    const { projectId, prompt, variantLabel } = req.body ?? {};

    if (typeof projectId !== 'string' || projectId.trim() === '') {
      return res.status(400).json({
        success: false,
        data: null,
        error_data: null,
        message: 'projectId is required'
      });
    }

    if (typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({
        success: false,
        data: null,
        error_data: null,
        message: 'prompt is required'
      });
    }

    const decoded = decodeProjectId(projectId);
    if (!decoded) {
      return res.status(400).json({
        success: false,
        data: null,
        error_data: null,
        message: 'Invalid project id'
      });
    }

    const profileLabel = resolveProfileLabel(decoded.executorType);

    const result = await executionService.startNewChat({
      profileLabel,
      variantLabel: typeof variantLabel === 'string' ? variantLabel : undefined,
      executorType: decoded.executorType,
      projectId,
      actualProjectId: decoded.actualProjectId,
      workspacePath: toWorkspacePath(decoded.actualProjectId),
      prompt
    });

    return res.status(202).json({
      success: true,
      data: result,
      error_data: null,
      message: 'Execution started'
    });
  } catch (error) {
    logger.error('Failed to start new task attempt', error);
    return res.status(500).json({
      success: false,
      data: null,
      error_data: null,
      message: error instanceof Error ? error.message : 'Failed to start execution'
    });
  }
});

router.post('/:sessionId/follow-up', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { message, variantLabel } = req.body ?? {};

    if (typeof sessionId !== 'string' || sessionId.trim() === '') {
      return res.status(400).json({
        success: false,
        data: null,
        error_data: null,
        message: 'sessionId is required'
      });
    }

    if (typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        success: false,
        data: null,
        error_data: null,
        message: 'message is required'
      });
    }

    const decoded = decodeSessionId(sessionId);
    if (!decoded) {
      return res.status(400).json({
        success: false,
        data: null,
        error_data: null,
        message: 'Invalid session id'
      });
    }

    const projectId = `${decoded.executorType}:${decoded.actualProjectId}`;
    const profileLabel = resolveProfileLabel(decoded.executorType);

    const result = await executionService.sendFollowUp({
      profileLabel,
      variantLabel: typeof variantLabel === 'string' ? variantLabel : undefined,
      executorType: decoded.executorType,
      projectId,
      actualProjectId: decoded.actualProjectId,
      workspacePath: toWorkspacePath(decoded.actualProjectId),
      sessionId,
      message
    });

    return res.status(202).json({
      success: true,
      data: result,
      error_data: null,
      message: 'Follow-up started'
    });
  } catch (error) {
    logger.error('Failed to start follow-up attempt', error);
    return res.status(500).json({
      success: false,
      data: null,
      error_data: null,
      message: error instanceof Error ? error.message : 'Failed to start follow-up'
    });
  }
});

router.post('/:sessionId/stop', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    if (typeof sessionId !== 'string' || sessionId.trim() === '') {
      return res.status(400).json({
        success: false,
        data: null,
        error_data: null,
        message: 'sessionId is required'
      });
    }

    const stopped = executionService.stopExecution(sessionId);
    if (!stopped) {
      return res.status(404).json({
        success: false,
        data: null,
        error_data: null,
        message: 'Execution not found or already finished'
      });
    }

    return res.json({
      success: true,
      data: { sessionId },
      error_data: null,
      message: 'Execution stop requested'
    });
  } catch (error) {
    logger.error('Failed to stop execution', error);
    return res.status(500).json({
      success: false,
      data: null,
      error_data: null,
      message: error instanceof Error ? error.message : 'Failed to stop execution'
    });
  }
});

export const taskAttemptsRoutes = router;
