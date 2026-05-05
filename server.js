const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const LOG_FILE = 'vraag_log_v2.csv';
const ENV_FILE = '.env';

// Simpele .env parser
let config = {};
if (fs.existsSync(ENV_FILE)) {
    const envContent = fs.readFileSync(ENV_FILE, 'utf-8');
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) config[key.trim()] = value.trim();
    });
}

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm',
    '.txt': 'text/plain',
    '.csv': 'text/csv'
};

if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, 'Timestamp;Vraag;Thema\n');
}

http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);
    
    // 1. Proxy voor OpenAI API
    if (req.url.startsWith('/api/chat') && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            const clientData = JSON.parse(body);
            
            const options = {
                hostname: 'api.openai.com',
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.OPENAI_API_KEY}`
                }
            };

            const proxyReq = https.request(options, (proxyRes) => {
                let proxyData = '';
                proxyRes.on('data', (chunk) => { proxyData += chunk; });
                proxyRes.on('end', () => {
                    res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
                    res.end(proxyData);
                });
            });

            proxyReq.on('error', (e) => {
                res.writeHead(500);
                res.end(JSON.stringify({ error: e.message }));
            });

            // OpenAI verwacht 'messages' array in plaats van 'contents'
            const openAiBody = {
                model: "gpt-4o",
                messages: clientData.messages,
                temperature: 0.7
            };

            proxyReq.write(JSON.stringify(openAiBody));
            proxyReq.end();
        });
        return;
    }

    // 2. Logging endpoint
    if (req.url === '/log' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            console.log('Log body:', body);
            try {
                const data = JSON.parse(body);
                const timestamp = new Date().toISOString();
                const logLine = `${timestamp};${data.vraag};${data.thema}\n`;
                fs.appendFileSync(LOG_FILE, logLine);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success' }));
            } catch (e) {
                console.error("Log JSON parse error:", e.message, "Body length:", body.length);
                res.writeHead(400);
                res.end('Invalid JSON');
            }
        });
        return;
    }

    // 3. Statische bestanden serveren
    let filePath = '.' + decodeURIComponent(req.url);
    if (filePath === './') filePath = './index.html';

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(error.code === 'ENOENT' ? 404 : 500);
            res.end(error.code === 'ENOENT' ? 'Not found' : 'Error');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}).listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log("Using OpenAI API Proxy");
});
