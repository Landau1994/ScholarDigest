import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        {
          name: 'save-template-api',
          configureServer(server) {
            server.middlewares.use('/api/save-template', (req, res, next) => {
              if (req.method === 'POST') {
                let body = '';
                req.on('data', (chunk) => {
                  body += chunk.toString();
                });
                req.on('end', () => {
                  try {
                    const { name, content } = JSON.parse(body);
                    if (!name || !content) {
                      res.statusCode = 400;
                      res.end(JSON.stringify({ error: 'Missing name or content' }));
                      return;
                    }
                    
                    // Sanitize filename: allow only alphanumeric, dashes, and underscores
                    const safeName = name.replace(/[^a-z0-9_\- ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase();
                    const filePath = path.join(__dirname, 'templates', `${safeName}.md`);
                    
                    fs.writeFileSync(filePath, content);
                    
                    console.log(`[ScholarDigest] Saved template to ${filePath}`);
                    
                    res.setHeader('Content-Type', 'application/json');
                    res.statusCode = 200;
                    res.end(JSON.stringify({ success: true, filename: `${safeName}.md` }));
                  } catch (e: any) {
                    console.error('Error saving template:', e);
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: e.message }));
                  }
                });
              } else {
                next();
              }
            });

            // New: List all templates
            server.middlewares.use('/api/templates', (req, res, next) => {
               if (req.method === 'GET') {
                  try {
                     const templatesDir = path.join(__dirname, 'templates');
                     if (!fs.existsSync(templatesDir)) {
                        fs.mkdirSync(templatesDir);
                     }

                     const files = fs.readdirSync(templatesDir).filter(file => file.endsWith('.md'));
                     
                     const templates = files.map(file => {
                        const content = fs.readFileSync(path.join(templatesDir, file), 'utf-8');
                        // Convert filename to readable name (e.g., "my-template.md" -> "My Template")
                        const name = file.replace('.md', '')
                           .split('-')
                           .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                           .join(' ');
                           
                        return {
                           id: file.replace('.md', ''),
                           name: name,
                           content: content,
                           isDefault: ['standard', 'brief', 'methods'].includes(file.replace('.md', '')) // optional flag
                        };
                     });

                     res.setHeader('Content-Type', 'application/json');
                     res.statusCode = 200;
                     res.end(JSON.stringify(templates));
                  } catch (e: any) {
                     console.error('Error listing templates:', e);
                     res.statusCode = 500;
                     res.end(JSON.stringify({ error: e.message }));
                  }
               } else {
                  next();
               }
            });

            // History API
            server.middlewares.use('/api/history', (req, res, next) => {
              const tempDir = path.join(__dirname, 'temp');
              const historyFile = path.join(tempDir, 'history.json');
              
              if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir);
              }

              if (req.method === 'GET') {
                try {
                  if (fs.existsSync(historyFile)) {
                    const history = fs.readFileSync(historyFile, 'utf-8');
                    res.setHeader('Content-Type', 'application/json');
                    res.statusCode = 200;
                    res.end(history);
                  } else {
                    res.setHeader('Content-Type', 'application/json');
                    res.statusCode = 200;
                    res.end(JSON.stringify([])); // Return empty array if no history
                  }
                } catch (e: any) {
                  console.error('Error reading history:', e);
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: e.message }));
                }
              } else if (req.method === 'POST') {
                  let body = '';
                  req.on('data', (chunk) => {
                    body += chunk.toString();
                  });
                  req.on('end', () => {
                    try {
                      const newHistoryItem = JSON.parse(body);
                      let history = [];
                      if (fs.existsSync(historyFile)) {
                          history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
                      }
                      
                      const updatedHistory = [newHistoryItem, ...history].slice(0, 3);
                      
                      fs.writeFileSync(historyFile, JSON.stringify(updatedHistory, null, 2));
                      
                      res.setHeader('Content-Type', 'application/json');
                      res.statusCode = 200;
                      res.end(JSON.stringify(updatedHistory));
                    } catch (e: any) {
                      console.error('Error saving history:', e);
                      res.statusCode = 500;
                      res.end(JSON.stringify({ error: e.message }));
                    }
                });
              } else {
                next();
              }
            });
          },
        }
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
