#!/usr/bin/env node
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp, render } from 'ink';
import { LogSourceFactory } from '../../backend/dist/services/src/logs/logSourceFactory.js';
import { ExecutionService } from '../../backend/dist/services/src/execution/index.js';

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

// Main App Component
const App: React.FC = () => {
  const { exit } = useApp();
  const [viewMode, setViewMode] = useState<ViewMode>('profile-list');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Data
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [projectsByProfile, setProjectsByProfile] = useState<Record<string, Project[]>>({});
  const [profiles, setProfiles] = useState<string[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [logEntries, setLogEntries] = useState<string[]>([]);
  
  // Selection
  const [selectedProfileIndex, setSelectedProfileIndex] = useState(0);
  const [selectedProjectIndex, setSelectedProjectIndex] = useState(0);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState(0);
  const [currentProfile, setCurrentProfile] = useState<string | null>(null);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);

  const factory = new LogSourceFactory();
  const executor = new ExecutionService();

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const projects = await factory.getAllProjects();
      setAllProjects(projects);
      
      // Group by profile
      const grouped: Record<string, Project[]> = {};
      for (const project of projects) {
        const [profile] = project.id.split(':');
        if (!grouped[profile]) {
          grouped[profile] = [];
        }
        grouped[profile].push(project);
      }
      
      setProjectsByProfile(grouped);
      setProfiles(Object.keys(grouped));
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
    try {
      const stream = await factory.getSessionStream(sessionId);
      if (!stream) {
        setError('Failed to get log stream');
        return;
      }

      stream.on('data', (chunk) => {
        const text = chunk.toString();
        const lines = text.split('\n').filter(line => line.trim());
        
        setLogEntries(prev => [...prev, ...lines]);
      });

      stream.on('end', () => {
        setLogEntries(prev => [...prev, '--- Stream finished ---']);
      });

      stream.on('error', (err) => {
        setError(`Stream error: ${err.message}`);
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
    if (viewMode === 'profile-list') {
      setSelectedProfileIndex(prev => Math.max(0, prev - 1));
    } else if (viewMode === 'project-list') {
      setSelectedProjectIndex(prev => Math.max(0, prev - 1));
    } else if (viewMode === 'session-list') {
      setSelectedSessionIndex(prev => Math.max(0, prev - 1));
    }
  };

  const handleDown = () => {
    if (viewMode === 'profile-list') {
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
      setCurrentProfile(profile);
      setSelectedProjectIndex(0);
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
      <Header viewMode={viewMode} currentProfile={currentProfile} currentProject={currentProject} />
      
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
  currentProfile: string | null;
  currentProject: Project | null;
}> = ({ viewMode, currentProfile, currentProject }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">🤖 Coding Agent Viewer CLI</Text>
      <Box>
        <Text dimColor>
          {viewMode === 'profile-list' && 'Select Agent Profile'}
          {viewMode === 'project-list' && `${getProfileIcon(currentProfile || '')} ${currentProfile} - Select Project`}
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
  profiles: string[]; 
  selectedIndex: number;
  projectsByProfile: Record<string, Project[]>;
}> = ({ profiles, selectedIndex, projectsByProfile }) => {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" padding={1}>
      <Text bold>Agent Profiles:</Text>
      {profiles.map((profile, index) => {
        const isSelected = index === selectedIndex;
        const projectCount = projectsByProfile[profile]?.length || 0;
        return (
          <Box key={profile}>
            <Text 
              color={isSelected ? 'black' : 'white'}
              backgroundColor={isSelected ? 'cyan' : undefined}
              bold={isSelected}
            >
              {isSelected ? '▶ ' : '  '}{getProfileIcon(profile)} {profile} ({projectCount} projects)
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
const LogStream: React.FC<{ entries: string[] }> = ({ entries }) => {
  const displayEntries = entries.slice(-20); // Show last 20 entries

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="magenta" padding={1}>
      <Text bold color="magenta">Log Stream (last 20 entries):</Text>
      {displayEntries.map((entry, index) => (
        <Text key={index} dimColor>{entry}</Text>
      ))}
      {entries.length === 0 && <Text color="yellow">Waiting for logs...</Text>}
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

