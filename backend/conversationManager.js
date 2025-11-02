export class ConversationManager {
  constructor() {
    this.sessions = {};
    this.systemPrompt = `You are TripKaki — an AI Travel Insurance Concierge with a talking avatar.
You help travelers find, customize, and purchase the right travel insurance in a way that feels personal, smart, and protective — never pushy.

Your job is to guide the user through the entire purchase journey conversationally:
1. Understand the trip
2. Classify the traveler persona
3. Recommend a base plan
4. Offer smart add-ons
5. Expose remaining gaps
6. Confirm details (bind check)
7. Handle payment
8. Provide post-purchase crisis support

Sound like a friendly Singaporean: short sentences, calm, protective, mix in some Singlish expressions naturally like "lah", "leh", "ah", "can" (but don't overdo it).
Never dump walls of text.
Never use tier names like Basic / Premium / Platinum.
Never hard-sell — your tone is "guardian," not salesperson.
Use phrases like "Can check for you", "No problem lah", "Actually quite good", "Better be safe ah".`;
  }

  getOrCreateSession(sessionId) {
    if (!this.sessions[sessionId]) {
      this.sessions[sessionId] = {
        session_id: sessionId,
        step: 'trip_intake',
        trip_data: {},
        persona: null,
        selected_plan: null,
        addons: [],
        conversation_history: [],
        pending_question: null, // Store questions asked before trip info is collected
        created_at: new Date().toISOString()
      };
    }
    return this.sessions[sessionId];
  }

  getSession(sessionId) {
    return this.sessions[sessionId] || null;
  }

  updateSession(sessionId, sessionData) {
    this.sessions[sessionId] = sessionData;
  }

  extractTripInfo(message, currentData) {
    /** Extract trip information from user message */
    const messageLower = message.toLowerCase();
    const extracted = {};
    
    // Handle "today" and "tomorrow" for departure date - check this FIRST before anything else
    // This needs to be checked immediately, even before other extractions
    if (!currentData.departure_date && !currentData.trip_start_date) {
      const trimmedLower = message.trim().toLowerCase();
      // Check for "today" - exact match or word boundary
      if (trimmedLower === 'today' || /\btoday\b/i.test(message)) {
        extracted.departure_date = this._getDateString(0); // Today
        extracted.trip_start_date = extracted.departure_date;
        console.log(`[Date Extraction] Found "today" in "${message}" → ${extracted.departure_date}`);
      } 
      // Check for "tomorrow" - exact match or word boundary
      else if (trimmedLower === 'tomorrow' || /\btomorrow\b/i.test(message)) {
        extracted.departure_date = this._getDateString(1); // Tomorrow
        extracted.trip_start_date = extracted.departure_date;
        console.log(`[Date Extraction] Found "tomorrow" in "${message}" → ${extracted.departure_date}`);
      }
    }
    
    // Name extraction (if not already captured)
    // Be more flexible - try to catch standalone names or common phrases
    if (!currentData.name) {
      const namePatterns = [
        /(?:i am|my name is|i'm|calling me|name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /name:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        // Catch simple first name patterns at start of message
        /^([A-Z][a-z]{2,})\s*$/m
      ];
      for (const pattern of namePatterns) {
        const match = message.match(pattern);
        if (match) {
          extracted.name = match[1];
          break;
        }
      }
      // If no pattern match but message is short and looks like a name, use it
      if (!extracted.name && message.trim().split(/\s+/).length <= 2 && /^[A-Za-z\s]+$/.test(message.trim())) {
        extracted.name = message.trim();
      }
    }
    
    // Age extraction (primary age - for main traveller)
    if (!currentData.age) {
      const ageMatch = messageLower.match(/(?:i am|i'm|age is|i'm)\s+(\d+)|^(\d+)\s*(?:years?)?\s*$/);
      if (ageMatch) {
        extracted.age = parseInt(ageMatch[1] || ageMatch[2]);
      }
    }
    
    // Destination (country/city) - but skip if user is asking a question
    if (!currentData.destination && !messageLower.includes('want to ask') && !messageLower.includes('have a question')) {
      const destinationPatterns = [
        /(?:going to|traveling to|visiting|destination is|trip to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /(?:to|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
      ];
      for (const pattern of destinationPatterns) {
        const match = message.match(pattern);
        if (match && match[1].toLowerCase() !== 'ask') {
          extracted.destination = match[1];
          break;
        }
      }
    }
    
    // Trip type: Round Trip or Single Trip
    if (!currentData.trip_type) {
      if (messageLower.match(/round\s*trip|return\s*trip|coming\s*back/)) {
        extracted.trip_type = 'RT';
      } else if (messageLower.match(/single\s*trip|one\s*way|not\s*returning/)) {
        extracted.trip_type = 'ST';
      }
    }
    
    // Dates (convert to YYYY-MM-DD format)
    const datePatterns = [
      /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})\s+to\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /from\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})\s+to\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\s+to\s+(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})/i
    ];
    for (const pattern of datePatterns) {
      const match = message.match(pattern);
      if (match) {
        // Try to parse and normalize dates to YYYY-MM-DD
        const date1 = this._normalizeDate(match[1]);
        const date2 = this._normalizeDate(match[2]);
        if (date1 && date2) {
          extracted.departure_date = date1;
          extracted.return_date = date2;
        } else {
          extracted.departure_date = match[1];
          extracted.return_date = match[2];
        }
        // Also set legacy fields for backward compatibility
        extracted.trip_start_date = extracted.departure_date;
        extracted.trip_end_date = extracted.return_date;
        break;
      }
    }
    
    // Catch standalone dates in common formats (DD-MM-YYYY, DD/MM/YYYY, etc.)
    if (!extracted.departure_date && !extracted.return_date) {
      const standaloneDate = message.match(/\b(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})\b/);
      if (standaloneDate) {
        const normalized = this._normalizeDate(standaloneDate[1]);
        const dateValue = normalized || standaloneDate[1];
        
        // Determine which date field to use based on what's already filled
        if (!currentData.departure_date && !currentData.return_date) {
          // No dates yet - treat as departure
          extracted.departure_date = dateValue;
          extracted.trip_start_date = dateValue;
        } else if (currentData.departure_date && !currentData.return_date) {
          // Have departure, missing return - treat as return
          extracted.return_date = dateValue;
          extracted.trip_end_date = dateValue;
        } else if (!currentData.departure_date && currentData.return_date) {
          // Have return, missing departure - treat as departure
          extracted.departure_date = dateValue;
          extracted.trip_start_date = dateValue;
        }
      }
    }
    
    // Extract trip duration (e.g., "5 days", "1 week", "2 weeks")
    if (!currentData.trip_duration && !currentData.return_date && !currentData.trip_end_date) {
      const durationPatterns = [
        /(\d+)\s*(?:day|days)/i,
        /(\d+)\s*(?:week|weeks)/i,
        /(\d+)\s*(?:night|nights)/i,
        /for\s+(\d+)\s*(?:day|days|week|weeks)/i,
        /duration.*?(\d+)\s*(?:day|days|week|weeks)/i
      ];
      
      for (const pattern of durationPatterns) {
        const match = message.match(pattern);
        if (match) {
          const number = parseInt(match[1]);
          const unit = message.toLowerCase().match(/\b(?:week|weeks)\b/) ? 'weeks' : 'days';
          
          if (unit === 'weeks') {
            extracted.trip_duration = number * 7; // Convert weeks to days
          } else {
            extracted.trip_duration = number;
          }
          
          // If we have departure date, calculate return date
          const departureDate = extracted.departure_date || currentData.departure_date || currentData.trip_start_date;
          if (departureDate && extracted.trip_duration) {
            extracted.return_date = this._calculateReturnDate(departureDate, extracted.trip_duration);
            extracted.trip_end_date = extracted.return_date;
          }
          break;
        }
      }
    }
    
    // Departure country extraction (ISO code)
    if (!currentData.departure_country) {
      // Try to extract from phrases like "from Singapore" or "leaving from SG"
      const depCountryMatch = message.match(/(?:from|leaving from|departing from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?|\b[A-Z]{2}\b)/i);
      if (depCountryMatch) {
        extracted.departure_country = depCountryMatch[1];
      } else {
        // Try standalone country name if message is simple
        const standaloneCountry = message.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?|\b[A-Z]{2}\b)$/);
        if (standaloneCountry && !currentData.arrival_country && !currentData.destination) {
          extracted.departure_country = standaloneCountry[1];
        }
      }
    }
    
    // Arrival country extraction (ISO code)
    if (!currentData.arrival_country) {
      // This is usually the destination
      if (extracted.destination) {
        extracted.arrival_country = extracted.destination;
      }
      // Or explicit: "to Singapore" or "arriving at SG"
      const arrCountryMatch = message.match(/(?:to|arriving at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?|\b[A-Z]{2}\b)/i);
      if (arrCountryMatch) {
        extracted.arrival_country = arrCountryMatch[1];
      } else if (!extracted.departure_country && !currentData.departure_country) {
        // If we just got departure but already have it, try as arrival
        const standaloneCountry = message.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?|\b[A-Z]{2}\b)$/);
        if (standaloneCountry && currentData.departure_country) {
          extracted.arrival_country = standaloneCountry[1];
        }
      }
    }
    
    // Number of travellers / adults / children
    const travellerMatch = messageLower.match(/(\d+)\s+(?:traveller|person|people|adult)/);
    if (travellerMatch) {
      extracted.number_of_travellers = parseInt(travellerMatch[1]);
      // Default to all adults if not specified separately
      if (!currentData.number_of_adults) {
        extracted.number_of_adults = parseInt(travellerMatch[1]);
      }
    }
    
    // Separate adults count
    const adultsMatch = messageLower.match(/(\d+)\s+adult/);
    if (adultsMatch) {
      extracted.number_of_adults = parseInt(adultsMatch[1]);
    }
    
    // Separate children count
    const childrenMatch = messageLower.match(/(\d+)\s+(?:child|kid|children|kids)/);
    if (childrenMatch) {
      extracted.number_of_children = parseInt(childrenMatch[1]);
    }
    
    // Catch standalone numbers for adults if missing (simple "2" as answer)
    if (!extracted.number_of_adults && !currentData.number_of_adults && !currentData.number_of_travellers && 
        !travellerMatch && !adultsMatch && !childrenMatch) {
      const standaloneNumber = messageLower.match(/^(\d+)$/);
      if (standaloneNumber) {
        const num = parseInt(standaloneNumber[1]);
        // Only treat as adults if it's a reasonable number (1-10)
        if (num >= 1 && num <= 10) {
          extracted.number_of_adults = num;
        }
      }
    }
    
    // Ages (for multiple travellers)
    const ageMatches = messageLower.match(/(\d+)\s*years?\s*old/g);
    if (ageMatches) {
      extracted.ages = ageMatches.map(m => parseInt(m.match(/\d+/)[0]));
    }
    
    // Activities
    const activitiesKeywords = {
      skiing: ['ski', 'snowboard', 'winter sports'],
      diving: ['dive', 'scuba', 'snorkel'],
      hiking: ['hike', 'trek', 'mountain'],
      scooter: ['scooter', 'moped', 'motorcycle'],
      adventure: ['adventure', 'outdoor', 'extreme']
    };
    const foundActivities = [];
    for (const [activity, keywords] of Object.entries(activitiesKeywords)) {
      if (keywords.some(kw => messageLower.includes(kw))) {
        foundActivities.push(activity);
      }
    }
    if (foundActivities.length > 0) {
      extracted.activities = foundActivities;
    }
    
    // Medical flags / Existing conditions
    const medicalKeywords = {
      diabetes: ['diabetes', 'diabetic'],
      asthma: ['asthma'],
      'heart condition': ['heart', 'cardiac'],
      surgery: ['surgery', 'surgical']
    };
    const foundMedical = [];
    for (const [condition, keywords] of Object.entries(medicalKeywords)) {
      if (keywords.some(kw => messageLower.includes(kw))) {
        foundMedical.push(condition);
      }
    }
    if (foundMedical.length > 0) {
      extracted.existing_conditions = foundMedical.join(', ');
      // Also set legacy field for backward compatibility
      extracted.medical_flags = foundMedical;
    }
    
    // Trip style
    if (['relax', 'beach', 'resort'].some(word => messageLower.includes(word))) {
      extracted.trip_style = 'relax';
    } else if (['romantic', 'honeymoon', 'couple'].some(word => messageLower.includes(word))) {
      extracted.trip_style = 'romantic';
    } else if (['business', 'work', 'conference'].some(word => messageLower.includes(word))) {
      extracted.trip_style = 'business';
    } else if (['adventure', 'outdoor', 'extreme'].some(word => messageLower.includes(word))) {
      extracted.trip_style = 'adventure';
    }
    
    // Debug: Log final extracted object
    if (Object.keys(extracted).length > 0) {
      console.log(`[ExtractTripInfo] Final extracted object:`, extracted);
    }
    
    return extracted;
  }
  
  _normalizeDate(dateStr) {
    /** Try to normalize date string to YYYY-MM-DD format */
    try {
      // Handle various formats
      const normalized = dateStr.replace(/\//g, '-');
      const date = new Date(normalized);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch (e) {
      // Return original if parsing fails
    }
    return null;
  }
  
  _getDateString(daysOffset) {
    /** Get date string in YYYY-MM-DD format, offset by days (0 = today, 1 = tomorrow) */
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  _calculateReturnDate(departureDate, durationDays) {
    /** Calculate return date from departure date and duration */
    try {
      const departure = new Date(departureDate);
      if (isNaN(departure.getTime())) {
        return null;
      }
      departure.setDate(departure.getDate() + durationDays);
      const year = departure.getFullYear();
      const month = String(departure.getMonth() + 1).padStart(2, '0');
      const day = String(departure.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (e) {
      return null;
    }
  }

  isTripDataComplete(tripData) {
    /** Check if we have essential trip information - using both new and legacy fields */
    const hasDate = tripData.departure_date || tripData.trip_start_date;
    const hasReturnDate = tripData.return_date || tripData.trip_end_date;
    const hasDestination = tripData.arrival_country || tripData.destination;
    const hasTravellers = tripData.number_of_adults || tripData.number_of_children || tripData.number_of_travellers;
    
    // If we have departure date and trip duration, calculate return date
    if (hasDate && !hasReturnDate && tripData.trip_duration) {
      const departureDate = tripData.departure_date || tripData.trip_start_date;
      const returnDate = this._calculateReturnDate(departureDate, tripData.trip_duration);
      if (returnDate) {
        tripData.return_date = returnDate;
        tripData.trip_end_date = returnDate;
        return hasDate && hasDestination && hasTravellers;
      }
    }
    
    return hasDate && hasReturnDate && hasDestination && hasTravellers;
  }
  
  getMissingFields(tripData) {
    /** Get list of missing required fields for prompting user */
    const missing = [];
    
    if (!tripData.name) missing.push('name');
    if (!tripData.age) missing.push('age');
    if (!tripData.trip_type) missing.push('trip_type');
    if (!tripData.departure_date && !tripData.trip_start_date) missing.push('departure_date');
    
    // Check for return date or trip duration
    const hasReturnDate = tripData.return_date || tripData.trip_end_date;
    const hasTripDuration = tripData.trip_duration;
    const hasDepartureDate = tripData.departure_date || tripData.trip_start_date;
    
    // If we have departure date but no return date and no trip duration, ask for duration
    if (hasDepartureDate && !hasReturnDate && !hasTripDuration) {
      missing.push('trip_duration');
    } else if (!hasReturnDate && !hasTripDuration) {
      missing.push('return_date');
    }
    
    if (!tripData.departure_country) missing.push('departure_country');
    if (!tripData.arrival_country && !tripData.destination) missing.push('arrival_country');
    if (!tripData.number_of_adults && !tripData.number_of_travellers) missing.push('number_of_adults');
    
    return missing;
  }

  async processMessage(sessionId, message, groqService, policyDatabase, claimsIntelligence) {
    /** Process user message through conversation flow */
    const session = this.getOrCreateSession(sessionId);
    let step = session.step;
    const tripData = session.trip_data;
    const conversationHistory = session.conversation_history || [];
    
    // Add user message to history
    conversationHistory.push({ role: 'user', content: message });
    
    // Extract trip info
    const extracted = this.extractTripInfo(message, tripData);
    console.log(`[Extraction] Extracted from message "${message}":`, extracted);
    
    // If regex extraction didn't find anything and we're in trip_intake, use AI fallback
    // But preserve any values we already extracted (like "today" or "tomorrow")
    if (step === 'trip_intake' && Object.keys(extracted).length === 0) {
      const missingFields = this.getMissingFields(tripData);
      if (missingFields.length > 0) {
        const aiExtracted = await this._extractWithAI(message, missingFields, groqService);
        if (aiExtracted) {
          // Only assign non-empty values to avoid overwriting with empty strings
          for (const [key, value] of Object.entries(aiExtracted)) {
            if (value !== null && value !== undefined && value !== '') {
              extracted[key] = value;
            }
          }
        }
      }
    }
    
    // Merge extracted data, but don't overwrite existing non-empty values with empty ones
    for (const [key, value] of Object.entries(extracted)) {
      if (value !== null && value !== undefined && value !== '') {
        tripData[key] = value;
        console.log(`[TripData Update] Set ${key} = ${value}`);
      }
    }
    
    // If we have departure date and trip duration, calculate return date
    if (tripData.departure_date && tripData.trip_duration && !tripData.return_date) {
      const returnDate = this._calculateReturnDate(tripData.departure_date, tripData.trip_duration);
      if (returnDate) {
        tripData.return_date = returnDate;
        tripData.trip_end_date = returnDate;
      }
    }
    // Also check legacy trip_start_date
    if (tripData.trip_start_date && tripData.trip_duration && !tripData.return_date && !tripData.trip_end_date) {
      const returnDate = this._calculateReturnDate(tripData.trip_start_date, tripData.trip_duration);
      if (returnDate) {
        tripData.return_date = returnDate;
        tripData.trip_end_date = returnDate;
      }
    }
    
    session.trip_data = tripData;
    
    let responseText = '';
    let nextStep = step;
    let requiresAction = null;
    let data = null;
    
    // Check if user wants to ask a question during trip intake
    const messageLower = message.toLowerCase();
    const wantsToAskQuestion = messageLower.includes('want to ask') || 
                                  messageLower.includes('i have a question') ||
                                  messageLower.includes('can i ask') ||
                                  messageLower.includes('i want to ask a question');
    
    // If user wants to ask a question during trip intake, store it and ask for info first
    if (step === 'trip_intake' && wantsToAskQuestion && !this.isTripDataComplete(tripData)) {
      // Extract the actual question if it's in the same message
      const questionMatch = message.match(/(?:want to ask|have a question|can i ask|want to ask a question)[\s:,]*[^\w]*(.+)/i);
      if (questionMatch && questionMatch[1].trim().length > 5) {
        // If there's actual question content, extract it
        const questionText = questionMatch[1].trim();
        // Check if it ends with a question mark or contains question words
        if (questionText.includes('?') || /\b(what|how|when|where|why|can|will|is|does)\b/i.test(questionText)) {
          session.pending_question = questionText.replace(/[.!]$/, ''); // Remove trailing period/exclamation, keep question mark
        } else {
          session.pending_question = 'general_question';
        }
      } else {
        // Just store that they want to ask something
        session.pending_question = 'general_question';
      }
      
      responseText = "Okay okay, before I answer your question, I need to collect certain information from you first ah. Let me get your trip details first, then I'll answer your question properly.";
      
      conversationHistory.push({ role: 'assistant', content: responseText });
      session.conversation_history = conversationHistory;
      this.updateSession(sessionId, session);
      
      return {
        session_id: sessionId,
        response: responseText,
        step: nextStep,
        data: data,
        requires_action: requiresAction
      };
    }
    
    // Check if user is providing a question while we have a pending_question stored
    if (step === 'trip_intake' && session.pending_question === 'general_question' && 
        !this.isTripDataComplete(tripData) && 
        (message.includes('?') || /\b(what|how|when|where|why|can|will|is|does)\b/i.test(messageLower))) {
      // User is providing the actual question now
      session.pending_question = message;
      const missing = this._getMissingInfo(tripData);
      responseText = `Got your question ah. I'll answer it once I collect all your trip info. ${missing}`;
      
      conversationHistory.push({ role: 'assistant', content: responseText });
      session.conversation_history = conversationHistory;
      this.updateSession(sessionId, session);
      
      return {
        session_id: sessionId,
        response: responseText,
        step: nextStep,
        data: data,
        requires_action: requiresAction
      };
    }
    
    // Check if user is asking a question (after trip intake or during trip intake if trip data is complete)
    const isQuestion = (step !== 'trip_intake' || this.isTripDataComplete(tripData)) && (
                      message.includes('?') || 
                      /\bwhat\b/.test(messageLower) || 
                      /\bhow\b/.test(messageLower) || 
                      /\bwhen\b/.test(messageLower) || 
                      /\bwhere\b/.test(messageLower) || 
                      /\bwhy\b/.test(messageLower) ||
                      messageLower.includes('do you') ||
                      messageLower.includes('can you') ||
                      messageLower.includes('explain') ||
                      messageLower.includes('tell me') ||
                      messageLower.includes('what about') ||
                      messageLower.includes('is it') ||
                      messageLower.includes('will it') ||
                      messageLower.includes('does this'));
    
    // If it's a question and we're past trip intake, handle as FAQ
    if (isQuestion) {
      responseText = await this._handleFAQ(message, tripData, session, groqService, policyDatabase);
      
      // Don't update step, stay in current step
      conversationHistory.push({ role: 'assistant', content: responseText });
      session.conversation_history = conversationHistory;
      this.updateSession(sessionId, session);
      
      return {
        session_id: sessionId,
        response: responseText,
        step: nextStep,
        data: data,
        requires_action: requiresAction
      };
    }
    
    // STEP 1: TRIP INTAKE
    if (step === 'trip_intake') {
      if (this.isTripDataComplete(tripData)) {
        const summary = this._summarizeTrip(tripData);
        // Vary the confirmation message naturally
        const confirmations = [
          `Okay okay, so that's ${summary} — correct ah?`,
          `Hmm, let me check... ${summary} — that right?`,
          `Okay so ${summary} — sounds right to you?`,
          `Alright, so ${summary} — confirm ah?`
        ];
        responseText = confirmations[Math.floor(Math.random() * confirmations.length)];
        
        // If there's a pending question, mention we'll answer it after confirmation
        if (session.pending_question && session.pending_question !== 'general_question') {
          responseText += ` Once you confirm, I'll answer your question ah.`;
        } else if (session.pending_question === 'general_question') {
          responseText += ` Once you confirm, I'll answer your question lah.`;
        }
        
        nextStep = 'persona_classification';
      } else {
        const missing = this._getMissingInfo(tripData);
        const acknowledgements = [
          `Got it lah. ${missing}`,
          `Okay okay. ${missing}`,
          `Sure sure. ${missing}`,
          `Alright. ${missing}`
        ];
        responseText = acknowledgements[Math.floor(Math.random() * acknowledgements.length)];
        
        // Also check if user is providing a question in the current message
        if (wantsToAskQuestion && !session.pending_question) {
          const questionMatch = message.match(/(?:want to ask|have a question|can i ask)[\s:,]*[^\w]*([^.!?]+\?)/i);
          if (questionMatch) {
            session.pending_question = questionMatch[1].trim();
            responseText += ` Got your question, I'll answer it after I get all your trip info ah.`;
          }
        }
      }
    }
    
    // STEP 2: PERSONA CLASSIFICATION
    else if (step === 'persona_classification') {
      if (['yes', 'correct', 'yep', "that's right"].includes(message.toLowerCase())) {
        const persona = await groqService.classifyPersona(tripData);
        session.persona = persona;
        
        const personaMessages = {
          'Chill Voyager': [
            "Wah, sounds like a Chill Voyager trip leh — relaxed, low-risk, and you just want peace of mind without the fuss.",
            "Oh, this one's a Chill Voyager trip ah — relaxed vibes, low-risk, just want to chill without worrying.",
            "Hmm, Chill Voyager trip I think — you want to relax and not stress about things lah."
          ],
          'Adventurous Explorer': [
            "This one sounds like an Adventurous Explorer trip — outdoors, active, and you definitely don't want medical emergency in the mountains ah.",
            "Oh wow, Adventurous Explorer trip! Outdoors stuff, active... definitely need good coverage for this kind of trip.",
            "Adventurous Explorer lah this one — hiking, outdoor activities, better make sure you're covered properly."
          ],
          'Family Guardian': [
            "Ah, Family Guardian trip — keeping your loved ones safe is the priority, and medical coverage can't be compromised.",
            "Family Guardian trip I see — when you traveling with family, safety is everything ah.",
            "Oh, you're bringing family! Family Guardian trip — definitely want to make sure everyone's protected."
          ],
          'Business Nomad': [
            "Business Nomad trip lah — tight schedules, work commitments, and delays just cannot happen one.",
            "Business trip ah? Business Nomad — you need coverage for delays and work stuff, right?",
            "Hmm, Business Nomad trip — tight schedules, can't afford delays one lah."
          ],
          'Romantic Escaper': [
            "Sounds like a Romantic Escaper trip — couple time, honeymoon vibes, and you want flexibility if plans change.",
            "Oh, Romantic Escaper trip! Couple getaway ah — want flexibility in case plans change, right?",
            "Romantic trip leh — couple time, want to make sure you got coverage for changes lah."
          ],
          'Cultural Explorer': [
            "Cultural Explorer trip leh — multiple cities, longer stays, and luggage protection matters.",
            "Cultural Explorer trip ah — going to a few places, staying longer... definitely need luggage coverage.",
            "Oh, Cultural Explorer trip — multiple cities, longer stay, better make sure luggage is covered."
          ]
        };
        
        const personaOptions = personaMessages[persona] || ["Let me find the right plan for your trip."];
        responseText = personaOptions[Math.floor(Math.random() * personaOptions.length)];
        
        // If there's a pending question, answer it now
        if (session.pending_question) {
          const questionToAnswer = session.pending_question === 'general_question' ? 
            'What questions do you have about travel insurance?' : 
            session.pending_question;
          
          // Answer the pending question using Groq
          const questionAnswer = await this._handleFAQ(questionToAnswer, tripData, session, groqService, policyDatabase);
          
          responseText += `\n\n${questionAnswer}`;
          
          // Clear pending question
          session.pending_question = null;
        }
        
        nextStep = 'plan_recommendation';
      } else {
        const updateResponses = [
          "No worries lah, let me update that. What needs changing ah?",
          "Okay okay, can change one. What you want to update?",
          "Sure sure, can fix. What's wrong?"
        ];
        responseText = updateResponses[Math.floor(Math.random() * updateResponses.length)];
      }
    }
    
    // STEP 3: PLAN RECOMMENDATION
    else if (step === 'plan_recommendation') {
      // Get recommendation from policy database
      if (!session.plans_shown && policyDatabase) {
        const recommended = await policyDatabase.recommendProduct(tripData);
        
        // Get risk assessment and show it together with recommendation
        let claimsIntel = {};
        if (claimsIntelligence) {
          claimsIntel = await claimsIntelligence.getClaimIntelligence(
            tripData.arrival_country || tripData.destination || '',
            tripData.activities || []
          );
        }
        
        // Combine recommendation with risk assessment in one message
        responseText = `For your trip, I recommend ${recommended.name} for SGD $${recommended.price}.`;
        
        const riskLevel = claimsIntel.risk_level || 'medium';
        const topCauses = claimsIntel.top_claim_causes || [];
        
        if (topCauses.length > 0) {
          responseText += `\n\nFor ${tripData.arrival_country || tripData.destination || 'your destination'}, the risk level is ${riskLevel}.`;
          responseText += ` Common claims there are: ${topCauses.slice(0, 3).join(', ')}.`;
        }
        
        responseText += ` This plan will cover you well for your trip. Ready to confirm your details?`;
        
        session.recommended_plans = [recommended];
        session.selected_plan = recommended;
        session.plans_shown = true;
        session.risk_assessment_shown = true;
        
        // Skip add_ons and coverage_gap, go straight to bind_check
        nextStep = 'bind_check';
      } else if (session.plans_shown) {
        // Check if user wants to compare plans
        if (message.toLowerCase().includes('compare')) {
          if (policyDatabase) {
            // Generate prices for all products
            const allProductsWithPrices = [
              await policyDatabase.recommendProduct({ ...tripData, existing_conditions: false, trip_type: 'ST', activities: [] }), // Scootsurance scenario
              await policyDatabase.recommendProduct({ ...tripData, existing_conditions: false, trip_type: 'RT', activities: ['sightseeing'] }), // TravelEasy scenario
              await policyDatabase.recommendProduct({ ...tripData, existing_conditions: 'diabetes' }) // TravelEasy Pre-Ex scenario
            ];
            
            const recommended = session.selected_plan;
            
            responseText = "Here are all the available plans:\n\n";
            for (const product of allProductsWithPrices) {
              const isRecommended = product.key === recommended.key;
              responseText += `${isRecommended ? '✓ ' : ''}${product.name} – SGD $${product.price}\n`;
            }
            
            responseText += "\nTop 3 differences:\n\n";
            responseText += "1. Scootsurance: Budget-friendly for short trips without pre-existing conditions.\n";
            responseText += "2. TravelEasy Policy: Better coverage for round trips with activities.\n";
            responseText += "3. TravelEasy Pre-Ex: Essential if you have medical conditions.\n\n";
            responseText += `I still recommend ${recommended.name} for your specific needs. Ready to confirm your details?`;
          } else {
            responseText = "Let me get the comparison for you.";
          }
        } else {
          // User accepts or any other response - go to bind_check
          responseText = "Great! Let me confirm your details now.";
          nextStep = 'bind_check';
        }
      } else {
        responseText = "Let me get the right plans for you.";
      }
    }
    
    // STEP 4: BIND CHECK
    else if (step === 'bind_check') {
      if (!session.bind_summary_shown) {
        responseText = this._generateBindSummary(tripData);
        responseText += "\n\nIs everything above accurate, and do you confirm it's correct?";
        session.bind_summary_shown = true;
        requiresAction = 'confirm_binding';
      } else {
        if (['yes', 'correct', 'accurate', 'confirm', "that's right", 'yes confirm'].includes(message.toLowerCase())) {
          nextStep = 'payment';
          responseText = "Perfect. Moving to payment.";
        } else {
          responseText = "Let me know what needs adjusting, and I'll update it.";
        }
      }
    }
    
    // STEP 5: PAYMENT
    else if (step === 'payment') {
      if (!session.payment_message_shown) {
        const totalPrice = this._calculateTotal(session);
        responseText = `Total is $${totalPrice} SGD for ${tripData.number_of_travellers || 1} traveller(s), covering ${tripData.trip_start_date} to ${tripData.trip_end_date}.\n\n`;
        responseText += "I'll open a secure payment screen to take your card. Once paid, I'll activate your cover instantly and drop your emergency medical card here. Proceed?";
        requiresAction = 'payment';
        session.payment_message_shown = true;
      } else {
        if (['proceed', 'yes', 'ok'].includes(message.toLowerCase())) {
          nextStep = 'post_purchase';
          responseText = '';
        } else {
          responseText = "Please use the payment button to proceed.";
        }
      }
    }
    
    // STEP 6: POST-PURCHASE
    else if (step === 'post_purchase') {
      if (!session.post_purchase_shown) {
        responseText = "✅ Paid and confirmed — your travel insurance is now active.\n\n";
        responseText += "If your luggage's delayed 6+ hours, get the airline report, snap a photo, and send it here — I'll prep your claim.\n";
        responseText += "If anyone feels unwell, just say 'medical help' and I'll show the nearest approved clinic so you don't pay cash.\n\n";
        responseText += "I've saved your emergency card and claim instructions in this chat — you can pull them up anytime during your trip.";
        
        data = {
          policy_number: session.policy_number || 'POL-ACTIVE',
          emergency_card: 'Emergency: +65-XXXX-XXXX'
        };
        session.post_purchase_shown = true;
      } else {
        if (message.toLowerCase().includes('medical') || message.toLowerCase().includes('help')) {
          responseText = "For medical emergencies, call the 24/7 helpline: +65-XXXX-XXXX. They'll direct you to the nearest approved clinic. Save your receipts!";
        } else if (message.toLowerCase().includes('luggage') || message.toLowerCase().includes('baggage') || message.toLowerCase().includes('claim')) {
          responseText = "For delayed/lost luggage claims: Get a Property Irregularity Report (PIR) from the airline, take photos, and submit here with your policy number. Claims are typically processed within 5-7 business days.";
        } else {
          responseText = "I'm here to help! Say 'medical help' for emergency contacts, or 'claim' for filing instructions.";
        }
      }
    }
    
    // Add assistant response to history
    conversationHistory.push({ role: 'assistant', content: responseText });
    session.step = nextStep;
    session.conversation_history = conversationHistory;
    this.updateSession(sessionId, session);
    
    return {
      session_id: sessionId,
      response: responseText,
      step: nextStep,
      data: data,
      requires_action: requiresAction
    };
  }
  
  async _handleFAQ(question, tripData, session, groqService, policyDatabase) {
    /** Handle FAQ questions using Intelligent Query Classification System */
    try {
      // Import QueryClassifier dynamically
      const { QueryClassifier } = await import('./services/queryClassifier.js');
      const queryClassifier = new QueryClassifier();
      
      // Process query through classification system
      const queryResult = await queryClassifier.processQuery(question, policyDatabase, tripData);
      
      // Format response based on query type
      let responseText = this._formatQueryResponse(queryResult, groqService);
      
      return responseText;
    } catch (error) {
      console.error('Error handling FAQ:', error);
      // Fallback to simple Groq response
      try {
        const prompt = `You are TripKaki, a friendly Singaporean travel insurance assistant. Answer this question about travel insurance naturally.

Question: ${question}

Answer naturally with light Singlish ("lah", "leh", "ah"). Keep it short and helpful.`;

        const completion = await groqService.client.chat.completions.create({
          model: groqService.model,
          messages: [
            {
              role: 'system',
              content: 'You are TripKaki, a real Singaporean friend helping with travel insurance. Be natural, use Singlish lightly, vary responses.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.9
        });
        
        return completion.choices[0].message.content;
      } catch (fallbackError) {
        return "Sorry leh, having some trouble answering that right now. Can try rephrasing your question anot?";
      }
    }
  }

  _formatQueryResponse(queryResult, groqService) {
    /** Format structured query results into natural language responses */
    if (queryResult.error) {
      return queryResult.message || "Sorry leh, having some trouble with that. Can try again?";
    }

    let response = '';

    switch (queryResult.query_type) {
      case 'comparison':
        if (queryResult.matrix && Array.isArray(queryResult.matrix)) {
          response = `Here's the comparison for you:\n\n`;
          
          // Format matrix as table
          if (queryResult.plans_compared) {
            response += `Comparing: ${queryResult.plans_compared.join(', ')}\n\n`;
          }
          
          // Build table from matrix
          queryResult.matrix.slice(0, 5).forEach(row => {
            const benefit = row.Benefit || row.benefit || '';
            const values = Object.keys(row)
              .filter(k => k !== 'Benefit' && k !== 'benefit')
              .map(k => `${k}: ${row[k]}`)
              .join(', ');
            response += `• ${benefit}: ${values}\n`;
          });
          
          if (queryResult.summary) {
            response += `\n${queryResult.summary}`;
          }
          if (queryResult.recommendation) {
            response += `\n\n${queryResult.recommendation}`;
          }
        } else {
          response = queryResult.message || "Let me get the comparison for you.";
        }
        break;

      case 'explanation':
        if (queryResult.explanation) {
          response = queryResult.explanation;
          if (queryResult.reference_text) {
            response += `\n\nReference: ${queryResult.reference_text}`;
          }
          if (queryResult.coverage_details) {
            const details = queryResult.coverage_details;
            if (details.limit) {
              response += `\n\nCoverage Limit: ${details.limit}`;
            }
            if (details.exclusions && details.exclusions.length > 0) {
              response += `\n\nExclusions: ${details.exclusions.join(', ')}`;
            }
          }
        } else {
          response = queryResult.message || "Let me explain that for you.";
        }
        break;

      case 'eligibility':
        const isCovered = queryResult.is_covered;
        const coveredText = isCovered ? 'Yes, covered lah!' : 'Hmm, not covered for that one ah.';
        response = `${coveredText}\n\n`;
        
        if (queryResult.reason) {
          response += `${queryResult.reason}\n\n`;
        }
        if (queryResult.requirements && queryResult.requirements.length > 0) {
          response += `Requirements: ${queryResult.requirements.join(', ')}\n\n`;
        }
        if (queryResult.exclusions && queryResult.exclusions.length > 0) {
          response += `Exclusions: ${queryResult.exclusions.join(', ')}\n\n`;
        }
        if (queryResult.advice) {
          response += `${queryResult.advice}`;
        }
        break;

      case 'scenario':
        if (queryResult.coverage_steps && Array.isArray(queryResult.coverage_steps)) {
          response = `For that scenario:\n\n`;
          queryResult.coverage_steps.forEach((step, index) => {
            response += `${index + 1}. ${step}\n`;
          });
          
          if (queryResult.coverage_status) {
            response += `\nCoverage Status: ${queryResult.coverage_status}\n`;
          }
          
          if (queryResult.claim_guidance) {
            response += `\n${queryResult.claim_guidance}`;
          }
        } else {
          response = queryResult.message || "Let me analyze that scenario for you.";
        }
        break;

      default:
        response = queryResult.message || "Let me help you with that.";
    }

    // Add natural Singaporean tone to the response
    response = this._humanizeResponse(response);

    return response;
  }

  _humanizeResponse(response) {
    /** Add natural Singaporean conversational touches to structured responses */
    // Don't modify if it already sounds natural
    if (response.includes('lah') || response.includes('leh') || response.includes('ah')) {
      return response;
    }

    // Add light Singlish touches at the end
    const endings = [
      ' Hope that helps lah!',
      ' Let me know if you need more info ah.',
      ' Got any other questions anot?',
      ' Anything else you want to know?'
    ];
    
    const randomEnding = endings[Math.floor(Math.random() * endings.length)];
    return response + randomEnding;
  }

  _summarizeTrip(tripData) {
    const parts = [];
    
    if (tripData.number_of_travellers) {
      parts.push(`${tripData.number_of_travellers} traveller(s)`);
    }
    if (tripData.destination) {
      parts.push(`to ${tripData.destination}`);
    }
    if (tripData.trip_start_date && tripData.trip_end_date) {
      parts.push(`from ${tripData.trip_start_date} to ${tripData.trip_end_date}`);
    }
    if (tripData.activities?.length > 0) {
      parts.push(`planning to ${tripData.activities.join(', ')}`);
    }
    if (tripData.medical_flags?.length > 0) {
      parts.push(`with medical conditions: ${tripData.medical_flags.join(', ')}`);
    }
    
    return parts.join(' ');
  }

  _getMissingInfo(tripData) {
    /** Generate natural language prompt for the FIRST missing required field only */
    const missingFields = this.getMissingFields(tripData);
    
    if (missingFields.length === 0) {
      return "What else should I know about your trip ah?";
    }
    
    // Map field names to natural prompts - ask one at a time
    const fieldPrompts = {
      'name': "What's your name ah?",
      'age': "How old are you leh?",
      'trip_type': "Is this a round trip or single trip?",
      'departure_date': "What's your departure date ah? You can say 'today', 'tomorrow', or give me a date.",
      'trip_duration': "How many days is your trip ah?",
      'return_date': "What's your return date?",
      'departure_country': "Which country you leaving from ah?",
      'arrival_country': "Which country you traveling to?",
      'number_of_adults': "How many adults traveling leh?"
    };
    
    // Return only the first missing field
    const firstMissingField = missingFields[0];
    return fieldPrompts[firstMissingField] || "What else should I know about your trip ah?";
  }

  _generateBindSummary(tripData) {
    let summary = "Let me read this back:\n\n";
    
    // Personal Information
    if (tripData.name) summary += `Name: ${tripData.name}\n`;
    if (tripData.age) summary += `Age: ${tripData.age}\n`;
    
    // Trip Information
    summary += `Trip Type: ${tripData.trip_type || 'RT'}\n`;
    summary += `Departure Date: ${tripData.departure_date || tripData.trip_start_date || 'N/A'}\n`;
    summary += `Return Date: ${tripData.return_date || tripData.trip_end_date || 'N/A'}\n`;
    summary += `Departure Country: ${tripData.departure_country || 'N/A'}\n`;
    summary += `Arrival Country: ${tripData.arrival_country || tripData.destination || 'N/A'}\n`;
    
    // Traveller Information
    if (tripData.number_of_adults) summary += `Number of Adults: ${tripData.number_of_adults}\n`;
    if (tripData.number_of_children) summary += `Number of Children: ${tripData.number_of_children}\n`;
    if (!tripData.number_of_adults && !tripData.number_of_children && tripData.number_of_travellers) {
      summary += `Number of Travellers: ${tripData.number_of_travellers}\n`;
    }
    
    // Medical Information
    if (tripData.existing_conditions) {
      summary += `Existing Conditions: ${tripData.existing_conditions}\n`;
    }
    
    // Activities
    if (tripData.activities?.length > 0) {
      summary += `Activities: ${tripData.activities.join(', ')}\n`;
    }
    
    return summary;
  }

  _calculateTotal(session) {
    const selectedPlan = session.selected_plan || session.recommended_plans?.[0] || {};
    const basePrice = selectedPlan.price || 0;
    
    const addons = session.addons || [];
    const addonTotal = addons.reduce((sum, addon) => sum + (addon.price || 0), 0);
    
    return basePrice + addonTotal;
  }

  async _extractWithAI(message, missingFields, groqService) {
    /** Use AI to extract information from user message when regex fails */
    const firstMissing = missingFields[0];
    
    // Map field names to descriptions for AI
    const fieldDescriptions = {
      'name': 'person\'s full name',
      'age': 'age in years as a number',
      'departure_date': 'departure date in YYYY-MM-DD format',
      'return_date': 'return date in YYYY-MM-DD format',
      'departure_country': 'departure country name',
      'arrival_country': 'destination country name',
      'number_of_adults': 'number of adults traveling as a number',
      'trip_type': 'either "RT" for round trip or "ST" for single trip'
    };
    
    // Special handling for departure_date to recognize "today" and "tomorrow"
    let fieldDesc = fieldDescriptions[firstMissing];
    let examples = `Example for name: {"name": "John Doe"}
Example for age: {"age": 35}
Example for departure_date: {"departure_date": "2024-12-12"}
Example for departure_country: {"departure_country": "Singapore"}`;
    
    if (firstMissing === 'departure_date') {
      fieldDesc = 'departure date in YYYY-MM-DD format. If user says "today", return today\'s date. If user says "tomorrow", return tomorrow\'s date.';
      examples = `Example for departure_date (today): {"departure_date": "${this._getDateString(0)}"}
Example for departure_date (tomorrow): {"departure_date": "${this._getDateString(1)}"}
Example for departure_date (specific date): {"departure_date": "2024-12-12"}`;
    }
    
    const prompt = `Extract the ${fieldDesc} from the following user message. Return ONLY a JSON object with the field name and value. If the field is not found or unclear, return an empty JSON object {}.

Field name: ${firstMissing}
User message: "${message}"

Return JSON format: {"${firstMissing}": "extracted_value"}

${examples}`;

    try {
      const response = await groqService.client.chat.completions.create({
        model: groqService.model,
        messages: [
          {
            role: 'system',
            content: 'You are a data extraction assistant. Extract information from user messages and return ONLY valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const extracted = JSON.parse(response.choices[0].message.content);
      console.log(`AI extracted:`, extracted);
      return extracted;
    } catch (error) {
      console.error('Error in AI extraction:', error);
      return null;
    }
  }
}

