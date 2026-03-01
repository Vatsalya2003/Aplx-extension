// Generic form filling engine for aplx
// Expects window.ProfileFillFieldMapper to be available (from utils/fieldMapper.js)

(function () {
  /**
   * Main entry point for filling the current page.
   * @param {Profile} profile
   * @param {{ attachResume?: boolean, attachCoverLetter?: boolean }} options
   * @returns {Promise<string>} summary
   */
  var PHONE_KEYS = ['phone', 'phoneNumber', 'countryCode', 'countryPhoneCode', 'phoneType', 'phoneDeviceType', 'phoneExtension'];

  var EEO_VALUE_MAPS = {
    veteranStatus: {
      'I am not a veteran': [
        'I am not a veteran',
        'I am not a protected veteran',
        'I am Not a Protected Veteran',
        'Not a protected veteran',
        'Not a veteran',
        'No',
      ],
      'I identify as one or more of the classifications of protected veterans': [
        'I identify as one or more of the classifications of protected veterans',
        'I identify as one or more of the classifications of a protected veteran',
        'I identify as a protected veteran',
        'I am a protected veteran',
        'Protected veteran',
        'Yes',
      ],
      'I identify as a veteran, just not a protected veteran': [
        'I identify as a veteran, just not a protected veteran',
        'I am a veteran but not a protected veteran',
        'Veteran, not protected',
      ],
      'I do not want to answer': [
        'I do not want to answer',
        'I don\'t wish to answer',
        'I do not wish to answer',
        'Prefer not to say',
        'Decline to self-identify',
        'Decline',
        'Choose not to disclose',
      ],
    },
    disabilityStatus: {
      'Yes, I have a disability, or have had one in the past': [
        'Yes, I have a disability, or have had one in the past',
        'Yes, I have a disability (or previously had a disability)',
        'Yes, I Have A Disability, Or Have A History/Record Of Having A Disability',
        'I have a disability',
        'Yes, I have a disability',
        'Yes',
      ],
      'No, I do not have a disability and have not had one in the past': [
        'No, I do not have a disability and have not had one in the past',
        'No, I Don\'t Have A Disability, Or A History/Record Of Having A Disability',
        'No, I don\'t have a disability',
        'I do not have a disability',
        'No',
      ],
      'I do not want to answer': [
        'I do not want to answer',
        'I don\'t wish to answer',
        'I do not wish to answer',
        'Prefer not to say',
        'Decline to self-identify',
        'Decline To Self Identify',
        'Decline',
      ],
    },
    gender: {
      'Male': ['Male', 'Man', 'M'],
      'Female': ['Female', 'Woman', 'F'],
      'Non-binary': ['Non-binary', 'Non-Binary', 'Nonbinary', 'Genderqueer'],
      'Other': ['Other', 'Self-describe', 'Not listed'],
      'Prefer not to say': ['Prefer not to say', 'Decline to self-identify', 'Decline'],
    },
  };

  var EEO_KEYS = ['veteranStatus', 'disabilityStatus', 'gender', 'ethnicity'];

  function getEEOValues(key, profileValue) {
    if (!profileValue || !EEO_VALUE_MAPS[key]) return [profileValue];

    var map = EEO_VALUE_MAPS[key];
    for (var category in map) {
      if (map.hasOwnProperty(category)) {
        var variations = map[category];
        var allValues = [category].concat(variations);
        for (var i = 0; i < allValues.length; i++) {
          if (allValues[i].toLowerCase().trim() === profileValue.toLowerCase().trim()) {
            return allValues;
          }
        }
      }
    }
    return [profileValue];
  }

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
    const filledEls = new Set();

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
            filledEls.add(field.el);
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
          filledEls.add(field.el);
          highlightSuccess(field.el);
        }
        continue;
      }

      if (key === 'state') {
        const stateValue = valueMap.state || '';
        if (stateValue) {
          const ok = await fillDropdownElement(field.el, [stateValue]);
          if (ok) { filledCount++; filledEls.add(field.el); highlightSuccess(field.el); }
          else unmatched.push(field);
        } else {
          unmatched.push(field);
        }
        continue;
      }

      if (key === 'country') {
        var countryDisplayMap = {
          US: ['United States of America', 'United States', 'USA'],
          UK: ['United Kingdom', 'Great Britain'],
          IN: ['India'],
          AU: ['Australia'],
          DE: ['Germany'],
          FR: ['France'],
          JP: ['Japan'],
          CN: ['China'],
          CA: ['Canada'],
          SG: ['Singapore'],
          AE: ['United Arab Emirates', 'UAE'],
          IE: ['Ireland'],
          NL: ['Netherlands'],
          ES: ['Spain'],
          IT: ['Italy'],
          BR: ['Brazil'],
          MX: ['Mexico'],
          KR: ['South Korea', 'Korea'],
          TR: ['Turkey', 'Türkiye'],
        };
        const countryValue = valueMap.country || '';
        if (countryValue) {
          var possibleCountries = [];
          if (countryDisplayMap[countryValue]) {
            possibleCountries = possibleCountries.concat(countryDisplayMap[countryValue]);
          }
          possibleCountries.push(countryValue);
          const ok = await fillDropdownElement(field.el, possibleCountries);
          if (ok) { filledCount++; filledEls.add(field.el); highlightSuccess(field.el); }
          else unmatched.push(field);
        } else {
          unmatched.push(field);
        }
        continue;
      }

      if (key === 'visaSponsorship') {
        const rawValue = valueMap.visaSponsorship;
        if (rawValue) {
          const context = (field.desc.contextText || field.desc.labelText || '').toLowerCase();
          const isInverted = context.includes('without visa sponsorship') ||
            context.includes('without sponsorship') ||
            (context.includes('eligible to work') && context.includes('sponsorship'));
          let fillValue = rawValue;
          if (isInverted) {
            const wants = matchBoolean(rawValue);
            if (wants === true) fillValue = 'No';
            else if (wants === false) fillValue = 'Yes';
          }
          const ok = fillField(field.el, key, fillValue, profile, options);
          if (ok) { filledCount++; filledEls.add(field.el); highlightSuccess(field.el); }
          else unmatched.push(field);
        } else {
          unmatched.push(field);
        }
        continue;
      }

      if (key === 'workplacePolicy') {
        const ok = fillField(field.el, key, 'Yes', profile, options);
        if (ok) { filledCount++; filledEls.add(field.el); highlightSuccess(field.el); }
        else unmatched.push(field);
        continue;
      }

      if (key === 'veteranStatus' || key === 'disabilityStatus') {
        const storedValue = valueMap[key] || '';
        if (!storedValue) { continue; }
        const tag = field.el.tagName.toLowerCase();
        const type = (field.el.getAttribute('type') || '').toLowerCase();
        const role = (field.el.getAttribute('role') || '').toLowerCase();
        const hasPopup = field.el.hasAttribute('aria-haspopup');
        const valuesToTry = getEEOValues(key, storedValue);
        let filled = false;
        if (tag === 'select') {
          for (var vi = 0; vi < valuesToTry.length && !filled; vi++) {
            filled = setSelectValue(field.el, valuesToTry[vi]);
          }
        } else if (type === 'radio' || type === 'checkbox') {
          for (var vi = 0; vi < valuesToTry.length && !filled; vi++) {
            filled = fillChoiceByLabel(field.el, valuesToTry[vi]);
          }
        } else if (role === 'combobox' || role === 'listbox' || hasPopup ||
                   tag === 'button' || hasNearbyDropdownIndicator(field.el)) {
          filled = await fillDropdownElement(field.el, valuesToTry);
        } else {
          for (var vi = 0; vi < valuesToTry.length && !filled; vi++) {
            filled = fillField(field.el, key, valuesToTry[vi], profile, options);
          }
        }
        if (filled) { filledCount++; filledEls.add(field.el); highlightSuccess(field.el); }
        else unmatched.push(field);
        continue;
      }

      const value = valueMap[key] != null ? valueMap[key] : (key === 'postalCode' ? valueMap.pincode : null);
      if (value == null || value === '') {
        continue;
      }

      const success = fillField(field.el, key, value, profile, options);
      if (success) {
        filledCount++;
        filledEls.add(field.el);
        highlightSuccess(field.el);
      } else {
        unmatched.push(field);
      }
    }

    // Fallback: scan the entire page for state/country dropdowns that may have
    // been missed (Workday uses custom button comboboxes the main loop can miss)
    filledCount += await fillMissedDropdownFields(valueMap, filledEls);

    // Fallback: scan for disability/veteran checkboxes missed by the main loop
    filledCount += fillMissedCheckboxFields(valueMap, filledEls);

    // Fallback: fill signature date fields on EEO / disability / veteran forms
    filledCount += fillSignatureDateFields(filledEls);

    markUnmatched(unmatched);

    const summary = 'Filled ' + filledCount + '/' + (totalConsidered || fields.length) + ' detected fields.';
    return summary;
  }

  async function fillMissedDropdownFields(valueMap, filledEls) {
    var filled = 0;
    var processedEls = filledEls;

    var dropdownConfigs = [
      { value: valueMap.state || '', keywords: ['state', 'state/province', 'province'] },
      { value: valueMap.country || '', keywords: ['country', 'country/region'] },
      { value: valueMap.visaSponsorship || '', keywords: ['visa sponsorship', 'sponsorship', 'eligible to work'] },
      { value: valueMap.workAuthorization || '', keywords: ['work authorization', 'authorized to work', 'legally authorized'] },
      { value: 'Yes', keywords: ['agree to comply', 'workplace polic', 'drug free', 'tobacco', 'background check'] },
      { value: valueMap.veteranStatus || '', keywords: ['veteran', 'veteran status', 'protected veteran'], eeoKey: 'veteranStatus' },
      { value: valueMap.disabilityStatus || '', keywords: ['disability', 'disability status'], eeoKey: 'disabilityStatus' },
    ];

    for (var c = 0; c < dropdownConfigs.length; c++) {
      var config = dropdownConfigs[c];
      if (!config.value) continue;

      var candidates = Array.from(document.querySelectorAll(
        'select, [role="combobox"], button[aria-haspopup="listbox"], button[aria-haspopup="true"]'
      ));

      for (var d = 0; d < candidates.length; d++) {
        var el = candidates[d];
        if (processedEls.has(el)) continue;

        var label = getLabelText(el).toLowerCase();
        var ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        var context = getContextText(el).toLowerCase();
        var name = (el.getAttribute('name') || el.id || '').toLowerCase();
        var allText = label + ' ' + ariaLabel + ' ' + name + ' ' + context;

        var matches = config.keywords.some(function(kw) { return allText.includes(kw); });
        if (!matches) continue;

        var currentVal = (el.value || el.textContent || '').trim().toLowerCase();
        if (currentVal && currentVal !== 'select one' && currentVal !== 'select' &&
            currentVal !== '--' && currentVal !== '' && currentVal !== 'choose') {
          continue;
        }

        console.log('aplx fallback: Found missed dropdown for "' + config.keywords[0] + '":', el.tagName, label);
        var tryValues = config.eeoKey ? getEEOValues(config.eeoKey, config.value) : [config.value];
        var ok = await fillDropdownElement(el, tryValues);
        if (ok) {
          highlightSuccess(el);
          filled++;
          processedEls.add(el);
          break;
        }
      }
    }

    return filled;
  }

  function fillMissedCheckboxFields(valueMap, filledEls) {
    var processedEls = filledEls;
    var filled = 0;

    var checkboxConfigs = [
      { value: valueMap.disabilityStatus || '', sectionKeywords: ['disability', 'check one of the boxes'], eeoKey: 'disabilityStatus' },
      { value: valueMap.veteranStatus || '', sectionKeywords: ['veteran', 'self-identify'], eeoKey: 'veteranStatus' },
    ];

    for (var c = 0; c < checkboxConfigs.length; c++) {
      var config = checkboxConfigs[c];
      if (!config.value) continue;

      var valuesToTry = getEEOValues(config.eeoKey, config.value);
      var allCheckboxes = Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]'));

      var best = null;
      var bestScore = 0;

      for (var vi = 0; vi < valuesToTry.length; vi++) {
        var normTarget = normalizeString(valuesToTry[vi]);
        if (!normTarget) continue;

        for (var i = 0; i < allCheckboxes.length; i++) {
          var el = allCheckboxes[i];
          if (processedEls.has(el)) continue;
          if (el.checked) continue;

          var label = normalizeString(getLabelText(el));
          var context = normalizeString(getContextText(el));
          var sectionMatch = config.sectionKeywords.some(function(kw) { return context.includes(kw); });
          if (!sectionMatch) continue;

          var score = 0;
          if (label === normTarget) score = 100;
          else if (label.startsWith(normTarget) || normTarget.startsWith(label)) score = 80;
          else if (label && label.includes(normTarget) && normTarget.length > 5) score = 70;
          else if (label && normTarget.includes(label) && label.length > 5) score = 60;
          else {
            var targetWords = normTarget.split(/\s+/).filter(function(w) { return w.length > 2; });
            var labelWords = label.split(/\s+/).filter(function(w) { return w.length > 2; });
            var matchingWords = 0;
            for (var tw = 0; tw < targetWords.length; tw++) {
              for (var lw = 0; lw < labelWords.length; lw++) {
                if (targetWords[tw] === labelWords[lw] ||
                    labelWords[lw].includes(targetWords[tw]) ||
                    targetWords[tw].includes(labelWords[lw])) {
                  matchingWords++;
                  break;
                }
              }
            }
            if (targetWords.length > 0 && matchingWords > 0) {
              score = Math.round((matchingWords / Math.max(targetWords.length, 1)) * 45);
            }
          }

          if (score > bestScore) { bestScore = score; best = el; }
        }
      }

      if (best && bestScore >= 20) {
        best.checked = true;
        dispatchInputEvents(best);
        highlightSuccess(best);
        processedEls.add(best);
        filled++;
      }
    }

    return filled;
  }

  function fillSignatureDateFields(filledEls) {
    var processedEls = filledEls;
    var filled = 0;

    var pageText = (document.body?.innerText || '').toLowerCase();
    var isEEOPage = pageText.includes('disability') || pageText.includes('veteran') ||
      pageText.includes('self-identification') || pageText.includes('eeo') ||
      pageText.includes('equal employment') || pageText.includes('cc-305');
    if (!isEEOPage) return 0;

    var allInputs = Array.from(document.querySelectorAll('input'));
    for (var i = 0; i < allInputs.length; i++) {
      var el = allInputs[i];
      if (processedEls.has(el)) continue;

      var type = (el.getAttribute('type') || '').toLowerCase();
      if (type !== 'date' && type !== 'text' && type !== '') continue;

      var label = normalizeString(getLabelText(el));
      var name = normalizeString(el.getAttribute('name') || el.id || '');
      var placeholder = normalizeString(el.getAttribute('placeholder') || '');

      var isDateField = (label === 'date' || label === 'today\'s date' || label === 'signature date' ||
        name.includes('date') || name.includes('signature'));
      var isStartDate = label.includes('start') || label.includes('available') || label.includes('earliest') ||
        name.includes('start') || name.includes('available');
      if (!isDateField || isStartDate) continue;

      if (el.value && el.value.trim()) continue;

      var now = new Date();
      var dateValue;
      if (type === 'date') {
        dateValue = now.getFullYear() + '-' +
          String(now.getMonth() + 1).padStart(2, '0') + '-' +
          String(now.getDate()).padStart(2, '0');
      } else {
        dateValue = String(now.getMonth() + 1).padStart(2, '0') + '/' +
          String(now.getDate()).padStart(2, '0') + '/' +
          now.getFullYear();
      }

      var proto = window.HTMLInputElement.prototype;
      var desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && typeof desc.set === 'function') {
        desc.set.call(el, dateValue);
      } else {
        el.value = dateValue;
      }
      dispatchInputEvents(el);
      highlightSuccess(el);
      processedEls.add(el);
      filled++;
    }

    return filled;
  }

  /**
   * @param {Document|HTMLElement} root
   */
  function collectFormControls(root) {
    const selectors = [
      'input',
      'textarea',
      'select',
      '[contenteditable="true"]',
      '[role="combobox"]',
      'button[aria-haspopup="listbox"]',
      'button[aria-haspopup="true"]',
    ].join(', ');
    const all = Array.from(root.querySelectorAll(selectors));
    const seen = new Set();
    const results = [];

    for (const el of all) {
      if (seen.has(el)) continue;
      seen.add(el);

      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || '').toLowerCase();
      const role = (el.getAttribute('role') || '').toLowerCase();
      const hasAriaPopup = el.hasAttribute('aria-haspopup');

      if (tag === 'input') {
        if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;
      }

      // Combobox/haspopup elements are always interactive even if CSS-hidden
      var isInteractiveRole = role === 'combobox' || hasAriaPopup;
      if (!isInteractiveRole && !isVisible(el)) continue;

      const labelText = getLabelText(el);
      const name = el.getAttribute('name') || '';
      const id = el.id || '';
      const autocomplete = el.getAttribute('autocomplete') || '';
      const placeholder = el.getAttribute('placeholder') || el.textContent?.trim()?.slice(0, 80) || '';
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
    '+1': ['United States of America', 'United States of America (+1)', 'United States', 'US (+1)', 'USA'],
    '+1CA': ['Canada', 'Canada (+1)'],
    '+44': ['United Kingdom', 'United Kingdom (+44)', 'UK (+44)'],
    '+91': ['India', 'India (+91)'],
    '+61': ['Australia', 'Australia (+61)'],
    '+49': ['Germany', 'Germany (+49)'],
    '+33': ['France', 'France (+33)'],
    '+81': ['Japan', 'Japan (+81)'],
    '+86': ['China', 'China (+86)'],
    '+971': ['United Arab Emirates', 'United Arab Emirates (+971)', 'UAE'],
    '+353': ['Ireland', 'Ireland (+353)'],
    '+31': ['Netherlands', 'Netherlands (+31)'],
    '+34': ['Spain', 'Spain (+34)'],
    '+39': ['Italy', 'Italy (+39)'],
    '+55': ['Brazil', 'Brazil (+55)'],
    '+52': ['Mexico', 'Mexico (+52)'],
    '+65': ['Singapore', 'Singapore (+65)'],
    '+82': ['South Korea', 'South Korea (+82)', 'Korea (+82)'],
    '+90': ['Turkey', 'Turkey (+90)', 'Türkiye'],
    '+27': ['South Africa', 'South Africa (+27)'],
  };

  async function fillDropdownElement(element, possibleValues) {
    if (!element || !possibleValues || !possibleValues.length) return false;
    var tagName = element.tagName ? element.tagName.toLowerCase() : '';
    var role = (element.getAttribute('role') || '').toLowerCase();
    var ariaAuto = (element.getAttribute('aria-autocomplete') || '').toLowerCase();
    var hasPopup = element.hasAttribute('aria-haspopup');
    var isNativeSelect = tagName === 'select';
    var isInputCombobox = (tagName === 'input') && (role === 'combobox' || ariaAuto === 'list' || ariaAuto === 'both');
    var isButtonCombobox = (tagName === 'button') && (role === 'combobox' || hasPopup);

    console.log('aplx fillDropdown:', {
      tag: tagName, role: role, ariaAuto: ariaAuto, hasPopup: hasPopup,
      isNativeSelect: isNativeSelect, isInputCombobox: isInputCombobox,
      isButtonCombobox: isButtonCombobox,
      label: getLabelText(element),
      values: possibleValues,
    });

    // === Native <select> ===
    if (isNativeSelect) {
      var options = Array.from(element.options);
      // If options are not loaded yet (only "Select One" placeholder), trigger load
      if (options.length <= 1) {
        element.focus();
        element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        element.dispatchEvent(new Event('focus', { bubbles: true }));
        await sleep(500);
        options = Array.from(element.options);
      }
      var bestMatch = null;
      for (var i = 0; i < possibleValues.length; i++) {
        var candidate = (possibleValues[i] || '').toLowerCase();
        bestMatch = options.find(function (opt) {
          var t = (opt.textContent || '').trim().toLowerCase();
          var v = (opt.value || '').trim().toLowerCase();
          if (!t || t === 'select one' || t === 'select' || t === '--' || v === '') return false;
          return t === candidate || v === candidate || t.includes(candidate) || candidate.includes(t);
        });
        if (bestMatch) break;
      }
      if (bestMatch) {
        element.value = bestMatch.value;
        dispatchInputEvents(element);
        console.log('aplx: Filled native select with:', bestMatch.textContent);
        return true;
      }
      console.log('aplx: No matching option in native select. Options:', options.map(function(o) { return o.textContent; }));
      return false;
    }

    // === Button-based combobox (Workday-style) ===
    if (isButtonCombobox) {
      await fillButtonCombobox(element, possibleValues);
      return true;
    }

    // === Input-based combobox (searchable dropdown) ===
    if (isInputCombobox || hasNearbyDropdownIndicator(element)) {
      await fillCombobox(element, possibleValues);
      return true;
    }

    // Fallback: check if there's a nearby combobox/dropdown we should be filling instead
    var parent = element.closest('div, section, fieldset') || element.parentElement;
    if (parent) {
      var nearbyCombo = parent.querySelector('button[aria-haspopup], [role="combobox"], select');
      if (nearbyCombo && nearbyCombo !== element) {
        console.log('aplx: Found nearby dropdown for', getLabelText(element), '→ redirecting');
        return await fillDropdownElement(nearbyCombo, possibleValues);
      }
    }

    setNativeValue(element, possibleValues[0]);
    return true;
  }

  async function fillButtonCombobox(buttonElement, possibleValues) {
    // Click the button to open the dropdown
    buttonElement.focus();
    buttonElement.dispatchEvent(new Event('focus', { bubbles: true }));
    buttonElement.click();
    buttonElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    buttonElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await sleep(400);

    // Look for a search input inside the opened dropdown
    var dropdownContainer =
      buttonElement.closest('[data-automation-id]')?.parentElement ||
      buttonElement.closest('[role="group"]')?.parentElement ||
      buttonElement.parentElement?.parentElement?.parentElement ||
      document.body;

    var searchInput = dropdownContainer.querySelector(
      'input[type="text"][role="combobox"], input[type="search"], input[aria-autocomplete], input[placeholder*="earch"]'
    ) || document.querySelector(
      '[role="listbox"] ~ input, [data-automation-id="searchBox"]'
    );

    if (searchInput) {
      // Type the search value into the search input
      setNativeValue(searchInput, possibleValues[0]);
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(400);
    }

    // Find dropdown options
    var optionSelectors = [
      '[role="listbox"] [role="option"]',
      '[role="listbox"] li',
      'ul[role="listbox"] > li',
      '[data-automation-id="promptOption"]',
      '[data-automation-id*="option"]',
      '.css-dropdown li',
      '[id*="listbox"] [id*="option"]',
    ];

    var optionElements = [];
    for (var s = 0; s < optionSelectors.length; s++) {
      try {
        optionElements = Array.from(document.querySelectorAll(optionSelectors[s]));
        if (optionElements.length > 0) break;
      } catch (e) { /* skip */ }
    }

    console.log('aplx: Button combobox found', optionElements.length, 'options');

    if (optionElements.length > 0) {
      var bestOption = null;
      for (var v = 0; v < possibleValues.length; v++) {
        var candidateVal = (possibleValues[v] || '').toLowerCase();
        bestOption = optionElements.find(function (el) {
          var text = (el.textContent || el.innerText || '').trim().toLowerCase();
          return text === candidateVal || text.includes(candidateVal) || candidateVal.includes(text);
        });
        if (bestOption) break;
      }

      if (bestOption) {
        bestOption.scrollIntoView({ block: 'nearest' });
        bestOption.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        await sleep(50);
        bestOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        bestOption.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        bestOption.click();
        console.log('aplx: Selected option:', bestOption.textContent?.trim());
        await sleep(100);
      } else {
        console.log('aplx: No matching option found for values:', possibleValues);
        // Close the dropdown
        buttonElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
      }
    } else {
      console.log('aplx: No dropdown options appeared after click');
      buttonElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    }
  }

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

    var filled = 0;

    // Scan ALL visible inputs/selects and classify each into phone sub-fields.
    // This avoids the bug where findFirstMatchingElement grabs the country code
    // combobox when searching for the phone number input.
    var allInputs = Array.from(document.querySelectorAll(
      'input:not([type="hidden"]), select, [role="combobox"], [role="listbox"], button[aria-haspopup="listbox"], button[aria-haspopup="true"]'
    )).filter(function(el) { return isVisible(el); });

    var phoneDeviceTypeField = null;
    var countryCodeField = null;
    var phoneNumberField = null;
    var phoneExtensionField = null;

    for (var i = 0; i < allInputs.length; i++) {
      var el = allInputs[i];
      var label = getLabelText(el).toLowerCase();
      var name = (el.getAttribute('name') || el.id || '').toLowerCase();
      var placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
      var context = getContextText(el).toLowerCase();
      var allText = label + ' ' + name + ' ' + placeholder + ' ' + context;
      var tag = el.tagName.toLowerCase();
      var type = (el.getAttribute('type') || '').toLowerCase();
      var role = (el.getAttribute('role') || '').toLowerCase();

      if (el === phoneDeviceTypeField || el === countryCodeField ||
          el === phoneNumberField || el === phoneExtensionField) continue;

      // PHONE DEVICE TYPE — can be <select>, <button>, or combobox
      if (!phoneDeviceTypeField && (tag === 'select' || tag === 'button' || role === 'combobox' || el.hasAttribute('aria-haspopup'))) {
        if (allText.includes('device type') || allText.includes('phone type') ||
            allText.includes('phone device') || allText.includes('contact type') ||
            (allText.includes('type') && allText.includes('phone'))) {
          phoneDeviceTypeField = el;
          continue;
        }
      }

      // COUNTRY PHONE CODE — usually a combobox/searchable dropdown with "country" + "code"/"phone"
      if (!countryCodeField) {
        if (allText.includes('country') && (allText.includes('code') || allText.includes('phone'))) {
          countryCodeField = el;
          continue;
        }
        if (allText.includes('dialing code') || allText.includes('phone code')) {
          countryCodeField = el;
          continue;
        }
        if (role === 'combobox' && allText.includes('country')) {
          countryCodeField = el;
          continue;
        }
      }

      // PHONE EXTENSION
      if (!phoneExtensionField) {
        if (label.includes('extension') || label.includes('phone ext') ||
            name.includes('extension') || name.includes('ext')) {
          phoneExtensionField = el;
          continue;
        }
      }

      // PHONE NUMBER — a text/tel input, matched AFTER the above to avoid confusion
      if (!phoneNumberField) {
        if (tag === 'input' && (type === 'tel' || type === 'text' || type === '')) {
          if (allText.includes('phone number') || allText.includes('telephone number') ||
              allText.includes('mobile number') || allText.includes('cell phone') ||
              allText.includes('contact number')) {
            phoneNumberField = el;
            continue;
          }
          if ((label.includes('phone') || label.includes('telephone') || label.includes('mobile')) &&
              !label.includes('country') && !label.includes('ext') && !label.includes('type') &&
              !label.includes('device') && !label.includes('code')) {
            phoneNumberField = el;
            continue;
          }
        }
      }
    }

    // Fallback: find phone number by autocomplete or input type="tel"
    if (!phoneNumberField) {
      for (var j = 0; j < allInputs.length; j++) {
        var el2 = allInputs[j];
        if (el2 === phoneDeviceTypeField || el2 === countryCodeField || el2 === phoneExtensionField) continue;
        var tag2 = el2.tagName.toLowerCase();
        var type2 = (el2.getAttribute('type') || '').toLowerCase();
        var autocomplete = (el2.getAttribute('autocomplete') || '').toLowerCase();

        if (tag2 === 'input' && type2 === 'tel') {
          phoneNumberField = el2;
          break;
        }
        if (autocomplete === 'tel' || autocomplete === 'tel-national' || autocomplete === 'tel-local') {
          phoneNumberField = el2;
          break;
        }
      }
    }

    console.log('aplx phone detection:', {
      deviceType: phoneDeviceTypeField ? getLabelText(phoneDeviceTypeField) : 'NOT FOUND',
      countryCode: countryCodeField ? getLabelText(countryCodeField) : 'NOT FOUND',
      phoneNumber: phoneNumberField ? getLabelText(phoneNumberField) : 'NOT FOUND',
      extension: phoneExtensionField ? getLabelText(phoneExtensionField) : 'NOT FOUND',
    });

    // === FILL PHONE DEVICE TYPE ===
    if (phoneDeviceTypeField) {
      var dtTag = phoneDeviceTypeField.tagName.toLowerCase();
      var preferredTypes = [phoneType, 'Mobile', 'Cell', 'Home', 'Landline', 'Work', 'Mobile Paid by SEL', 'Other'];

      if (dtTag === 'select') {
        // Native <select>
        var matched = false;
        for (var p = 0; p < preferredTypes.length; p++) {
          var options = Array.from(phoneDeviceTypeField.options);
          var opt = options.find(function (o) {
            var text = (o.text || o.textContent || '').toLowerCase().trim();
            var val = (o.value || '').toLowerCase().trim();
            var pref = preferredTypes[p].toLowerCase().trim();
            return (text === pref || val === pref || text.includes(pref) || pref.includes(text)) &&
                   val !== '' && text !== 'select one' && text !== '--' && text !== 'select';
          });
          if (opt) {
            phoneDeviceTypeField.value = opt.value;
            dispatchInputEvents(phoneDeviceTypeField);
            highlightSuccess(phoneDeviceTypeField);
            filled++;
            matched = true;
            console.log('aplx: Filled phone device type (select) with:', opt.text);
            break;
          }
        }
        if (!matched) {
          var firstValid = Array.from(phoneDeviceTypeField.options).find(function (o) {
            var val = (o.value || '').toLowerCase().trim();
            var text = (o.text || o.textContent || '').toLowerCase().trim();
            return val !== '' && val !== 'select one' && text !== 'select one' &&
                   text !== '--' && text !== 'select' && val !== '0';
          });
          if (firstValid) {
            phoneDeviceTypeField.value = firstValid.value;
            dispatchInputEvents(phoneDeviceTypeField);
            highlightSuccess(phoneDeviceTypeField);
            filled++;
            console.log('aplx: Filled phone device type (select fallback) with:', firstValid.text);
          }
        }
      } else {
        // Button combobox or custom dropdown
        var ok = await fillDropdownElement(phoneDeviceTypeField, preferredTypes);
        if (ok) {
          highlightSuccess(phoneDeviceTypeField);
          filled++;
          console.log('aplx: Filled phone device type (dropdown) with preferred type');
        }
      }
    }

    // === FILL COUNTRY PHONE CODE ===
    if (countryCodeField) {
      var ccTag = countryCodeField.tagName.toLowerCase();
      var ccRole = (countryCodeField.getAttribute('role') || '').toLowerCase();
      var isCombobox = ccRole === 'combobox' ||
                       countryCodeField.getAttribute('aria-autocomplete') === 'list' ||
                       countryCodeField.getAttribute('aria-autocomplete') === 'both' ||
                       hasNearbyDropdownIndicator(countryCodeField);
      var isSelect = ccTag === 'select';

      var possibleValues = [];
      if (COUNTRY_CODE_DISPLAY_MAP[countryCode]) {
        possibleValues = possibleValues.concat(COUNTRY_CODE_DISPLAY_MAP[countryCode]);
      }
      var dialCode = countryCode.replace(/[^+\d]/g, '');
      possibleValues.push(countryCode);
      if (dialCode !== countryCode) possibleValues.push(dialCode);

      if (isSelect) {
        var ccOptions = Array.from(countryCodeField.options);
        var bestMatch = null;
        for (var v = 0; v < possibleValues.length; v++) {
          var candidate = possibleValues[v].toLowerCase();
          bestMatch = ccOptions.find(function(o) {
            var t = (o.textContent || '').trim().toLowerCase();
            var val = (o.value || '').trim().toLowerCase();
            return t.includes(candidate) || candidate.includes(t) || val.includes(candidate);
          });
          if (bestMatch) break;
        }
        if (bestMatch) {
          countryCodeField.value = bestMatch.value;
          dispatchInputEvents(countryCodeField);
          highlightSuccess(countryCodeField);
          filled++;
        }
      } else if (isCombobox || ccTag === 'input') {
        await fillCombobox(countryCodeField, possibleValues);
        highlightSuccess(countryCodeField);
        filled++;
      }
      console.log('aplx: Filled country code');
    }

    // === FILL PHONE NUMBER (digits only, country code stripped) ===
    if (phoneNumberField) {
      var cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');

      if (countryCode) {
        var codeDigits = countryCode.replace(/[^\d]/g, '');
        if (codeDigits && cleanPhone.indexOf(codeDigits) === 0) {
          cleanPhone = cleanPhone.slice(codeDigits.length);
        }
      }
      if (cleanPhone.indexOf('+') === 0) {
        cleanPhone = cleanPhone.replace(/^\+\d{1,3}/, '');
      }

      setNativeValue(phoneNumberField, cleanPhone);
      highlightSuccess(phoneNumberField);
      filled++;
      console.log('aplx: Filled phone number with:', cleanPhone);
    }

    if (phoneExtensionField) {
      console.log('aplx: Skipped phone extension field');
    }

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
      workplacePolicy: 'Yes',
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
      if (EEO_KEYS.indexOf(key) >= 0) {
        var valuesToTry = getEEOValues(key, value);
        for (var i = 0; i < valuesToTry.length; i++) {
          if (setSelectValue(el, valuesToTry[i])) return true;
        }
        return false;
      }
      return setSelectValue(el, value);
    }

    if (type === 'radio' || type === 'checkbox') {
      if (EEO_KEYS.indexOf(key) >= 0) {
        var valuesToTry = getEEOValues(key, value);
        for (var i = 0; i < valuesToTry.length; i++) {
          if (setChoiceInput(el, key, valuesToTry[i])) return true;
        }
        return false;
      }
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
    try {
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText' }));
    } catch (e) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function setNativeValue(element, value) {
    element.focus();
    element.dispatchEvent(new Event('focus', { bubbles: true }));

    var tag = element.tagName ? element.tagName.toLowerCase() : '';
    var proto = tag === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && typeof desc.set === 'function') {
      desc.set.call(element, value);
    } else {
      element.value = value;
    }

    try {
      element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText' }));
    } catch (e) {
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setSelectValue(selectEl, targetValue) {
    var options = Array.from(selectEl.options);
    if (!options.length) return false;

    var normTarget = normalizeString(targetValue);
    if (!normTarget) return false;

    var best = null;
    var bestScore = 0;

    for (var i = 0; i < options.length; i++) {
      var opt = options[i];
      var text = normalizeString(opt.textContent || '');
      var value = normalizeString(opt.value || '');

      if (!value || value === 'select one' || value === 'select' ||
          value === '--' || value === '0' || value === 'null' ||
          text === 'select one' || text === 'select' || text === '--' ||
          text === 'please select' || text === 'choose one') {
        continue;
      }

      var score = 0;

      if (text === normTarget || value === normTarget) {
        score = 100;
      } else if (text.startsWith(normTarget) || normTarget.startsWith(text)) {
        score = 80;
      } else if (text.includes(normTarget)) {
        score = 70;
      } else if (normTarget.includes(text) && text.length > 3) {
        score = 60;
      } else if (value === normTarget) {
        score = 90;
      } else if (value.includes(normTarget) || normTarget.includes(value)) {
        score = 50;
      } else {
        var targetWords = normTarget.split(/\s+/).filter(function(w) { return w.length > 2; });
        var textWords = text.split(/\s+/).filter(function(w) { return w.length > 2; });
        var matchingWords = 0;

        for (var tw = 0; tw < targetWords.length; tw++) {
          for (var ow = 0; ow < textWords.length; ow++) {
            if (targetWords[tw] === textWords[ow] ||
                textWords[ow].includes(targetWords[tw]) ||
                targetWords[tw].includes(textWords[ow])) {
              matchingWords++;
              break;
            }
          }
        }

        if (targetWords.length > 0 && matchingWords > 0) {
          var wordMatchPercent = matchingWords / Math.max(targetWords.length, 1);
          score = Math.round(wordMatchPercent * 45);
        }
      }

      if (score > bestScore) {
        bestScore = score;
        best = opt;
      }
    }

    if (!best || bestScore < 20) return false;

    var prev = selectEl.value;
    selectEl.value = best.value;
    if (selectEl.value !== prev) {
      dispatchInputEvents(selectEl);
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
      if (['visaSponsorship', 'willingToRelocate', 'workAuthorization', 'workplacePolicy'].includes(key)) {
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

  function fillChoiceByLabel(inputEl, targetValue) {
    const type = (inputEl.getAttribute('type') || '').toLowerCase();
    const name = inputEl.name;
    const normTarget = normalizeString(targetValue);
    if (!normTarget) return false;

    let candidates;
    if (name) {
      candidates = Array.from(
        document.querySelectorAll(`input[type="${type}"][name="${CSS.escape(name)}"]`)
      );
    } else {
      let container = inputEl.closest('fieldset, [role="group"], div, section') || inputEl.parentElement;
      candidates = container
        ? Array.from(container.querySelectorAll(`input[type="${type}"]`))
        : [inputEl];

      var walkAttempts = 0;
      while (candidates.length <= 1 && container && walkAttempts < 5) {
        container = container.parentElement;
        if (!container) break;
        candidates = Array.from(container.querySelectorAll(`input[type="${type}"]`));
        walkAttempts++;
      }
    }

    let best = null;
    let bestScore = 0;
    for (const el of candidates) {
      const label = normalizeString(getLabelText(el));
      const value = normalizeString(el.value || '');
      let score = 0;
      if (label === normTarget || value === normTarget) score = 100;
      else if (label.startsWith(normTarget) || normTarget.startsWith(label)) score = 80;
      else if (label && label.includes(normTarget) && normTarget.length > 5) score = 70;
      else if (label && normTarget.includes(label) && label.length > 5) score = 60;
      else {
        const targetWords = normTarget.split(/\s+/).filter(function(w) { return w.length > 2; });
        const labelWords = label.split(/\s+/).filter(function(w) { return w.length > 2; });
        var matchingWords = 0;
        for (var tw = 0; tw < targetWords.length; tw++) {
          for (var lw = 0; lw < labelWords.length; lw++) {
            if (targetWords[tw] === labelWords[lw] ||
                labelWords[lw].includes(targetWords[tw]) ||
                targetWords[tw].includes(labelWords[lw])) {
              matchingWords++;
              break;
            }
          }
        }
        if (targetWords.length > 0 && matchingWords > 0) {
          score = Math.round((matchingWords / Math.max(targetWords.length, 1)) * 45);
        }
      }
      if (score > bestScore) { bestScore = score; best = el; }
    }

    if (!best || bestScore < 20) return false;
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

