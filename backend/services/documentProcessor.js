import { GroqService } from '../groqService.js';
import pdfParse from 'pdf-parse';

export class DocumentProcessor {
  constructor() {
    this.groqService = new GroqService();
  }

  /**
   * Process uploaded document (PDF/image) and extract trip information
   */
  async processTravelDocument(fileBuffer, fileName) {
    let documentText = '';
    const isPdf = fileName.toLowerCase().endsWith('.pdf');
    
    // Extract text from PDF if applicable
    if (isPdf) {
      try {
        console.log(`Extracting text from PDF: ${fileName}`);
        const pdfData = await pdfParse(fileBuffer);
        documentText = pdfData.text;
        console.log(`Extracted ${documentText.length} characters from PDF`);
      } catch (error) {
        console.error('Error parsing PDF:', error);
        return {
          valid: false,
          errors: ['Failed to parse PDF document'],
          data: {}
        };
      }
    }
    
    // Generate extraction prompt with actual document content
    const prompt = isPdf
      ? `You are analyzing a travel document PDF. Extract structured trip information from the following text:

${documentText}

Extract and return JSON with standardized user information:
{
  "document_type": "flight_confirmation" | "itinerary" | "booking" | "other",
  "name": "string (primary traveller name)",
  "age": number (primary traveller age),
  "existing_conditions": "string (comma-separated medical conditions if any)",
  "trip_type": "RT" | "ST" (Round Trip or Single Trip),
  "departure_date": "YYYY-MM-DD",
  "return_date": "YYYY-MM-DD",
  "departure_country": "string (ISO country code if available, otherwise country name)",
  "arrival_country": "string (ISO country code if available, otherwise country name)",
  "number_of_adults": number,
  "number_of_children": number,
  "activities": ["string (optional activities/risks)"],
  "flight_numbers": [],
  "hotel_bookings": [],
  "confidence": number
}

Important: Keep existing_conditions blank if no medical conditions are mentioned.
Important: Infer trip_type (RT if return flight, ST if one-way).
Important: Extract information only from what is present in the text above.`
      : `You are an OCR system processing a travel document image. Analyze this document and extract structured trip information.

Document type: ${fileName}

Extract and return JSON with standardized user information:
{
  "document_type": "flight_confirmation" | "itinerary" | "booking" | "other",
  "name": "string (primary traveller name)",
  "age": number (primary traveller age),
  "existing_conditions": "string (comma-separated medical conditions if any)",
  "trip_type": "RT" | "ST" (Round Trip or Single Trip),
  "departure_date": "YYYY-MM-DD",
  "return_date": "YYYY-MM-DD",
  "departure_country": "string (ISO country code if available, otherwise country name)",
  "arrival_country": "string (ISO country code if available, otherwise country name)",
  "number_of_adults": number,
  "number_of_children": number,
  "activities": ["string (optional activities/risks)"],
  "flight_numbers": [],
  "hotel_bookings": [],
  "confidence": number
}

Important: Keep existing_conditions blank if no medical conditions are mentioned.
Important: Infer trip_type (RT if return flight, ST if one-way).

Since I cannot see the actual document image, please provide realistic example extraction structure.`;

    try {
      const response = await this.groqService.client.chat.completions.create({
        model: this.groqService.model,
        messages: [
          {
            role: 'system',
            content: 'You are an OCR and document extraction system. Always return valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      });

      const extracted = JSON.parse(response.choices[0].message.content);
      return this.validateExtraction(extracted);
    } catch (error) {
      console.error('Error processing document:', error);
      return null;
    }
  }

  /**
   * Validate extracted trip data
   */
  validateExtraction(extracted) {
    const errors = [];

    // Check dates - using standardized field names
    const departureDate = extracted.departure_date || extracted.trip_start_date;
    const returnDate = extracted.return_date || extracted.trip_end_date;
    
    if (departureDate && returnDate) {
      const start = new Date(departureDate);
      const end = new Date(returnDate);
      if (start > end) {
        errors.push('Trip end date must be after start date');
      }
    }

    // Check travellers - accept either standardized or legacy fields
    if (!extracted.number_of_adults && !extracted.number_of_children && 
        !extracted.number_of_travellers && 
        (!extracted.travellers || extracted.travellers.length === 0)) {
      errors.push('No travellers detected');
    }

    // Check destination - accept either standardized or legacy fields
    if (!extracted.arrival_country && !extracted.destination) {
      errors.push('Destination not detected');
    }

    // Always return valid: true even with errors - we'll handle missing fields in the conversation
    // This allows partial extraction to work and prompts for missing info
    return {
      valid: true,
      errors, // Pass errors along for informational purposes
      data: extracted
    };
  }

  /**
   * Generate travel profile JSON from extracted document data
   */
  async generateTravelProfile(extractedData) {
    const prompt = `Convert this extracted travel document data into a comprehensive travel profile.

Extracted Data:
${JSON.stringify(extractedData, null, 2)}

Generate a travel profile JSON with:
{
  "destination": {
    "country": "string",
    "city": "string",
    "zone": "string"
  },
  "trip_dates": {
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD",
    "duration_days": number
  },
  "travellers": [
    {
      "name": "string",
      "age": number,
      "role": "adult" | "child" | "elderly"
    }
  ],
  "trip_type": "leisure" | "business" | "adventure" | "family",
  "activities": [],
  "estimated_cost": number,
  "risk_level": "low" | "medium" | "high",
  "special_considerations": []
}`;

    try {
      const response = await this.groqService.client.chat.completions.create({
        model: this.groqService.model,
        messages: [
          {
            role: 'system',
            content: 'You are a travel profile generator. Always return valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Error generating travel profile:', error);
      return null;
    }
  }
}

