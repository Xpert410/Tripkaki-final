import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from frontend directory
app.use(express.static(join(__dirname, '../frontend')));

// Simple chat endpoint that works
app.post('/api/chat', (req, res) => {
    const { message, conversationId } = req.body;
    
    console.log('Received message:', message);
    
    // Simple TripKaki response
    const responses = [
        "Great! I can help you with travel insurance for Japan. Let me find the best options for your trip.",
        "I'd be happy to help you compare travel insurance plans. What type of coverage are you looking for?",
        "Perfect! I can assist you with purchasing travel insurance. Let me show you our available policies.",
        "Thanks for reaching out! I'm TripKaki, your travel insurance concierge. How can I help you today?"
    ];
    
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    
    res.json({
        message: randomResponse,
        conversationId: conversationId || 'default',
        timestamp: new Date().toISOString()
    });
});

// API health check
app.get('/api', (req, res) => {
    res.json({ 
        status: 'TripKaki API running',
        timestamp: new Date().toISOString(),
        message: 'Ready to help with travel insurance!'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`TripKaki server running on http://localhost:${PORT}`);
    console.log(`Frontend available at http://localhost:${PORT}`);
});