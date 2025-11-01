# TripKaki Setup Guide

## Quick Start

### 1. Install Dependencies

**Prerequisites:** Node.js 18+ and npm

```bash
cd backend
npm install
```

### 2. Start Backend Server

```bash
cd backend
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

The backend will start on `http://localhost:8000`

### 3. Open Frontend

Simply open your browser and navigate to:
```
http://localhost:8000
```

The backend server automatically serves the frontend files, so everything runs from one place!

## Testing the Flow

Start a conversation with TripKaki like this:

1. **Trip Intake:**
   - "I'm going to Hokkaido from Dec 12 to Dec 18"
   - "2 travelers, planning to ski"
   - "My dad has diabetes"

2. **Follow the conversation** through:
   - Persona classification
   - Plan recommendation
   - Add-ons
   - Coverage gap check
   - Bind confirmation
   - Payment
   - Post-purchase support

## API Endpoints

All API endpoints are prefixed with `/api`:

- `POST /api/chat` - Send message to TripKaki
- `GET /api/session/{session_id}` - Get session state
- `POST /api/session/{session_id}/confirm` - Confirm trip details
- `POST /api/session/{session_id}/payment` - Process payment

The frontend is served at the root (`/`) and automatically accesses these API endpoints.

## Troubleshooting

### Backend won't start
- Make sure port 8000 is available
- Check that Node.js 18+ is installed (`node --version`)
- Verify all dependencies are installed (`npm install`)
- Verify Groq API key is correct in `groqService.js`

### Frontend can't connect
- Ensure backend is running on `http://localhost:8000`
- Check browser console for CORS errors
- If using file:// protocol, switch to http://localhost:8080

### Groq API errors
- Verify API key is valid
- Check internet connection
- The system will fall back to default intelligence if Groq fails

## Notes

- Session data is stored in memory (cleared on restart)
- Payment processing is simulated
- Groq API key is configured in `backend/groqService.js`
- Requires Node.js 18+ and npm

