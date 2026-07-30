import {
  normalizeProviderId,
  isProviderConfigured,
  getLegacyModel,
  getDefaultModel,
  resolveProviderEntry
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
    const defaultGemini = resolveProviderEntry('gemini', null);
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
    modelId = getLegacyModel(providerId, settings) || getDefaultModel(providerId, settings);
  }

  // 2. Fallback to Gemini Basic if chosen provider is not configured
  if (!isProviderConfigured(providerId, settings)) {
    if (isProviderConfigured('gemini', settings)) {
      providerId = 'gemini';
      modelId = settings.selectedGeminiModel || getDefaultModel('gemini', settings);
    }
  }

  // Ensure modelId is not empty
  if (!modelId) {
    modelId = getDefaultModel(providerId, settings) || '';
  }

  const provider = resolveProviderEntry(providerId, settings);
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

/**
 * Resolves provider and model for a conversation with provider-independent
 * fallback. A stored provider whose model is missing resolves to that
 * provider's own default — it never borrows settings.chat's model.
 *
 * Single source of truth for both the request path (chatService) and the
 * display path (chatStore's effective-model getter); they must not disagree.
 *
 * @param {Object|null} conversation
 * @param {Object} settings
 * @returns {{ providerId: string, modelId: string }}
 */
export function resolveConversationModel(conversation, settings) {
  const chatFallback = resolveFeatureModel('chat', settings);
  const providerId = conversation?.providerId || chatFallback.providerId;

  let modelId;
  if (conversation?.modelId) {
    modelId = conversation.modelId;
  } else if (conversation?.providerId) {
    // Stored provider, no stored model → use THIS provider's own model.
    // getLegacyModel returns null for dynamic profiles; getDefaultModel is
    // profile-aware (needs `settings`) and returns the profile's defaultModel.
    modelId =
      getLegacyModel(conversation.providerId, settings) ||
      getDefaultModel(conversation.providerId, settings) ||
      chatFallback.modelId;
  } else {
    modelId = chatFallback.modelId;
  }
  return { providerId, modelId };
}
