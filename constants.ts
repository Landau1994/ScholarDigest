import { Template } from './types';
import standardTemplate from './templates/standard.md?raw';
import briefTemplate from './templates/brief.md?raw';
import methodsTemplate from './templates/methods.md?raw';

export const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 'standard',
    name: 'Standard Obsidian Digest',
    content: standardTemplate,
    isDefault: true,
  },
  {
    id: 'brief',
    name: 'Brief Summary',
    content: briefTemplate,
    isDefault: true,
  },
  {
    id: 'methods',
    name: 'Methods & Data Focus',
    content: methodsTemplate,
    isDefault: true,
  }
];
