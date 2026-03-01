import {
  getAllProfiles,
  saveProfile,
  deleteProfile,
  setDefaultProfile,
  exportProfile,
  importProfile,
  exportAllProfiles,
} from '../utils/storage.js';
import { getSettings, saveSettings as persistSettings, getDefaultSettings } from '../utils/settings.js';
import { testApiKey } from '../utils/aiParser.js';
import { initTheme, toggleTheme, getCurrentTheme } from '../utils/theme.js';

const appEl = document.getElementById('app');

const VIEW = {
  LIST: 'list',
  EDITOR: 'editor',
};

const AI_PROVIDERS = [
  { value: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini' },
  { value: 'gemini', label: 'Google Gemini', defaultModel: 'gemini-2.5-flash' },
  { value: 'claude', label: 'Anthropic Claude', defaultModel: 'claude-sonnet-4-20250514' },
];

let state = {
  view: VIEW.LIST,
  profiles: [],
  searchQuery: '',
  sortBy: 'recent',
  editingProfile: null,
  settings: null,
  settingsDirty: null,
  testApiResult: null,
};

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await loadProfiles();
  state.settings = await getSettings();
  state.settingsDirty = { ...state.settings };
  const url = new URL(window.location.href);
  const mode = url.searchParams.get('mode');
  const id = url.searchParams.get('id');

  if (mode === 'edit' && id) {
    const profile = state.profiles.find((p) => p.id === id) || null;
    if (profile) {
      openEditor(profile);
      return;
    }
  } else if (mode === 'new') {
    openEditor(createEmptyProfile());
    return;
  }

  render();
});

async function loadProfiles() {
  state.profiles = await getAllProfiles();
}

/* ─── Navigation bar (always visible) ─────── */
function renderNav() {
  const nav = document.createElement('nav');
  nav.className = 'options-nav';

  const brand = document.createElement('span');
  brand.className = 'options-nav-brand';
  brand.textContent = 'ProfileFill';

  const right = document.createElement('div');
  right.className = 'options-nav-right';

  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'options-nav-icon-btn';
  settingsBtn.setAttribute('aria-label', 'Settings');
  settingsBtn.title = 'Settings';
  settingsBtn.textContent = '\u2699';
  settingsBtn.addEventListener('click', () => openSettingsModal());

  const themeBtn = document.createElement('button');
  themeBtn.className = 'options-nav-theme-btn';
  themeBtn.setAttribute('aria-label', 'Toggle theme');
  themeBtn.textContent = getCurrentTheme() === 'dark' ? '\u2600' : '\u25CF';
  themeBtn.addEventListener('click', () => {
    toggleTheme();
    themeBtn.textContent = getCurrentTheme() === 'dark' ? '\u2600' : '\u25CF';
  });

  const version = document.createElement('span');
  version.className = 'options-nav-version';
  version.textContent = 'v1.0.0';

  right.appendChild(settingsBtn);
  right.appendChild(themeBtn);
  right.appendChild(version);
  nav.appendChild(brand);
  nav.appendChild(right);
  return nav;
}

function createSeparator() {
  const hr = document.createElement('hr');
  hr.className = 'options-separator';
  return hr;
}

/* ─── Settings modal ──────────────────────── */
function openSettingsModal() {
  closeSettingsModal();
  state.settingsDirty = { ...(state.settings ?? getDefaultSettings()) };
  state.testApiResult = null;

  const s = state.settingsDirty;
  const provider = AI_PROVIDERS.find((p) => p.value === (s.aiProvider || 'openai')) || AI_PROVIDERS[0];

  const overlay = document.createElement('div');
  overlay.className = 'settings-overlay';
  overlay.id = 'settings-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'settings-modal';

  modal.innerHTML = `
    <div class="settings-modal-header">
      <span class="settings-modal-title">Settings</span>
      <button class="settings-modal-close" id="settings-close-btn" aria-label="Close">&times;</button>
    </div>
    <hr class="settings-modal-separator" />
    <div class="settings-modal-body" id="settings-modal-body">
      <div class="settings-toggle-row" id="settings-ai-toggle-row">
        <div>
          <div class="settings-toggle-label">Enable AI Resume Parsing</div>
          <div class="settings-toggle-desc">Use an AI provider to parse resumes more accurately</div>
        </div>
        <div class="settings-toggle ${s.aiParsingEnabled ? 'on' : ''}" id="settings-ai-toggle">
          <div class="settings-toggle-thumb"></div>
        </div>
      </div>
      <div id="settings-ai-fields" style="display: ${s.aiParsingEnabled ? 'flex' : 'none'}; flex-direction: column; gap: var(--pf-spacing-md);">
        <div class="settings-field">
          <label class="settings-field-label">AI Provider</label>
          <select id="settings-ai-provider" class="pf-input">
            ${AI_PROVIDERS.map((p) => `<option value="${escapeHtml(p.value)}" ${(s.aiProvider || '') === p.value ? 'selected' : ''}>${escapeHtml(p.label)}</option>`).join('')}
          </select>
        </div>
        <div class="settings-field">
          <label class="settings-field-label">API Key</label>
          <div class="settings-key-wrapper">
            <input type="password" id="settings-ai-apikey" class="pf-input" placeholder="Your API key" value="${escapeHtml(s.aiApiKey || '')}" autocomplete="off" />
            <button type="button" class="settings-key-toggle" id="settings-apikey-eye" aria-label="Show/hide">\uD83D\uDC41</button>
          </div>
        </div>
        <div class="settings-field">
          <label class="settings-field-label">Custom Model (optional)</label>
          <input type="text" id="settings-ai-model" class="pf-input" placeholder="${escapeHtml(provider.defaultModel)}" value="${escapeHtml(s.aiModel || '')}" />
        </div>
        <div class="settings-toggle-row" id="settings-fallback-row">
          <div>
            <div class="settings-toggle-label">Fall back to local if AI fails</div>
          </div>
          <div class="settings-toggle ${s.localParsingFallback !== false ? 'on' : ''}" id="settings-fallback-toggle">
            <div class="settings-toggle-thumb"></div>
          </div>
        </div>
        <div class="settings-test-row">
          <button type="button" class="pf-button pf-button-ghost" id="settings-test-btn">Test Connection</button>
          <span id="settings-test-result" class="settings-test-result"></span>
        </div>
      </div>
    </div>
    <p class="settings-muted">Your API key is stored locally and only sent to your chosen AI provider.</p>
    <div class="settings-modal-footer">
      <button type="button" class="pf-button pf-button-ghost" id="settings-cancel-btn">Cancel</button>
      <button type="button" class="pf-button pf-button-primary" id="settings-save-btn">Save</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSettingsModal();
  });

  // Close on escape
  const onEscape = (e) => {
    if (e.key === 'Escape') { closeSettingsModal(); document.removeEventListener('keydown', onEscape); }
  };
  document.addEventListener('keydown', onEscape);

  // Close button
  modal.querySelector('#settings-close-btn').addEventListener('click', closeSettingsModal);
  modal.querySelector('#settings-cancel-btn').addEventListener('click', closeSettingsModal);

  // AI toggle
  modal.querySelector('#settings-ai-toggle').addEventListener('click', () => {
    state.settingsDirty.aiParsingEnabled = !state.settingsDirty.aiParsingEnabled;
    const toggle = modal.querySelector('#settings-ai-toggle');
    const fields = modal.querySelector('#settings-ai-fields');
    toggle.classList.toggle('on', state.settingsDirty.aiParsingEnabled);
    fields.style.display = state.settingsDirty.aiParsingEnabled ? 'flex' : 'none';
  });

  // Fallback toggle
  modal.querySelector('#settings-fallback-toggle').addEventListener('click', () => {
    state.settingsDirty.localParsingFallback = !state.settingsDirty.localParsingFallback;
    modal.querySelector('#settings-fallback-toggle').classList.toggle('on', state.settingsDirty.localParsingFallback);
  });

  // Provider change updates model placeholder
  modal.querySelector('#settings-ai-provider').addEventListener('change', (e) => {
    state.settingsDirty.aiProvider = e.target.value;
    const prov = AI_PROVIDERS.find((p) => p.value === e.target.value) || AI_PROVIDERS[0];
    modal.querySelector('#settings-ai-model').placeholder = prov.defaultModel;
  });

  // Track inputs
  modal.querySelector('#settings-ai-apikey').addEventListener('input', (e) => {
    state.settingsDirty.aiApiKey = e.target.value;
  });
  modal.querySelector('#settings-ai-model').addEventListener('input', (e) => {
    state.settingsDirty.aiModel = e.target.value;
  });

  // Eye toggle
  modal.querySelector('#settings-apikey-eye').addEventListener('click', () => {
    const input = modal.querySelector('#settings-ai-apikey');
    const btn = modal.querySelector('#settings-apikey-eye');
    if (input.type === 'password') { input.type = 'text'; btn.textContent = '\uD83D\uDE48'; }
    else { input.type = 'password'; btn.textContent = '\uD83D\uDC41'; }
  });

  // Test connection
  modal.querySelector('#settings-test-btn').addEventListener('click', async () => {
    const resultEl = modal.querySelector('#settings-test-result');
    resultEl.textContent = 'Testing\u2026';
    resultEl.className = 'settings-test-result';
    const providerVal = modal.querySelector('#settings-ai-provider').value;
    const apiKey = modal.querySelector('#settings-ai-apikey').value;
    const modelVal = modal.querySelector('#settings-ai-model').value.trim();
    const { ok, error } = await testApiKey(providerVal, apiKey, modelVal || undefined);
    state.testApiResult = ok ? 'ok' : error;
    resultEl.textContent = ok ? '\u2713 Connected' : `\u2717 ${error || 'Failed'}`;
    resultEl.className = 'settings-test-result ' + (ok ? 'success' : 'error');
  });

  // Save
  modal.querySelector('#settings-save-btn').addEventListener('click', async () => {
    const defaults = getDefaultSettings();
    const next = {
      ...defaults,
      aiParsingEnabled: state.settingsDirty.aiParsingEnabled,
      aiProvider: modal.querySelector('#settings-ai-provider').value,
      aiApiKey: modal.querySelector('#settings-ai-apikey').value.trim(),
      aiModel: modal.querySelector('#settings-ai-model').value.trim(),
      localParsingFallback: state.settingsDirty.localParsingFallback,
    };
    await persistSettings(next);
    state.settings = next;
    state.settingsDirty = { ...next };
    closeSettingsModal();
    showToast('Settings saved');
  });
}

function closeSettingsModal() {
  const overlay = document.getElementById('settings-modal-overlay');
  if (overlay) overlay.remove();
}

/* ─── Main render ─────────────────────────── */
function render() {
  appEl.innerHTML = '';
  appEl.className = '';

  appEl.appendChild(renderNav());

  const content = document.createElement('div');
  content.className = 'options-content';

  if (state.view === VIEW.LIST) {
    content.appendChild(renderListView());
  } else if (state.view === VIEW.EDITOR && state.editingProfile) {
    content.appendChild(renderEditorView());
  }

  appEl.appendChild(content);
}

function renderListView() {
  const container = document.createElement('div');

  const title = document.createElement('h1');
  title.className = 'options-page-title';
  title.textContent = 'Profiles';
  container.appendChild(title);

  container.appendChild(createSeparator());

  const toolbar = document.createElement('div');
  toolbar.className = 'options-toolbar';
  const count = document.createElement('div');
  count.className = 'options-toolbar-left';
  count.textContent = `${state.profiles.length} profile${state.profiles.length !== 1 ? 's' : ''}`;
  const actions = document.createElement('div');
  actions.className = 'options-toolbar-right';
  actions.innerHTML = `
    <button class="pf-button pf-button-ghost" id="import-profile-btn">Import</button>
    <button class="pf-button pf-button-ghost" id="export-all-btn">Export All</button>
    <button class="pf-button pf-button-primary" id="new-profile-btn">+ New Profile</button>
  `;
  toolbar.appendChild(count);
  toolbar.appendChild(actions);
  container.appendChild(toolbar);

  const searchSort = document.createElement('div');
  searchSort.className = 'options-search-sort';
  searchSort.innerHTML = `
    <input
      id="search-input"
      class="pf-input options-search-input"
      type="search"
      placeholder="Search profiles by name"
      value="${escapeHtml(state.searchQuery)}"
    />
    <select id="sort-select" class="pf-input" style="max-width: 200px;">
      <option value="recent">Recently updated</option>
      <option value="created">Recently created</option>
      <option value="alpha">Alphabetical</option>
    </select>
  `;
  container.appendChild(searchSort);

  let filtered = [...state.profiles];
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.trim().toLowerCase();
    filtered = filtered.filter((p) => p.name.toLowerCase().includes(q));
  }

  if (state.sortBy === 'recent') {
    filtered.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  } else if (state.sortBy === 'created') {
    filtered.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } else if (state.sortBy === 'alpha') {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'options-empty-state';
    empty.innerHTML = `
      <div class="options-empty-icon">+</div>
      <div class="options-empty-title">No profiles yet</div>
      <div class="options-empty-subtitle">Create your first profile by uploading a resume or starting from scratch.</div>
      <button class="pf-button pf-button-primary" id="empty-new-profile-btn">+ New Profile</button>
    `;
    container.appendChild(empty);
  } else {
    const list = document.createElement('div');
    for (const profile of filtered) {
      const card = document.createElement('div');
      card.className = 'options-profile-card';
      card.dataset.id = profile.id;

      const subtitleParts = [];
      if (profile.personal?.firstName || profile.personal?.lastName) {
        subtitleParts.push(
          [profile.personal.firstName, profile.personal.lastName].filter(Boolean).join(' ')
        );
      }
      if (profile.experience && profile.experience.length && profile.experience[0].title) {
        subtitleParts.push(profile.experience[0].title);
      }
      const subtitle = subtitleParts.join(' \u2022 ');

      card.innerHTML = `
        <div class="options-profile-card-header">
          <div>
            <div class="options-profile-name">${escapeHtml(profile.name || 'Untitled profile')}</div>
            ${subtitle ? `<div class="options-profile-subtitle">${escapeHtml(subtitle)}</div>` : ''}
          </div>
          ${profile.isDefault ? '<span class="pf-badge">Default</span>' : ''}
        </div>
        <div class="options-profile-meta">
          <div>Created ${formatDate(profile.createdAt)}</div>
          <div>Updated ${formatDate(profile.updatedAt)}</div>
        </div>
        <div class="options-profile-actions">
          <button class="pf-button pf-button-ghost" data-action="set-default" data-id="${profile.id}">Set Default</button>
          <button class="pf-button pf-button-ghost" data-action="duplicate" data-id="${profile.id}">Duplicate</button>
          <button class="pf-button pf-button-ghost" data-action="export" data-id="${profile.id}">Export</button>
          <button class="pf-button pf-button-danger" data-action="delete" data-id="${profile.id}">Delete</button>
        </div>
      `;
      list.appendChild(card);
    }
    container.appendChild(list);
  }

  container.addEventListener('click', async (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (!target) return;

    if (target.id === 'new-profile-btn' || target.id === 'empty-new-profile-btn') {
      event.preventDefault();
      openEditor(createEmptyProfile());
      return;
    }

    if (target.id === 'import-profile-btn') {
      event.preventDefault();
      openImportDialog();
      return;
    }

    if (target.id === 'export-all-btn') {
      event.preventDefault();
      await exportAllProfiles();
      showToast('Exported all profiles');
      return;
    }

    const action = target.dataset.action;
    const id = target.dataset.id;

    if (action && id) {
      event.stopPropagation();
      if (action === 'set-default') {
        await setDefaultProfile(id);
        await loadProfiles();
        showToast('Default profile updated');
        render();
      } else if (action === 'duplicate') {
        await duplicateProfile(id);
      } else if (action === 'export') {
        await exportProfile(id);
      } else if (action === 'delete') {
        const confirmed = window.confirm('Delete this profile? This cannot be undone.');
        if (confirmed) {
          await deleteProfile(id);
          await loadProfiles();
          showToast('Profile deleted');
          render();
        }
      }
      return;
    }

    const card = target.closest('.options-profile-card');
    if (card && card.dataset.id) {
      const profile = state.profiles.find((p) => p.id === card.dataset.id);
      if (profile) {
        openEditor(profile);
      }
    }
  });

  const searchInput = searchSort.querySelector('#search-input');
  const sortSelect = searchSort.querySelector('#sort-select');

  if (sortSelect) {
    sortSelect.value = state.sortBy;
  }

  searchInput?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    render();
  });

  sortSelect?.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    render();
  });

  return container;
}

function renderEditorView() {
  const profile = state.editingProfile;
  const container = document.createElement('div');
  container.className = 'options-editor';

  const header = document.createElement('div');
  header.className = 'options-editor-header';
  header.innerHTML = `
    <div class="options-editor-name-input">
      <div class="options-field-label">Profile Name</div>
      <input
        id="profile-name-input"
        class="pf-input"
        type="text"
        placeholder="Profile Name e.g., SWE Resume"
        value="${escapeHtml(profile.name || '')}"
      />
    </div>
    <div>
      <button class="pf-button pf-button-ghost" id="back-to-list-btn">\u2190 Back to Profiles</button>
    </div>
  `;
  container.appendChild(header);
  container.appendChild(createSeparator());

  // Personal Information
  const personalSection = document.createElement('section');
  personalSection.className = 'options-editor-section';
  personalSection.innerHTML = `
    <div class="pf-card">
      <div class="options-editor-card-header">
        <div class="pf-label">Personal Information</div>
      </div>
      <div class="options-field-grid">
        ${renderLabeledInput('First Name', 'personal-firstName', profile.personal.firstName)}
        ${renderLabeledInput('Last Name', 'personal-lastName', profile.personal.lastName)}
        ${renderLabeledInput('Email', 'personal-email', profile.personal.email, 'email')}
        ${renderSelect('Country Code (phone)', 'personal-countryCode', profile.personal.countryCode, [
          { value: '', label: 'Select' },
          { value: '+1', label: '+1 (US/Canada)' },
          { value: '+44', label: '+44 (UK)' },
          { value: '+91', label: '+91 (India)' },
          { value: '+61', label: '+61 (Australia)' },
          { value: '+49', label: '+49 (Germany)' },
          { value: '+33', label: '+33 (France)' },
          { value: '+81', label: '+81 (Japan)' },
          { value: '+86', label: '+86 (China)' },
          { value: '+971', label: '+971 (UAE)' },
          { value: '+353', label: '+353 (Ireland)' },
          { value: '+31', label: '+31 (Netherlands)' },
          { value: '+34', label: '+34 (Spain)' },
          { value: '+39', label: '+39 (Italy)' },
          { value: '+55', label: '+55 (Brazil)' },
          { value: '+52', label: '+52 (Mexico)' },
          { value: '+27', label: '+27 (South Africa)' },
          { value: '+65', label: '+65 (Singapore)' },
          { value: '+82', label: '+82 (South Korea)' },
          { value: '+90', label: '+90 (Turkey)' },
        ])}
        ${renderLabeledInput('Phone', 'personal-phone', profile.personal.phone, 'tel')}
        ${renderSelect('Phone / Device Type', 'personal-phoneType', profile.personal.phoneType, [
          { value: '', label: 'Select' },
          { value: 'Mobile', label: 'Mobile' },
          { value: 'Home', label: 'Home' },
          { value: 'Work', label: 'Work' },
        ])}
        ${renderLabeledInput('Address', 'personal-address', profile.personal.address, 'text', 'Street address')}
        ${renderLabeledInput('City', 'personal-city', profile.personal.city, 'text')}
        ${renderLabeledInput('State', 'personal-state', profile.personal.state, 'text', 'State / Province')}
        ${renderLabeledInput('Location (optional)', 'personal-location', profile.personal.location, 'text', 'Other location info')}
        ${renderLabeledInput('Country', 'personal-country', profile.personal.country, 'text')}
        ${renderLabeledInput('Pincode / Zip', 'personal-pincode', profile.personal.pincode, 'text', 'Postal code')}
        ${renderLabeledInput('LinkedIn URL', 'personal-linkedIn', profile.personal.linkedIn, 'url')}
        ${renderLabeledInput('GitHub URL', 'personal-github', profile.personal.github, 'url')}
        ${renderLabeledInput('Portfolio URL', 'personal-portfolio', profile.personal.portfolio, 'url')}
        ${renderLabeledInput('Website', 'personal-website', profile.personal.website, 'url')}
      </div>
    </div>
  `;
  container.appendChild(personalSection);

  // Education
  const educationSection = document.createElement('section');
  educationSection.className = 'options-editor-section';
  educationSection.innerHTML = `
    <div class="pf-card">
      <div class="options-editor-card-header">
        <div class="pf-label">Education</div>
        <button class="pf-button pf-button-ghost" id="add-education-btn">+ Add</button>
      </div>
      <div id="education-list"></div>
    </div>
  `;
  container.appendChild(educationSection);

  // Experience
  const experienceSection = document.createElement('section');
  experienceSection.className = 'options-editor-section';
  experienceSection.innerHTML = `
    <div class="pf-card">
      <div class="options-editor-card-header">
        <div class="pf-label">Experience</div>
        <button class="pf-button pf-button-ghost" id="add-experience-btn">+ Add</button>
      </div>
      <div id="experience-list"></div>
    </div>
  `;
  container.appendChild(experienceSection);

  // Skills
  const skillsSection = document.createElement('section');
  skillsSection.className = 'options-editor-section';
  skillsSection.innerHTML = `
    <div class="pf-card">
      <div class="options-editor-card-header">
        <div class="pf-label">Skills</div>
      </div>
      <div class="options-row">
        <div class="options-field-label">Technical Skills</div>
        <div class="options-tag-list" id="skills-technical-list"></div>
        <input id="skills-technical-input" class="pf-input" type="text" placeholder="Type a skill and press Enter" />
      </div>
      <div class="options-row">
        <div class="options-field-label">Languages</div>
        <div class="options-tag-list" id="skills-languages-list"></div>
        <input id="skills-languages-input" class="pf-input" type="text" placeholder="Type a language and press Enter" />
      </div>
      <div class="options-row">
        <div class="options-field-label">Tools & Frameworks</div>
        <div class="options-tag-list" id="skills-tools-list"></div>
        <input id="skills-tools-input" class="pf-input" type="text" placeholder="Type a tool and press Enter" />
      </div>
    </div>
  `;
  container.appendChild(skillsSection);

  // Projects
  const projectsSection = document.createElement('section');
  projectsSection.className = 'options-editor-section';
  projectsSection.innerHTML = `
    <div class="pf-card">
      <div class="options-editor-card-header">
        <div class="pf-label">Projects</div>
        <button class="pf-button pf-button-ghost" id="add-project-btn">+ Add</button>
      </div>
      <div id="projects-list"></div>
    </div>
  `;
  container.appendChild(projectsSection);

  // Certifications
  const certSection = document.createElement('section');
  certSection.className = 'options-editor-section';
  certSection.innerHTML = `
    <div class="pf-card">
      <div class="options-editor-card-header">
        <div class="pf-label">Certifications</div>
        <button class="pf-button pf-button-ghost" id="add-cert-btn">+ Add</button>
      </div>
      <div id="cert-list"></div>
    </div>
  `;
  container.appendChild(certSection);

  // Application Defaults
  const appDefaultsSection = document.createElement('section');
  appDefaultsSection.className = 'options-editor-section';
  appDefaultsSection.innerHTML = `
    <div class="pf-card">
      <div class="options-editor-card-header">
        <div class="pf-label">Application Defaults</div>
      </div>
      <div class="options-field-grid">
        ${renderSelect('Visa Sponsorship', 'app-visaSponsorship', profile.applicationDefaults.visaSponsorship, [
          { value: '', label: 'Select' },
          { value: 'Yes', label: 'Yes' },
          { value: 'No', label: 'No' },
          { value: 'Prefer not to say', label: 'Prefer not to say' },
        ])}
        ${renderSelect('Work Authorization', 'app-workAuthorization', profile.applicationDefaults.workAuthorization, [
          { value: '', label: 'Select' },
          { value: 'Authorized', label: 'Authorized' },
          { value: 'Need Sponsorship', label: 'Need Sponsorship' },
          { value: 'Other', label: 'Other' },
        ])}
        ${renderLabeledInput('Expected Salary', 'app-expectedSalary', profile.applicationDefaults.expectedSalary)}
        ${renderLabeledInput('Available Start Date', 'app-availableStartDate', profile.applicationDefaults.availableStartDate, 'date')}
        ${renderLabeledInput('Years of Experience', 'app-yearsOfExperience', profile.applicationDefaults.yearsOfExperience)}
        ${renderSelect('Willing to Relocate', 'app-willingToRelocate', profile.applicationDefaults.willingToRelocate, [
          { value: '', label: 'Select' },
          { value: 'Yes', label: 'Yes' },
          { value: 'No', label: 'No' },
        ])}
        ${renderSelect('Gender (optional)', 'app-gender', profile.applicationDefaults.gender, [
          { value: '', label: 'Prefer not to say' },
          { value: 'Female', label: 'Female' },
          { value: 'Male', label: 'Male' },
          { value: 'Non-binary', label: 'Non-binary' },
          { value: 'Other', label: 'Other' },
        ])}
        ${renderLabeledInput('Ethnicity (optional)', 'app-ethnicity', profile.applicationDefaults.ethnicity)}
        ${renderSelect('Veteran Status (optional)', 'app-veteranStatus', profile.applicationDefaults.veteranStatus, [
          { value: '', label: 'Select' },
          { value: 'I am not a veteran', label: 'I am not a veteran' },
          { value: 'I am a protected veteran', label: 'I am a protected veteran' },
          { value: 'Prefer not to say', label: 'Prefer not to say' },
        ])}
        ${renderSelect('Disability Status (optional)', 'app-disabilityStatus', profile.applicationDefaults.disabilityStatus, [
          { value: '', label: 'Select' },
          { value: 'No, I do not have a disability and have not had one in the past', label: 'No, I do not have a disability and have not had one in the past' },
          { value: 'I do not have a disability', label: 'I do not have a disability' },
          { value: 'I had a disability in the past', label: 'I had a disability in the past' },
          { value: 'I have a disability', label: 'I have a disability' },
          { value: 'Prefer not to say', label: 'Prefer not to say' },
        ])}
        ${renderLabeledInput('Pronouns', 'app-pronouns', profile.applicationDefaults.pronouns)}
      </div>
    </div>
  `;
  container.appendChild(appDefaultsSection);

  // Custom Fields
  const customFieldsSection = document.createElement('section');
  customFieldsSection.className = 'options-editor-section';
  customFieldsSection.innerHTML = `
    <div class="pf-card">
      <div class="options-editor-card-header">
        <div class="pf-label">Custom Fields</div>
        <button class="pf-button pf-button-ghost" id="add-custom-field-btn">+ Add</button>
      </div>
      <div id="custom-fields-list"></div>
    </div>
  `;
  container.appendChild(customFieldsSection);

  // Cover Letters
  const coverLettersSection = document.createElement('section');
  coverLettersSection.className = 'options-editor-section';
  coverLettersSection.innerHTML = `
    <div class="pf-card">
      <div class="options-editor-card-header">
        <div class="pf-label">Cover Letters</div>
        <button class="pf-button pf-button-ghost" id="add-cover-letter-btn">+ Add</button>
      </div>
      <div id="cover-letters-list"></div>
    </div>
  `;
  container.appendChild(coverLettersSection);

  // Resume file
  const resumeSection = document.createElement('section');
  resumeSection.className = 'options-editor-section';
  resumeSection.innerHTML = `
    <div class="pf-card">
      <div class="options-editor-card-header">
        <div class="pf-label">Resume File</div>
      </div>
      <div class="options-row">
        <div class="options-field-label">Current file</div>
        <div class="pf-text-muted">
          ${profile.resumeFileName ? escapeHtml(profile.resumeFileName) : 'No file attached'}
        </div>
      </div>
      <div class="options-row">
        <input id="resume-file-input" type="file" accept=".pdf,.docx" />
      </div>
    </div>
  `;
  container.appendChild(resumeSection);

  // Sticky footer
  const footer = document.createElement('div');
  footer.className = 'options-sticky-footer';
  footer.innerHTML = `
    <div class="options-sticky-footer-inner">
      <div class="pf-text-muted">Changes saved locally</div>
      <div class="options-sticky-footer-actions">
        <button class="pf-button pf-button-ghost" id="cancel-edit-btn">Cancel</button>
        <button class="pf-button pf-button-primary" id="save-profile-btn">Save Profile</button>
      </div>
    </div>
  `;

  setTimeout(() => {
    renderEducationList(profile.education);
    renderExperienceList(profile.experience);
    renderSkills(profile.skills);
    renderProjectsList(profile.projects);
    renderCertList(profile.certifications);
    renderCustomFieldsList(profile.customFields);
    renderCoverLettersList(profile.coverLetters);
    wireEditorEvents();
  }, 0);

  const wrapper = document.createElement('div');
  wrapper.appendChild(container);
  wrapper.appendChild(footer);
  return wrapper;
}

function renderLabeledInput(label, id, value, type = 'text', placeholder = '') {
  return `
    <div class="options-row">
      <label class="options-field-label" for="${id}">${label}</label>
      <input
        id="${id}"
        class="pf-input"
        type="${type}"
        ${placeholder ? `placeholder="${placeholder}"` : ''}
        value="${escapeHtml(value || '')}"
      />
    </div>
  `;
}

function renderSelect(label, id, value, options) {
  const opts = options
    .map(
      (opt) =>
        `<option value="${escapeHtml(opt.value)}" ${
          opt.value === (value || '') ? 'selected' : ''
        }>${escapeHtml(opt.label)}</option>`
    )
    .join('');
  return `
    <div class="options-row">
      <label class="options-field-label" for="${id}">${label}</label>
      <select id="${id}" class="pf-input">
        ${opts}
      </select>
    </div>
  `;
}

function renderEducationList(education) {
  const listEl = document.getElementById('education-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  education.forEach((edu, index) => {
    const card = document.createElement('div');
    card.className = 'options-subcard';
    card.dataset.index = String(index);
    card.innerHTML = `
      <div class="options-subcard-header">
        <div class="options-field-label">${escapeHtml(edu.school || 'Education')}</div>
        <button class="pf-button pf-button-danger" data-role="remove-education">Remove</button>
      </div>
      <div class="options-field-grid">
        ${renderLabeledInput('School', `edu-school-${index}`, edu.school)}
        ${renderLabeledInput('Degree', `edu-degree-${index}`, edu.degree)}
        ${renderLabeledInput('Field of Study', `edu-field-${index}`, edu.field)}
        ${renderLabeledInput('GPA', `edu-gpa-${index}`, edu.gpa)}
        ${renderLabeledInput('Start Date (MM/YYYY)', `edu-start-${index}`, edu.startDate)}
        ${renderLabeledInput('End Date (MM/YYYY or Present)', `edu-end-${index}`, edu.endDate)}
        ${renderLabeledInput('Location', `edu-location-${index}`, edu.location)}
      </div>
    `;
    listEl.appendChild(card);
  });

  listEl.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.dataset.role === 'remove-education') {
      const card = target.closest('.options-subcard');
      if (!card) return;
      const idx = Number(card.dataset.index);
      state.editingProfile.education.splice(idx, 1);
      renderEditorViewAgain();
    }
  });
}

function renderExperienceList(experience) {
  const listEl = document.getElementById('experience-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  experience.forEach((exp, index) => {
    const card = document.createElement('div');
    card.className = 'options-subcard';
    card.dataset.index = String(index);
    card.innerHTML = `
      <div class="options-subcard-header">
        <div class="options-field-label">${escapeHtml(exp.title || 'Experience')}</div>
        <button class="pf-button pf-button-danger" data-role="remove-experience">Remove</button>
      </div>
      <div class="options-field-grid">
        ${renderLabeledInput('Company', `exp-company-${index}`, exp.company)}
        ${renderLabeledInput('Title', `exp-title-${index}`, exp.title)}
        ${renderLabeledInput('Location', `exp-location-${index}`, exp.location)}
        ${renderLabeledInput('Start Date', `exp-start-${index}`, exp.startDate)}
        ${renderLabeledInput('End Date', `exp-end-${index}`, exp.endDate)}
      </div>
      <div class="options-row">
        <label class="options-field-label" for="exp-current-${index}">
          <input id="exp-current-${index}" type="checkbox" ${exp.isCurrentRole ? 'checked' : ''} /> Current Role
        </label>
      </div>
      <div class="options-row">
        <label class="options-field-label" for="exp-desc-${index}">Description</label>
        <textarea id="exp-desc-${index}" class="pf-input" placeholder="Bullets or paragraph">${exp.description || ''}</textarea>
      </div>
    `;
    listEl.appendChild(card);
  });

  listEl.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.dataset.role === 'remove-experience') {
      const card = target.closest('.options-subcard');
      if (!card) return;
      const idx = Number(card.dataset.index);
      state.editingProfile.experience.splice(idx, 1);
      renderEditorViewAgain();
    }
  });
}

function renderSkills(skills) {
  const technicalList = document.getElementById('skills-technical-list');
  const languagesList = document.getElementById('skills-languages-list');
  const toolsList = document.getElementById('skills-tools-list');
  if (!technicalList || !languagesList || !toolsList) return;

  const renderTags = (container, items, type) => {
    container.innerHTML = '';
    items.forEach((item, index) => {
      const tag = document.createElement('span');
      tag.className = 'options-tag';
      tag.innerHTML = `
        <span>${escapeHtml(item)}</span>
        <span class="options-tag-remove" data-type="${type}" data-index="${index}">&times;</span>
      `;
      container.appendChild(tag);
    });
  };

  renderTags(technicalList, skills.technical || [], 'technical');
  renderTags(languagesList, skills.languages || [], 'languages');
  renderTags(toolsList, skills.tools || [], 'tools');

  const handleInput = (inputId, type) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const value = input.value.trim();
        if (!value) return;
        if (!state.editingProfile.skills[type]) {
          state.editingProfile.skills[type] = [];
        }
        state.editingProfile.skills[type].push(value);
        input.value = '';
        renderSkills(state.editingProfile.skills);
      }
    });
  };

  handleInput('skills-technical-input', 'technical');
  handleInput('skills-languages-input', 'languages');
  handleInput('skills-tools-input', 'tools');

  const root = technicalList.parentElement?.parentElement;
  root?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.classList.contains('options-tag-remove')) {
      const type = target.dataset.type;
      const index = Number(target.dataset.index);
      if (type && Number.isFinite(index)) {
        const arr = state.editingProfile.skills[type] || [];
        arr.splice(index, 1);
        renderSkills(state.editingProfile.skills);
      }
    }
  });
}

function renderProjectsList(projects) {
  const listEl = document.getElementById('projects-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  projects.forEach((project, index) => {
    const card = document.createElement('div');
    card.className = 'options-subcard';
    card.dataset.index = String(index);
    card.innerHTML = `
      <div class="options-subcard-header">
        <div class="options-field-label">${escapeHtml(project.name || 'Project')}</div>
        <button class="pf-button pf-button-danger" data-role="remove-project">Remove</button>
      </div>
      <div class="options-field-grid">
        ${renderLabeledInput('Name', `proj-name-${index}`, project.name)}
        ${renderLabeledInput('URL', `proj-url-${index}`, project.url)}
        ${renderLabeledInput('Start Date', `proj-start-${index}`, project.startDate)}
        ${renderLabeledInput('End Date', `proj-end-${index}`, project.endDate)}
      </div>
      <div class="options-row">
        <label class="options-field-label" for="proj-tech-${index}">Technologies (comma separated)</label>
        <input id="proj-tech-${index}" class="pf-input" type="text" value="${escapeHtml((project.technologies || []).join(', '))}" />
      </div>
      <div class="options-row">
        <label class="options-field-label" for="proj-desc-${index}">Description</label>
        <textarea id="proj-desc-${index}" class="pf-input">${project.description || ''}</textarea>
      </div>
    `;
    listEl.appendChild(card);
  });

  listEl.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.dataset.role === 'remove-project') {
      const card = target.closest('.options-subcard');
      if (!card) return;
      const idx = Number(card.dataset.index);
      state.editingProfile.projects.splice(idx, 1);
      renderEditorViewAgain();
    }
  });
}

function renderCertList(certifications) {
  const listEl = document.getElementById('cert-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  certifications.forEach((cert, index) => {
    const card = document.createElement('div');
    card.className = 'options-subcard';
    card.dataset.index = String(index);
    card.innerHTML = `
      <div class="options-subcard-header">
        <div class="options-field-label">${escapeHtml(cert.name || 'Certification')}</div>
        <button class="pf-button pf-button-danger" data-role="remove-cert">Remove</button>
      </div>
      <div class="options-field-grid">
        ${renderLabeledInput('Name', `cert-name-${index}`, cert.name)}
        ${renderLabeledInput('Issuer', `cert-issuer-${index}`, cert.issuer)}
        ${renderLabeledInput('Date', `cert-date-${index}`, cert.date)}
        ${renderLabeledInput('URL', `cert-url-${index}`, cert.url)}
      </div>
    `;
    listEl.appendChild(card);
  });

  listEl.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.dataset.role === 'remove-cert') {
      const card = target.closest('.options-subcard');
      if (!card) return;
      const idx = Number(card.dataset.index);
      state.editingProfile.certifications.splice(idx, 1);
      renderEditorViewAgain();
    }
  });
}

function renderCustomFieldsList(customFields) {
  const listEl = document.getElementById('custom-fields-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  customFields.forEach((field, index) => {
    const card = document.createElement('div');
    card.className = 'options-subcard';
    card.dataset.index = String(index);
    card.innerHTML = `
      <div class="options-subcard-header">
        <div class="options-field-label">${escapeHtml(field.label || 'Custom Field')}</div>
        <button class="pf-button pf-button-danger" data-role="remove-custom-field">Remove</button>
      </div>
      <div class="options-field-grid">
        ${renderLabeledInput('Label', `custom-label-${index}`, field.label)}
        ${renderLabeledInput('Value', `custom-value-${index}`, field.value)}
      </div>
    `;
    listEl.appendChild(card);
  });

  listEl.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.dataset.role === 'remove-custom-field') {
      const card = target.closest('.options-subcard');
      if (!card) return;
      const idx = Number(card.dataset.index);
      state.editingProfile.customFields.splice(idx, 1);
      renderEditorViewAgain();
    }
  });
}

function renderCoverLettersList(coverLetters) {
  const listEl = document.getElementById('cover-letters-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  coverLetters.forEach((cl, index) => {
    const card = document.createElement('div');
    card.className = 'options-subcard';
    card.dataset.index = String(index);
    card.innerHTML = `
      <div class="options-subcard-header">
        <div class="options-field-label">${escapeHtml(cl.name || 'Cover Letter')}</div>
        <button class="pf-button pf-button-danger" data-role="remove-cover-letter">Remove</button>
      </div>
      <div class="options-row">
        ${renderLabeledInput('Name', `cl-name-${index}`, cl.name)}
      </div>
      <div class="options-row">
        <label class="options-field-label" for="cl-content-${index}">Content</label>
        <textarea id="cl-content-${index}" class="pf-input">${cl.content || ''}</textarea>
      </div>
    `;
    listEl.appendChild(card);
  });

  listEl.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.dataset.role === 'remove-cover-letter') {
      const card = target.closest('.options-subcard');
      if (!card) return;
      const idx = Number(card.dataset.index);
      state.editingProfile.coverLetters.splice(idx, 1);
      renderEditorViewAgain();
    }
  });
}

function wireEditorEvents() {
  const backBtn = document.getElementById('back-to-list-btn');
  const cancelBtn = document.getElementById('cancel-edit-btn');
  const saveBtn = document.getElementById('save-profile-btn');

  backBtn?.addEventListener('click', () => {
    state.view = VIEW.LIST;
    state.editingProfile = null;
    render();
  });

  cancelBtn?.addEventListener('click', () => {
    state.view = VIEW.LIST;
    state.editingProfile = null;
    render();
  });

  saveBtn?.addEventListener('click', async () => {
    const updated = collectProfileFromEditor();
    if (!updated) return;
    await saveProfile(updated);
    await loadProfiles();
    state.view = VIEW.LIST;
    state.editingProfile = null;
    render();
    showToast('Profile saved');
  });

  const addEducationBtn = document.getElementById('add-education-btn');
  addEducationBtn?.addEventListener('click', () => {
    state.editingProfile.education.push({
      id: crypto.randomUUID(),
      school: '', degree: '', field: '', gpa: '',
      startDate: '', endDate: '', location: '',
    });
    renderEditorViewAgain();
  });

  const addExperienceBtn = document.getElementById('add-experience-btn');
  addExperienceBtn?.addEventListener('click', () => {
    state.editingProfile.experience.push({
      id: crypto.randomUUID(),
      company: '', title: '', location: '',
      startDate: '', endDate: '', description: '', isCurrentRole: false,
    });
    renderEditorViewAgain();
  });

  const addProjectBtn = document.getElementById('add-project-btn');
  addProjectBtn?.addEventListener('click', () => {
    state.editingProfile.projects.push({
      id: crypto.randomUUID(),
      name: '', description: '', technologies: [],
      url: '', startDate: '', endDate: '',
    });
    renderEditorViewAgain();
  });

  const addCertBtn = document.getElementById('add-cert-btn');
  addCertBtn?.addEventListener('click', () => {
    state.editingProfile.certifications.push({
      id: crypto.randomUUID(),
      name: '', issuer: '', date: '', url: '',
    });
    renderEditorViewAgain();
  });

  const addCustomFieldBtn = document.getElementById('add-custom-field-btn');
  addCustomFieldBtn?.addEventListener('click', () => {
    state.editingProfile.customFields.push({
      id: crypto.randomUUID(),
      label: '', value: '',
    });
    renderEditorViewAgain();
  });

  const addCoverLetterBtn = document.getElementById('add-cover-letter-btn');
  addCoverLetterBtn?.addEventListener('click', () => {
    state.editingProfile.coverLetters.push({
      id: crypto.randomUUID(),
      name: '', content: '',
    });
    renderEditorViewAgain();
  });

  const resumeInput = document.getElementById('resume-file-input');
  resumeInput?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    state.editingProfile.resumeFileName = file.name;
    state.editingProfile.resumeBase64 = base64;
    renderEditorViewAgain();
  });
}

function collectProfileFromEditor() {
  const profile = { ...state.editingProfile };

  const nameInput = /** @type {HTMLInputElement} */ (document.getElementById('profile-name-input'));
  const firstNameInput = /** @type {HTMLInputElement} */ (document.getElementById('personal-firstName'));
  const lastNameInput = /** @type {HTMLInputElement} */ (document.getElementById('personal-lastName'));
  const emailInput = /** @type {HTMLInputElement} */ (document.getElementById('personal-email'));

  const firstName = firstNameInput?.value.trim() || '';
  const lastName = lastNameInput?.value.trim() || '';
  const email = emailInput?.value.trim() || '';

  if (!firstName || !lastName || !email) {
    alert('Please fill at least First Name, Last Name, and Email.');
    return null;
  }

  profile.name = nameInput?.value.trim() || `${firstName} ${lastName}`;

  profile.personal = {
    firstName, lastName, email,
    countryCode: valueOf('personal-countryCode'),
    phone: valueOf('personal-phone'),
    phoneType: valueOf('personal-phoneType') || 'Mobile',
    address: valueOf('personal-address'),
    city: valueOf('personal-city'),
    state: valueOf('personal-state'),
    location: valueOf('personal-location'),
    country: valueOf('personal-country'),
    pincode: valueOf('personal-pincode'),
    linkedIn: valueOf('personal-linkedIn'),
    github: valueOf('personal-github'),
    portfolio: valueOf('personal-portfolio'),
    website: valueOf('personal-website'),
  };

  profile.education = profile.education.map((edu, index) => ({
    ...edu,
    school: valueOf(`edu-school-${index}`),
    degree: valueOf(`edu-degree-${index}`),
    field: valueOf(`edu-field-${index}`),
    gpa: valueOf(`edu-gpa-${index}`),
    startDate: valueOf(`edu-start-${index}`),
    endDate: valueOf(`edu-end-${index}`),
    location: valueOf(`edu-location-${index}`),
  }));

  profile.experience = profile.experience.map((exp, index) => ({
    ...exp,
    company: valueOf(`exp-company-${index}`),
    title: valueOf(`exp-title-${index}`),
    location: valueOf(`exp-location-${index}`),
    startDate: valueOf(`exp-start-${index}`),
    endDate: valueOf(`exp-end-${index}`),
    isCurrentRole: checkedOf(`exp-current-${index}`),
    description: valueOf(`exp-desc-${index}`, true),
  }));

  profile.projects = profile.projects.map((proj, index) => {
    const techRaw = valueOf(`proj-tech-${index}`);
    const technologies = techRaw
      ? techRaw.split(',').map((t) => t.trim()).filter(Boolean)
      : [];
    return {
      ...proj,
      name: valueOf(`proj-name-${index}`),
      url: valueOf(`proj-url-${index}`),
      startDate: valueOf(`proj-start-${index}`),
      endDate: valueOf(`proj-end-${index}`),
      technologies,
      description: valueOf(`proj-desc-${index}`, true),
    };
  });

  profile.certifications = profile.certifications.map((cert, index) => ({
    ...cert,
    name: valueOf(`cert-name-${index}`),
    issuer: valueOf(`cert-issuer-${index}`),
    date: valueOf(`cert-date-${index}`),
    url: valueOf(`cert-url-${index}`),
  }));

  profile.applicationDefaults = {
    visaSponsorship: valueOf('app-visaSponsorship'),
    workAuthorization: valueOf('app-workAuthorization'),
    expectedSalary: valueOf('app-expectedSalary'),
    availableStartDate: valueOf('app-availableStartDate'),
    yearsOfExperience: valueOf('app-yearsOfExperience'),
    willingToRelocate: valueOf('app-willingToRelocate'),
    gender: valueOf('app-gender'),
    ethnicity: valueOf('app-ethnicity'),
    veteranStatus: valueOf('app-veteranStatus'),
    disabilityStatus: valueOf('app-disabilityStatus'),
    pronouns: valueOf('app-pronouns'),
  };

  profile.customFields = profile.customFields.map((field, index) => ({
    ...field,
    label: valueOf(`custom-label-${index}`),
    value: valueOf(`custom-value-${index}`),
  }));

  profile.coverLetters = profile.coverLetters.map((cl, index) => ({
    ...cl,
    name: valueOf(`cl-name-${index}`),
    content: valueOf(`cl-content-${index}`, true),
  }));

  profile.updatedAt = new Date().toISOString();

  return profile;
}

function valueOf(id, isTextArea = false) {
  const el = /** @type {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null} */ (
    document.getElementById(id)
  );
  if (!el) return '';
  return el.value || '';
}

function checkedOf(id) {
  const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
  return !!el?.checked;
}

function openEditor(profile) {
  state.view = VIEW.EDITOR;
  state.editingProfile = JSON.parse(JSON.stringify(profile));
  render();
}

function openImportDialog() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await importProfile(file);
      await loadProfiles();
      render();
      showToast('Profile imported');
    } catch (e) {
      console.error(e);
      alert('Failed to import profile. Please check the JSON file.');
    }
  });
  input.click();
}

async function duplicateProfile(id) {
  const original = state.profiles.find((p) => p.id === id);
  if (!original) return;
  const now = new Date().toISOString();
  const copy = {
    ...original,
    id: crypto.randomUUID(),
    name: `${original.name || 'Profile'} (Copy)`,
    createdAt: now,
    updatedAt: now,
    isDefault: false,
  };
  await saveProfile(copy);
  await loadProfiles();
  render();
  showToast('Profile duplicated');
}

function showToast(message) {
  const existing = document.querySelector('.pf-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'pf-toast';
  toast.innerHTML = `
    <span class="pf-toast-success-indicator"></span>
    <span>${escapeHtml(message)}</span>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 200ms ease';
    setTimeout(() => toast.remove(), 220);
  }, 1800);
}

function formatDate(iso) {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '\u2014';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createEmptyProfile() {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: '',
    createdAt: now,
    updatedAt: now,
    isDefault: state.profiles.length === 0,
    personal: {
      firstName: '', lastName: '', email: '',
      countryCode: '', phone: '', phoneType: '',
      address: '', city: '', state: '', location: '',
      country: '', pincode: '',
      linkedIn: '', github: '', portfolio: '', website: '',
    },
    education: [],
    experience: [],
    skills: { technical: [], languages: [], tools: [] },
    projects: [],
    certifications: [],
    applicationDefaults: {
      visaSponsorship: '', workAuthorization: '',
      expectedSalary: '', availableStartDate: '',
      yearsOfExperience: '', willingToRelocate: '',
      gender: '', ethnicity: '', veteranStatus: '',
      disabilityStatus: '', pronouns: '',
    },
    customFields: [],
    coverLetters: [],
    resumeFileName: '',
    resumeBase64: '',
  };
}

function renderEditorViewAgain() {
  const contentEl = document.querySelector('.options-content');
  if (!contentEl) return;
  contentEl.innerHTML = '';
  contentEl.appendChild(renderEditorView());
}

async function fileToBase64(file) {
  const arrayBuffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
