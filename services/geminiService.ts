import { DigestResult, Language } from '../types';
import { DEFAULT_MODEL } from '../shared/models';

/**
 * Converts a File object to a Base64 string without the Data URL prefix.
 */
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read file contents.'));
        return;
      }
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
    reader.readAsDataURL(file);
  });
};

export const generateDigest = async (
  file: File,
  template: string,
  language: Language = 'en',
  model: string = DEFAULT_MODEL
): Promise<DigestResult> => {
  try {
    const dataBase64 = await fileToBase64(file);
    const mimeType = file.type || 'application/pdf';

    const response = await fetch('/api/digest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: file.name,
        mimeType,
        dataBase64,
        template,
        language,
        model,
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || `Server error (${response.status}) while analyzing paper.`);
    }

    if (!payload.markdown) {
      throw new Error('The model returned an empty response.');
    }

    return {
      markdown: payload.markdown,
      filename: file.name,
      modelUsed: payload.modelUsed || model,
      fallbackFrom: payload.fallbackFrom,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to analyze the paper.';
    console.error('Error generating digest:', error);
    throw new Error(message);
  }
};
