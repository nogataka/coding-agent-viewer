const API_BASE = import.meta.env.VITE_CAV_API ?? 'http://localhost:3001';
const ENDPOINTS = {
  profiles: `${API_BASE}/api/profiles`,
  projects: (profileLabel) => `${API_BASE}/api/projects?profile=${encodeURIComponent(profileLabel)}`,
  taskAttempts: `${API_BASE}/api/task-attempts`,
  logs: (sessionId) =>
    `${API_BASE}/api/execution-processes/${encodeURIComponent(sessionId)}/normalized-logs`
};

const form = document.getElementById('chat-form');
const profileSelect = document.getElementById('profile');
const projectSelect = document.getElementById('project');
const workspaceInput = document.getElementById('workspace');
const promptInput = document.getElementById('prompt');
const sendButton = document.getElementById('send-btn');
const clearButton = document.getElementById('clear-btn');
const messagesEl = document.getElementById('messages');

const profileCatalog = new Map();
const projectCache = new Map();
const projectLookup = new Map();
let activeStream = null;

const capitalize = (value) =>
  value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);

const toDisplayName = (label) =>
  label
    .split('-')
    .map((segment) => capitalize(segment))
    .join(' ');

const toExecutorType = (label) => label.toUpperCase().replace(/-/g, '_');

const toBase64Url = (value) => {
  const encoded = encodeURIComponent(value)
    .replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16)));
  return btoa(encoded).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const normalizeContent = (value) => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
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

const appendMessage = (role, content, meta = '') => {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;

  const metaLine = document.createElement('div');
  metaLine.className = 'meta';
  metaLine.innerHTML = `<span>${role === 'user' ? 'You' : 'Assistant'}</span><span>${meta}</span>`;

  const body = document.createElement('pre');
  body.textContent = content;

  wrapper.append(metaLine, body);
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
  return wrapper;
};

const appendStatus = (text, isError = false) => {
  const p = document.createElement('p');
  p.className = `status${isError ? ' error' : ''}`;
  p.textContent = text;
  messagesEl.appendChild(p);
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
  return p;
};

const setFormDisabled = (disabled) => {
  sendButton.disabled = disabled;
  promptInput.disabled = disabled;
  profileSelect.disabled = disabled;
  projectSelect.disabled = disabled;
  workspaceInput.disabled = disabled;
};

const updateSendButtonState = () => {
  const hasPrompt = promptInput.value.trim().length > 0;
  const hasProject = projectSelect.value.trim().length > 0;
  const hasWorkspace = workspaceInput.value.trim().length > 0;
  sendButton.disabled = !(hasPrompt && (hasProject || hasWorkspace));
};

const closeActiveStream = () => {
  if (activeStream) {
    try {
      activeStream.close();
    } catch (error) {
      console.warn('Failed to close previous stream', error);
    }
    activeStream = null;
  }
};

const loadProfiles = async () => {
  try {
    const response = await fetch(ENDPOINTS.profiles);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    const profiles = payload?.data?.profiles ?? [];

    profileCatalog.clear();
    profileSelect.innerHTML = '';

    profiles.forEach((profile) => {
      const meta = {
        label: profile.label,
        executorType: toExecutorType(profile.label),
        displayName: toDisplayName(profile.label),
        variants: profile.variants?.map((variant) => variant.label) ?? []
      };
      profileCatalog.set(profile.label, meta);

      const option = document.createElement('option');
      option.value = profile.label;
      option.textContent = `${meta.displayName} (${profile.label})`;
      profileSelect.appendChild(option);
    });

    if (profileCatalog.size === 0) {
      appendStatus('No profiles available. Check server configuration.', true);
      setFormDisabled(true);
      return;
    }

    const firstProfile = profileCatalog.keys().next().value;
    profileSelect.value = firstProfile;
    await loadProjects(firstProfile);
  } catch (error) {
    appendStatus(`Failed to load profiles: ${error instanceof Error ? error.message : error}`, true);
    setFormDisabled(true);
  }
};

const loadProjects = async (profileLabel) => {
  if (!profileLabel) {
    projectSelect.innerHTML = '<option value="">Select a profile first</option>';
    projectSelect.disabled = true;
    return;
  }

  projectSelect.disabled = true;
  projectSelect.innerHTML = '<option value="">Loading...</option>';

  try {
    const response = await fetch(ENDPOINTS.projects(profileLabel));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const projects = await response.json();
    const projectList = projects?.data ?? [];

    projectCache.set(profileLabel, projectList);

    const executorType = profileCatalog.get(profileLabel)?.executorType ?? '';
    // Remove cached entries for this executor
    for (const key of Array.from(projectLookup.keys())) {
      if (key.startsWith(`${executorType}:`)) {
        projectLookup.delete(key);
      }
    }
    projectList.forEach((project) => {
      projectLookup.set(project.id, project);
    });

    projectSelect.innerHTML = '';
    if (projectList.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No projects found (specify workspace path)';
      projectSelect.appendChild(option);
      projectSelect.disabled = true;
    } else {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select an existing project';
      projectSelect.appendChild(placeholder);

      projectList.forEach((project) => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = `${project.name} (${project.id})`;
        projectSelect.appendChild(option);
      });

      projectSelect.disabled = false;
    }
  } catch (error) {
    appendStatus(`Failed to load projects: ${error instanceof Error ? error.message : error}`, true);
    projectSelect.innerHTML = '<option value="">Error loading projects</option>';
    projectSelect.disabled = true;
  } finally {
    updateSendButtonState();
  }
};

const openLogStream = (sessionId, { onEntry, onFinished, onError }) => {
  const source = new EventSource(ENDPOINTS.logs(sessionId));

  source.addEventListener('json_patch', (event) => {
    try {
      const patches = JSON.parse(event.data);
      patches.forEach((patch) => {
        if (patch?.op !== 'add') return;
        if (patch?.value?.type !== 'NORMALIZED_ENTRY') return;
        const entry = patch.value.content;
        const entryType = entry?.entry_type?.type;
        const content = normalizeContent(entry?.content);
        if (!content) return;
        onEntry?.({ entryType, content, metadata: entry });
      });
    } catch (error) {
      console.warn('Failed to parse json_patch event', error);
    }
  });

  source.addEventListener('finished', () => {
    source.close();
    onFinished?.();
  });

  source.addEventListener('error', (event) => {
    source.close();
    onError?.('Stream error');
  });

  return source;
};

const handleSubmit = async (event) => {
  event.preventDefault();

  const prompt = promptInput.value.trim();
  if (!prompt) {
    return;
  }

  const profileLabel = profileSelect.value;
  const profileMeta = profileCatalog.get(profileLabel);
  if (!profileMeta) {
    appendStatus('Invalid profile selected.', true);
    return;
  }

  const workspacePath = workspaceInput.value.trim();
  let projectId = projectSelect.value.trim();
  let projectMeta = projectLookup.get(projectId) ?? null;

  if (workspacePath) {
    const actualProjectId = toBase64Url(workspacePath);
    projectId = `${profileMeta.executorType}:${actualProjectId}`;
    projectMeta = null;
  }

  if (!projectId) {
    appendStatus('Select a project or specify a workspace path.', true);
    return;
  }

  const displayMeta = projectMeta
    ? `${profileMeta.displayName} • ${projectMeta.name}`
    : `${profileMeta.displayName}${workspacePath ? ` • ${workspacePath}` : ''}`;

  const userMessage = appendMessage('user', prompt, displayMeta);
  const assistantMessage = appendMessage('assistant', '', 'waiting...');
  const statusLine = appendStatus('Starting execution...');

  setFormDisabled(true);
  closeActiveStream();

  try {
    const response = await fetch(ENDPOINTS.taskAttempts, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ projectId, prompt })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const payload = await response.json();
    const result = payload?.data;
    const sessionId = result?.sessionId;

    if (!sessionId) {
      throw new Error('Session ID not returned by server');
    }

    statusLine.textContent = `Execution started: ${sessionId}`;
    assistantMessage.querySelector('.meta span:last-child').textContent = 'streaming...';

    let assistantBuffer = '';
    const flushAssistant = () => {
      assistantMessage.querySelector('pre').textContent = assistantBuffer || '(no response yet)';
    };

    activeStream = openLogStream(sessionId, {
      onEntry: ({ entryType, content, metadata }) => {
        if (entryType === 'assistant_message') {
          assistantBuffer += (assistantBuffer ? '\n\n' : '') + content;
          flushAssistant();
        } else if (entryType === 'tool_use') {
          const toolName = metadata?.entry_type?.tool_name ?? 'tool';
          appendStatus(`Tool ${toolName}: ${content}`);
        } else if (entryType === 'system_message') {
          appendStatus(content);
        }
      },
      onFinished: () => {
        assistantMessage.querySelector('.meta span:last-child').textContent = 'done';
        appendStatus('Stream finished');
        setFormDisabled(false);
        updateSendButtonState();
        activeStream = null;
      },
      onError: (message) => {
        appendStatus(message, true);
        assistantMessage.querySelector('.meta span:last-child').textContent = 'error';
        setFormDisabled(false);
        updateSendButtonState();
        activeStream = null;
      }
    });
  } catch (error) {
    statusLine.textContent = error instanceof Error ? error.message : String(error);
    statusLine.classList.add('error');
    appendStatus('Execution failed', true);
    setFormDisabled(false);
    updateSendButtonState();
  }
};

form.addEventListener('submit', handleSubmit);
profileSelect.addEventListener('change', async (event) => {
  const label = event.target.value;
  await loadProjects(label);
});
projectSelect.addEventListener('change', updateSendButtonState);
workspaceInput.addEventListener('input', updateSendButtonState);
promptInput.addEventListener('input', updateSendButtonState);

clearButton.addEventListener('click', () => {
  messagesEl.innerHTML = '';
  appendStatus('Conversation cleared');
});

window.addEventListener('beforeunload', () => {
  closeActiveStream();
});

appendStatus('Loading profiles...');
loadProfiles().then(() => {
  appendStatus('Ready. Provide a prompt to start a new execution.');
  updateSendButtonState();
});
