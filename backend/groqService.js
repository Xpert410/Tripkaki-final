import Groq from 'groq-sdk';

export class GroqService {
  constructor(apiKey = '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') {
    this.client = new Groq({ apiKey });
    this.model = 'llama-3.3-70b-versatile';
  }

  async getTripIntelligence(
    destination,
    activities = [],
    medicalFlags = [],
    tripStyle = null
  ) {
    /**
     * Get intelligent insights about the trip from Groq:
     * - Pricing and coverage tiers
     * - Destination-specific claim insights
     * - Risk levels for activities
     * - Personalized plan recommendations
     */
    
    const medicalContext = medicalFlags.length > 0 ? medicalFlags.join(', ') : 'None';
    const activitiesContext = activities.length > 0 ? activities.join(', ') : 'General travel';
    
    const prompt = `You are a travel insurance intelligence system analyzing a trip request.

Trip Details:
- Destination: ${destination}
- Activities: ${activitiesContext}
- Medical conditions: ${medicalContext}
- Trip style: ${tripStyle || 'Not specified'}

Generate a JSON response with:
1. "recommended_plans": Array of 2-3 plans with name, coverage_details, exclusions, price
2. "risk_intel": Object with top_claims (array), common_incidents, risk_level
3. "coverage_gaps": Array of potential uncovered scenarios
4. "claim_patterns": Object with destination-specific claim statistics
5. "pricing": Object with base_price, addon_options (array with name, price, description)

Be specific and realistic. Prices should be in SGD and reasonable (base plans $30-80 for 1 week trip).
Format as valid JSON only.`;

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a travel insurance data analysis system. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      });
      
      const result = JSON.parse(completion.choices[0].message.content);
      return result;
    } catch (error) {
      console.error('Groq API error:', error);
      // Fallback to default intelligence if Groq fails
      return this._defaultIntelligence(destination, activities, medicalFlags);
    }
  }

  _defaultIntelligence(destination, activities = [], medicalFlags = []) {
    /** Fallback default intelligence */
    // Determine add-ons based on activities
    const addonOptions = [];
    
    if (activities.some(a => a.includes('ski') || a.includes('snowboard'))) {
      addonOptions.push({
        name: 'Winter Sports Medical Boost',
        price: 11,
        description: 'Raises emergency cover to $250k and adds slope rescue'
      });
    }
    
    if (activities.some(a => a.includes('dive') || a.includes('scuba'))) {
      addonOptions.push({
        name: 'Adventure Sports Coverage',
        price: 15,
        description: 'Adds scuba diving and water sports medical coverage'
      });
    }
    
    if (addonOptions.length === 0) {
      addonOptions.push({
        name: 'High-Value Baggage Boost',
        price: 4,
        description: 'Increases baggage loss from $1k to $3k'
      });
    }
    
    return {
      recommended_plans: [
        {
          name: 'Standard Plan',
          coverage_details: ['Medical emergency up to $100k', 'Trip cancellation', 'Baggage loss up to $1k'],
          exclusions: ['Extreme sports', 'Pre-existing conditions'],
          price: 45
        },
        {
          name: 'Comprehensive Plan',
          coverage_details: ['Medical emergency up to $200k', 'Trip cancellation', 'Baggage loss up to $2k', 'Travel delays'],
          exclusions: ['Pre-existing conditions without declaration'],
          price: 65
        }
      ],
      risk_intel: {
        top_claims: ['Medical emergencies', 'Baggage delays'],
        common_incidents: ['Airport delays', 'Lost luggage'],
        risk_level: 'moderate'
      },
      coverage_gaps: [],
      claim_patterns: {
        [destination]: 'Standard travel risks apply'
      },
      pricing: {
        base_price: 45,
        addon_options: addonOptions
      }
    };
  }

  async classifyPersona(tripData) {
    /** Classify traveler persona based on trip data */
    const activities = tripData.activities || [];
    const tripStyle = tripData.trip_style || '';
    const medicalFlags = tripData.medical_flags || [];
    const roles = tripData.roles || [];
    const numberOfTravellers = tripData.number_of_travellers || 1;
    
    const prompt = `Based on this trip profile, classify the traveler persona:

Activities: ${activities.join(', ')}
Trip style: ${tripStyle}
Medical conditions: ${medicalFlags.join(', ')}
Travellers: ${numberOfTravellers} (${roles.join(', ')})

Choose ONE persona:
1. Chill Voyager - Relax trip, low-risk, city/beach, cost aware
2. Adventurous Explorer - High-risk outdoor (ski, dive, hike, remote)
3. Family Guardian - With kids/elderly, prioritizes safety
4. Business Nomad - Tight schedule, work trip, cares about delays
5. Romantic Escaper - Couple, honeymoon, cancellation flexibility
6. Cultural Explorer - Multi-city, long stays, sightseeing, luggage theft risk

Respond with ONLY the persona name.`;

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a travel persona classifier. Respond with only the persona name.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3
      });
      
      const persona = completion.choices[0].message.content.trim();
      return persona;
    } catch (error) {
      console.error('Groq classification error:', error);
      // Fallback classification
      if (roles.some(r => ['kids', 'elderly', 'family'].includes(r.toLowerCase()))) {
        return 'Family Guardian';
      } else if (activities.some(a => ['skiing', 'diving', 'hiking', 'scuba'].includes(a.toLowerCase()))) {
        return 'Adventurous Explorer';
      } else if (tripStyle.toLowerCase() === 'business') {
        return 'Business Nomad';
      } else if (tripStyle.toLowerCase() === 'romantic') {
        return 'Romantic Escaper';
      } else {
        return 'Chill Voyager';
      }
    }
  }

  async generateResponse(conversationContext, systemPrompt) {
    /** Generate conversational response using Groq */
    const messages = [{ role: 'system', content: systemPrompt }, ...conversationContext];
    
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: messages,
        temperature: 0.8
      });
      
      return completion.choices[0].message.content;
    } catch (error) {
      console.error('Groq response error:', error);
      return "I apologize, I'm having trouble processing that. Could you rephrase?";
    }
  }
}


