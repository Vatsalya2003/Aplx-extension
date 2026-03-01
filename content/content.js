// Content script: form detection + floating widget

const WIDGET_ID = 'profilefill-widget-root';

let widgetHost = null;
let widgetShadow = null;
let widgetState = {
  expanded: false,
  visible: false,
  profiles: [],
  selectedProfileId: null,
  attachResume: true,
  attachCoverLetter: false,
  selectedCoverLetterId: null,
  lastFillSummary: null,
  pillX: null,
  pillY: null,
  theme: 'light',
};

let detectionScheduled = false;
let detectionObserver = null;

init();

function init() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'PROFILEFILL_TOGGLE_WIDGET') {
      toggleWidgetVisibility();
    }
  });
}

function onReady() {
  scheduleDetection();
  setupMutationObserver();
  setTimeout(scheduleDetection, 1500);
  setTimeout(scheduleDetection, 4000);
  setTimeout(scheduleDetection, 6000);
  setTimeout(scheduleDetection, 10000);
}

function scheduleDetection() {
  if (detectionScheduled) return;
  detectionScheduled = true;
  setTimeout(() => {
    detectionScheduled = false;
    detectAndMaybeShowWidget();
  }, 500);
}

function setupMutationObserver() {
  try {
    detectionObserver = new MutationObserver(() => {
      scheduleDetection();
    });
    detectionObserver.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
    });
  } catch (e) {
    // ignore
  }
}

function detectAndMaybeShowWidget() {
  const forms = findCandidateForms();
  const likelyApp = isLikelyJobApplicationPage();
  const knownApplyUrl = isKnownApplyUrl();

  if (forms.length > 0) {
    if (!likelyApp && forms[0] === document.body) {
      const totalInputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select').length;
      if (totalInputs < 3) return;
    }
  } else if (!knownApplyUrl) {
    return;
  }

  ensureWidget();
  const wasVisible = widgetState.visible;
  widgetState.visible = true;
  if (!wasVisible) {
    widgetState.expanded = true;
  }
  renderWidget();
}

function isKnownApplyUrl() {
  const url = location.href.toLowerCase();
  const host = location.host.toLowerCase();
  if (!url.includes('/apply')) return false;
  const applyHosts = [
    'myworkdayjobs.com', 'workday.com', 'myworkday.com',
    'greenhouse.io', 'lever.co', 'ashbyhq.com', 'smartrecruiters',
    'jobvite', 'icims', 'taleo', 'workable', 'indeed.com',
  ];
  return applyHosts.some((h) => host.includes(h));
}

function isLikelyJobApplicationPage() {
  const url = location.href.toLowerCase();
  const host = location.host.toLowerCase();

  const hostSignals = [
    'greenhouse.io', 'lever.co', 'myworkdayjobs.com', 'workday.com',
    'ashbyhq.com', 'boards.greenhouse.io', 'jobs.lever.co', 'indeed.com',
    'linkedin.com', 'myworkday.com', 'google.com', 'smartrecruiters',
    'jobvite', 'icims', 'taleo', 'workable',
  ];
  if (hostSignals.some((h) => host.includes(h))) {
    return true;
  }

  const pathSignals = [
    '/apply', '/application', '/applications', '/careers', '/career',
    '/jobs', '/job/', '/opportunit', '/position', '/positions', '/recruit',
  ];
  if (pathSignals.some((p) => url.includes(p))) {
    return true;
  }

  const textSample = (document.body?.innerText || '').slice(0, 12000).toLowerCase();
  const keywords = [
    'job application', 'apply for this job', 'apply for this position',
    'submit your application', 'upload your resume', 'upload resume',
    'resume', 'cover letter', 'first name', 'last name', 'email address',
    'phone number', 'applicant',
  ];
  const matches = keywords.reduce(
    (count, kw) => (textSample.includes(kw) ? count + 1 : count),
    0
  );
  return matches >= 1;
}

function findCandidateForms() {
  const forms = Array.from(document.querySelectorAll('form'));
  const candidates = [];

  for (const form of forms) {
    const inputs = form.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'
    );
    if (inputs.length < 3) continue;

    const hasResumeInput = !!form.querySelector('input[type="file"]');
    const labelEls = form.querySelectorAll('label, [aria-label], .label, [class*="label"]');
    const labelsText = Array.from(labelEls)
      .map((el) => (el.textContent || el.getAttribute('aria-label') || ''))
      .join(' ')
      .toLowerCase();
    const formHtml = (form.innerHTML || '').toLowerCase();
    const keywordHits = ['resume', 'cv', 'cover letter', 'first name', 'last name', 'email', 'phone'].filter(
      (kw) => labelsText.includes(kw) || formHtml.includes(kw)
    ).length;

    if (hasResumeInput || keywordHits >= 1 || inputs.length >= 4) {
      candidates.push(form);
    }
  }

  if (!candidates.length) {
    const allInputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'
    );
    if (allInputs.length >= 3) {
      return [document.body];
    }
  }

  return candidates;
}

function ensureWidget() {
  if (widgetHost && widgetShadow) return;

  widgetHost = document.getElementById(WIDGET_ID);
  if (!widgetHost) {
    widgetHost = document.createElement('div');
    widgetHost.id = WIDGET_ID;
    document.documentElement.appendChild(widgetHost);
  }

  widgetShadow = widgetHost.attachShadow({ mode: 'open' });

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('content/content.css');
  widgetShadow.appendChild(link);

  const container = document.createElement('div');
  container.className = 'pfw-root';
  container.id = 'pfw-root-inner';
  widgetShadow.appendChild(container);

  loadWidgetTheme();
  loadProfilesIntoWidget();
}

async function loadWidgetTheme() {
  try {
    const { profilefill_widget_theme } = await chrome.storage.local.get(['profilefill_widget_theme']);
    if (profilefill_widget_theme === 'dark' || profilefill_widget_theme === 'light') {
      widgetState.theme = profilefill_widget_theme;
      applyWidgetTheme();
    }
  } catch (e) {
    // ignore
  }
}

function applyWidgetTheme() {
  if (!widgetShadow) return;
  const root = widgetShadow.getElementById('pfw-root-inner');
  if (!root) return;
  root.classList.toggle('pfw-dark', widgetState.theme === 'dark');
}

function toggleWidgetTheme() {
  widgetState.theme = widgetState.theme === 'dark' ? 'light' : 'dark';
  chrome.storage.local.set({ profilefill_widget_theme: widgetState.theme });
  applyWidgetTheme();
  renderWidget();
}

async function loadProfilesIntoWidget() {
  try {
    const { profiles } = await chrome.storage.local.get(['profiles']);
    widgetState.profiles = Array.isArray(profiles) ? profiles : [];
    if (!widgetState.selectedProfileId && widgetState.profiles.length) {
      const defaultProfile = widgetState.profiles.find((p) => p.isDefault);
      widgetState.selectedProfileId = (defaultProfile || widgetState.profiles[0]).id;
    }
    renderWidget();
  } catch (e) {
    // ignore
  }
}

function toggleWidgetVisibility() {
  ensureWidget();
  widgetState.visible = !widgetState.visible;
  renderWidget();
}

function applyPosition(container) {
  if (widgetState.pillX != null && widgetState.pillY != null) {
    container.style.left = widgetState.pillX + 'px';
    container.style.top = widgetState.pillY + 'px';
    container.style.right = 'auto';
    container.style.bottom = 'auto';
  } else {
    container.style.right = '20px';
    container.style.bottom = '20px';
    container.style.left = 'auto';
    container.style.top = 'auto';
  }
}

function makePillDraggable(pillElement, container) {
  let hasMoved = false;
  let startX, startY, startPillX, startPillY;

  function onPointerDown(e) {
    if (e.button && e.button !== 0) return;
    e.preventDefault();

    hasMoved = false;
    startX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    startY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;

    const rect = container.getBoundingClientRect();
    startPillX = rect.left;
    startPillY = rect.top;

    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);
    document.addEventListener('touchmove', onPointerMove, { passive: false });
    document.addEventListener('touchend', onPointerUp);
  }

  function onPointerMove(e) {
    e.preventDefault();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    const dx = clientX - startX;
    const dy = clientY - startY;

    if (!hasMoved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    hasMoved = true;

    pillElement.classList.add('dragging');

    let newX = startPillX + dx;
    let newY = startPillY + dy;

    const pillW = pillElement.offsetWidth || 80;
    const pillH = pillElement.offsetHeight || 40;
    newX = Math.max(0, Math.min(window.innerWidth - pillW, newX));
    newY = Math.max(0, Math.min(window.innerHeight - pillH, newY));

    container.style.left = newX + 'px';
    container.style.top = newY + 'px';
    container.style.right = 'auto';
    container.style.bottom = 'auto';
  }

  function onPointerUp() {
    document.removeEventListener('mousemove', onPointerMove);
    document.removeEventListener('mouseup', onPointerUp);
    document.removeEventListener('touchmove', onPointerMove);
    document.removeEventListener('touchend', onPointerUp);

    pillElement.classList.remove('dragging');

    if (hasMoved) {
      const rect = container.getBoundingClientRect();
      widgetState.pillX = rect.left;
      widgetState.pillY = rect.top;
    } else {
      widgetState.expanded = true;
      renderWidget();
    }
  }

  pillElement.addEventListener('mousedown', onPointerDown);
  pillElement.addEventListener('touchstart', onPointerDown, { passive: false });
}

function renderWidget() {
  if (!widgetShadow) return;
  const container = widgetShadow.getElementById('pfw-root-inner');
  if (!container) return;

  if (!widgetState.visible) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  container.innerHTML = '';

  if (!widgetState.expanded) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'pfw-pill pfw-pulse-once';
    pill.innerHTML = `
      <img src="${chrome.runtime.getURL('assets/Applix_logo.png')}" alt="" class="pfw-pill-logo" />
      <span>Fill</span>
    `;

    applyPosition(container);
    container.appendChild(pill);
    makePillDraggable(pill, container);

    setTimeout(() => pill.classList.remove('pfw-pulse-once'), 1000);
    return;
  }

  // Position expanded panel near the pill location
  if (widgetState.pillX != null && widgetState.pillY != null) {
    let panelX = widgetState.pillX;
    let panelY = widgetState.pillY;
    const panelW = 300;
    const panelH = 420;

    if (panelX + panelW > window.innerWidth) {
      panelX = window.innerWidth - panelW - 12;
    }
    if (panelX < 0) panelX = 12;
    if (panelY + panelH > window.innerHeight) {
      panelY = window.innerHeight - panelH - 12;
    }
    if (panelY < 0) panelY = 12;

    container.style.left = panelX + 'px';
    container.style.top = panelY + 'px';
    container.style.right = 'auto';
    container.style.bottom = 'auto';
  } else {
    container.style.right = '20px';
    container.style.bottom = '20px';
    container.style.left = 'auto';
    container.style.top = 'auto';
  }

  const panel = document.createElement('div');
  panel.className = 'pfw-panel';

  const header = document.createElement('div');
  header.className = 'pfw-header';
  const themeIcon = widgetState.theme === 'dark' ? '\u2600' : '\u25CF';
  header.innerHTML = `
    <div class="pfw-header-left">
      <img src="${chrome.runtime.getURL('assets/Applix_logo.png')}" alt="" class="pfw-header-logo" />
      <span class="pfw-title">Applix</span>
    </div>
    <div class="pfw-header-buttons">
      <button class="pfw-theme-btn" aria-label="Toggle theme">${themeIcon}</button>
      <button class="pfw-minimize-btn" aria-label="Collapse widget">&times;</button>
    </div>
  `;
  header.querySelector('.pfw-theme-btn')?.addEventListener('click', () => {
    toggleWidgetTheme();
  });
  header.querySelector('.pfw-minimize-btn')?.addEventListener('click', () => {
    widgetState.expanded = false;
    renderWidget();
  });
  panel.appendChild(header);

  const prompt = document.createElement('div');
  prompt.className = 'pfw-summary';
  prompt.style.marginBottom = '6px';
  prompt.textContent = 'Select a profile and click Auto-Fill below.';
  panel.appendChild(prompt);

  const body = document.createElement('div');
  body.className = 'pfw-body';

  const list = document.createElement('div');
  list.className = 'pfw-profile-list';

  if (!widgetState.profiles.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:12px;color:#6b7280;padding:8px 0;';
    empty.textContent = 'No profiles found. Create one from the extension popup.';
    list.appendChild(empty);
  } else {
    const sorted = [...widgetState.profiles].sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });

    for (const profile of sorted) {
      const card = document.createElement('div');
      card.className = 'pfw-profile-card';
      if (profile.id === widgetState.selectedProfileId) {
        card.classList.add('selected');
      }

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
      main.className = 'pfw-profile-main';
      main.innerHTML = `
        <div class="pfw-profile-name">${escapeHtml(profile.name || 'Untitled profile')}</div>
        ${
          subtitle
            ? `<div class="pfw-profile-subtitle">${escapeHtml(subtitle)}</div>`
            : '<div class="pfw-profile-subtitle">Tap to select</div>'
        }
      `;

      const right = document.createElement('div');
      if (profile.isDefault) {
        const badge = document.createElement('span');
        badge.className = 'pfw-badge-default';
        badge.textContent = 'Default';
        right.appendChild(badge);
      }

      card.appendChild(main);
      card.appendChild(right);

      card.addEventListener('click', () => {
        widgetState.selectedProfileId = profile.id;
        renderWidget();
      });

      list.appendChild(card);
    }
  }

  body.appendChild(list);

  const rowAttachResume = document.createElement('div');
  rowAttachResume.className = 'pfw-row';
  rowAttachResume.innerHTML = `<span>Attach resume</span>`;
  const toggleResume = createToggle(widgetState.attachResume);
  toggleResume.addEventListener('click', () => {
    widgetState.attachResume = !widgetState.attachResume;
    renderWidget();
  });
  rowAttachResume.appendChild(toggleResume);
  body.appendChild(rowAttachResume);

  const rowAttachCL = document.createElement('div');
  rowAttachCL.className = 'pfw-row';
  rowAttachCL.innerHTML = `<span>Attach cover letter</span>`;
  const toggleCL = createToggle(widgetState.attachCoverLetter);
  toggleCL.addEventListener('click', () => {
    widgetState.attachCoverLetter = !widgetState.attachCoverLetter;
    renderWidget();
  });
  rowAttachCL.appendChild(toggleCL);
  body.appendChild(rowAttachCL);

  const primaryBtn = document.createElement('button');
  primaryBtn.type = 'button';
  primaryBtn.className = 'pfw-primary-btn';
  primaryBtn.textContent = 'Auto-Fill Application';
  primaryBtn.disabled = !widgetState.selectedProfileId || !widgetState.profiles.length;
  primaryBtn.addEventListener('click', onAutoFillClick);
  body.appendChild(primaryBtn);

  panel.appendChild(body);

  const footer = document.createElement('div');
  footer.className = 'pfw-footer';
  const summary = document.createElement('div');
  summary.className = 'pfw-summary';
  summary.textContent =
    widgetState.lastFillSummary || 'Data stays in your browser.';
  const manageLink = document.createElement('span');
  manageLink.className = 'pfw-footer-link';
  manageLink.textContent = 'Edit Profile \u2192';
  manageLink.addEventListener('click', () => {
    if (!widgetState.selectedProfileId) return;
    chrome.runtime.sendMessage({
      type: 'PROFILEFILL_OPEN_PROFILE',
      id: widgetState.selectedProfileId,
    });
  });

  footer.appendChild(summary);
  footer.appendChild(manageLink);
  panel.appendChild(footer);

  container.appendChild(panel);
  applyWidgetTheme();
}

function createToggle(on) {
  const wrapper = document.createElement('div');
  wrapper.className = 'pfw-toggle' + (on ? ' on' : '');
  const thumb = document.createElement('div');
  thumb.className = 'pfw-toggle-thumb';
  wrapper.appendChild(thumb);
  return wrapper;
}

async function onAutoFillClick() {
  if (!widgetState.selectedProfileId) return;
  const profile = widgetState.profiles.find((p) => p.id === widgetState.selectedProfileId);
  if (!profile) return;

  try {
    if (!window.ProfileFillFormFiller || typeof window.ProfileFillFormFiller.fill !== 'function') {
      console.warn('Applix form filler not available on this page.');
      widgetState.lastFillSummary = 'Form fill engine not available on this page.';
      renderWidget();
      return;
    }

    const summary = await window.ProfileFillFormFiller.fill(profile, {
      attachResume: widgetState.attachResume,
      attachCoverLetter: widgetState.attachCoverLetter,
    });

    widgetState.lastFillSummary =
      summary || 'Attempted to fill application. Review fields before submitting.';
    renderWidget();
  } catch (e) {
    console.error('Applix fill error', e);
    widgetState.lastFillSummary =
      'Something went wrong while filling. Please review fields manually.';
    renderWidget();
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
