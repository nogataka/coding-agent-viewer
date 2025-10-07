import { Router, Request, Response } from 'express';

const router = Router();

type ProfileResponse = {
  label: string;
  variants?: Array<{ label: string }>;
};

const PROFILES: ProfileResponse[] = [
  {
    label: 'claude-code',
    variants: [{ label: 'plan' }]
  },
  {
    label: 'gemini',
    variants: [{ label: 'flash' }]
  },
  { label: 'codex' },
  { label: 'opencode' },
  { label: 'cursor' }
];

/**
 * GET /api/profiles
 * Get all available profiles from profiles.json
 */
router.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      profiles: PROFILES
    },
    error_data: null,
    message: null
  });
});

export const profilesRoutes = router;
