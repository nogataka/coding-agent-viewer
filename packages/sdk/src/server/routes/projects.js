import { Router } from 'express';
import { logger } from '../../utils/logger.js';
import { LogSourceFactory } from '../../services/logs/index.js';
const router = Router();
const buildFactory = () => new LogSourceFactory();
// Profile labelからExecutor Typeに変換
function getExecutorTypeFromProfile(profileLabel) {
    const mapping = {
        'claude-code': 'CLAUDE_CODE',
        cursor: 'CURSOR',
        gemini: 'GEMINI',
        codex: 'CODEX',
        opencode: 'OPENCODE'
    };
    return mapping[profileLabel] || profileLabel.toUpperCase().replace(/-/g, '_');
}
function toProjectResponse(project) {
    return {
        id: project.id,
        name: project.name,
        git_repo_path: project.git_repo_path,
        use_existing_repo: true,
        setup_script: null,
        dev_script: null,
        cleanup_script: null,
        copy_files: null,
        created_at: project.created_at,
        updated_at: project.updated_at
    };
}
// GET /api/projects
router.get('/', async (req, res) => {
    try {
        const factory = buildFactory();
        const profileParam = req.query.profile;
        const currentProfile = profileParam || 'claude-code';
        const executorType = getExecutorTypeFromProfile(currentProfile);
        logger.info(`[projects] Listing projects for profile=${currentProfile} (executor=${executorType})`);
        const filteredProjects = await factory.getAllProjects(executorType);
        const projects = filteredProjects.map(toProjectResponse);
        res.json({
            success: true,
            data: projects,
            error_data: null,
            message: null
        });
    }
    catch (error) {
        logger.error('Failed to get projects:', error);
        res.status(500).json({
            success: false,
            data: null,
            error_data: null,
            message: 'Failed to get projects'
        });
    }
});
export const projectRoutes = router;
//# sourceMappingURL=projects.js.map
