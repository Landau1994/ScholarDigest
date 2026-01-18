export enum LoadingState {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  ANALYZING = 'ANALYZING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface DigestResult {
  markdown: string;
  filename: string;
}

export interface ProcessingError {
  message: string;
  details?: string;
}

export interface Template {
  id: string;
  name: string;
  content: string;
  isDefault?: boolean;
}

export type Language = 'en' | 'cn';
