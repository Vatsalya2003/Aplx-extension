// Generic form filling engine for ProfileFill
// Expects window.ProfileFillFieldMapper to be available (from utils/fieldMapper.js)

(function () {
  /**
   * Main entry point for filling the current page.
   * @param {Profile} profile
   * @param {{ attachResume?: boolean, attachCoverLetter?: boolean }} options
   * @returns {Promise<string>} summary
   */
  var PHONE_KEYS = ['phone', 'phoneNumber', 'countryCode', 'countryPhoneCode', 'phoneType', 'phoneDeviceType'];

  async function fill(profile, options = {}) {
    const root = document;
    const fields = collectFormControls(root);
    if (!fields.length) {
      return 'No fillable fields detected on this page.';
    }

    const fieldMapper = window.ProfileFillFieldMapper;
    const valueMap = buildValueMap(profile);

    let totalConsidered = 0;
    let filledCount = 0;
    const unmatched = [];

    // Fill only the first phone group (device type + country code + number)
    filledCount += await fillPhoneSection(profile);

    for (const field of fields) {
      const key = fieldMapper.classifyField(field.desc);
      if (!key) continue;

      totalConsidered++;

      if (PHONE_KEYS.indexOf(key) >= 0) {
        continue;
      }

      if (key === 'resume') {
        if (options.attachResume) {
          const success = await tryFillFileInput(field.el, profile);
          if (success) {
            filledCount++;
            highlightSuccess(field.el);
          } else {
            unmatched.push(field);
          }
        }
        continue;
      }

      if (key === 'coverLetter') {
        if (!options.attachCoverLetter) continue;
        const content = chooseCoverLetter(profile);
        if (!content) continue;
        const ok = setTextLike(field.el, content);
        if (ok) {
          filledCount++;
          highlightSuccess(field.el);
        }
        continue;
      }

      if (key === 'state') {
        const statePatterns = fieldMapper.FIELD_PATTERNS.state || { labels: ['state'], names: ['state'] };
        const scope = findPhoneFieldsInSameGroup(field.el);
        const ok = await fillSearchableDropdown(statePatterns, valueMap.state || '', null, scope);
        if (ok) filledCount++;
        else unmatched.push(field);
        continue;
      }

      if (key === 'country') {
        var countryDisplayMap = {
          US: ['United States', 'United States of America', 'USA'],
          UK: ['United Kingdom', 'Great Britain'],
          IN: ['India'],
          AU: ['Australia'],
          DE: ['Germany'],
          FR: ['France'],
          JP: ['Japan'],
          CN: ['China'],
        };
        const countryPatterns = fieldMapper.FIELD_PATTERNS.country || { labels: ['country'], names: ['country'] };
        const scope = findPhoneFieldsInSameGroup(field.el);
        const ok = await fillSearchableDropdown(countryPatterns, valueMap.country || '', countryDisplayMap, scope);
        if (ok) filledCount++;
        else unmatched.push(field);
        continue;
      }

      const value = valueMap[key] != null ? valueMap[key] : (key === 'postalCode' ? valueMap.pincode : null);
      if (value == null || value === '') {
        unmatched.push(field);
        continue;
      }

      const success = fillField(field.el, key, value, profile, options);
      if (success) {
        filledCount++;
        highlightSuccess(field.el);
      } else {
        unmatched.push(field);
      }
    }

    markUnmatched(unmatched);

    const summary = 'Filled ' + filledCount + '/' + (totalConsidered || fields.length) + ' detected fields.';
    return summary;
  }

  /**
   * @param {Document|HTMLElement} root
   */
  function collectFormControls(root) {
    const selectors = 'input, textarea, select, [contenteditable="true"]';
    const all = Array.from(root.querySelectorAll(selectors));
    const results = [];

    for (const el of all) {
      if (!isVisible(el)) continue;

      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || '').toLowerCase();

      if (tag === 'input') {
        if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;
      }

      const labelText = getLabelText(el);
      const name = el.getAttribute('name') || '';
      const id = el.id || '';
      const autocomplete = el.getAttribute('autocomplete') || '';
      const placeholder = el.getAttribute('placeholder') || '';
      const contextText = getContextText(el);

      results.push({
        el,
        desc: {
          labelText,
          name,
          id,
          autocomplete,
          type,
          placeholder,
          contextText,
          element: el,
        },
      });
    }

    return results;
  }

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return true;
  }

  function getLabelText(el) {
    const id = el.id;
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label && label.textContent) return label.textContent.trim();
    }
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.textContent) return parentLabel.textContent.trim();

    const ariaLabelledBy = el.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const parts = ariaLabelledBy.split(/\s+/);
      const texts = parts
        .map((pid) => document.getElementById(pid))
        .filter(Boolean)
        .map((n) => n.textContent || '');
      if (texts.length) return texts.join(' ').trim();
    }

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    return '';
  }

  function getContextText(el) {
    const container = el.closest('div, section, fieldset, li') || el.parentElement;
    if (!container) return '';
    const text = container.innerText || '';
    return text.slice(0, 160);
  }

  function elementMatchesPatterns(el, patterns) {
    const labelText = getLabelText(el).toLowerCase();
    const name = (el.getAttribute('name') || el.id || '').toLowerCase();
    const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
    const context = getContextText(el).toLowerCase();
    const text = (labelText + ' ' + name + ' ' + placeholder + ' ' + context).toLowerCase();
    if (patterns.labels) {
      for (const l of patterns.labels) {
        if (text.includes(l.toLowerCase())) return true;
      }
    }
    if (patterns.names) {
      for (const n of patterns.names) {
        if (name && name.includes(n.toLowerCase())) return true;
        if (text.includes(n.toLowerCase())) return true;
      }
    }
    return false;
  }

  function findFirstMatchingElementInScope(scope, selector, patterns) {
    try {
      const candidates = Array.from(scope.querySelectorAll(selector));
      for (const el of candidates) {
        if (!isVisible(el)) continue;
        if (elementMatchesPatterns(el, patterns)) return el;
      }
    } catch (e) {
      /* invalid selector */
    }
    return null;
  }

  function findFirstMatchingElement(selector, patterns) {
    return findFirstMatchingElementInScope(document, selector, patterns);
  }

  function findPhoneFieldsInSameGroup(phoneInput) {
    let container = phoneInput.parentElement;
    for (let i = 0; i < 8; i++) {
      if (!container || container === document.body) break;
      const tag = container.tagName ? container.tagName.toLowerCase() : '';
      const classAndId = ((container.className || '') + ' ' + (container.id || '')).toLowerCase();
      if (
        tag === 'fieldset' ||
        tag === 'section' ||
        tag === 'article' ||
        classAndId.includes('phone') ||
        classAndId.includes('group') ||
        classAndId.includes('section') ||
        classAndId.includes('row') ||
        classAndId.includes('block')
      ) {
        break;
      }
      container = container.parentElement;
    }
    return container || phoneInput.parentElement;
  }

  function hasNearbyDropdownIndicator(inputElement) {
    const parent = inputElement.parentElement;
    if (!parent) return false;
    const html = (parent.innerHTML || '').toLowerCase();
    return (
      html.includes('arrow') ||
      html.includes('dropdown') ||
      html.includes('combobox') ||
      html.includes('listbox') ||
      html.includes('chevron') ||
      html.includes('caret') ||
      parent.querySelector('[role="listbox"], [role="combobox"], [aria-haspopup], [aria-expanded], button[aria-label*="open"]') !== null
    );
  }

  async function fillCombobox(inputElement, possibleValues) {
    if (!possibleValues || !possibleValues.length) return;
    inputElement.focus();
    inputElement.dispatchEvent(new Event('focus', { bubbles: true }));
    setNativeValue(inputElement, '');
    await sleep(100);
    const searchText = possibleValues[0];
    setNativeValue(inputElement, searchText);
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    inputElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    inputElement.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    await sleep(400);
    const dropdownSelectors = [
      '[role="listbox"] [role="option"]',
      '[role="listbox"] li',
      'ul[role="listbox"] > li',
      '.option-list li',
      '.dropdown-option',
      '.select-option',
      '[data-automation-id="promptOption"]',
      '[data-automation-id="searchedValue"]',
      '[id*="option"]',
      '[id*="listbox"] [id*="option"]',
    ];
    let optionElements = [];
    for (const sel of dropdownSelectors) {
      try {
        optionElements = Array.from(document.querySelectorAll(sel));
        if (optionElements.length > 0) break;
      } catch (e) {
        /* skip */
      }
    }
    if (optionElements.length === 0) {
      const parent =
        inputElement.closest('[role="combobox"], [data-automation-id]')?.parentElement ||
        inputElement.parentElement?.parentElement?.parentElement;
      if (parent) {
        optionElements = Array.from(
          parent.querySelectorAll('li, [role="option"], [data-automation-id*="option"]')
        );
      }
    }
    if (optionElements.length > 0) {
      let bestOption = null;
      for (const candidate of possibleValues) {
        const candidateLower = (candidate || '').toLowerCase();
        bestOption = optionElements.find(function (el) {
          const text = (el.textContent || el.innerText || '').trim().toLowerCase();
          return text === candidateLower || text.startsWith(candidateLower) || candidateLower.startsWith(text) || text.includes(candidateLower) || candidateLower.includes(text);
        });
        if (bestOption) break;
      }
      if (!bestOption && optionElements.length > 0) bestOption = optionElements[0];
      if (bestOption) {
        bestOption.scrollIntoView({ block: 'nearest' });
        bestOption.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        await sleep(50);
        bestOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        bestOption.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        bestOption.click();
        await sleep(100);
        inputElement.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    } else {
      setNativeValue(inputElement, possibleValues[0]);
    }
  }

  var COUNTRY_CODE_DISPLAY_MAP = {
    '+1': ['United States', 'United States of America (+1)', 'US (+1)', 'USA'],
    '+44': ['United Kingdom', 'United Kingdom (+44)', 'UK (+44)'],
    '+91': ['India', 'India (+91)'],
    '+61': ['Australia', 'Australia (+61)'],
    '+49': ['Germany', 'Germany (+49)'],
    '+33': ['France', 'France (+33)'],
    '+81': ['Japan', 'Japan (+81)'],
    '+86': ['China', 'China (+86)'],
    '+971': ['UAE', 'United Arab Emirates (+971)'],
    '+353': ['Ireland', 'Ireland (+353)'],
    '+31': ['Netherlands', 'Netherlands (+31)'],
    '+34': ['Spain', 'Spain (+34)'],
    '+39': ['Italy', 'Italy (+39)'],
    '+55': ['Brazil', 'Brazil (+55)'],
    '+52': ['Mexico', 'Mexico (+52)'],
    '+65': ['Singapore', 'Singapore (+65)'],
    '+82': ['South Korea', 'Korea (+82)', 'South Korea (+82)'],
    '+90': ['Turkey', 'Turkey (+90)'],
  };

  async function fillSearchableDropdown(patterns, value, displayMap, scopeContainer) {
    if (!value) return false;
    var scope = scopeContainer || document;
    var element = findFirstMatchingElementInScope(
      scope,
      'select, input:not([type="hidden"]), [role="combobox"], [role="listbox"]',
      patterns
    );
    if (!element) return false;
    var tagName = element.tagName ? element.tagName.toLowerCase() : '';
    var role = (element.getAttribute('role') || '').toLowerCase();
    var ariaAuto = element.getAttribute('aria-autocomplete');
    var isNativeSelect = tagName === 'select';
    var isCombobox = role === 'combobox' || ariaAuto === 'list' || ariaAuto === 'both';
    var possibleValues = [];
    if (displayMap && displayMap[value]) {
      possibleValues = possibleValues.concat(displayMap[value]);
    }
    possibleValues.push(value);
    if (isNativeSelect) {
      var options = Array.from(element.options);
      var bestMatch = null;
      for (var i = 0; i < possibleValues.length; i++) {
        var candidate = possibleValues[i];
        bestMatch = options.find(function (opt) {
          var t = (opt.textContent || '').trim().toLowerCase();
          var v = (opt.value || '').trim().toLowerCase();
          var c = (candidate || '').toLowerCase();
          return t === c || v === c || t.includes(c) || c.includes(t);
        });
        if (bestMatch) break;
      }
      if (bestMatch) {
        element.value = bestMatch.value;
        dispatchInputEvents(element);
        return true;
      }
      return false;
    }
    if (isCombobox || hasNearbyDropdownIndicator(element)) {
      await fillCombobox(element, possibleValues);
      return true;
    }
    setNativeValue(element, value);
    return true;
  }

  async function fillPhoneSection(profile) {
    var personal = profile.personal || {};
    var phone = personal.phone || '';
    var countryCode = personal.countryCode || '+1';
    var phoneType = personal.phoneType || 'Mobile';
    if (!phone) return 0;
    var phoneNumberPatterns = {
      labels: ['phone number', 'phone', 'telephone', 'mobile number', 'cell phone'],
      names: ['phoneNumber', 'phone_number', 'phone', 'telephone', 'mobile'],
    };
    var firstPhoneInput = findFirstMatchingElement(
      'input[type="text"], input[type="tel"], input:not([type])',
      phoneNumberPatterns
    );
    if (!firstPhoneInput) return 0;
    var scope = findPhoneFieldsInSameGroup(firstPhoneInput);
    var filled = 0;
    var phoneTypePatterns = {
      labels: ['phone device type', 'phone type', 'device type', 'type'],
      names: ['phoneDeviceType', 'phone_device_type', 'phone_type', 'deviceType', 'phoneType'],
    };
    var phoneTypeSelect = findFirstMatchingElementInScope(scope, 'select', phoneTypePatterns);
    if (phoneTypeSelect) {
      var preferredTypes = [phoneType, 'Mobile', 'Home', 'Work'];
      var matched = false;
      for (var p = 0; p < preferredTypes.length; p++) {
        var opt = Array.from(phoneTypeSelect.options).find(function (o) {
          var text = (o.text || '').toLowerCase();
          var val = (o.value || '').toLowerCase();
          var pref = (preferredTypes[p] || '').toLowerCase();
          return text.includes(pref) || val.includes(pref);
        });
        if (opt && opt.value) {
          phoneTypeSelect.value = opt.value;
          dispatchInputEvents(phoneTypeSelect);
          filled++;
          matched = true;
          break;
        }
      }
      if (!matched) {
        var firstValid = Array.from(phoneTypeSelect.options).find(function (o) {
          return o.value;
        });
        if (firstValid) {
          phoneTypeSelect.value = firstValid.value;
          dispatchInputEvents(phoneTypeSelect);
          filled++;
        }
      }
    }
    var countryCodePatterns = {
      labels: ['country phone code', 'country code', 'phone code', 'dialing code'],
      names: ['countryPhoneCode', 'country_phone_code', 'country_code', 'dialingCode', 'phoneCountryCode'],
    };
    var ok = await fillSearchableDropdown(countryCodePatterns, countryCode, COUNTRY_CODE_DISPLAY_MAP, scope);
    if (ok) filled++;
    var cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');
    if (countryCode && cleanPhone.indexOf(countryCode.replace('+', '')) === 0) {
      cleanPhone = cleanPhone.slice(countryCode.replace('+', '').length);
    }
    if (cleanPhone.indexOf('+') === 0) {
      cleanPhone = cleanPhone.replace(/^\+\d{1,3}/, '');
    }
    setNativeValue(firstPhoneInput, cleanPhone);
    filled++;
    return filled;
  }

  function buildValueMap(profile) {
    const personal = profile.personal || {};
    const app = profile.applicationDefaults || {};

    const currentExp =
      (profile.experience || []).find((e) => e.isCurrentRole) || (profile.experience || [])[0] || {};

    return {
      firstName: personal.firstName || '',
      lastName: personal.lastName || '',
      fullName:
        [personal.firstName, personal.lastName].filter(Boolean).join(' ') ||
        profile.name ||
        '',
      email: personal.email || '',
      phone: personal.phone || '',
      countryCode: personal.countryCode || '',
      phoneType: personal.phoneType || '',
      address: personal.address || '',
      city: personal.city || '',
      state: personal.state || '',
      location: personal.location || '',
      country: personal.country || '',
      pincode: personal.pincode || '',
      postalCode: personal.pincode || '',
      linkedIn: personal.linkedIn || '',
      github: personal.github || '',
      portfolio: personal.portfolio || personal.website || '',
      company: currentExp.company || '',
      title: currentExp.title || '',
      salary: app.expectedSalary || '',
      startDate: app.availableStartDate || '',
      yearsExperience: app.yearsOfExperience || '',
      visaSponsorship: app.visaSponsorship || '',
      workAuthorization: app.workAuthorization || '',
      willingToRelocate: app.willingToRelocate || '',
      gender: app.gender || '',
      ethnicity: app.ethnicity || '',
      veteranStatus: app.veteranStatus || '',
      disabilityStatus: app.disabilityStatus || '',
      pronouns: app.pronouns || '',
    };
  }

  function fillField(el, key, value, profile, options) {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();

    if (tag === 'select') {
      return setSelectValue(el, value);
    }

    if (type === 'radio' || type === 'checkbox') {
      return setChoiceInput(el, key, value);
    }

    return setTextLike(el, value);
  }

  function setTextLike(el, value) {
    if (el.isContentEditable) {
      el.focus();
      el.textContent = value;
      dispatchInputEvents(el);
      return true;
    }

    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'input') {
      const proto =
        tag === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && typeof desc.set === 'function') {
        desc.set.call(el, value);
      } else {
        el.value = value;
      }
      dispatchInputEvents(el);
      return true;
    }

    return false;
  }

  function dispatchInputEvents(el) {
    ['input', 'change', 'blur'].forEach((type) => {
      const ev = new Event(type, { bubbles: true });
      el.dispatchEvent(ev);
    });
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function setNativeValue(element, value) {
    const tag = element.tagName ? element.tagName.toLowerCase() : '';
    const proto = tag === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && typeof desc.set === 'function') {
      desc.set.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setSelectValue(selectEl, targetValue) {
    const options = Array.from(selectEl.options);
    if (!options.length) return false;
    const normTarget = normalizeString(targetValue);

    let best = null;
    let bestScore = 0;

    for (const opt of options) {
      const text = normalizeString(opt.textContent || '');
      const value = normalizeString(opt.value || '');
      let score = 0;

      if (!normTarget) continue;

      if (text === normTarget || value === normTarget) score = 10;
      else if (text.includes(normTarget) || normTarget.includes(text)) score = 7;
      else if (value && normTarget.includes(value)) score = 5;

      if (score > bestScore) {
        bestScore = score;
        best = opt;
      }
    }

    if (!best) return false;

    const prev = selectEl.value;
    selectEl.value = best.value;
    if (selectEl.value !== prev) {
      const ev = new Event('change', { bubbles: true });
      selectEl.dispatchEvent(ev);
    }

    return true;
  }

  function setChoiceInput(inputEl, key, targetValue) {
    const name = inputEl.name;
    if (!name) {
      if (inputEl.type === 'checkbox') {
        const shouldCheck = matchBoolean(targetValue);
        if (shouldCheck === null) return false;
        if (inputEl.checked !== shouldCheck) {
          inputEl.checked = shouldCheck;
          dispatchInputEvents(inputEl);
        }
        return true;
      }
      return false;
    }

    const group = Array.from(
      document.querySelectorAll(`input[type="${inputEl.type}"][name="${CSS.escape(name)}"]`)
    );
    if (!group.length) return false;

    const normTarget = normalizeString(targetValue);
    let best = null;
    let bestScore = 0;

    for (const el of group) {
      const valueAttr = normalizeString(el.value || '');
      const label = getLabelText(el);
      const labelNorm = normalizeString(label);
      let score = 0;

      if (!normTarget) continue;

      if (valueAttr === normTarget || labelNorm === normTarget) score = 10;
      else if (valueAttr && normTarget.includes(valueAttr)) score = 7;
      else if (labelNorm && normTarget.includes(labelNorm)) score = 7;

      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }

    if (!best) {
      // For some boolean fields (yes/no) fall back to any radio with yes/no
      if (['visaSponsorship', 'willingToRelocate'].includes(key)) {
        for (const el of group) {
          const label = normalizeString(getLabelText(el));
          if (!label) continue;
          const wantYes = matchBoolean(targetValue);
          if (wantYes === null) continue;
          if (wantYes && (label.includes('yes') || label.includes('y'))) {
            best = el;
            break;
          }
          if (!wantYes && (label.includes('no') || label.includes('n'))) {
            best = el;
            break;
          }
        }
      }
    }

    if (!best) return false;

    if (!best.checked) {
      best.checked = true;
      dispatchInputEvents(best);
    }
    return true;
  }

  function matchBoolean(value) {
    const v = normalizeString(value);
    if (!v) return null;
    if (['yes', 'y', 'true'].includes(v)) return true;
    if (['no', 'n', 'false'].includes(v)) return false;
    return null;
  }

  async function tryFillFileInput(inputEl, profile) {
    if (!profile.resumeBase64) return false;

    const byteCharacters = atob(profile.resumeBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);

    const ext = (profile.resumeFileName || '').split('.').pop() || '';
    const lowerExt = ext.toLowerCase();
    let mime = 'application/octet-stream';
    if (lowerExt === 'pdf') mime = 'application/pdf';
    else if (lowerExt === 'docx') mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    const file = new File([byteArray], profile.resumeFileName || 'resume', { type: mime });

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    try {
      inputEl.files = dataTransfer.files;
      const ev = new Event('change', { bubbles: true });
      inputEl.dispatchEvent(ev);
      return true;
    } catch (e) {
      console.warn('Failed to set file input via DataTransfer', e);
      return false;
    }
  }

  function highlightSuccess(el) {
    const originalOutline = el.style.outline;
    const originalOffset = el.style.outlineOffset;
    el.style.outline = '2px solid rgba(52, 199, 89, 0.8)';
    el.style.outlineOffset = '1px';
    setTimeout(() => {
      el.style.outline = originalOutline;
      el.style.outlineOffset = originalOffset;
    }, 500);
  }

  function markUnmatched(unmatched) {
    for (const item of unmatched) {
      const el = item.el;
      const labelEl = findLabelElement(el);
      const target = labelEl || el;
      const dot = document.createElement('span');
      dot.style.display = 'inline-block';
      dot.style.width = '6px';
      dot.style.height = '6px';
      dot.style.borderRadius = '999px';
      dot.style.backgroundColor = '#ff9500';
      dot.style.marginLeft = '4px';
      target.insertAdjacentElement('afterend', dot);
    }
  }

  function findLabelElement(el) {
    const id = el.id;
    if (id) {
      const l = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (l) return l;
    }
    const parentLabel = el.closest('label');
    if (parentLabel) return parentLabel;
    return null;
  }

  function chooseCoverLetter(profile) {
    const list = profile.coverLetters || [];
    if (!list.length) return '';
    // For now choose the first; could be enhanced later to pick by name.
    return list[0].content || '';
  }

  function normalizeString(str) {
    return String(str || '').trim().toLowerCase();
  }

  // Expose globally
  window.ProfileFillFormFiller = {
    fill,
  };
})();

/**
 * @typedef {Object} Profile
 * @property {string} id
 * @property {string} name
 */

