import {
  getProvider,
  normalizeProviderId,
  isProviderConfigured,
  getLegacyModel,
  getDefaultModel
} from './providerRegistry.js';

/**
 * Resolves the provider and model for a given feature (summarize or chat) based on user settings.
 *
 * @param {string} feature - The feature to resolve ('summarize' or 'chat')
 * @param {Object} settings - The user settings object
 * @returns {{providerId: string, modelId: string, adapterProviderId: string, settingsOverlay: Object}}
 */
export function resolveFeatureModel(feature, settings) {
  if (!settings) {
    const defaultGemini = getProvider('gemini');
    return {
      providerId: 'gemini',
      modelId: defaultGemini.defaultModel,
      adapterProviderId: defaultGemini.adapterId,
      settingsOverlay: defaultGemini.adapterOverlay || {},
    };
  }

  let providerId;
  let modelId;

  // 1. Read settings[feature].provider/model if block is present
  const featureBlock = settings[feature];
  if (featureBlock && featureBlock.provider && featureBlock.model) {
    providerId = featureBlock.provider;
    modelId = featureBlock.model;
  } else {
    // Fallback to legacy derivation
    const legacyProvider = settings.selectedProvider || 'gemini';
    if (legacyProvider === 'gemini') {
      providerId = 'gemini';
    } else {
      providerId = normalizeProviderId(legacyProvider);
    }
    modelId = getLegacyModel(providerId, settings) || getDefaultModel(providerId);
  }

  // 2. Fallback to Gemini Basic if chosen provider is not configured
  if (!isProviderConfigured(providerId, settings)) {
    if (isProviderConfigured('gemini', settings)) {
      providerId = 'gemini';
      modelId = settings.selectedGeminiModel || getDefaultModel('gemini');
    }
  }

  // Ensure modelId is not empty
  if (!modelId) {
    modelId = getDefaultModel(providerId) || '';
  }

  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`Resolved to unknown provider: ${providerId}`);
  }

  return {
    providerId,
    modelId,
    adapterProviderId: provider.adapterId,
    settingsOverlay: provider.adapterOverlay || {},
  };
}
