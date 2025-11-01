# TripKaki Architecture Documentation

## Overview

TripKaki (MSIG Intelligent Conversational Agent) is a next-generation travel insurance concierge that combines AI reasoning, document intelligence, and proprietary MSIG data to provide end-to-end insurance services.

## Core Architecture Blocks

### BLOCK 1: Policy Wording Intelligence & Taxonomy Normalization

**Location:** `backend/services/taxonomyEngine.js`

**Purpose:** Parse and normalize policy documents into structured taxonomy

**Key Features:**
- 4-layer taxonomy structure:
  - Layer 1: General Conditions (eligibility, exclusions)
  - Layer 2: Benefits Structure
  - Layer 3: Benefit-Specific Conditions
  - Layer 4: Operational Parameters
- Groq-powered PDF parsing
- Dual access: Normalized (comparison) + Raw (legal FAQ)

**API Endpoint:**
```
POST /api/parse-policy
Body: { pdf_text: string, product_name: string }
Response: { extracted: {...}, normalized: {...} }
```

### BLOCK 2: Conversational FAQ & Intelligent Product Recommendation

**Location:** `backend/services/taxonomyEngine.js` + `backend/conversationManager.js`

**Purpose:** Dynamic query routing based on question type

**Query Types:**
- `comparison` → Normalized taxonomy matrix
- `explanation` → Raw text + context
- `eligibility` → Rule-based yes/no + conditions
- `scenario` → Groq simulation of coverage outcome

**API Endpoint:**
```
POST /api/faq
Body: { 
  question: string, 
  policy_context: object,
  query_type: 'comparison' | 'explanation' | 'eligibility' | 'scenario'
}
```

### BLOCK 3: Document Intelligence & Auto-Quotation

**Location:** `backend/services/documentProcessor.js`

**Purpose:** Extract trip data from travel documents (flight confirmations, itineraries)

**Pipeline:**
1. OCR/document processing (via Groq)
2. Structured extraction (travellers, dates, destination, cost)
3. Validation (chronology, names, geography)
4. Travel profile generation
5. Instant quotation via MCP Tools

**API Endpoint:**
```
POST /api/upload-document
Content-Type: multipart/form-data
Body: { document: File }
Response: {
  extracted: {...},
  travel_profile: {...},
  claims_intelligence: {...},
  quotation: {...}
}
```

### BLOCK 4: Purchase Engine Integration

**Location:** `backend/services/mcpTools.js`

**Purpose:** Handle quote acceptance → policy issuance

**Flow:**
1. User accepts quote
2. Call `MCP.purchase()` with quotation + payment details
3. Process payment (simulated)
4. Return policy PDF + emergency card URLs
5. Confirm activation in chat

**API Endpoint:**
```
POST /api/session/:sessionId/payment
Body: {
  quotation_id: string,
  plan_id: string,
  payment_details: object,
  customer_info: object
}
```

### BLOCK 5: MSIG Proprietary Intelligence

**Location:** `backend/services/claimsIntelligence.js`

**Purpose:** Evidence-based guidance using historical claims data

**Features:**
- Claims frequency by destination/activity
- Tier recommendations based on claim thresholds
- Risk prediction for scenarios
- Integration with Groq for intelligent analysis

**API Endpoint:**
```
POST /api/claims-intelligence
Body: { destination: string, activities: string[] }
Response: {
  intelligence: {...},
  recommendation: {...}
}
```

## Groq API Utilization

**Location:** `backend/services/groqIntelligence.js`

### Functions:

1. **`extractPolicy(pdfText)`** → Parse policy documents
2. **`predictClaimRisk(tripProfile, claimsHistory)`** → Risk assessment
3. **`comparePolicies(policy1, policy2)`** → Side-by-side comparison
4. **`simulateCoverage(scenario, policyData)`** → Coverage outcome simulation
5. **`chatCompletion(messages, context)`** → Conversational responses

## Data Schema

### Trip Profile (`trip_profile.json`)
```json
{
  "destination": { "country": string, "city": string, "zone": string },
  "trip_dates": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "duration_days": number },
  "travellers": [{ "name": string, "age": number, "role": string }],
  "trip_type": string,
  "activities": string[],
  "estimated_cost": number,
  "risk_level": string
}
```

### Taxonomy Schema (`taxonomy_schema.json`)
Uses the structure from `Taxonomy_Hackathon.json`:
- `layer_1_general_conditions`: Eligibility and exclusions
- `layer_2_benefits`: Benefit types and limits
- `layer_3_benefit_conditions`: When coverage applies
- `layer_4_operational_parameters`: Deductibles, providers, claim rules

### Plan Matrix (`plan_matrix.json`)
Generated dynamically via MCP Tools based on travel profile.

### Conversation State (`conversation_state.json`)
```json
{
  "session_id": string,
  "step": "trip_intake" | "persona_classification" | ...,
  "trip_data": object,
  "persona": string,
  "selected_plan": object,
  "addons": array,
  "conversation_history": array,
  "extracted_documents": array,
  "quotation": object
}
```

## Memory System

### Session Context
- Per-session dictionary: trip profile, plan choices, extracted docs, last responses
- Stored in `ConversationManager.sessions`

### Long-term Memory
- For returning customers (future enhancement)
- Could integrate with user database/CRM

## Frontend Architecture

**Location:** `frontend/`

**Components:**
- Chat interface with TripKaki avatar
- File upload zone (PDFs/screenshots)
- Plan comparison dashboard
- Quote and purchase summary screen

**Key Features:**
- Real-time chat with typing indicators
- Document upload with instant extraction
- Visual plan cards with pricing
- Claims intelligence display
- Comparison tables

## API Routes Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/chat` | POST | Main conversation endpoint |
| `/api/parse-policy` | POST | Parse policy PDF into taxonomy |
| `/api/faq` | POST | Intelligent FAQ with routing |
| `/api/upload-document` | POST | Document OCR + auto-quotation |
| `/api/claims-intelligence` | POST | Get claims data & recommendations |
| `/api/compare-plans` | POST | Side-by-side plan comparison |
| `/api/simulate-coverage` | POST | Simulate coverage scenario |
| `/api/session/:id` | GET | Get session state |
| `/api/session/:id/confirm` | POST | Confirm trip details |
| `/api/session/:id/payment` | POST | Process purchase |

## Technology Stack

- **Backend:** Node.js + Express
- **AI Engine:** Groq API (Llama 3.3 70B)
- **File Processing:** Multer for uploads
- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **State Management:** In-memory sessions
- **Data:** Taxonomy JSON, Claims intelligence (simulated)

## Development Guidelines

### Tone & Behavior
- Empathetic, concise, protective
- Never hard-sell
- Natural conversation flow
- Legal precision when needed
- Escalate when coverage question exceeds scope

### Compliance
- Preserve legal precision from raw policy text
- Never expose policy IDs, session tokens, or card numbers
- All recommendations must show reason or data insight

### Error Handling
- Graceful fallbacks for Groq API failures
- Clear error messages to users
- Log errors for debugging

## Future Enhancements

1. **Real OCR Integration:** Replace Groq simulation with actual OCR service
2. **MCP SDK:** Connect to real MSIG MCP tools
3. **Claims Database:** Real database connection for claims data
4. **User Authentication:** Long-term memory for returning customers
5. **Policy PDF Generation:** Actual PDF generation from templates
6. **Payment Gateway:** Real payment processing integration

