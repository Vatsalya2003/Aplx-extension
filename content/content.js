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
  // Re-run after delays so SPAs (e.g. Workday) that load the form later still get the widget
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

  loadProfilesIntoWidget();
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

function toggleWidgetExpanded() {
  widgetState.expanded = !widgetState.expanded;
  renderWidget();
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
      <span class="pfw-pill-icon">
        <span class="pfw-pill-icon-inner"></span>
      </span>
      <span>Fill</span>
    `;
    pill.addEventListener('click', () => {
      widgetState.expanded = true;
      renderWidget();
    });
    container.appendChild(pill);
    setTimeout(() => pill.classList.remove('pfw-pulse-once'), 1000);
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'pfw-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'pfw-header';
  header.innerHTML = `
    <div class="pfw-title">ProfileFill</div>
    <div class="pfw-header-buttons">
      <button class="pfw-minimize-btn" aria-label="Collapse ProfileFill widget">&times;</button>
    </div>
  `;
  header.querySelector('.pfw-minimize-btn')?.addEventListener('click', () => {
    widgetState.expanded = false;
    renderWidget();
  });
  panel.appendChild(header);

  const prompt = document.createElement('div');
  prompt.className = 'pfw-summary';
  prompt.style.marginBottom = '6px';
  prompt.textContent = 'Want to fill this form? Select a profile and click Auto-Fill below.';
  panel.appendChild(prompt);

  const body = document.createElement('div');
  body.className = 'pfw-body';

  const list = document.createElement('div');
  list.className = 'pfw-profile-list';

  if (!widgetState.profiles.length) {
    const empty = document.createElement('div');
    empty.style.fontSize = '12px';
    empty.style.color = '#8e8e93';
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
      const subtitle = subtitleParts.join(' • ');

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

  // Attach options
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
    widgetState.lastFillSummary || 'ProfileFill never sends data to any server.';
  const manageLink = document.createElement('span');
  manageLink.className = 'pfw-footer-link';
  manageLink.textContent = 'Edit Profile →';
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
      console.warn('ProfileFill form filler not available on this page.');
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
    console.error('ProfileFill fill error', e);
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

