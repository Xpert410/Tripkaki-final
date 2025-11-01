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
    
    // Destination (country/city)
    if (!currentData.destination) {
      const destinationPatterns = [
        /(?:going to|traveling to|visiting|destination is|trip to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /(?:to|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
      ];
      for (const pattern of destinationPatterns) {
        const match = message.match(pattern);
        if (match) {
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

  isTripDataComplete(tripData) {
    /** Check if we have essential trip information - using both new and legacy fields */
    const hasDate = tripData.departure_date || tripData.trip_start_date;
    const hasReturnDate = tripData.return_date || tripData.trip_end_date;
    const hasDestination = tripData.arrival_country || tripData.destination;
    const hasTravellers = tripData.number_of_adults || tripData.number_of_children || tripData.number_of_travellers;
    
    return hasDate && hasReturnDate && hasDestination && hasTravellers;
  }
  
  getMissingFields(tripData) {
    /** Get list of missing required fields for prompting user */
    const missing = [];
    
    if (!tripData.name) missing.push('name');
    if (!tripData.age) missing.push('age');
    if (!tripData.trip_type) missing.push('trip_type');
    if (!tripData.departure_date && !tripData.trip_start_date) missing.push('departure_date');
    if (!tripData.return_date && !tripData.trip_end_date) missing.push('return_date');
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
    
    // If regex extraction didn't find anything and we're in trip_intake, use AI fallback
    if (step === 'trip_intake' && Object.keys(extracted).length === 0) {
      const missingFields = this.getMissingFields(tripData);
      if (missingFields.length > 0) {
        const aiExtracted = await this._extractWithAI(message, missingFields, groqService);
        if (aiExtracted) {
          Object.assign(extracted, aiExtracted);
        }
      }
    }
    
    Object.assign(tripData, extracted);
    session.trip_data = tripData;
    
    let responseText = '';
    let nextStep = step;
    let requiresAction = null;
    let data = null;
    
    // Check if user is asking a question BEFORE processing steps
    // Only check for FAQs if we're past trip intake
    const isQuestion = step !== 'trip_intake' && (
                      message.includes('?') || 
                      /\bwhat\b/.test(message.toLowerCase()) || 
                      /\bhow\b/.test(message.toLowerCase()) || 
                      /\bwhen\b/.test(message.toLowerCase()) || 
                      /\bwhere\b/.test(message.toLowerCase()) || 
                      /\bwhy\b/.test(message.toLowerCase()) ||
                      message.toLowerCase().includes('do you') ||
                      message.toLowerCase().includes('can you') ||
                      message.toLowerCase().includes('explain') ||
                      message.toLowerCase().includes('tell me') ||
                      message.toLowerCase().includes('what about') ||
                      message.toLowerCase().includes('is it') ||
                      message.toLowerCase().includes('will it') ||
                      message.toLowerCase().includes('does this'));
    
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
        responseText = `Perfect. So that's ${summary} — correct?`;
        nextStep = 'persona_classification';
      } else {
        const missing = this._getMissingInfo(tripData);
        responseText = `Got it. ${missing}`;
      }
    }
    
    // STEP 2: PERSONA CLASSIFICATION
    else if (step === 'persona_classification') {
      if (['yes', 'correct', 'yep', "that's right"].includes(message.toLowerCase())) {
        const persona = await groqService.classifyPersona(tripData);
        session.persona = persona;
        
        const personaMessages = {
          'Chill Voyager': "This sounds like a Chill Voyager trip — relaxed, low-risk, and you want peace of mind without the fuss.",
          'Adventurous Explorer': "This sounds like an Adventurous Explorer trip — outdoors, active, and where you can't afford a medical emergency in the mountains.",
          'Family Guardian': "This sounds like a Family Guardian trip — keeping your loved ones safe is the priority, and medical coverage can't be compromised.",
          'Business Nomad': "This sounds like a Business Nomad trip — tight schedules, work commitments, and delays just can't happen.",
          'Romantic Escaper': "This sounds like a Romantic Escaper trip — couple time, honeymoon vibes, and you want flexibility if plans change.",
          'Cultural Explorer': "This sounds like a Cultural Explorer trip — multiple cities, longer stays, and luggage protection matters."
        };
        
        responseText = personaMessages[persona] || "Let me find the right plan for your trip.";
        nextStep = 'plan_recommendation';
      } else {
        responseText = "No worries, let me update that. What needs changing?";
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
    /** Handle FAQ questions about insurance policies */
    try {
      // Get policy context from database
      let policyContext = {};
      if (policyDatabase) {
        const db = policyDatabase.loadDatabase();
        if (db.layers) {
          // Get selected plan's data
          const selectedPlan = session.selected_plan || session.recommended_plans?.[0];
          if (selectedPlan && db.layers.layer_2_benefits) {
            policyContext = {
              selected_plan: selectedPlan.name,
              trip_info: {
                destination: tripData.arrival_country || tripData.destination,
                duration: selectedPlan.duration || 7,
                travelers: selectedPlan.travelers || 1
              },
              available_benefits: db.layers.layer_2_benefits.slice(0, 10).map(benefit => ({
                name: benefit.benefit_name,
                description: benefit.original_text || ''
              }))
            };
          }
        }
      }
      
      // Build FAQ context
      const context = {
        user_trip: tripData,
        selected_policy: session.selected_plan?.name || 'Travel insurance',
        policy_context: policyContext
      };
      
      // Use Groq to answer the question
      const selectedPlan = session.selected_plan || session.recommended_plans?.[0];
      const planName = selectedPlan?.name || 'travel insurance';
      
      const prompt = `You are TripKaki, a friendly Singaporean travel insurance assistant. Answer this question about travel insurance.

Selected Policy: ${planName}

${Object.keys(policyContext).length > 0 ? `Policy Details: ${JSON.stringify(policyContext)}` : 'Note: Policy details are still being collected.'}

${Object.keys(tripData).length > 0 ? `User's Trip: ${JSON.stringify(tripData)}` : 'Note: User trip details are still being collected.'}

Question: ${question}

Provide a helpful, conversational answer. Sound like a friendly Singaporean: short sentences, calm, use some Singlish naturally like "lah", "leh", "ah" (but don't overdo it). 

IMPORTANT: If the user is asking about coverage or benefits, use the policy information provided. If they're asking about what's covered but we don't have policy details yet, politely explain that you're still gathering their trip info first, then you'll be able to answer their specific questions about coverage.`;

      const completion = await groqService.client.chat.completions.create({
        model: groqService.model,
        messages: [
          {
            role: 'system',
            content: 'You are TripKaki, a friendly Singaporean travel insurance assistant. Answer questions about travel insurance policies in a conversational, helpful way. Be empathetic and natural.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7
      });
      
      return completion.choices[0].message.content;
    } catch (error) {
      console.error('Error handling FAQ:', error);
      return "Sorry, I'm having trouble answering that right now. Could you try rephrasing your question?";
    }
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
      return "What else should I know about your trip?";
    }
    
    // Map field names to natural prompts - ask one at a time
    const fieldPrompts = {
      'name': "What's your name?",
      'age': "How old are you?",
      'trip_type': "Is this a round trip or single trip?",
      'departure_date': "What's your departure date?",
      'return_date': "What's your return date?",
      'departure_country': "Which country are you leaving from?",
      'arrival_country': "Which country are you traveling to?",
      'number_of_adults': "How many adults are traveling?"
    };
    
    // Return only the first missing field
    const firstMissingField = missingFields[0];
    return fieldPrompts[firstMissingField] || "What else should I know about your trip?";
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
    
    const prompt = `Extract the ${fieldDescriptions[firstMissing]} from the following user message. Return ONLY a JSON object with the field name and value. If the field is not found or unclear, return an empty JSON object {}.

Field name: ${firstMissing}
User message: "${message}"

Return JSON format: {"${firstMissing}": "extracted_value"}

Example for name: {"name": "John Doe"}
Example for age: {"age": 35}
Example for departure_date: {"departure_date": "2024-12-12"}
Example for departure_country: {"departure_country": "Singapore"}`;

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

