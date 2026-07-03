# ScholarDigest Developer Instructions & Conventions

This file provides project-specific instructions and conventions for development and AI assistance in the ScholarDigest repository.

## 🛠️ Tech Stack & Architecture

- **Frontend**: React 19, TypeScript, TailwindCSS (for styling, though Vanilla CSS overrides are preferred), React Markdown, and Remark GFM.
- **Local Backend (API)**: Implemented as custom Connect middlewares within `vite.config.ts` to support file-system interactions (avoiding the need for a separate server process):
  - `/api/templates` (GET): Reads and lists all Markdown templates from the `./templates/` folder.
  - `/api/save-template` (POST): Saves new or edits existing custom templates directly onto the disk.
  - `/api/history` (GET/POST): Persists task histories into `./temp/history.json`.
- **AI Integration**: The web UI directly uses `@google/genai` (Google Gen AI SDK) in the browser, powered by client-side environment variable injection (`process.env.GEMINI_API_KEY`).
  - Default Model: `gemini-3.1-flash-lite`
  - Reasoning: Activated via `thinkingConfig` (2048 token budget) for structured academic information extraction.

---

## 📝 Template System Guidelines

- **Storage**: All summary templates MUST be placed in the `./templates/` directory as `.md` files.
- **Externalization**: No template markdown files should be imported statically into the React bundle (e.g. `?raw` imports). The frontend starts with an empty state and loads templates dynamically from `/api/templates`.
- **System Templates**: Shipped/pre-configured templates are marked as `isDefault: true` on the server and are read-only in the UI. These are defined in `vite.config.ts` using the `SYSTEM_TEMPLATES` array:
  ```typescript
  const SYSTEM_TEMPLATES = ['general_article', 'standard', 'brief', 'methods', 'review', 'aivc_paper', 'scp_paper'];
  ```
- **Default Template**: `general_article` (corresponding to `./templates/general_article.md`) is the absolute default template for both the web app and the CLI batch processor.

---

## 💻 CLI Tools

- **Batch Processing CLI**: Located at `./scripts/batch-digest.ts`, executed via:
  ```bash
  npm run batch -- [options]
  ```
- **Defaults**: Defaults to the `general_article` template and English (`en`) output language if flags are omitted.
- **Flags**:
  - `--template=<name>`: Specified without the `.md` extension.
  - `--lang=<en|cn>`: Configures output language to English or Chinese (Simplified).

---

## 📋 Developer & Git Conventions

1. **Updates Log**:
   - Always record important project updates (new features, architectural refactors, template updates) under the `## Updates` section in `README.md`.
2. **Type Checking & Verification**:
   - Before committing, always run TypeScript verification (`npx tsc --noEmit`) and build (`npm run build`) to ensure there are no compilation or type-safety errors.
3. **Commit Messages**:
   - Use clean, lower-case commit prefixes to categorize changes:
     - `feat:` for new features or capabilities.
     - `fix:` for bug fixes.
     - `docs:` for documentation updates.
     - `refactor:` for code restructuring without behavioral changes.
