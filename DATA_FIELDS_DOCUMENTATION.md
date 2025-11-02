# User Information Data Fields

## Overview
The database now stores standardized user information fields for all travel insurance sessions. These fields are automatically extracted from conversations or document uploads.

## Data Fields Schema

### Personal Information
- **name** (String): Primary traveller's name
  - Extracted from: "I am John", "My name is Jane", etc.
  
- **age** (Integer): Primary traveller's age
  - Extracted from: "I am 35", "I'm 28 years old", etc.

- **existing_conditions** (String): Medical conditions (comma-separated)
  - Examples: "diabetes", "asthma, heart condition"
  - Detected from medical keywords in conversation

### Trip Information
- **trip_type** (String): "RT" (Round Trip) or "ST" (Single Trip)
  - Auto-detected from: "round trip", "return trip" → "RT"
  - Auto-detected from: "single trip", "one way" → "ST"
  
- **departure_date** (String): Format YYYY-MM-DD
  - Extracted from conversation or document
  - Legacy field: `trip_start_date` (backward compatible)
  
- **return_date** (String): Format YYYY-MM-DD
  - Extracted from conversation or document
  - Legacy field: `trip_end_date` (backward compatible)

- **departure_country** (String): ISO country code or country name
  - Extracted from: "from Singapore", "leaving from SG"
  
- **arrival_country** (String): ISO country code or country name
  - Usually the destination country
  - Extracted from: "to Japan", "arriving at JP"

### Traveller Count
- **number_of_adults** (Integer): Number of adult travellers
  - Extracted from: "2 adults", "travelling with my spouse"
  
- **number_of_children** (Integer): Number of child travellers
  - Extracted from: "1 child", "2 kids"

- **number_of_travellers** (Integer): Total travellers (legacy field)
  - Still supported for backward compatibility
  - Used when adults/children not separately specified

## Data Storage

### Session Object Structure
All data is stored in `conversationManager.sessions[sessionId].trip_data`:

```javascript
{
  session_id: "uuid",
  step: "trip_intake",
  trip_data: {
    // New standardized fields
    name: "John Doe",
    age: 35,
    existing_conditions: "diabetes",
    trip_type: "RT",
    departure_date: "2024-12-12",
    return_date: "2024-12-18",
    departure_country: "Singapore",
    arrival_country: "Japan",
    number_of_adults: 2,
    number_of_children: 0,
    
    // Legacy fields (still supported)
    destination: "Japan",
    trip_start_date: "2024-12-12",
    trip_end_date: "2024-12-18",
    number_of_travellers: 2,
    medical_flags: ["diabetes"],
    activities: ["skiing"],
    trip_style: "adventure"
  },
  persona: "Adventurous Explorer",
  selected_plan: {...},
  addons: [],
  conversation_history: [...],
  created_at: "2024-12-01T10:00:00.000Z"
}
```

## Data Extraction

### From Conversation (`extractTripInfo`)
The `ConversationManager.extractTripInfo()` method extracts fields from natural language:
- Uses regex patterns to identify keywords
- Intelligently parses dates and normalizes to YYYY-MM-DD
- Detects trip type from phrases
- Separates adult/child counts
- Identifies medical conditions from keywords

### From Document Upload (`processTravelDocument`)
The `DocumentProcessor.processTravelDocument()` method extracts fields from documents:
- Uses Groq AI vision capabilities (OCR simulation)
- Structured extraction from flight confirmations, itineraries
- Returns standardized JSON format
- Validates extracted data

## Bind Summary Display

When users reach the confirmation step, `_generateBindSummary()` displays all collected information:

```
Let me read this back:

Name: John Doe
Age: 35
Trip Type: RT
Departure Date: 2024-12-12
Return Date: 2024-12-18
Departure Country: Singapore
Arrival Country: Japan
Number of Adults: 2
Number of Children: 0
Existing Conditions: diabetes
Activities: skiing
```

## API Endpoints

All user data is accessible via:

- `GET /api/session/:sessionId` - Returns full session including trip_data
- `POST /api/chat` - Extracts and stores fields during conversation
- `POST /api/upload-document` - Extracts and stores fields from documents

## Backward Compatibility

Legacy fields are maintained for compatibility:
- `trip_start_date` → `departure_date`
- `trip_end_date` → `return_date`
- `destination` → `arrival_country`
- `medical_flags[]` → `existing_conditions` (String)
- `number_of_travellers` → Used if adults/children not specified separately

## Example Usage

### Conversation Example
User: "Hi, I'm John, 35 years old. I'm traveling from Singapore to Hokkaido from Dec 12 to Dec 18, round trip. 2 adults. My dad has diabetes and we're planning to ski."

Extracted:
```javascript
{
  name: "John",
  age: 35,
  trip_type: "RT",
  departure_date: "2024-12-12",
  return_date: "2024-12-18",
  departure_country: "Singapore",
  arrival_country: "Hokkaido",
  number_of_adults: 2,
  existing_conditions: "diabetes",
  activities: ["skiing"]
}
```

### Document Upload Example
Upload a flight confirmation PDF and extract:
```javascript
{
  name: "John Doe",
  age: 35,
  trip_type: "RT",
  departure_date: "2024-12-12",
  return_date: "2024-12-18",
  departure_country: "SG",
  arrival_country: "JP",
  number_of_adults: 2,
  number_of_children: 0
}
```

## Database Integration

Currently, session data is stored in memory (`conversationManager.sessions`). For production:
- Consider persisting to database (PostgreSQL, MongoDB, etc.)
- Use the standardized field names for consistency
- Index on frequently queried fields (dates, countries, trip_type)
- Consider GDPR compliance for personal data storage


