import {
  getAllProfiles,
  saveProfile,
  deleteProfile,
  setDefaultProfile,
  exportProfile,
} from '../utils/storage.js';
import { getSettings } from '../utils/settings.js';
import { parseResumeFile } from '../utils/parser.js';
import { initTheme, toggleTheme, getCurrentTheme } from '../utils/theme.js';

const rootEl = document.getElementById('popup-root');

const VIEW = {
  EMPTY: 'empty',
  LIST: 'list',
  UPLOAD: 'upload',
  PARSING: 'parsing',
};

let state = {
  view: VIEW.EMPTY,
  profiles: [],
  selectedFile: null,
  parsingMessage: '',
  parsingWithAI: false,
};

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await loadProfiles();
  state.view = state.profiles.length ? VIEW.LIST : VIEW.EMPTY;
  render();
});

async function loadProfiles() {
  state.profiles = await getAllProfiles();
}

function render() {
  rootEl.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'popup-shell';

  shell.appendChild(renderHeader());
  shell.appendChild(createSeparator());

  if (state.view === VIEW.EMPTY) {
    shell.appendChild(renderEmptyState());
  } else if (state.view === VIEW.LIST) {
    shell.appendChild(renderListView());
  } else if (state.view === VIEW.UPLOAD) {
    shell.appendChild(renderUploadView());
  } else if (state.view === VIEW.PARSING) {
    shell.appendChild(renderParsingView());
  }

  shell.appendChild(createSeparator());
  shell.appendChild(renderFooter());

  rootEl.appendChild(shell);
}

function createSeparator() {
  const hr = document.createElement('hr');
  hr.className = 'popup-separator';
  return hr;
}

function renderHeader() {
  const header = document.createElement('div');
  header.className = 'popup-header';

  const left = document.createElement('div');
  left.className = 'popup-header-left';
  left.innerHTML = `
    <div class="popup-title">ProfileFill</div>
    <div class="popup-subtitle">Profiles live only in your browser.</div>
  `;

  const right = document.createElement('div');
  right.className = 'popup-header-right';

  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'popup-header-btn';
  settingsBtn.setAttribute('aria-label', 'Settings');
  settingsBtn.innerHTML = '&#9881;';
  settingsBtn.addEventListener('click', () => {
    openOptionsTab();
  });

  const themeBtn = document.createElement('button');
  themeBtn.className = 'popup-header-btn';
  themeBtn.setAttribute('aria-label', 'Toggle theme');
  themeBtn.textContent = getCurrentTheme() === 'dark' ? '\u2600' : '\u25CF';
  themeBtn.addEventListener('click', () => {
    toggleTheme();
    themeBtn.textContent = getCurrentTheme() === 'dark' ? '\u2600' : '\u25CF';
  });

  right.appendChild(settingsBtn);
  right.appendChild(themeBtn);
  header.appendChild(left);
  header.appendChild(right);
  return header;
}

function renderEmptyState() {
  const container = document.createElement('div');
  container.className = 'popup-empty';
  container.innerHTML = `
    <div class="popup-empty-icon">+</div>
    <div class="popup-empty-title">No profiles yet</div>
    <div class="popup-empty-subtitle">Upload a resume or create from scratch.</div>
    <button class="pf-button pf-button-primary" id="popup-new-profile-btn">+ New Profile</button>
  `;

  container.querySelector('#popup-new-profile-btn')?.addEventListener('click', () => {
    state.selectedFile = null;
    state.view = VIEW.UPLOAD;
    render();
  });

  return container;
}

function renderListView() {
  const container = document.createElement('div');
  const list = document.createElement('div');
  list.className = 'popup-profile-list';

  const sorted = [...state.profiles].sort((a, b) =>
    (b.updatedAt || '').localeCompare(a.updatedAt || '')
  );

  for (const profile of sorted) {
    const card = document.createElement('div');
    card.className = 'popup-profile-card';
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

    const main = document.createElement('div');
    main.className = 'popup-profile-main';
    main.innerHTML = `
      <div class="popup-profile-name">${escapeHtml(profile.name || 'Untitled profile')}</div>
      ${
        subtitle
          ? `<div class="popup-profile-subtitle">${escapeHtml(subtitle)}</div>`
          : '<div class="popup-profile-subtitle">Tap to edit or manage</div>'
      }
    `;

    const right = document.createElement('div');
    right.className = 'popup-profile-right';
    if (profile.isDefault) {
      const badge = document.createElement('span');
      badge.className = 'popup-badge-default';
      badge.textContent = 'Default';
      right.appendChild(badge);
    }

    const menuButton = document.createElement('button');
    menuButton.className = 'popup-menu-button';
    menuButton.innerHTML = '&#8943;';
    menuButton.addEventListener('click', (event) => {
      event.stopPropagation();
      openMenuForProfile(profile, menuButton);
    });

    right.appendChild(menuButton);

    card.appendChild(main);
    card.appendChild(right);

    card.addEventListener('click', () => {
      openEditorTab(profile.id);
    });

    list.appendChild(card);
  }

  container.appendChild(list);

  const ctaRow = document.createElement('div');
  ctaRow.style.marginTop = '8px';
  ctaRow.innerHTML = `
    <button class="pf-button pf-button-ghost" id="popup-new-profile-secondary">+ New Profile</button>
  `;
  container.appendChild(ctaRow);

  container.querySelector('#popup-new-profile-secondary')?.addEventListener('click', () => {
    state.selectedFile = null;
    state.view = VIEW.UPLOAD;
    render();
  });

  return container;
}

function renderUploadView() {
  const container = document.createElement('div');

  if (state.parsingMessage) {
    const errBox = document.createElement('div');
    errBox.className = 'popup-error-box';
    errBox.textContent = state.parsingMessage;
    const tryAgain = document.createElement('button');
    tryAgain.className = 'pf-button pf-button-ghost';
    tryAgain.style.marginTop = '6px';
    tryAgain.textContent = 'Try again';
    tryAgain.addEventListener('click', () => {
      state.parsingMessage = '';
      render();
    });
    errBox.appendChild(document.createElement('br'));
    errBox.appendChild(tryAgain);
    container.appendChild(errBox);
  }

  const dropzone = document.createElement('div');
  dropzone.className = 'popup-dropzone';
  dropzone.id = 'popup-dropzone';
  dropzone.innerHTML = `
    <div class="popup-dropzone-icon">\u2191</div>
    <div class="popup-dropzone-title">Drop your resume here</div>
    <div class="popup-dropzone-subtitle">PDF or DOCX, up to 5MB</div>
    <div class="popup-dropzone-browse" id="popup-browse-link">or browse files</div>
    <input id="popup-file-input" type="file" accept=".pdf,.docx" style="display:none" />
    <div class="popup-file-selected" id="popup-file-selected"></div>
    <div class="popup-create-link">
      <span id="popup-create-scratch-link">Create from scratch instead</span>
    </div>
  `;

  container.appendChild(dropzone);

  const dz = dropzone;
  const fileInput = dropzone.querySelector('#popup-file-input');
  const browse = dropzone.querySelector('#popup-browse-link');
  const selectedLabel = dropzone.querySelector('#popup-file-selected');

  const handleFile = (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Please choose a file smaller than 5MB.');
      return;
    }
    state.selectedFile = file;
    if (selectedLabel) {
      selectedLabel.textContent = `Selected: ${file.name}`;
    }
    startParsing(file);
  };

  dz.addEventListener('dragover', (event) => {
    event.preventDefault();
    dz.classList.add('drag-over');
  });
  dz.addEventListener('dragleave', (event) => {
    event.preventDefault();
    dz.classList.remove('drag-over');
  });
  dz.addEventListener('drop', (event) => {
    event.preventDefault();
    dz.classList.remove('drag-over');
    const file = event.dataTransfer?.files?.[0];
    handleFile(file);
  });

  browse?.addEventListener('click', () => {
    fileInput?.click();
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    handleFile(file);
  });

  dropzone.querySelector('#popup-create-scratch-link')?.addEventListener('click', () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL('options/options.html?mode=new'),
    });
    window.close();
  });

  return container;
}

function renderParsingView() {
  const method = state.parsingWithAI ? ' (AI)' : ' (local)';
  const container = document.createElement('div');
  container.className = 'popup-parsing';
  container.innerHTML = `
    <div class="popup-spinner"></div>
    <div class="popup-parsing-title">Parsing your resume${method}\u2026</div>
    <div class="popup-parsing-subtitle">${
      state.parsingMessage || 'This takes a few seconds.'
    }</div>
  `;
  return container;
}

function renderFooter() {
  const footer = document.createElement('div');
  footer.className = 'popup-footer';
  footer.innerHTML = `
    <div class="popup-footer-link" id="popup-manage-link">Manage Profiles \u2192</div>
    <div class="popup-footer-version">v1.0.0</div>
  `;

  footer.querySelector('#popup-manage-link')?.addEventListener('click', () => {
    openOptionsTab();
  });

  return footer;
}

async function startParsing(file) {
  state.view = VIEW.PARSING;
  state.parsingMessage = '';
  const settings = await getSettings();
  state.parsingWithAI = !!settings.aiParsingEnabled && !!String(settings.aiApiKey || '').trim();
  render();

  try {
    const { profile, usedAI } = await parseResumeFile(file);
    state.parsingWithAI = usedAI;
    if (state.view === VIEW.PARSING) render();
    if (!state.profiles.some((p) => p.isDefault)) {
      profile.isDefault = true;
    }
    await saveProfile(profile);
    await loadProfiles();

    openEditorTab(profile.id);

    setTimeout(() => {
      window.close();
    }, 200);
  } catch (e) {
    console.error('ProfileFill parse error:', e);
    state.parsingMessage =
      (e && (e.message || e.toString())) ||
      'Could not read this file. Please try another resume or create from scratch.';
    state.view = VIEW.UPLOAD;
    render();
  }
}

function openOptionsTab() {
  const url = chrome.runtime.getURL('options/options.html');
  chrome.tabs.create({ url });
}

function openEditorTab(id) {
  const url = chrome.runtime.getURL(`options/options.html?mode=edit&id=${encodeURIComponent(id)}`);
  chrome.tabs.create({ url });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function openMenuForProfile(profile, anchorEl) {
  const existing = document.querySelector('.popup-menu');
  if (existing) existing.remove();

  const rect = anchorEl.getBoundingClientRect();

  const menu = document.createElement('div');
  menu.className = 'popup-menu';
  menu.style.top = `${rect.bottom + window.scrollY}px`;
  menu.style.left = `${rect.right - 160 + window.scrollX}px`;

  menu.innerHTML = `
    <div class="popup-menu-item" data-action="edit">Edit in full page</div>
    <div class="popup-menu-item" data-action="set-default">${
      profile.isDefault ? 'Default profile' : 'Set as default'
    }</div>
    <div class="popup-menu-item" data-action="export">Export JSON</div>
    <div class="popup-menu-item danger" data-action="delete">Delete</div>
  `;

  menu.addEventListener('click', async (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const action = target.dataset.action;
    if (!action) return;
    event.stopPropagation();
    menu.remove();

    if (action === 'edit') {
      openEditorTab(profile.id);
    } else if (action === 'set-default' && !profile.isDefault) {
      await setDefaultProfile(profile.id);
      await loadProfiles();
      render();
    } else if (action === 'export') {
      await exportProfile(profile.id);
    } else if (action === 'delete') {
      const confirmed = window.confirm('Delete this profile? This cannot be undone.');
      if (confirmed) {
        await deleteProfile(profile.id);
        await loadProfiles();
        state.view = state.profiles.length ? VIEW.LIST : VIEW.EMPTY;
        render();
      }
    }
  });

  document.body.appendChild(menu);

  const onClickAway = (event) => {
    if (!menu.contains(event.target) && event.target !== anchorEl) {
      menu.remove();
      document.removeEventListener('click', onClickAway);
    }
  };

  setTimeout(() => {
    document.addEventListener('click', onClickAway);
  }, 0);
}
