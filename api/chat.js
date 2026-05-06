const https = require('https');

export default function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { messages } = req.body;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'OpenAI API Key is missing in Vercel settings.' });
    }

    const openAiBody = {
        model: "gpt-4o",
        messages: messages,
        temperature: 0.7
    };

    const options = {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }
    };

    const proxyReq = https.request(options, (proxyRes) => {
        let proxyData = '';
        proxyRes.on('data', (chunk) => { proxyData += chunk; });
        proxyRes.on('end', () => {
            res.status(proxyRes.statusCode).send(proxyData);
        });
    });

    proxyReq.on('error', (e) => {
        res.status(500).json({ error: e.message });
    });

    proxyReq.write(JSON.stringify(openAiBody));
    proxyReq.end();
}
