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
        responseText = `Nice! So that's ${summary}. Sounds like it'll be a great trip! This correct ah?`;
        nextStep = 'persona_classification';
      } else {
        const missing = this._getMissingInfo(tripData);
        // Add some friendly acknowledgment first
        const acknowledgments = [
          "Got it!", "Okay!", "Noted!", "Right!", "Cool!", "Alright!"
        ];
        const randomAck = acknowledgments[Math.floor(Math.random() * acknowledgments.length)];
        responseText = `${randomAck} ${missing}`;
      }
    }
    
    // STEP 2: PERSONA CLASSIFICATION
    else if (step === 'persona_classification') {
      if (['yes', 'correct', 'yep', "that's right", 'ya', 'yeah', 'right'].includes(message.toLowerCase().trim())) {
        const persona = await groqService.classifyPersona(tripData);
        session.persona = persona;
        
        const personaMessages = {
          'Chill Voyager': "Ah, I can tell this is a Chill Voyager trip lah — nice and relaxed! You want good coverage without all the complicated stuff right?",
          'Adventurous Explorer': "Wah, Adventurous Explorer vibes! 🏔️ Active trip means we need solid medical coverage - can't have you stuck somewhere with hospital bills sia.",
          'Family Guardian': "This one is Family Guardian mode - protecting your loved ones is priority number one! Medical coverage confirm cannot compromise one.",
          'Business Nomad': "Business Nomad style! Time is money, so we need coverage for delays and cancellations. Cannot let work kena affected.",
          'Romantic Escaper': "Aww, Romantic Escaper trip! 💕 Couple time is precious, so we want flexibility in case plans need to change lah.",
          'Cultural Explorer': "Cultural Explorer adventure! Multiple places, longer trip - your luggage and gear need extra protection for sure."
        };
        
        responseText = personaMessages[persona] || "Alright, let me find the perfect plan for your adventure!";
        nextStep = 'plan_recommendation';
      } else {
        responseText = "No problem! What should I update? Just tell me what's different and I'll fix it 😊";
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
        responseText = `Perfect! Based on your trip, I think **${recommended.name}** is your best bet - SGD $${recommended.price}. 👍\n\n`;
        
        const riskLevel = claimsIntel.risk_level || 'medium';
        const topCauses = claimsIntel.top_claim_causes || [];
        
        if (topCauses.length > 0) {
          const riskEmoji = riskLevel === 'high' ? '⚠️' : riskLevel === 'low' ? '✅' : '📊';
          responseText += `${riskEmoji} **${tripData.arrival_country || tripData.destination || 'Your destination'}** has ${riskLevel} risk level. `;
          responseText += `Most common claims there are: ${topCauses.slice(0, 3).join(', ')}.\n\n`;
        }
        
        responseText += `This plan covers all the important stuff for your kind of trip. Want to see other options to compare, or shall we go with this one? 😊`;
        
        session.recommended_plans = [recommended];
        session.selected_plan = recommended;
        session.plans_shown = true;
        session.risk_assessment_shown = true;
        
        // Skip add_ons and coverage_gap, go straight to bind_check
        nextStep = 'bind_check';
      } else if (session.plans_shown) {
        // Check if user wants to compare plans or asks questions
        if (message.toLowerCase().includes('compare') || message.toLowerCase().includes('options') || message.toLowerCase().includes('other plans')) {
          if (policyDatabase) {
            // Generate prices for all products with different scenarios
            const allProductsWithPrices = [
              await policyDatabase.recommendProduct({ ...tripData, existing_conditions: false, trip_type: 'ST', activities: [] }), // Scootsurance scenario
              await policyDatabase.recommendProduct({ ...tripData, existing_conditions: false, trip_type: 'RT', activities: ['sightseeing'] }), // TravelEasy scenario
              await policyDatabase.recommendProduct({ ...tripData, existing_conditions: 'diabetes' }) // TravelEasy Pre-Ex scenario
            ];
            
            const recommended = session.selected_plan;
            
            responseText = "Ah, you want to see all options? No problem lah! Let me break it down for you:\n\n";
            
            for (const product of allProductsWithPrices) {
              const isRecommended = product.key === recommended.key;
              responseText += `${isRecommended ? '✅ ' : '💡 '}**${product.name}** – SGD $${product.price}\n`;
              
              // Add personalized explanations
              if (product.name.includes('Scootsurance')) {
                responseText += "   → Perfect for short trips, no medical issues, budget-conscious\n";
              } else if (product.name.includes('TravelEasy') && !product.name.includes('Pre-Ex')) {
                responseText += "   → Great for longer trips, includes activities, comprehensive coverage\n";
              } else if (product.name.includes('Pre-Ex')) {
                responseText += "   → Must-have if you have existing medical conditions\n";
              }
              responseText += "\n";
            }
            
            responseText += "🎯 **Why I recommend " + recommended.name + " for you:**\n";
            
            // Personalized recommendation based on trip data
            if (tripData.destination && tripData.trip_start_date) {
              responseText += `Based on your ${tripData.destination} trip`;
              if (tripData.existing_conditions) {
                responseText += " and your medical needs";
              }
              if (tripData.activities && tripData.activities.length > 0) {
                responseText += ` plus your planned activities (${tripData.activities.join(', ')})`;
              }
              responseText += ", this plan gives you the best value and coverage lah.\n\n";
            }
            
            // Suggest add-ons based on destination and activities
            responseText += "💡 **Smart add-ons I'd suggest:**\n";
            if (tripData.destination && (tripData.destination.toLowerCase().includes('japan') || tripData.destination.toLowerCase().includes('korea'))) {
              responseText += "• Winter Sports Cover (+$15) - Good for ski season\n";
            }
            if (tripData.activities && tripData.activities.some(a => a.includes('adventure') || a.includes('extreme'))) {
              responseText += "• Adventure Sports Cover (+$25) - Essential for your activities\n";
            }
            responseText += "• Gadget Protection (+$12) - Covers your phone/camera/laptop\n";
            responseText += "• Travel Delay Cover (+$8) - Extra protection for flight delays\n\n";
            
            responseText += "Want me to add any of these, or shall we stick with the main plan? Either way also can! 😊";
            
          } else {
            responseText = "Let me get the comparison for you lah.";
          }
        } else if (message.toLowerCase().includes('add') && (message.toLowerCase().includes('on') || message.toLowerCase().includes('extra'))) {
          // User asking about add-ons
          responseText = "Wah, smart thinking! Let me suggest some add-ons that make sense for your trip:\n\n";
          
          responseText += "🛡️ **Recommended for you:**\n";
          if (tripData.destination) {
            if (tripData.destination.toLowerCase().includes('europe')) {
              responseText += "• Schengen Medical (+$18) - Higher medical limits for Europe\n";
            } else if (tripData.destination.toLowerCase().includes('usa') || tripData.destination.toLowerCase().includes('america')) {
              responseText += "• USA Medical Boost (+$35) - USA healthcare is expensive sia\n";
            }
          }
          
          responseText += "• Gadget Shield (+$12) - Your phone, camera, laptop all covered\n";
          responseText += "• Travel Delay Plus (+$8) - Extra money if flights get delayed\n";
          if (tripData.activities && tripData.activities.length > 0) {
            responseText += "• Activity Cover (+$20) - For your planned activities\n";
          }
          responseText += "\n📱 Just tell me which ones you want, like 'add gadget shield' and I'll update your plan!";
          
        } else if (message.toLowerCase().includes('cheaper') || message.toLowerCase().includes('budget') || message.toLowerCase().includes('save')) {
          // User looking for cheaper options
          responseText = "I get it, budget is important! Let me see if got cheaper options for you...\n\n";
          
          if (policyDatabase) {
            const budgetOption = await policyDatabase.recommendProduct({ ...tripData, existing_conditions: false, trip_type: 'ST', activities: [] });
            responseText += `💰 **Budget Option:** ${budgetOption.name} - SGD $${budgetOption.price}\n`;
            responseText += "This one covers the essentials lah, but less comprehensive.\n\n";
          }
          
          responseText += "Actually, let me ask - what's your main concern? Medical coverage? Lost luggage? Trip cancellation?\n";
          responseText += "I can help you pick the minimum coverage that still protects you properly 👍";
          
        } else {
          // User seems ready or has other response - be more conversational
          const positiveResponses = ['yes', 'ok', 'good', 'sure', 'sounds good', 'great', 'perfect'];
          const isPositive = positiveResponses.some(word => message.toLowerCase().includes(word));
          
          if (isPositive) {
            responseText = "Awesome! You made a good choice 👍 Let me confirm all your details now.";
          } else {
            responseText = "No worries! If you have any other questions about the coverage, just ask lah. Otherwise, let's confirm your details?";
          }
          nextStep = 'bind_check';
        }
      } else {
        responseText = "Let me get the right plans for you.";
      }
    }
    
    // STEP 4: BIND CHECK
    else if (step === 'bind_check') {
      if (!session.bind_summary_shown) {
        responseText = "Alright, let me double-check everything with you:\n\n";
        responseText += this._generateBindSummary(tripData);
        responseText += "\n\nLooks good? If everything's accurate just give me a 'yes' and we'll proceed to payment! 👍";
        session.bind_summary_shown = true;
        requiresAction = 'confirm_binding';
      } else {
        if (['yes', 'correct', 'accurate', 'confirm', "that's right", 'yes confirm', 'looks good', 'all good'].includes(message.toLowerCase().trim())) {
          nextStep = 'payment';
          responseText = "Awesome! Everything confirmed. Let's get this paid for you! 💳";
        } else {
          responseText = "No problem! Just tell me what needs changing and I'll update it for you lah 😊";
        }
      }
    }
    
    // STEP 5: PAYMENT
    else if (step === 'payment') {
      if (!session.payment_message_shown) {
        const totalPrice = this._calculateTotal(session);
        responseText = `Alright! Total comes to **SGD $${totalPrice}** for ${tripData.number_of_travellers || 1} traveller(s), covering ${tripData.trip_start_date} to ${tripData.trip_end_date}. 💳\n\n`;
        responseText += "I'll open the secure payment page for you. Once payment goes through, your coverage starts immediately and I'll give you your emergency contact card right here. Ready to proceed?";
        requiresAction = 'payment';
        session.payment_message_shown = true;
      } else {
        if (['proceed', 'yes', 'ok', 'sure', 'go ahead'].includes(message.toLowerCase())) {
          nextStep = 'post_purchase';
          responseText = '';
        } else {
          responseText = "Just click the payment button when you're ready lah! 😊";
        }
      }
    }
    
    // STEP 6: POST-PURCHASE
    else if (step === 'post_purchase') {
      if (!session.post_purchase_shown) {
        responseText = "🎉 **Woohoo! All done lah!** Your travel insurance is now active and ready to protect you!\n\n";
        responseText += "📱 **Quick reminders for your trip:**\n";
        responseText += "• Luggage delayed 6+ hours? Get that airline report, take photos, send to me - I'll sort out your claim!\n";
        responseText += "• Feeling unwell anywhere? Just message 'medical help' and I'll find you the nearest approved clinic (no cash payment needed!)\n\n";
        responseText += "💡 **Pro tip:** I've saved your emergency card and all claim instructions right here in our chat. Just scroll up anytime during your trip to find them!\n\n";
        responseText += "Have an amazing trip! I'll be here if you need anything 😊";
        
        data = {
          policy_number: session.policy_number || 'POL-ACTIVE',
          emergency_card: 'Emergency: +65-XXXX-XXXX'
        };
        session.post_purchase_shown = true;
      } else {
        if (message.toLowerCase().includes('medical') || message.toLowerCase().includes('help') || message.toLowerCase().includes('emergency')) {
          responseText = "🚨 **Medical Emergency Support:**\n24/7 Hotline: +65-XXXX-XXXX\n\nThey'll find you the nearest approved clinic so you don't need to pay upfront. Keep your receipts safe ah!";
        } else if (message.toLowerCase().includes('luggage') || message.toLowerCase().includes('baggage') || message.toLowerCase().includes('claim') || message.toLowerCase().includes('lost')) {
          responseText = "📦 **Luggage Claim Process:**\n1. Get Property Irregularity Report (PIR) from airline\n2. Take photos of everything\n3. Send me the docs with your policy number\n4. Claims usually processed in 5-7 days\n\nDon't worry, I'll guide you through it! 👍";
        } else if (message.toLowerCase().includes('thank') || message.toLowerCase().includes('bye')) {
          responseText = "You're welcome! Enjoy your trip and stay safe! If anything happens, just come back here and I'll help you sort it out. Have fun! 🌟✈️";
        } else {
          responseText = "I'm always here to help during your trip! Just say:\n• 'medical help' for emergency contacts\n• 'claim' for filing instructions\n• Or ask me anything else! 😊";
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
      
      const prompt = `You are TripKaki, a friendly Singaporean travel insurance buddy helping your friend with travel insurance. You're like that knowledgeable friend who always looks out for others.

Selected Policy: ${planName}

${Object.keys(policyContext).length > 0 ? `Policy Details: ${JSON.stringify(policyContext)}` : 'Note: Policy details are still being collected.'}

${Object.keys(tripData).length > 0 ? `User's Trip: ${JSON.stringify(tripData)}` : 'Note: User trip details are still being collected.'}

Question: ${question}

Answer like you're talking to a close friend - be helpful, caring, and use natural Singaporean expressions. Keep it conversational and personal:
- Use "lah", "leh", "ah", "can", "sia" naturally (don't force it)
- Be protective and caring like a good friend would be
- Give practical advice and real examples
- Compare options when relevant 
- Suggest add-ons or alternatives if it helps them

IMPORTANT: Always relate back to their specific trip when possible. If asking about coverage, explain it in context of their destination/activities. If you don't have their trip details yet, be friendly about it - "Let me get your trip details first, then I can give you super specific advice about what you need!"

Make it feel like talking to that friend who really knows insurance and wants to help you make the right choice.`;

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
      return "Anything else I should know about your trip?";
    }
    
    // Map field names to natural prompts - ask one at a time, friendly style
    const fieldPrompts = {
      'name': "What should I call you?",
      'age': "How old are you?", 
      'trip_type': "Round trip or one-way?",
      'departure_date': "When are you flying out?",
      'return_date': "And when do you come back?",
      'departure_country': "Which country you leaving from?",
      'arrival_country': "Where are you headed to?",
      'number_of_adults': "How many adults going on this trip?"
    };
    
    // Return only the first missing field
    const firstMissingField = missingFields[0];
    return fieldPrompts[firstMissingField] || "Tell me more about your trip lah!";
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

