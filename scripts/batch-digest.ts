import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from "@google/genai";
import { setGlobalDispatcher, ProxyAgent } from 'undici';
import cliProgress from 'cli-progress';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Configure Proxy if exists
const proxyUrl = process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
if (proxyUrl) {
  try {
    const dispatcher = new ProxyAgent(proxyUrl);
    setGlobalDispatcher(dispatcher);
    // console.log(`🌐 Using Proxy: ${proxyUrl}`); // Squelch log for clean UI
  } catch (e) {
    console.warn("⚠️ Failed to configure proxy:", e);
  }
}

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("Error: GEMINI_API_KEY not found in .env.local");
  process.exit(1);
}

const INPUT_DIR = path.join(process.cwd(), 'input');
const OUTPUT_DIR = path.join(process.cwd(), 'output');

// Ensure directories exist
if (!fs.existsSync(INPUT_DIR)) fs.mkdirSync(INPUT_DIR);
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

const getGeminiClient = () => {
  return new GoogleGenAI({ apiKey: API_KEY });
};

async function processFile(filename: string, templateContent: string, bar: cliProgress.SingleBar) {
  const filePath = path.join(INPUT_DIR, filename);
  
  // Update bar payload to show current file
  bar.update({ filename: filename.substring(0, 30) + (filename.length > 30 ? '...' : '') });

  try {
    // Read file as base64
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');
    
    // Determine mime type
    const ext = path.extname(filename).toLowerCase();
    let mimeType = 'application/pdf'; // Default
    if (ext === '.png') mimeType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';

    const client = getGeminiClient();
    const modelId = "gemini-3-flash-preview"; 

    const prompt = `
      You are an expert academic researcher. 
      Analyze the provided research paper and generate a digest using this Markdown template:
      
      \`\`\`markdown
      ${templateContent}
      \`\`\`

      Instructions:
      1. Replace "<% tp.file.title %>" with the paper's title.
      2. Follow the template structure strictly.
      3. Return ONLY raw Markdown.
    `;

    const response = await client.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          { text: prompt }
        ]
      }
    });

    if (response.text) {
      const outputFilename = filename.replace(ext, '.md');
      const outputPath = path.join(OUTPUT_DIR, outputFilename);
      fs.writeFileSync(outputPath, response.text);
      // bar.log(`✅ Saved: ${outputFilename}\n`); // Optional: Log success
    } else {
      bar.stop(); // Stop bar to print error clearly
      console.error(`❌ No response text for ${filename}`);
      bar.start(bar.getTotal(), bar.value, { filename: 'Retrying...' }); // Restart/Resume logic roughly
    }

  } catch (error: any) {
    // bar.stop();
    // console.error(`❌ Failed to process ${filename}:`, error.message);
    // bar.start(bar.getTotal(), bar.value, { filename: 'Continuing...' });
  }
}

async function main() {
  console.log("🚀 Starting Batch Analysis...");

  // Parse arguments
  let templateName = 'standard';
  const args = process.argv.slice(2);
  const templateArg = args.find(arg => arg.startsWith('--template='));
  if (templateArg) {
    templateName = templateArg.split('=')[1];
  }

  const templateFile = `${templateName}.md`;
  const templatePath = path.join(process.cwd(), 'templates', templateFile);
  
  // Load Template
  let templateContent = "";
  try {
     if (fs.existsSync(templatePath)) {
        templateContent = fs.readFileSync(templatePath, 'utf-8');
        console.log(`📝 Using template: ${templateName} (${templateFile})`);
     } else {
        console.error(`❌ Template '${templateName}' not found.`);
        console.log("👉 Available templates:");
        const available = fs.readdirSync(path.join(process.cwd(), 'templates'))
                            .filter(f => f.endsWith('.md'))
                            .map(f => `   - ${f.replace('.md', '')}`);
        console.log(available.join('\n'));
        return;
     }
  } catch (e) {
     console.error("Error reading template:", e);
     return;
  }

  // Find Files
  const files = fs.readdirSync(INPUT_DIR).filter(f => f.toLowerCase().endsWith('.pdf'));
  
  if (files.length === 0) {
    console.log("⚠️ No PDF files found in the 'input' directory.");
    console.log("👉 Please put your research papers in:", INPUT_DIR);
    return;
  }

  console.log(`Found ${files.length} PDF(s).`);

  // Initialize Progress Bar
  const bar = new cliProgress.SingleBar({
      format: 'Progress |' + '{bar}' + '| {percentage}% || {value}/{total} Files || {duration_formatted} || Processing: {filename}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
  });

  bar.start(files.length, 0, { filename: 'Starting...' });

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Process sequentially to avoid rate limits
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    await processFile(file, templateContent, bar);
    bar.increment();
    
    // Rate limit pause (skip after last file)
    if (i < files.length - 1) {
       bar.update({ filename: 'Cooling down (10s)...' });
       await sleep(10000);
    }
  }

  bar.stop();
  console.log("\n🎉 Batch processing complete!");
}

main();
