// aplx storage utilities using chrome.storage.local

const STORAGE_KEYS = {
  PROFILES: 'profiles',
};

/**
 * @returns {Promise<Profile[]>}
 */
export async function getAllProfiles() {
  const result = await chrome.storage.local.get([STORAGE_KEYS.PROFILES]);
  return Array.isArray(result[STORAGE_KEYS.PROFILES]) ? result[STORAGE_KEYS.PROFILES] : [];
}

/**
 * @param {string} id
 * @returns {Promise<Profile | null>}
 */
export async function getProfileById(id) {
  const profiles = await getAllProfiles();
  return profiles.find((p) => p.id === id) || null;
}

/**
 * @param {Profile} profile
 * @returns {Promise<void>}
 */
export async function saveProfile(profile) {
  const profiles = await getAllProfiles();
  const now = new Date().toISOString();
  const existingIndex = profiles.findIndex((p) => p.id === profile.id);

  if (existingIndex >= 0) {
    profiles[existingIndex] = {
      ...profiles[existingIndex],
      ...profile,
      updatedAt: now,
    };
  } else {
    profiles.push({
      ...profile,
      createdAt: profile.createdAt || now,
      updatedAt: now,
    });
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.PROFILES]: profiles });
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteProfile(id) {
  const profiles = await getAllProfiles();
  const filtered = profiles.filter((p) => p.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.PROFILES]: filtered });
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function setDefaultProfile(id) {
  const profiles = await getAllProfiles();
  const updated = profiles.map((p) => ({
    ...p,
    isDefault: p.id === id,
  }));
  await chrome.storage.local.set({ [STORAGE_KEYS.PROFILES]: updated });
}

/**
 * @returns {Promise<Profile | null>}
 */
export async function getDefaultProfile() {
  const profiles = await getAllProfiles();
  return profiles.find((p) => p.isDefault) || null;
}

/**
 * Export a single profile as downloadable JSON (in options / popup context).
 * @param {string} id
 */
export async function exportProfile(id) {
  const profile = await getProfileById(id);
  if (!profile) return;

  const blob = new Blob([JSON.stringify(profile, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aplx-${profile.name || 'profile'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Import a profile JSON file and save it.
 * @param {File} file
 * @returns {Promise<void>}
 */
export async function importProfile(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse profile JSON', e);
    throw new Error('Invalid JSON file');
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Invalid profile data');
  }

  // Ensure required fields with fallbacks
  const now = new Date().toISOString();
  const profile = {
    id: data.id || crypto.randomUUID(),
    name: data.name || 'Imported Profile',
    createdAt: data.createdAt || now,
    updatedAt: now,
    isDefault: !!data.isDefault,
    personal: data.personal || {
      firstName: '',
      lastName: '',
      email: '',
      countryCode: '',
      phone: '',
      phoneType: '',
      address: '',
      city: '',
      state: '',
      location: '',
      country: '',
      pincode: '',
      linkedIn: '',
      github: '',
      portfolio: '',
      website: '',
    },
    education: Array.isArray(data.education) ? data.education : [],
    experience: Array.isArray(data.experience) ? data.experience : [],
    skills: data.skills || {
      technical: [],
      languages: [],
      tools: [],
    },
    projects: Array.isArray(data.projects) ? data.projects : [],
    certifications: Array.isArray(data.certifications) ? data.certifications : [],
    applicationDefaults: data.applicationDefaults || {
      visaSponsorship: '',
      workAuthorization: '',
      expectedSalary: '',
      availableStartDate: '',
      yearsOfExperience: '',
      willingToRelocate: '',
      gender: '',
      ethnicity: '',
      veteranStatus: '',
      disabilityStatus: '',
      pronouns: '',
    },
    customFields: Array.isArray(data.customFields) ? data.customFields : [],
    coverLetters: Array.isArray(data.coverLetters) ? data.coverLetters : [],
    resumeFileName: data.resumeFileName || '',
    resumeBase64: data.resumeBase64 || '',
  };

  await saveProfile(profile);
}

/**
 * Export all profiles to a JSON file.
 */
export async function exportAllProfiles() {
  const profiles = await getAllProfiles();
  const blob = new Blob([JSON.stringify(profiles, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'aplx-profiles.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Check approximate storage usage and warn if approaching limit.
 * This is approximate because Chrome enforces a quota per extension (~10MB).
 */
export async function getApproximateStorageUsage() {
  const data = await chrome.storage.local.get(null);
  const json = JSON.stringify(data);
  // Rough bytes length
  return new Blob([json]).size;
}

/**
 * @typedef {Object} Profile
 * @property {string} id
 * @property {string} name
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {boolean} isDefault
 */

