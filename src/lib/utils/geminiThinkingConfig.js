// @ts-nocheck
/**
 * Gemini Thinking Configuration Utility
 *
 * Maps UI-level thinking preference ('off' | 'minimal' | 'low' | 'medium' | 'high')
 * to the correct API parameter for each Gemini model family:
 *
 * - Gemini 2.5 series  → thinkingBudget (integer)
 * - Gemini 3/3.1 Flash & Flash-Lite → thinkingLevel ('minimal' | 'low' | 'medium' | 'high')
 * - Gemini 3 Pro       → thinkingLevel ('medium' | 'high') — no 'minimal'/'low' support
 * - Gemma 4            → thinkingLevel ('minimal' | 'high') — no 'low'/'medium' support
 * - Other models       → no thinkingConfig (ignored)
 *
 * 'off' is aliased to 'minimal' at the top of buildThinkingProviderOptions.
 *
 * UI mapping per model family:
 * ┌─────────┬──────────────────┬──────────────────────┬───────────────┬──────────┐
 * │ UI      │ Gemini 2.5       │ Gemini 3 Flash/Lite  │ Gemini 3 Pro  │ Gemma 4  │
 * ├─────────┼──────────────────┼──────────────────────┼───────────────┼──────────┤
 * │ Off     │ thinkingBudget:0 │ 'minimal'            │ 'medium' ↑    │ 'minimal'│
 * │ Minimal │ thinkingBudget:0 │ 'minimal'            │ 'medium' ↑    │ 'minimal'│
 * │ Low     │ thinkingBudget:  │ 'low'                │ 'medium' ↑    │ 'minimal'↓│
 * │         │   2048           │                      │               │          │
 * │ Medium  │ thinkingBudget:  │ 'medium'             │ 'medium'      │ 'minimal'↓│
 * │         │   8000           │                      │               │          │
 * │ High    │ thinkingBudget:  │ 'high'               │ 'high'        │ 'high'   │
 * │         │   -1 (dynamic)   │                      │               │          │
 * └─────────┴──────────────────┴──────────────────────┴───────────────┴──────────┘
 */

/**
 * Detects the Gemini model family from a model name string.
 * @param {string} modelName
 * @returns {'gemma4' | 'gemini25' | 'gemini3pro' | 'gemini3' | 'other'}
 */
function detectModelFamily(modelName) {
  if (!modelName) return 'other'
  const lower = modelName.toLowerCase()

  // Gemma 4 (gemma-4-*)
  if (lower.includes('gemma')) return 'gemma4'

  // Gemini 2.5 series (gemini-2.5-*)
  if (lower.includes('gemini-2.5')) return 'gemini25'

  // Gemini 3 Pro — must check before generic gemini-3
  if (
    lower.includes('gemini-3-pro') ||
    lower.includes('gemini-3.1-pro') ||
    lower.includes('gemini-3.0-pro')
  ) {
    return 'gemini3pro'
  }

  // Gemini 3 / 3.1 Flash, Flash-Lite, etc.
  if (lower.includes('gemini-3')) return 'gemini3'

  return 'other'
}

/**
 * Builds the providerOptions object for Gemini thinking configuration.
 *
 * @param {string} modelName - The full model name (e.g. 'gemini-3-flash-preview')
 * @param {'off' | 'minimal' | 'low' | 'medium' | 'high'} uiLevel - The level chosen by the user
 * @returns {object} providerOptions to spread into generateText / streamText calls,
 *                   or an empty object if this model doesn't support thinking config.
 */
export function buildThinkingProviderOptions(modelName, uiLevel) {
  const family = detectModelFamily(modelName)

  if (family === 'other') {
    // Model doesn't support thinkingConfig — omit entirely to avoid API errors
    return {}
  }

  // Normalize 'off' → 'minimal' for backward compatibility
  const effectiveLevel = uiLevel === 'off' ? 'minimal' : uiLevel

  let thinkingConfig = null

  switch (family) {
    case 'gemini25': {
      // Gemini 2.5 uses thinkingBudget (integer tokens)
      const budgetMap = {
        minimal: 0,      // disable thinking
        low: 2048,       // light reasoning
        medium: 8000,    // moderate reasoning
        high: -1,        // dynamic / auto (model decides)
      }
      thinkingConfig = { thinkingBudget: budgetMap[effectiveLevel] ?? -1 }
      break
    }

    case 'gemini3pro': {
      // Gemini 3 Pro only supports 'medium' and 'high' (no 'minimal')
      // UI Minimal → map UP to 'medium'
      const levelMap = {
        minimal: 'medium', // mapped up — Pro doesn't support minimal
        low: 'medium',     // mapped up — Pro doesn't support low
        medium: 'medium',
        high: 'high',
      }
      thinkingConfig = { thinkingLevel: levelMap[effectiveLevel] ?? 'high' }
      break
    }

    case 'gemini3': {
      // Gemini 3/3.1 Flash & Flash-Lite support all levels
      const levelMap = {
        minimal: 'minimal',
        low: 'low',
        medium: 'medium',
        high: 'high',
      }
      thinkingConfig = { thinkingLevel: levelMap[effectiveLevel] ?? 'high' }
      break
    }

    case 'gemma4': {
      // Gemma 4 only supports 'minimal' and 'high'
      // UI Medium → map DOWN to 'minimal'
      const levelMap = {
        minimal: 'minimal',
        low: 'minimal',     // mapped down — Gemma has no 'low'
        medium: 'minimal',  // mapped down — Gemma has no 'medium'
        high: 'high',
      }
      thinkingConfig = { thinkingLevel: levelMap[effectiveLevel] ?? 'high' }
      break
    }

    default:
      return {}
  }

  return {
    google: {
      thinkingConfig,
    },
  }
}


