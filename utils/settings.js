// ProfileFill settings (AI parsing, etc.) stored in chrome.storage.local

const SETTINGS_KEY = 'profilefill_settings';

/**
 * @returns {Promise<Record<string, unknown>>}
 */
export async function getSettings() {
  const defaults = getDefaultSettings();
  const result = await chrome.storage.local.get([SETTINGS_KEY]);
  const stored = result[SETTINGS_KEY];
  if (!stored || typeof stored !== 'object') {
    return { ...defaults };
  }
  return { ...defaults, ...stored };
}

/**
 * @param {Record<string, unknown>} settings
 * @returns {Promise<void>}
 */
export async function saveSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

/**
 * @returns {{
 *   aiParsingEnabled: boolean;
 *   aiProvider: string;
 *   aiApiKey: string;
 *   aiModel: string;
 *   localParsingFallback: boolean;
 * }}
 */
export function getDefaultSettings() {
  return {
    aiParsingEnabled: false,
    aiProvider: 'openai',
    aiApiKey: '',
    aiModel: '',
    localParsingFallback: true,
  };
}
