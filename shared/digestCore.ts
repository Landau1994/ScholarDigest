import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { Language } from '../types.ts';
import { buildModelFallbackChain, DEFAULT_MODEL } from './models.ts';

const INLINE_SIZE_LIMIT_BYTES = 14 * 1024 * 1024; // 14 MB raw (~18.7 MB base64, safely under 20 MB inline limit)
const MAX_ATTEMPTS_PER_MODEL = 2;

export interface GeneratePaperDigestOptions {
  apiKey: string;
  fileBuffer: Buffer;
  mimeType?: string;
  filename?: string;
  template: string;
  language?: Language;
  model?: string;
  onStatus?: (message: string) => void;
}

export interface GeneratePaperDigestResult {
  markdown: string;
  modelUsed: string;
  fallbackFrom?: string;
}

export function buildDigestPrompt(template: string, language: Language = 'en'): string {
  const languageInstruction = language === 'cn' ? 'Simplified Chinese' : 'English';

  return [
    'You are an expert academic researcher and data scientist.',
    'Your task is to analyze the provided research paper and generate a comprehensive digest based strictly on the following Markdown template.',
    '',
    `Output Language: ${languageInstruction}`,
    '',
    'Here is the template you must fill out:',
    '',
    '```markdown',
    template,
    '```',
    '',
    'Instructions:',
    '1. **Title**: Replace "<% tp.file.title %>" with the actual title of the paper.',
    '2. **Citation**: Extract accurate citation details (authors, journal, year, DOI if present).',
    '3. **WikiLinks**: For methods, software, and downstream tools, use Obsidian `[[WikiLink]]` format for key technical terms and standard tools (e.g., `[[SCoPE2]]`, `[[MaxQuant]]`).',
    '4. **Accuracy**: Ensure facts, figures, sample sizes, and quantitative results are extracted accurately from the paper.',
    '5. **Missing Info**: If a section cannot be filled from the paper, write "N/A" or keep it brief without fabricating information.',
    '6. **Figures**: Summarize key figures accurately if the template includes a figure table or section.',
    '7. **Personal Notes**: Leave any personal notes section blank for the user.',
    '8. **Formatting**: Return ONLY the raw Markdown text. Do not wrap the entire output in ```markdown code blocks.',
    `9. **Language**: Write all narrative content in ${languageInstruction}, while preserving standard English technical terms, gene/protein names, software names, and the original paper title where appropriate.`,
  ].join('\n');
}

function stripOuterMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return match ? match[1].trim() : trimmed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isRetryableError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('fetch failed')
  );
}

function isThinkingConfigError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return (
    msg.includes('thinking') &&
    (msg.includes('unsupported') || msg.includes('invalid') || msg.includes('not supported') || msg.includes('400'))
  );
}

async function prepareDocumentPart(
  client: GoogleGenAI,
  fileBuffer: Buffer,
  mimeType: string,
  filename?: string,
  onStatus?: (message: string) => void
): Promise<{ part: Record<string, unknown>; uploadedFileName?: string }> {
  if (fileBuffer.byteLength <= INLINE_SIZE_LIMIT_BYTES) {
    return {
      part: {
        inlineData: {
          mimeType,
          data: fileBuffer.toString('base64'),
        },
      },
    };
  }

  onStatus?.(
    `Large file detected (${(fileBuffer.byteLength / (1024 * 1024)).toFixed(1)} MB); uploading via Gemini Files API...`
  );

  const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
  let uploaded = await client.files.upload({
    file: blob,
    config: {
      mimeType,
      displayName: filename || 'paper.pdf',
    },
  });

  // Poll until file processing finishes
  const maxPolls = 30;
  for (let i = 0; i < maxPolls && uploaded.state === 'PROCESSING'; i++) {
    await sleep(2000);
    if (!uploaded.name) break;
    uploaded = await client.files.get({ name: uploaded.name });
  }

  if (uploaded.state === 'FAILED') {
    throw new Error(`Gemini Files API failed to process ${filename || 'uploaded file'}.`);
  }

  if (!uploaded.uri) {
    throw new Error('Gemini Files API did not return a valid file URI.');
  }

  return {
    part: {
      fileData: {
        fileUri: uploaded.uri,
        mimeType: uploaded.mimeType || mimeType,
      },
    },
    uploadedFileName: uploaded.name,
  };
}

export async function generatePaperDigest(
  options: GeneratePaperDigestOptions
): Promise<GeneratePaperDigestResult> {
  const {
    apiKey,
    fileBuffer,
    mimeType = 'application/pdf',
    filename,
    template,
    language = 'en',
    model = DEFAULT_MODEL,
    onStatus,
  } = options;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing.');
  }

  const client = new GoogleGenAI({ apiKey });
  const prompt = buildDigestPrompt(template, language);
  const candidateModels = buildModelFallbackChain(model);
  const primaryModel = candidateModels[0];

  const { part: documentPart, uploadedFileName } = await prepareDocumentPart(
    client,
    fileBuffer,
    mimeType,
    filename,
    onStatus
  );

  const errorsByModel: string[] = [];

  try {
    for (let modelIndex = 0; modelIndex < candidateModels.length; modelIndex++) {
      const currentModel = candidateModels[modelIndex];
      const isFallback = modelIndex > 0;

      if (isFallback) {
        onStatus?.(`Falling back from ${primaryModel} to ${currentModel}...`);
      }

      let useThinkingConfig = true;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
        try {
          const response = await client.models.generateContent({
            model: currentModel,
            contents: [
              {
                role: 'user',
                parts: [documentPart as never, { text: prompt }],
              },
            ],
            ...(useThinkingConfig
              ? {
                  config: {
                    thinkingConfig: {
                      thinkingLevel: ThinkingLevel.MEDIUM,
                    },
                  },
                }
              : {}),
          });

          const rawText = response.text;
          if (!rawText || !rawText.trim()) {
            throw new Error(`Model ${currentModel} returned an empty response.`);
          }

          return {
            markdown: stripOuterMarkdownFence(rawText),
            modelUsed: currentModel,
            fallbackFrom: isFallback ? primaryModel : undefined,
          };
        } catch (error: unknown) {
          const errMsg = getErrorMessage(error);

          // If this model rejects thinkingConfig, retry immediately without thinkingConfig
          if (useThinkingConfig && isThinkingConfigError(error)) {
            onStatus?.(`Model ${currentModel} rejected thinkingConfig; retrying without it...`);
            useThinkingConfig = false;
            continue;
          }

          const shouldRetry = attempt < MAX_ATTEMPTS_PER_MODEL && isRetryableError(error);
          if (shouldRetry) {
            const backoffMs = 2000 * attempt;
            onStatus?.(
              `Transient error on ${currentModel} (attempt ${attempt}/${MAX_ATTEMPTS_PER_MODEL}): ${errMsg}. Retrying in ${backoffMs}ms...`
            );
            await sleep(backoffMs);
            continue;
          }

          errorsByModel.push(`${currentModel}: ${errMsg}`);
          onStatus?.(`Model ${currentModel} failed: ${errMsg}`);
          break;
        }
      }
    }

    throw new Error(`All candidate models failed (${errorsByModel.join(' | ')})`);
  } finally {
    if (uploadedFileName) {
      await client.files.delete({ name: uploadedFileName }).catch(() => {
        // Best-effort cleanup of temporary uploaded file
      });
    }
  }
}
