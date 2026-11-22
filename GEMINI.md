# ScholarDigest Developer Instructions & Conventions

This file provides project-specific instructions and conventions for development and AI assistance in the ScholarDigest repository.

## 🛠️ Tech Stack & Architecture

- **Frontend**: React 19, TypeScript, Vite 8, locally bundled Tailwind CSS v4 + `@tailwindcss/typography` (`@tailwindcss/vite`), React Markdown, and Remark GFM.
- **Local Backend (API)**: Implemented as custom Connect middlewares in `server/apiPlugin.ts` (registered in `vite.config.ts`) to support file-system and AI interactions without a separate server process:
  - `/api/digest` (POST): Server-side Gemini PDF analysis using `shared/digestCore.ts` (keeps `GEMINI_API_KEY` out of the browser bundle and reuses server `HTTPS_PROXY`).
  - `/api/templates` (GET): Reads and lists all Markdown templates from `./templates/`.
  - `/api/templates/:id` (DELETE): Permanently deletes custom templates from `./templates/` (blocks built-in system templates).
  - `/api/save-template` (POST): Saves or updates custom templates on disk (with server-side system template protection).
  - `/api/history` (GET/POST) & `/api/history/:id` (DELETE): Persists up to 20 recent digests in `./temp/history.json` (gitignored).
- **AI Integration**: Unified in `shared/digestCore.ts` and `shared/models.ts` using `@google/genai` v3:
  - Default Model: `gemini-3.8-flash`
  - Automatic Fallback Chain: `gemini-3.8-flash` → `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite`
  - Reasoning: Uses `thinkingConfig.thinkingLevel` (`ThinkingLevel.MEDIUM`), automatically retrying without `thinkingConfig` if rejected by a model.
  - Large PDFs (>14 MB): Automatically uploaded via Gemini Files API with polling and post-request cleanup.

---

## 📝 Template System Guidelines

- **Storage**: All summary templates MUST be placed in the `./templates/` directory as `.md` files.
- **Externalization**: No template markdown files should be imported statically into the React bundle (e.g. `?raw` imports). The frontend starts with an empty state and loads templates dynamically from `/api/templates`.
- **System Templates**: Shipped/pre-configured templates are marked as `isDefault: true` on the server and protected against edit/deletion on both client and server (`SYSTEM_TEMPLATES` in `server/apiPlugin.ts`):
  ```typescript
  export const SYSTEM_TEMPLATES = ['general_article', 'standard', 'brief', 'methods', 'review', 'aivc_paper', 'scp_paper'];
  ```
- **Default Template**: `general_article` (corresponding to `./templates/general_article.md`) is the default template for both the web app and the CLI batch processor.

---

## 💻 CLI Tools

- **Batch Processing CLI**: Located at `./scripts/batch-digest.ts`, executed via:
  ```bash
  npm run batch -- [options]
  ```
- **Defaults**: Defaults to `general_article` template, English (`en`) output language, `gemini-3.8-flash` (with automatic fallback), skipping already-generated outputs.
- **Flags**:
  - `--template=<name>`: Specified without the `.md` extension.
  - `--lang=<en|cn>`: Configures output language to English or Chinese (Simplified).
  - `--model=<modelId>`: Primary Gemini model ID.
  - `--force`: Re-process PDFs even when the output `.md` file already exists.
  - `--delay=<ms>`: Cooldown delay between API requests (default `5000`).

---

## 📋 Developer & Git Conventions

1. **Updates Log**:
   - Always record important project updates (new features, architectural refactors, template updates) under the `## Updates` section in `README.md`.
2. **Type Checking & Verification**:
   - Before committing, always run TypeScript verification (`npm run typecheck` / `npx tsc --noEmit`) and build (`npm run build`) to ensure there are no compilation or type-safety errors.
3. **Commit Messages**:
   - Use clean, lower-case commit prefixes to categorize changes:
     - `feat:` for new features or capabilities.
     - `fix:` for bug fixes.
     - `docs:` for documentation updates.
     - `refactor:` for code restructuring without behavioral changes.
