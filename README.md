# TripKaki - MSIG Intelligent Conversational Agent

TripKaki is a next-generation travel insurance concierge built for the MSIG × Ancileo Innovation Challenge. It transforms complex insurance data into natural, compliant, and intelligent conversation that quotes, compares, and completes policies end-to-end.

## 🎯 Mission

Turn complex insurance data into natural, compliant, and intelligent conversation that quotes, compares, and completes policies end-to-end using:
- **Groq API** → Reasoning and data-processing brain
- **MCP Tools** → MSIG's proprietary comparison, quotation, and purchase engines
- **OCR/Vision Stack** → Document uploads (flight confirmations, itineraries)
- **MSIG Claims Intelligence** → Evidence-based recommendations

## 🧩 Core Architecture Blocks

### BLOCK 1: Policy Wording Intelligence & Taxonomy Normalization
- 4-layer taxonomy engine for policy documents
- Groq-powered PDF parsing
- Dual access: Normalized (comparison) + Raw (legal FAQ)

### BLOCK 2: Conversational FAQ & Intelligent Product Recommendation
- Dynamic query routing (comparison, explanation, eligibility, scenario)
- Memory system with session context
- Seamless blend of normalized comparisons and legal explanations

### BLOCK 3: Document Intelligence & Auto-Quotation
- OCR/document processing for travel documents
- Structured extraction (travellers, dates, destination, cost)
- Instant quotation in < 10 seconds

### BLOCK 4: Purchase Engine Integration
- MCP Tools integration for quotation and purchase
- Payment processing with policy issuance
- Policy PDF + emergency card delivery

### BLOCK 5: MSIG Proprietary Intelligence
- Historical claims data integration
- Evidence-based tier recommendations
- Risk prediction using claim thresholds

## Features

- 🧠 **Groq AI Integration** - Advanced reasoning, extraction, comparison, simulation
- 📄 **Document Upload** - Upload flight confirmations, itineraries for instant quotes
- 🔍 **Policy Intelligence** - Parse and normalize policy documents into structured taxonomy
- 💬 **Intelligent FAQ** - Query routing for comparisons, explanations, eligibility, scenarios
- 📊 **Claims Intelligence** - Evidence-based recommendations using MSIG historical data
- 🎭 **Persona Classification** - Automatically identifies traveler type
- 💡 **Smart Recommendations** - AI-powered plan suggestions with risk insights
- 🛡️ **Coverage Gap Analysis** - Identifies what's covered and what's not
- 💳 **MCP Purchase Integration** - Complete purchase flow with policy issuance
- 📱 **Talking Avatar** - Visual feedback with animated avatar
- 📋 **Comparison Dashboard** - Side-by-side plan comparison

## Architecture

### Backend (Node.js/Express)
- `server.js` - Main API server with endpoints
- `groqService.js` - Groq API integration for intelligence
- `conversationManager.js` - Conversation flow management
- `package.json` - Dependencies and scripts

### Frontend
- `index.html` - Main UI with talking avatar
- `styles.css` - Modern, responsive styling
- `app.js` - Chat interface and API communication

## Installation

### Quick Start

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Open your browser:**
   Navigate to `http://localhost:8000`

That's it! The backend serves both the API and the frontend from one server.

For development with auto-reload:
```bash
npm run dev
```

## Usage

1. Start the backend server
2. Open the frontend in a browser
3. Start chatting with TripKaki about your trip
4. Follow the 8-step conversation flow:
   - Trip intake
   - Persona classification
   - Plan recommendation
   - Smart add-ons
   - Coverage gap check
   - Bind confirmation
   - Payment
   - Post-purchase support

## Conversation Flow

TripKaki follows a strict 8-step flow:

1. **Trip Intake** - Collects destination, dates, travelers, activities, medical conditions
2. **Persona Classification** - Identifies traveler type using AI
3. **Base Plan Recommendation** - Suggests 2-3 personalized plans
4. **Smart Add-ons** - Offers targeted add-ons based on destination risks
5. **Coverage Gap Check** - Explains what's covered and what's not
6. **Bind Check** - Confirms all trip details before payment
7. **Payment** - Processes payment securely
8. **Post-Purchase Support** - Provides emergency contacts and claim instructions

## API Endpoints

### Core Conversation
- `POST /api/chat` - Send message to TripKaki
- `GET /api/session/{session_id}` - Get session state
- `POST /api/session/{session_id}/confirm` - Confirm trip details
- `POST /api/session/{session_id}/payment` - Process purchase

### Policy Intelligence
- `POST /api/parse-policy` - Parse policy PDF into taxonomy
- `POST /api/faq` - Intelligent FAQ with query routing

### Document & Quotation
- `POST /api/upload-document` - Upload travel document for auto-quotation
- `POST /api/compare-plans` - Side-by-side plan comparison

### Claims Intelligence
- `POST /api/claims-intelligence` - Get claims data & tier recommendations
- `POST /api/simulate-coverage` - Simulate coverage scenario

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed API documentation.

## Groq API

TripKaki uses Groq API for:
- Trip intelligence and risk analysis
- Persona classification
- Plan recommendations with pricing
- Destination-specific claim insights
- Coverage gap identification

## Technologies

- **Backend**: Node.js, Express
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **AI**: Groq API (Llama 3.3 70B)
- **State Management**: In-memory session storage

## Notes

- Groq API key is configured in `groqService.js`
- Payment processing is simulated
- Session data is stored in memory (restart clears sessions)
- Frontend expects backend at `http://localhost:8000`
- Node.js version 18+ recommended

