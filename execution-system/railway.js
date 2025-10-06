const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(cors());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Supported languages
const SUPPORTED_LANGUAGES = ['python', 'javascript', 'typescript', 'java', 'cpp', 'c'];

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'CodeArena Execution System running on Railway',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Code execution endpoint (simplified for Railway)
app.post('/execute', async (req, res) => {
    try {
        const { code, language, input } = req.body;

        // Validate request
        if (!code) {
            return res.status(400).json({ error: 'Code is required' });
        }
        if (!language) {
            return res.status(400).json({ error: 'Language is required' });
        }
        if (!SUPPORTED_LANGUAGES.includes(language)) {
            return res.status(400).json({ 
                error: `Unsupported language. Supported languages are: ${SUPPORTED_LANGUAGES.join(', ')}` 
            });
        }
        if (code.length > 64 * 1024) { // 64KB limit
            return res.status(400).json({ error: 'Code size exceeds limit (64KB)' });
        }

        // For Railway deployment, return a message indicating Docker execution is not available
        // In production, you would integrate with a separate Docker execution service
        res.json({
            success: true,
            message: 'Code execution service is running on Railway. Docker execution requires a separate deployment.',
            language,
            codeLength: code.length,
            input: input || 'No input provided',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Execution error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});

// Status endpoint
app.get('/status', (req, res) => {
    res.json({
        service: 'CodeArena Execution System',
        status: 'running',
        deployment: 'railway',
        docker: false,
        timestamp: new Date().toISOString()
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// Start server
app.listen(port, '0.0.0.0', () => {
    console.log(`[RAILWAY] CodeArena Execution System listening on port ${port}`);
    console.log(`[RAILWAY] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[RAILWAY] Health check available at /health`);
}); 