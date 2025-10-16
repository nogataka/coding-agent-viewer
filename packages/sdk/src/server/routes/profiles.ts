import { Router, Request, Response } from 'express';
import { getProfiles } from '../../services/execution/index.js';

const router = Router();

type ProfileResponse = {
  label: string;
  variants?: Array<{ label: string }>;
};

const buildProfileResponse = (): ProfileResponse[] => {
  return getProfiles().map((profile) => ({
    label: profile.label,
    variants: profile.variants.length > 0 ? profile.variants : undefined
  }));
};

/**
 * GET /api/profiles
 * Get all available profiles from profiles.json
 */
router.get('/', (req: Request, res: Response) => {
  const profiles = buildProfileResponse();
  res.json({
    success: true,
    data: {
      profiles
    },
    error_data: null,
    message: null
  });
});

export const profilesRoutes = router;
