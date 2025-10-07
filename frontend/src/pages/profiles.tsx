import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import { Sparkles } from 'lucide-react';
import { profilesApi } from '@/lib/api';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';

interface Profile {
  label: string;
  variants?: Array<{ label: string }>;
  [key: string]: unknown;
}

export function ProfilesPage() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await profilesApi.list();
      setProfiles(result as Profile[]);
    } catch (err) {
      console.error('Failed to load profiles:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSelect = async (
    profileLabel: string,
    variantLabel: string | null
  ) => {
    try {
      // プロジェクト一覧画面へ遷移（選択したProfileをURLパラメータで渡す）
      const variantQuery = variantLabel ? `&variant=${variantLabel}` : '';
      navigate(`/projects?profile=${profileLabel}${variantQuery}`);
    } catch (err) {
      console.error('Failed to update profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader className="w-8 h-8" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-red-500">Error: {error}</p>
        <Button onClick={loadProfiles}>Retry</Button>
      </div>
    );
  }

  if (!profiles.length) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">No profiles available</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-8">
      <div className="max-w-7xl mx-auto">
        <Breadcrumbs items={[{ label: 'Profiles' }]} className="mb-6" />
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-4">
            <Sparkles className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-bold">Choose Your Coding Agent</h1>
          </div>
          <p className="text-lg text-muted-foreground">
            Select a profile to view your coding sessions
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {profiles.map((profile) => (
            <div key={profile.label}>
              {/* メインProfile */}
              <Card
                className="cursor-pointer transition-all hover:shadow-xl hover:scale-105"
                onClick={() => handleProfileSelect(profile.label, null)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2 capitalize">
                        {profile.label.replace(/-/g, ' ')}
                      </CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm">
                    {getProfileDescription(profile.label)}
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getProfileDescription(label: string): string {
  const descriptions: Record<string, string> = {
    'claude-code': 'Anthropic Claude Code - AI-powered coding assistant',
    cursor: 'Cursor - AI-first code editor',
    gemini: 'Google Gemini - Advanced AI coding model',
    codex: 'OpenAI Codex - Code generation and analysis',
    opencode: 'OpenCode - Open-source coding assistant',
  };

  return descriptions[label] || 'AI Coding Assistant';
}
