import { GoogleGenAI } from "@google/genai";

const getGeminiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found. Please ensure process.env.API_KEY is set.");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Converts a File object to a Base64 string suitable for the Gemini API.
 */
const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove the Data URL prefix (e.g., "data:application/pdf;base64,")
      const base64Data = base64String.split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

import { Language } from '../types';

export const generateDigest = async (file: File, template: string, language: Language = 'en'): Promise<string> => {
  try {
    const client = getGeminiClient();
    
    // Using gemini-3-pro-preview for complex reasoning and document analysis
    const modelId = "gemini-3-pro-preview";

    const filePart = await fileToGenerativePart(file);

    const languageInstruction = language === 'cn' ? 'Simplified Chinese' : 'English';

    const prompt = `
      You are an expert academic researcher and data scientist.
      Your task is to analyze the provided research paper and generate a comprehensive digest based strictly on the following Markdown template.

      Output Language: ${languageInstruction}

      Here is the template you must fill out:

      \`\`\`markdown
      ${template}
      \`\`\`

      Instructions:
      1. **Title**: Replace "<% tp.file.title %>" with the actual title of the paper.
      2. **Citation**: Extract accurate citation details.
      3. **WikiLinks**: For 'Method used', 'Software', and 'Downstream', try to use the [[WikiLink]] format if the terms are standard or mentioned in the template examples (e.g., [[SCoPE2]], [[MaxQuant]]). If the specific method isn't one of the examples, still try to format key technical terms as [[Term]].
      4. **Accuracy**: Ensure facts, figures, and numbers are extracted accurately from the text.
      5. **Missing Info**: If a section cannot be filled (e.g., no specific cell type mentioned), write "N/A" or leave it brief.
      6. **Figures**: Summarize the key figures in the table provided.
      7. **Personal Notes**: Leave this section blank for the user.
      8. **Formatting**: Return ONLY the raw Markdown text. Do not wrap it in \`\`\`markdown code blocks.
      9. **Language**: Output all content in ${languageInstruction}, except for technical terms commonly used in English or the paper title.
    `;

    // Build request options - use same config for all languages
    const requestOptions: any = {
      model: modelId,
      contents: [{
        parts: [
          filePart,
          { text: prompt }
        ]
      }],
      config: {
        thinkingConfig: {
          thinkingBudget: 2048,
        }
      }
    };

    const response = await client.models.generateContent(requestOptions);

    if (!response.text) {
      throw new Error("The model returned an empty response.");
    }

    return response.text;
  } catch (error: any) {
    console.error("Error generating digest:", error);
    throw new Error(error.message || "Failed to analyze the paper.");
  }
};