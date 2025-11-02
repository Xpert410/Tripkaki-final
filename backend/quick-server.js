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
app.use(express.static(join(__dirname, '../frontend')));

// Chat endpoint
app.post('/api/chat', (req, res) => {
    const { message } = req.body;
    console.log('Received:', message);
    
    const responses = [
        "Great! I can help you with travel insurance for Japan. What are your travel dates?",
        "Perfect! Let me find the best travel insurance options for your Japan trip.",
        "I'd be happy to assist with travel insurance. What type of coverage do you need?",
        "Thanks for choosing TripKaki! How can I help with your travel insurance today?"
    ];
    
    const response = responses[Math.floor(Math.random() * responses.length)];
    
    res.json({
        message: response,
        conversationId: req.body.conversationId || 'default'
    });
});

// Health check
app.get('/api', (req, res) => {
    res.json({ status: 'TripKaki API running!' });
});

app.listen(PORT, () => {
    console.log(`TripKaki server running on http://localhost:${PORT}`);
});