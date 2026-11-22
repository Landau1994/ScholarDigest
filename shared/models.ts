export interface ModelOption {
  id: string;
  label: string;
  description: string;
}

export const DEFAULT_MODEL = 'gemini-3.8-flash';

export const AVAILABLE_MODELS: readonly ModelOption[] = [
  {
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    description: 'Default — high-intelligence reasoning & long documents',
  },
  {
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite',
    description: 'Fast & cost-effective multimodal processing',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    description: 'Stable legacy fallback model',
  },
  {
    id: 'gemini-4-argon',
    label: 'Gemini 4 Argon',
    description: 'Frontier reasoning for complex research papers',
  },
] as const;

export const FALLBACK_MODELS: readonly string[] = [
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
] as const;

/**
 * Builds a deduplicated model fallback chain starting with the preferred model,
 * followed by reliable fallback models if the primary model fails.
 */
export function buildModelFallbackChain(preferredModel?: string): string[] {
  const primary = (preferredModel || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const chain: string[] = [primary];

  for (const fallback of FALLBACK_MODELS) {
    if (!chain.includes(fallback)) {
      chain.push(fallback);
    }
  }

  return chain;
}
