<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# ScholarDigest

**Turn Papers into Knowledge.**

ScholarDigest is an AI-powered research paper analyzer that automatically generates structured digests using specific Obsidian-style templates. It leverages Google's **Gemini 3** models to extract key methods, results, and citations from PDF research papers directly into your preferred format.

## Features

- **📄 AI-Powered Analysis**: Instantly extracts insights, methods, and results from PDF research papers using the `gemini-3-pro-preview` model.
- **📝 Customizable Templates**: flexible Markdown template system. Create, save, and manage custom templates to match your Obsidian vault or personal note-taking style.
- **🎨 Modern & Responsive**: A clean interface built with React and Tailwind CSS.
- **🔗 Obsidian Ready**: Designed to produce output that pastes perfectly into Obsidian, including WikiLink support (e.g., `[[MethodName]]`).
- **🔒 Secure**: Your API key is stored locally in your browser/environment and never sent to our servers.

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **Styling**: Tailwind CSS (via CDN)
- **AI Model (Web App)**: Google Gemini API (`gemini-3-pro-preview` for high-quality single-file analysis)
- **AI Model (CLI)**: Google Gemini API (`gemini-3-flash-preview` for stable batch processing)


## Security & Secrets

To keep your personal information and API keys safe:
- **Never commit secrets**: Real API keys should be placed in `.env.local`.
- **Use the template**: Refer to `.env.example` for the required environment variables.
- **Git Ignore**: The `.gitignore` is configured to block all `.env` files from being tracked.

## Getting Started

### Prerequisites

- **Node.js**: (Latest LTS recommended)
- **Gemini API Key**: Get one from [Google AI Studio](https://aistudio.google.com/).

### Installation & Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Create a `.env.local` file in the root directory and add your Gemini API key:
   ```env
   GEMINI_API_KEY=your_actual_api_key_here
   ```

3. **Run the App**:
   
   **Development Mode:**
   ```bash
   npm run dev
   ```

   **Background Mode (using PM2):**
   To keep the app running in the background on your server:
   ```bash
   pm2 start npm --name "scholardigest" -- run dev
   ```
   
   Open your browser to `http://localhost:3000`.

## Batch Processing (CLI)

You can batch analyze multiple papers at once using the command line.

1.  Place your PDF files in the `input/` folder.
2.  Run the batch command:
    ```bash
    npm run batch
    ```
    
    **To specify a template:**
    Use the `--template` flag with the name of your template file (without `.md`).
    ```bash
    npm run batch -- --template=brief
    npm run batch -- --template=methods
    ```

### Proxy Support

If you are behind a proxy, the CLI tool will automatically detect and use it. You can set the proxy in your `.env.local` or your terminal:
```env
# In .env.local
HTTPS_PROXY=http://127.0.0.1:7890
```

3.  Find the generated Markdown digests in the `output/` folder.

    *Note: The script includes a detailed progress bar and a 10-second delay between each paper to ensure stability and respect API rate limits.*


## Updates

### 2026-01-18
- **Core Improvements**: Extracted default templates to external Markdown files in `templates/` and implemented file system sync for new web UI templates.
- **CLI Enhancements**: Added Batch Processing CLI tool (`npm run batch`) with template selection, proxy support, and `gemini-3-flash-preview` stability.
- **UI & UX**: Added loading progress bars (Web & CLI), improved template visibility, and implemented a robust fallback for the "Copy Markdown" feature.
- **Security & Ops**: Implemented secure secret management (`.env.example`), moved agent rules to `.gemini/`, and documented `pm2` deployment.
- **Agent Config**: Added `GEMINI.md` for interaction customization.







