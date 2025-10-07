import { Router } from 'express';
import { logger } from '../../../utils/src/logger';
import { LogSourceFactory } from '../../../services/src/logs/logSourceFactory';
const router = Router();
const EXECUTOR_PROFILE_MAP = {
    CLAUDE_CODE: 'claude-code',
    CURSOR: 'cursor',
    GEMINI: 'gemini',
    CODEX: 'codex',
    OPENCODE: 'opencode'
};
const SESSION_STATUS_TO_TASK_STATUS = {
    running: 'inprogress',
    completed: 'done',
    failed: 'inreview'
};
const mapSessionStatusToTaskStatus = (status) => SESSION_STATUS_TO_TASK_STATUS[status] ?? 'done';
const mapExecutorTypeToProfile = (executorType) => EXECUTOR_PROFILE_MAP[executorType] || executorType.toLowerCase();
const sessionInfoToTask = (session, executorType, projectId) => {
    const taskStatus = mapSessionStatusToTaskStatus(session.status);
    const profile = mapExecutorTypeToProfile(executorType);
    const createdAt = session.createdAt instanceof Date ? session.createdAt.toISOString() : String(session.createdAt);
    const updatedAt = session.updatedAt instanceof Date ? session.updatedAt.toISOString() : String(session.updatedAt);
    const normalizedFirstUserMessage = session.firstUserMessage
        ? session.firstUserMessage.replace(/\s+/g, ' ').trim()
        : undefined;
    const fallbackTitle = session.title ?? `${profile} session ${session.id.split(':').slice(-1)[0]}`;
    const displayTitle = normalizedFirstUserMessage && normalizedFirstUserMessage.length > 0
        ? normalizedFirstUserMessage.slice(0, 200)
        : fallbackTitle;
    return {
        id: session.id,
        project_id: projectId,
        title: displayTitle,
        description: normalizedFirstUserMessage ?? null,
        status: taskStatus,
        parent_task_attempt: null,
        created_at: createdAt,
        updated_at: updatedAt,
        has_in_progress_attempt: session.status === 'running',
        has_merged_attempt: false,
        last_attempt_failed: session.status === 'failed',
        profile
    };
};
const extractTaskFromTaskWithStatus = (task) => ({
    id: task.id,
    project_id: task.project_id,
    title: task.title,
    description: task.description,
    status: task.status,
    parent_task_attempt: task.parent_task_attempt,
    created_at: task.created_at,
    updated_at: task.updated_at
});
const parseProjectId = (projectId) => {
    const [executorType, ...rest] = projectId.split(':');
    if (!executorType || rest.length === 0) {
        return null;
    }
    return { executorType, actualProjectId: rest.join(':') };
};
const buildFactory = () => new LogSourceFactory();
// GET /api/tasks
router.get('/', async (req, res) => {
    try {
        const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : undefined;
        if (!projectId) {
            res.status(400);
            res.type('text/plain');
            return res.send('Failed to deserialize query string: missing field `project_id`');
        }
        const factory = buildFactory();
        const sessions = await factory.getSessionsForProject(projectId);
        const projectMeta = parseProjectId(projectId);
        const executorType = projectMeta?.executorType || 'CLAUDE_CODE';
        const tasks = sessions.map((session) => sessionInfoToTask(session, executorType, projectId));
        return res.json({
            success: true,
            data: tasks,
            error_data: null,
            message: null
        });
    }
    catch (error) {
        logger.error('Failed to get tasks:', error);
        return res.status(500).json({
            success: false,
            data: null,
            error_data: null,
            message: 'Failed to get tasks'
        });
    }
});
// GET /api/tasks/:id
router.get('/:id', async (req, res) => {
    try {
        const factory = buildFactory();
        const result = await factory.findSessionById(req.params.id);
        if (!result) {
            return res.status(404).json({
                success: false,
                data: null,
                error_data: null,
                message: 'Task not found'
            });
        }
        const task = extractTaskFromTaskWithStatus(sessionInfoToTask(result.session, result.executorType, result.projectCompositeId));
        return res.json({
            success: true,
            data: task,
            error_data: null,
            message: null
        });
    }
    catch (error) {
        logger.error('Failed to get task:', error);
        return res.status(500).json({
            success: false,
            data: null,
            error_data: null,
            message: 'Failed to get task'
        });
    }
});
export const taskRoutes = router;
//# sourceMappingURL=tasks.js.map