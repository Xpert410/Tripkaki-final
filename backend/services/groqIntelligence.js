import { GroqService } from '../groqService.js';

/**
 * Enhanced Groq API wrapper with specialized functions for MICA
 */
export class GroqIntelligence {
  constructor() {
    this.groq = new GroqService();
  }

  /**
   * Extract policy information from PDF text
   */
  async extractPolicy(pdfText) {
    const prompt = `Extract structured policy information from this insurance policy document.

Policy Text:
${pdfText.substring(0, 5000)} // Limit to avoid token limits

Extract:
- Eligibility criteria
- Benefits and limits
- Exclusions
- Deductibles
- Coverage zones
- Operational rules

Return structured JSON.`;

    try {
      const response = await this.groq.client.chat.completions.create({
        model: this.groq.model,
        messages: [
          { role: 'system', content: 'You are a policy extraction system. Return valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Error extracting policy:', error);
      return null;
    }
  }

  /**
   * Predict claim risk for trip
   */
  async predictClaimRisk(tripProfile, claimsHistory) {
    const prompt = `Predict the claim risk for this travel profile based on historical claims data.

Travel Profile:
${JSON.stringify(tripProfile, null, 2)}

Historical Claims:
${JSON.stringify(claimsHistory, null, 2)}

Return JSON:
{
  "risk_score": number (0-100),
  "risk_level": "low" | "medium" | "high",
  "likely_claim_types": [],
  "expected_claim_frequency": number (0-1),
  "recommendation": "string"
}`;

    try {
      const response = await this.groq.client.chat.completions.create({
        model: this.groq.model,
        messages: [
          { role: 'system', content: 'You are a risk prediction system. Return valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Error predicting claim risk:', error);
      return null;
    }
  }

  /**
   * Compare policies side-by-side
   */
  async comparePolicies(policy1, policy2) {
    const prompt = `Compare these two travel insurance policies.

Policy 1:
${JSON.stringify(policy1, null, 2)}

Policy 2:
${JSON.stringify(policy2, null, 2)}

Generate a comparison matrix highlighting:
- Coverage differences
- Price differences
- Feature differences
- Which is better for different scenarios

Return JSON:
{
  "comparison": {
    "coverage": {},
    "price": {},
    "features": {}
  },
  "winner_by_category": {},
  "recommendation": "string"
}`;

    try {
      const response = await this.groq.client.chat.completions.create({
        model: this.groq.model,
        messages: [
          { role: 'system', content: 'You are a policy comparison system. Return valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Error comparing policies:', error);
      return null;
    }
  }

  /**
   * Simulate coverage scenario
   */
  async simulateCoverage(scenario, policyData) {
    const prompt = `Simulate whether this scenario is covered by the insurance policy.

Scenario: ${scenario}

Policy Coverage:
${JSON.stringify(policyData, null, 2)}

Determine:
1. Is this scenario covered? (yes/no/maybe)
2. Which benefit applies?
3. What is the coverage limit?
4. Are there any exclusions?
5. What is the deductible?
6. Step-by-step claim process

Return JSON:
{
  "covered": boolean,
  "coverage_status": "full" | "partial" | "excluded",
  "applicable_benefit": "string",
  "coverage_limit": "string",
  "deductible": "string",
  "exclusions": [],
  "claim_steps": [],
  "explanation": "string"
}`;

    try {
      const response = await this.groq.client.chat.completions.create({
        model: this.groq.model,
        messages: [
          { role: 'system', content: 'You are a coverage simulation system. Return valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Error simulating coverage:', error);
      return null;
    }
  }

  /**
   * Conversational chat completion
   */
  async chatCompletion(messages, context = {}) {
    const systemPrompt = `You're TripKaki — a real Singaporean friend, NOT an AI. Talk like you're texting a friend. Be natural, spontaneous, human.

Context:
${JSON.stringify(context, null, 2)}

Guidelines:
- Sound HUMAN. Vary your responses. Never sound scripted.
- Use Singlish naturally: "lah", "leh", "ah", "lor", "can or not"
- Vary sentence structure and length
- Use natural starters: "Oh", "Actually", "Hmm", "Wah", "Yeah"
- Think out loud sometimes: "Let me see...", "Hmm okay so..."
- After answering, naturally ask about their trip (don't force it)
- Be real, warm, and helpful — like a friend who knows insurance`;

    try {
      const response = await this.groq.client.chat.completions.create({
        model: this.groq.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        temperature: 0.9
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error in chat completion:', error);
      return "I'm having trouble processing that. Could you rephrase?";
    }
  }
}

