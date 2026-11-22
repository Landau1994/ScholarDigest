import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { setGlobalDispatcher, ProxyAgent } from 'undici';
import cliProgress from 'cli-progress';
import { generatePaperDigest } from '../shared/digestCore';
import { DEFAULT_MODEL } from '../shared/models';
import type { Language } from '../types';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Configure Proxy if exists
const proxyUrl = process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
if (proxyUrl) {
  try {
    const dispatcher = new ProxyAgent(proxyUrl);
    setGlobalDispatcher(dispatcher);
  } catch (e) {
    console.warn('⚠️ Failed to configure proxy:', e);
  }
}

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('❌ Error: GEMINI_API_KEY not found in .env.local');
  process.exit(1);
}

const INPUT_DIR = path.join(process.cwd(), 'input');
const OUTPUT_DIR = path.join(process.cwd(), 'output');

if (!fs.existsSync(INPUT_DIR)) fs.mkdirSync(INPUT_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

interface ProcessOutcome {
  status: 'success' | 'skipped' | 'failed';
  filename: string;
  modelUsed?: string;
  fallbackFrom?: string;
  error?: string;
}

async function processFile(
  filename: string,
  templateContent: string,
  language: Language,
  model: string,
  force: boolean,
  bar: cliProgress.SingleBar
): Promise<ProcessOutcome> {
  const filePath = path.join(INPUT_DIR, filename);
  const ext = path.extname(filename);
  const outputFilename = filename.slice(0, filename.length - ext.length) + '.md';
  const outputPath = path.join(OUTPUT_DIR, outputFilename);

  const displayName = filename.length > 32 ? `${filename.slice(0, 29)}...` : filename;
  bar.update({ filename: displayName });

  if (!force && fs.existsSync(outputPath)) {
    return { status: 'skipped', filename };
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const lowerExt = ext.toLowerCase();
    let mimeType = 'application/pdf';
    if (lowerExt === '.png') mimeType = 'image/png';
    if (lowerExt === '.jpg' || lowerExt === '.jpeg') mimeType = 'image/jpeg';

    const result = await generatePaperDigest({
      apiKey: API_KEY!,
      fileBuffer,
      mimeType,
      filename,
      template: templateContent,
      language,
      model,
    });

    fs.writeFileSync(outputPath, result.markdown, 'utf-8');
    return {
      status: 'success',
      filename,
      modelUsed: result.modelUsed,
      fallbackFrom: result.fallbackFrom,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'failed',
      filename,
      error: message,
    };
  }
}

async function main() {
  console.log('🚀 Starting Batch Analysis...');

  // Parse CLI arguments
  let templateName = 'general_article';
  let language: Language = 'en';
  let model = DEFAULT_MODEL;
  let force = false;
  let delayMs = 5000;

  const args = process.argv.slice(2);

  const templateArg = args.find((arg) => arg.startsWith('--template='));
  if (templateArg) {
    templateName = templateArg.split('=')[1];
  }

  const langArg = args.find((arg) => arg.startsWith('--lang='));
  if (langArg) {
    const val = langArg.split('=')[1];
    if (val === 'en' || val === 'cn') {
      language = val;
    } else {
      console.warn(`⚠️ Warning: Unknown language '${val}', defaulting to English (en).`);
    }
  }

  const modelArg = args.find((arg) => arg.startsWith('--model='));
  if (modelArg) {
    model = modelArg.split('=')[1] || DEFAULT_MODEL;
  }

  if (args.includes('--force')) {
    force = true;
  }

  const delayArg = args.find((arg) => arg.startsWith('--delay='));
  if (delayArg) {
    const parsed = Number(delayArg.split('=')[1]);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      delayMs = parsed;
    }
  }

  const templateFile = `${templateName}.md`;
  const templatePath = path.join(process.cwd(), 'templates', templateFile);

  // Load Template
  let templateContent = '';
  try {
    if (fs.existsSync(templatePath)) {
      templateContent = fs.readFileSync(templatePath, 'utf-8');
      console.log(`📝 Template: ${templateName} (${templateFile})`);
      console.log(`🤖 Primary Model: ${model} (with automatic fallback)`);
      console.log(`🌐 Language: ${language === 'cn' ? 'Chinese (Simplified)' : 'English'}`);
      console.log(`♻️  Overwrite Existing: ${force ? 'Yes (--force)' : 'No (skip existing)'}`);
    } else {
      console.error(`❌ Template '${templateName}' not found.`);
      console.log('👉 Available templates:');
      const available = fs
        .readdirSync(path.join(process.cwd(), 'templates'))
        .filter((f) => f.endsWith('.md'))
        .map((f) => `   - ${f.replace(/\.md$/, '')}`);
      console.log(available.join('\n'));
      process.exit(1);
    }
  } catch (e) {
    console.error('❌ Error reading template:', e);
    process.exit(1);
  }

  // Find PDF files
  const files = fs.readdirSync(INPUT_DIR).filter((f) => f.toLowerCase().endsWith('.pdf'));

  if (files.length === 0) {
    console.log("⚠️ No PDF files found in the 'input' directory.");
    console.log('👉 Please put your research papers in:', INPUT_DIR);
    return;
  }

  console.log(`📚 Found ${files.length} PDF(s).\n`);

  const bar = new cliProgress.SingleBar({
    format:
      'Progress |{bar}| {percentage}% || {value}/{total} Files || {duration_formatted} || {filename}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  });

  bar.start(files.length, 0, { filename: 'Starting...' });

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const outcomes: ProcessOutcome[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const outcome = await processFile(file, templateContent, language, model, force, bar);
    outcomes.push(outcome);
    bar.increment();

    // Rate limit pause only after an actual API request (skip if file was already processed or last file)
    if (outcome.status !== 'skipped' && i < files.length - 1 && delayMs > 0) {
      bar.update({ filename: `Cooling down (${Math.round(delayMs / 1000)}s)...` });
      await sleep(delayMs);
    }
  }

  bar.stop();

  const succeeded = outcomes.filter((o) => o.status === 'success');
  const skipped = outcomes.filter((o) => o.status === 'skipped');
  const failed = outcomes.filter((o) => o.status === 'failed');
  const fallbacks = succeeded.filter((o) => Boolean(o.fallbackFrom));

  console.log('\n📊 Batch Summary:');
  console.log(`   ✅ Succeeded: ${succeeded.length}`);
  if (fallbacks.length > 0) {
    console.log(`   ⚠️  With Fallback: ${fallbacks.length}`);
    for (const f of fallbacks) {
      console.log(`      - ${f.filename}: ${f.fallbackFrom} -> ${f.modelUsed}`);
    }
  }
  console.log(`   ⏭️  Skipped (already exists): ${skipped.length}`);
  console.log(`   ❌ Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.error('\nFailed files:');
    for (const f of failed) {
      console.error(`   - ${f.filename}: ${f.error}`);
    }
    process.exitCode = 1;
  } else {
    console.log('\n🎉 Batch processing complete!');
  }
}

main();
