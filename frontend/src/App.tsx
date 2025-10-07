import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ProfilesPage } from '@/pages/profiles';
import { Projects } from '@/pages/projects';
import { ProjectTasks } from '@/pages/project-tasks';
import { TaskDetailsPage } from '@/pages/task-details';

import { ThemeProvider } from '@/components/theme-provider';
import { ProjectProvider } from '@/contexts/project-context';
import * as Sentry from '@sentry/react';
import { AppWithStyleOverride } from '@/utils/style-override';
import { WebviewContextMenu } from '@/vscode/ContextMenu';
import { DevBanner } from '@/components/DevBanner';
import {
  Sidebar,
  SidebarHeader,
  SidebarLogo,
  SidebarNav,
  NavSection,
  SidebarLink,
  SidebarFooter,
  SidebarButtonLink,
} from '@/components/layout/sidebar';
import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  MessageCircleQuestion,
  Sparkles,
  MousePointer2,
  Orbit,
  Code2,
  Globe2,
} from 'lucide-react';
import { ThemeMode } from 'shared/types.ts';
import { profilesApi } from '@/lib/api';
import { profileDisplayName } from '@/lib/profile-utils';

type SidebarProfile = {
  label: string;
  variants?: Array<{ label: string }>;
};

const PROFILE_ICON_MAP: Record<string, LucideIcon> = {
  'claude-code': Sparkles,
  cursor: MousePointer2,
  gemini: Orbit,
  codex: Code2,
  opencode: Globe2,
};

const DEFAULT_SIDEBAR_PROFILES: SidebarProfile[] = [
  { label: 'claude-code' },
  { label: 'cursor' },
  { label: 'gemini' },
  { label: 'codex' },
  { label: 'opencode' },
];

const ALLOWED_PROFILE_LABELS = new Set(
  DEFAULT_SIDEBAR_PROFILES.map((profile) => profile.label)
);

const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);

function AppContent() {
  return (
    <ThemeProvider initialTheme={ThemeMode.SYSTEM}>
      <AppWithStyleOverride>
        <div className="h-screen flex flex-col bg-background">
          {/* Custom context menu and VS Code-friendly interactions when embedded in iframe */}
          <WebviewContextMenu />
          <div className="flex flex-1 min-h-0">
            <AppSidebar />
            <div className="flex-1 min-w-0 flex flex-col bg-background">
              <DevBanner />
              <div className="flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto">
                  <SentryRoutes>
                    <Route path="/" element={<ProfilesPage />} />
                    <Route path="/profiles" element={<ProfilesPage />} />
                    <Route path="/projects" element={<Projects />} />
                    <Route
                      path="/projects/:projectId/tasks"
                      element={<ProjectTasks />}
                    />
                    <Route
                      path="/projects/:projectId/tasks/:taskId"
                      element={<TaskDetailsPage />}
                    />
                  </SentryRoutes>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppWithStyleOverride>
    </ThemeProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ProjectProvider>
        <AppContent />
      </ProjectProvider>
    </BrowserRouter>
  );
}

export default App;

function AppSidebar() {
  const [profiles, setProfiles] = useState<SidebarProfile[]>(
    DEFAULT_SIDEBAR_PROFILES
  );

  useEffect(() => {
    let cancelled = false;

    const loadProfiles = async () => {
      try {
        const result = (await profilesApi.list()) as SidebarProfile[];
        if (cancelled || !Array.isArray(result)) {
          return;
        }
        const filtered = result.filter((profile) =>
          ALLOWED_PROFILE_LABELS.has(profile.label)
        );
        if (filtered.length > 0) {
          setProfiles(filtered);
        }
      } catch (error) {
        console.warn('Failed to load profiles for sidebar navigation', error);
      }
    };

    void loadProfiles();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarLogo text="Coding Agent Viewer" />
      </SidebarHeader>
      <SidebarNav>
        <NavSection title="Profiles">
          {profiles.map((profile) => {
            const icon = PROFILE_ICON_MAP[profile.label] ?? Sparkles;
            const displayName = profileDisplayName(profile.label) ?? profile.label;
            const query = new URLSearchParams({
              profile: profile.label,
            }).toString();
            return (
              <SidebarLink
                key={profile.label}
                to={`/projects?${query}`}
                icon={icon}
              >
                {displayName}
              </SidebarLink>
            );
          })}
        </NavSection>
      </SidebarNav>
      <SidebarFooter>
        <NavSection title="Resources" className="mb-0">
          <SidebarButtonLink
            icon={BookOpen}
            onClick={() =>
              window.open(
                'https://github.com/nogataka/coding-agent-viewer/',
                '_blank'
              )
            }
          >
            Documentation
          </SidebarButtonLink>
          <SidebarButtonLink
            icon={MessageCircleQuestion}
            onClick={() =>
              window.open(
                'https://github.com/nogataka/coding-agent-viewer/issues',
                '_blank'
              )
            }
          >
            Support
          </SidebarButtonLink>
        </NavSection>
      </SidebarFooter>
    </Sidebar>
  );
}
