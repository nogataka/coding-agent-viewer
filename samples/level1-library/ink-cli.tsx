#!/usr/bin/env node
import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp, render } from 'ink';
import { LogSourceFactory } from '@nogataka/coding-agent-viewer-sdk/services/logs';
import { getProfiles } from '@nogataka/coding-agent-viewer-sdk/services/execution';

// Types
interface Project {
  id: string;
  name: string;
  updated_at: Date;
}

interface Session {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  projectId: string;
}

type ViewMode = 'profile-list' | 'project-list' | 'session-list' | 'session-detail' | 'log-stream';

interface FormattedLogEntry {
  id: number;
  icon: string;
  title: string;
  color: string;
  content: string;
}

interface ProfileMeta {
  label: string;
  executorType: string;
  displayName: string;
}

// Main App Component
const App: React.FC = () => {
  const { exit } = useApp();
  const [viewMode, setViewMode] = useState<ViewMode>('profile-list');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Data
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [projectsByProfile, setProjectsByProfile] = useState<Record<string, Project[]>>({});
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [logEntries, setLogEntries] = useState<FormattedLogEntry[]>([]);
  
  // Selection
  const [selectedProfileIndex, setSelectedProfileIndex] = useState(0);
  const [selectedProjectIndex, setSelectedProjectIndex] = useState(0);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState(0);
  const [currentProfile, setCurrentProfile] = useState<string | null>(null);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const factoryRef = useRef<LogSourceFactory | null>(null);
  if (!factoryRef.current) {
    factoryRef.current = new LogSourceFactory();
  }
  const factory = factoryRef.current!;
  const logEntryCounter = useRef(0);

  const getProfileMeta = (executorType?: string | null) =>
    executorType ? profiles.find((profile) => profile.executorType === executorType) : undefined;

  const formatLogEntry = (entry: any): FormattedLogEntry | null => {
    if (!entry || !entry.entry_type) {
      return null;
    }

    const type = entry.entry_type.type;
    const baseContent = normalizeContent(entry.content);

    const createEntry = (icon: string, title: string, color: string, content: string) => ({
      id: logEntryCounter.current++,
      icon,
      title,
      color,
      content
    });

    switch (type) {
      case 'user_message':
        return createEntry('👤', 'User message', 'cyan', baseContent);
      case 'assistant_message':
        return createEntry('🤖', 'Assistant response', 'green', baseContent);
      case 'tool_use':
        return createEntry('🔧', `Tool: ${entry.entry_type.tool_name || 'unknown'}`, 'yellow', baseContent);
      case 'tool_result':
        return createEntry('🛠️', `Tool result: ${entry.entry_type.tool_name || 'tool'}`, 'yellow', baseContent);
      case 'system_message':
        return createEntry('ℹ️', 'System', 'blue', baseContent);
      case 'thinking':
        return createEntry('💭', 'Assistant thinking', 'magenta', baseContent);
      default:
        return createEntry('📝', type, 'white', baseContent);
    }
  };

  const normalizeContent = (value: any): string => {
    if (value == null) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => normalizeContent(item)).join('\n');
    }
    if (typeof value === 'object') {
      if (typeof value.text === 'string') {
        return value.text;
      }
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  // Load projects on mount
  useEffect(() => {
    const catalog = getProfiles().map((definition) => ({
      label: definition.label,
      executorType: definition.label.toUpperCase().replace(/-/g, '_'),
      displayName: definition.label
        .split('-')
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ')
    }));
    setProfiles(catalog);
    loadProjects(catalog);
  }, []);

  const loadProjects = async (catalogOverride?: ProfileMeta[]) => {
    setLoading(true);
    const catalog = catalogOverride ?? profiles;
    try {
      const aggregated: Project[] = [];
      const grouped: Record<string, Project[]> = {};

      for (const profile of catalog) {
        try {
          const projects = await factory.getAllProjects(profile.executorType);
          aggregated.push(...projects);
          grouped[profile.executorType] = projects;
        } catch (innerError) {
          console.warn(`⚠️  Failed to load projects for ${profile.displayName}:`, innerError);
        }
      }

      setAllProjects(aggregated);
      setProjectsByProfile(grouped);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
      setLoading(false);
    }
  };

  const loadSessions = async (projectId: string) => {
    setLoading(true);
    try {
      const sessions = await factory.getSessionsForProject(projectId);
      setSessions(sessions);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
      setLoading(false);
    }
  };

  const streamLogs = async (sessionId: string) => {
    logEntryCounter.current = 0;
    setLogEntries([]);

    try {
      const stream = await factory.getSessionStream(sessionId);
      if (!stream) {
        setError('Failed to get log stream');
        return;
      }

      let buffer = '';

      const processEventBlock = (block: string) => {
        const lines = block.split('\n');
        let eventType: string | null = null;
        const dataLines: string[] = [];

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.substring(5));
          }
        }

        const data = dataLines.join('').trim();
        if (eventType === 'json_patch' && data) {
          try {
            const patches = JSON.parse(data);
            const formattedEntries: FormattedLogEntry[] = [];
            for (const patch of patches) {
              if (patch?.op === 'add' && patch?.value?.type === 'NORMALIZED_ENTRY') {
                const formatted = formatLogEntry(patch.value.content);
                if (formatted) {
                  formattedEntries.push(formatted);
                }
              }
            }
            if (formattedEntries.length > 0) {
              setLogEntries((prev) => [...prev, ...formattedEntries]);
            }
          } catch {
            // Ignore malformed patch data
          }
        } else if (eventType === 'finished') {
          setLogEntries((prev) => [
            ...prev,
            {
              id: logEntryCounter.current++,
              icon: '✅',
              title: 'Stream finished',
              color: 'green',
              content: 'Log stream ended.'
            }
          ]);
          stream.destroy();
        }
      };

      stream.on('data', (chunk) => {
        buffer += chunk.toString();
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          if (part.trim().length > 0) {
            processEventBlock(part);
          }
        }
      });

      stream.on('end', () => {
        if (buffer.trim().length > 0) {
          processEventBlock(buffer);
          buffer = '';
        }
        setLogEntries((prev) => [
          ...prev,
          {
            id: logEntryCounter.current++,
            icon: 'ℹ️',
            title: 'Connection closed',
            color: 'gray',
            content: 'Stream closed by server.'
          }
        ]);
      });

      stream.on('error', (err) => {
        setLogEntries((prev) => [
          ...prev,
          {
            id: logEntryCounter.current++,
            icon: '❌',
            title: 'Stream error',
            color: 'red',
            content: err.message
          }
        ]);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stream logs');
    }
  };

  // Input handling
  useInput((input, key) => {
    // Global: Quit
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }

    // Global: Back
    if (key.escape || input === 'b') {
      handleBack();
      return;
    }

    if (loading) return;

    // Navigation
    if (key.upArrow || input === 'k') {
      handleUp();
    }

    if (key.downArrow || input === 'j') {
      handleDown();
    }

    if (key.return) {
      handleEnter();
    }
  });

  const handleUp = () => {
    if (viewMode === 'profile-list' && profiles.length > 0) {
      setSelectedProfileIndex(prev => Math.max(0, prev - 1));
    } else if (viewMode === 'project-list') {
      setSelectedProjectIndex(prev => Math.max(0, prev - 1));
    } else if (viewMode === 'session-list') {
      setSelectedSessionIndex(prev => Math.max(0, prev - 1));
    }
  };

  const handleDown = () => {
    if (viewMode === 'profile-list' && profiles.length > 0) {
      setSelectedProfileIndex(prev => Math.min(profiles.length - 1, prev + 1));
    } else if (viewMode === 'project-list' && currentProfile) {
      const projects = projectsByProfile[currentProfile] || [];
      setSelectedProjectIndex(prev => Math.min(projects.length - 1, prev + 1));
    } else if (viewMode === 'session-list') {
      setSelectedSessionIndex(prev => Math.min(sessions.length - 1, prev + 1));
    }
  };

  const handleEnter = () => {
    if (viewMode === 'profile-list') {
      const profile = profiles[selectedProfileIndex];
      if (!profile) {
        return;
      }
      setCurrentProfile(profile.executorType);
      setSelectedProjectIndex(0);
      if (!projectsByProfile[profile.executorType]) {
        loadProjects();
      }
      setViewMode('project-list');
    } else if (viewMode === 'project-list' && currentProfile) {
      const projects = projectsByProfile[currentProfile] || [];
      const project = projects[selectedProjectIndex];
      setCurrentProject(project);
      setSelectedSessionIndex(0);
      loadSessions(project.id);
      setViewMode('session-list');
    } else if (viewMode === 'session-list') {
      const session = sessions[selectedSessionIndex];
      setCurrentSession(session);
      setViewMode('session-detail');
    } else if (viewMode === 'session-detail') {
      if (currentSession) {
        setLogEntries([]);
        streamLogs(currentSession.id);
        setViewMode('log-stream');
      }
    }
  };

  const handleBack = () => {
    if (viewMode === 'log-stream') {
      setViewMode('session-detail');
    } else if (viewMode === 'session-detail') {
      setViewMode('session-list');
    } else if (viewMode === 'session-list') {
      setCurrentProject(null);
      setViewMode('project-list');
    } else if (viewMode === 'project-list') {
      setCurrentProfile(null);
      setViewMode('profile-list');
    }
  };

  // Render based on view mode
  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Loading...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Press ESC to go back or Q to quit</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%" padding={1}>
      <Header
        viewMode={viewMode}
        currentProfile={getProfileMeta(currentProfile)}
        currentProject={currentProject}
      />
      
      {viewMode === 'profile-list' && (
        <ProfileList profiles={profiles} selectedIndex={selectedProfileIndex} projectsByProfile={projectsByProfile} />
      )}
      
      {viewMode === 'project-list' && currentProfile && (
        <ProjectList 
          projects={projectsByProfile[currentProfile] || []} 
          selectedIndex={selectedProjectIndex} 
        />
      )}
      
      {viewMode === 'session-list' && (
        <SessionList sessions={sessions} selectedIndex={selectedSessionIndex} />
      )}
      
      {viewMode === 'session-detail' && currentSession && (
        <SessionDetail session={currentSession} />
      )}
      
      {viewMode === 'log-stream' && (
        <LogStream entries={logEntries} />
      )}
      
      <Footer viewMode={viewMode} />
    </Box>
  );
};

// Header Component
const Header: React.FC<{
  viewMode: ViewMode;
  currentProfile: ProfileMeta | undefined;
  currentProject: Project | null;
}> = ({ viewMode, currentProfile, currentProject }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">🤖 Coding Agent Viewer CLI</Text>
      <Box>
        <Text dimColor>
          {viewMode === 'profile-list' && 'Select Agent Profile'}
          {viewMode === 'project-list' && `${getProfileIcon(currentProfile?.executorType || '')} ${currentProfile?.displayName ?? 'Profile'} - Select Project`}
          {viewMode === 'session-list' && `📂 ${currentProject?.name} - Select Session`}
          {viewMode === 'session-detail' && 'Session Details'}
          {viewMode === 'log-stream' && 'Log Stream'}
        </Text>
      </Box>
    </Box>
  );
};

// Profile List Component
const ProfileList: React.FC<{
  profiles: ProfileMeta[];
  selectedIndex: number;
  projectsByProfile: Record<string, Project[]>;
}> = ({ profiles, selectedIndex, projectsByProfile }) => {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" padding={1}>
      <Text bold>Agent Profiles:</Text>
      {profiles.map((profile, index) => {
        const isSelected = index === selectedIndex;
        const projectCount = projectsByProfile[profile.executorType]?.length || 0;
        return (
          <Box key={profile.executorType}>
            <Text 
              color={isSelected ? 'black' : 'white'}
              backgroundColor={isSelected ? 'cyan' : undefined}
              bold={isSelected}
            >
              {isSelected ? '▶ ' : '  '}{getProfileIcon(profile.executorType)} {profile.displayName} ({projectCount} projects)
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};

// Project List Component
const ProjectList: React.FC<{ projects: Project[]; selectedIndex: number }> = ({ projects, selectedIndex }) => {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" padding={1}>
      <Text bold>Projects ({projects.length}):</Text>
      {projects.slice(0, 10).map((project, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={project.id}>
            <Text 
              color={isSelected ? 'black' : 'white'}
              backgroundColor={isSelected ? 'cyan' : undefined}
              bold={isSelected}
            >
              {isSelected ? '▶ ' : '  '}{project.name}
            </Text>
            <Text dimColor> - {new Date(project.updated_at).toLocaleString()}</Text>
          </Box>
        );
      })}
      {projects.length > 10 && (
        <Text dimColor>... and {projects.length - 10} more</Text>
      )}
    </Box>
  );
};

// Session List Component
const SessionList: React.FC<{ sessions: Session[]; selectedIndex: number }> = ({ sessions, selectedIndex }) => {
  if (sessions.length === 0) {
    return (
      <Box borderStyle="single" borderColor="cyan" padding={1}>
        <Text color="yellow">No sessions found</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" padding={1}>
      <Text bold>Sessions ({sessions.length}):</Text>
      {sessions.slice(0, 10).map((session, index) => {
        const isSelected = index === selectedIndex;
        const statusIcon = session.status === 'running' ? '🟢' : session.status === 'completed' ? '✅' : '❌';
        return (
          <Box key={session.id} flexDirection="column">
            <Text 
              color={isSelected ? 'black' : 'white'}
              backgroundColor={isSelected ? 'cyan' : undefined}
              bold={isSelected}
            >
              {isSelected ? '▶ ' : '  '}{statusIcon} {session.title.substring(0, 60)}
            </Text>
            <Text dimColor>     {new Date(session.updatedAt).toLocaleString()}</Text>
          </Box>
        );
      })}
      {sessions.length > 10 && (
        <Text dimColor>... and {sessions.length - 10} more</Text>
      )}
    </Box>
  );
};

// Session Detail Component
const SessionDetail: React.FC<{ session: Session }> = ({ session }) => {
  return (
    <Box flexDirection="column" borderStyle="double" borderColor="green" padding={1}>
      <Text bold color="green">Session Details:</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Title: <Text color="cyan">{session.title}</Text></Text>
        <Text>Status: <Text color="yellow">{session.status}</Text></Text>
        <Text>Created: <Text dimColor>{new Date(session.createdAt).toLocaleString()}</Text></Text>
        <Text>Updated: <Text dimColor>{new Date(session.updatedAt).toLocaleString()}</Text></Text>
      </Box>
      <Box marginTop={1}>
        <Text color="green">Press ENTER to view logs</Text>
      </Box>
    </Box>
  );
};

// Log Stream Component
const LogStream: React.FC<{ entries: FormattedLogEntry[] }> = ({ entries }) => {
  const displayEntries = entries.slice(-20); // Show last 20 entries

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="magenta" padding={1}>
      <Text bold color="magenta">Log Stream (last 20 entries):</Text>
      {displayEntries.length === 0 ? (
        <Text color="yellow">Waiting for logs...</Text>
      ) : (
        displayEntries.map((entry) => (
          <Box key={entry.id} flexDirection="column" marginBottom={1}>
            <Text color={entry.color} bold>{`${entry.icon} ${entry.title}`}</Text>
            {entry.content && entry.content.split('\n').map((line, idx) => (
              <Text key={`${entry.id}-line-${idx}`} dimColor>{`  ${line}`}</Text>
            ))}
          </Box>
        ))
      )}
    </Box>
  );
};

// Footer Component
const Footer: React.FC<{ viewMode: ViewMode }> = ({ viewMode }) => {
  return (
    <Box marginTop={1} flexDirection="column">
      <Text dimColor>
        {viewMode === 'log-stream' ? 
          'ESC: Back | Q: Quit' : 
          '↑/↓ or J/K: Navigate | ENTER: Select | ESC/B: Back | Q: Quit'
        }
      </Text>
    </Box>
  );
};

// Helper functions
function getProfileIcon(profile: string): string {
  const icons: Record<string, string> = {
    'CLAUDE_CODE': '🎨',
    'CURSOR': '🖱️',
    'GEMINI': '💎',
    'CODEX': '📦',
    'OPENCODE': '🔓'
  };
  return icons[profile] || '🤖';
}

// Render the app
render(<App />);
