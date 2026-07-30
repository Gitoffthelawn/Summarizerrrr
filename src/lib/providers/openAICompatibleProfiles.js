import { generateUUID } from '@/lib/utils/utils.js'

/**
 * Checks if a provider ID represents an OpenAI Compatible profile.
 * @param {string} id - Provider ID to check
 * @returns {boolean} - True if dynamic profile ID
 */
export function isOpenAICompatibleProfileId(id) {
  return typeof id === 'string' && id.startsWith('openai-compatible-');
}

/**
 * Generates a stable unique ID for a new profile.
 * @returns {string} - Unique profile ID
 */
export function generateProfileId() {
  return `openai-compatible-${generateUUID()}`;
}

/**
 * Validates if the given Base URL uses http or https.
 * @param {string} url - URL string to validate
 * @returns {boolean} - True if HTTP(S) URL
 */
export function validateBaseUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

/**
 * Validates if a profile has all required fields configured.
 * @param {Object} p - Profile object to validate
 * @returns {boolean} - True if profile is valid and configured
 */
export function validateProfile(p) {
  if (!p || typeof p !== 'object') return false;
  const name = typeof p.name === 'string' ? p.name.trim() : '';
  const baseUrl = typeof p.baseUrl === 'string' ? p.baseUrl.trim() : '';
  const apiKey = typeof p.apiKey === 'string' ? p.apiKey.trim() : '';
  const defaultModel = typeof p.defaultModel === 'string' ? p.defaultModel.trim() : '';

  return name.length > 0 && validateBaseUrl(baseUrl) && apiKey.length > 0 && defaultModel.length > 0;
}

/**
 * Generates the next case-insensitively unique default profile name.
 * @param {Array<Object>} profiles - Existing profiles
 * @returns {string} - Generated default name
 */
export function getNextDefaultName(profiles) {
  const currentProfiles = Array.isArray(profiles) ? profiles : [];
  const lowercaseNames = currentProfiles.map(p =>
    typeof p.name === 'string' ? p.name.toLowerCase().trim() : ''
  );

  let index = 1;
  while (true) {
    const candidate = `OpenAI Compatible ${index}`;
    if (!lowercaseNames.includes(candidate.toLowerCase())) {
      return candidate;
    }
    index++;
  }
}

/**
 * Normalizes a single profile object from untrusted storage/import.
 * Trims all string fields.
 * @param {Object} p - Raw profile data
 * @param {Array<Object>} [profilesSoFar] - Previously normalized profiles in array for name clash avoidance
 * @returns {Object|null} - Normalized profile object, or null if invalid structure
 */
export function normalizeProfile(p, profilesSoFar = []) {
  if (!p || typeof p !== 'object') return null;

  const id = typeof p.id === 'string' && isOpenAICompatibleProfileId(p.id)
    ? p.id.trim()
    : generateProfileId();

  const name = typeof p.name === 'string' && p.name.trim().length > 0
    ? p.name.trim()
    : getNextDefaultName(profilesSoFar);

  const baseUrl = typeof p.baseUrl === 'string' ? p.baseUrl.trim() : '';
  const apiKey = typeof p.apiKey === 'string' ? p.apiKey.trim() : '';
  const defaultModel = typeof p.defaultModel === 'string' ? p.defaultModel.trim() : '';

  return {
    id,
    name,
    baseUrl,
    apiKey,
    defaultModel,
  };
}

/**
 * Normalizes an array of profile objects.
 * Filters out malformed entries, removes duplicate IDs, and preserves array order.
 * @param {Array} profilesArray - Raw profiles array
 * @returns {Array<Object>} - Sanitized array of normalized profiles
 */
export function normalizeProfiles(profilesArray) {
  if (!Array.isArray(profilesArray)) return [];
  const normalized = [];
  const ids = new Set();

  for (const p of profilesArray) {
    const norm = normalizeProfile(p, normalized);
    if (norm && !ids.has(norm.id)) {
      normalized.push(norm);
      ids.add(norm.id);
    }
  }

  return normalized;
}

/**
 * Finds a profile by ID in the list.
 * @param {Array<Object>} profiles - Profiles list
 * @param {string} id - Profile ID to search for
 * @returns {Object|null} - Matching profile or null
 */
export function findProfileById(profiles, id) {
  if (!Array.isArray(profiles)) return null;
  return profiles.find(p => p.id === id) || null;
}

/**
 * Merges two profile collections by stable ID.
 * Imported profiles overwrite local profiles if IDs match.
 * @param {Array<Object>} localProfiles - Local profiles collection
 * @param {Array<Object>} importedProfiles - Imported profiles collection
 * @returns {Array<Object>} - Merged profiles array
 */
export function mergeProfiles(localProfiles, importedProfiles) {
  const merged = normalizeProfiles(localProfiles);
  const importedNormalized = normalizeProfiles(importedProfiles);

  for (const imp of importedNormalized) {
    const existingIndex = merged.findIndex(p => p.id === imp.id);
    if (existingIndex !== -1) {
      merged[existingIndex] = imp;
    } else {
      merged.push(imp);
    }
  }

  return merged;
}
