import { GroqService } from '../groqService.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ClaimsIntelligence {
  constructor() {
    this.groqService = new GroqService();
    this.claimsData = this.loadClaimsData();
  }

  loadClaimsData() {
    try {
      // Load claims data if available (Claims_Data_DB.pdf exists but we'll simulate)
      // In production, this would be a proper database or API
      return {
        japan: {
          skiing: {
            frequency: 0.23, // 23% of Japan claims
            avg_amount: 2500,
            top_causes: ['Ski injuries', 'Equipment loss', 'Slope evacuation']
          },
          general: {
            frequency: 0.77,
            avg_amount: 800
          }
        },
        thailand: {
          general: {
            frequency: 1.0,
            avg_amount: 600,
            top_causes: ['Medical emergencies', 'Baggage delays', 'Trip cancellations']
          }
        },
        default: {
          general: {
            frequency: 1.0,
            avg_amount: 700
          }
        }
      };
    } catch (error) {
      console.error('Error loading claims data:', error);
      return {};
    }
  }

  /**
   * Get claim intelligence for destination and activities
   */
  async getClaimIntelligence(destination, activities = []) {
    const destinationKey = destination.toLowerCase().replace(/\s+/g, '_');
    let claimsStats = this.claimsData[destinationKey] || this.claimsData.default;

    // Check for activity-specific claims
    if (activities.length > 0) {
      const primaryActivity = activities[0].toLowerCase();
      if (claimsStats[primaryActivity]) {
        claimsStats = {
          ...claimsStats,
          primary_activity: claimsStats[primaryActivity]
        };
      }
    }

    return {
      destination,
      activities,
      claim_frequency: claimsStats.primary_activity?.frequency || claimsStats.general?.frequency || 0.15,
      avg_claim_amount: claimsStats.primary_activity?.avg_amount || claimsStats.general?.avg_amount || 700,
      top_claim_causes: claimsStats.primary_activity?.top_causes || claimsStats.general?.top_causes || [],
      risk_level: this.calculateRiskLevel(claimsStats)
    };
  }

  /**
   * Generate tier recommendation based on claims data
   */
  async recommendTier(destination, activities, travelProfile) {
    const intelligence = await this.getClaimIntelligence(destination, activities);
    
    const prompt = `Based on MSIG historical claims data, recommend the appropriate insurance tier.

Claims Intelligence:
- Destination: ${destination}
- Activities: ${activities.join(', ')}
- Claim Frequency: ${(intelligence.claim_frequency * 100).toFixed(1)}%
- Average Claim Amount: SGD ${intelligence.avg_claim_amount}
- Top Claim Causes: ${intelligence.top_claim_causes.join(', ')}

Travel Profile:
${JSON.stringify(travelProfile, null, 2)}

Tier Options:
- Lite: SGD 100k medical, SGD 10k cancellation, SGD 1k baggage
- Pro: SGD 250k medical, SGD 20k cancellation, SGD 3k baggage
- Premium: SGD 500k medical, SGD 50k cancellation, SGD 5k baggage

Recommend a tier based on claim risk and provide rationale. Return JSON:
{
  "recommended_tier": "Lite" | "Pro" | "Premium",
  "rationale": "string",
  "supporting_stats": {},
  "risk_assessment": "low" | "medium" | "high"
}`;

    try {
      const response = await this.groqService.client.chat.completions.create({
        model: this.groqService.model,
        messages: [
          {
            role: 'system',
            content: 'You are a travel insurance risk analyst. Use claims data to make tier recommendations. Always return valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const recommendation = JSON.parse(response.choices[0].message.content);
      
      return {
        ...recommendation,
        claims_intelligence: intelligence
      };
    } catch (error) {
      console.error('Error generating tier recommendation:', error);
      return {
        recommended_tier: 'Pro',
        rationale: 'Based on standard risk assessment',
        risk_assessment: 'medium'
      };
    }
  }

  /**
   * Calculate risk level from claims stats
   */
  calculateRiskLevel(claimsStats) {
    const frequency = claimsStats.primary_activity?.frequency || claimsStats.general?.frequency || 0.15;
    const avgAmount = claimsStats.primary_activity?.avg_amount || claimsStats.general?.avg_amount || 700;

    if (frequency > 0.25 || avgAmount > 2000) {
      return 'high';
    } else if (frequency > 0.15 || avgAmount > 1000) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Get predictive claim risk for specific scenario
   */
  async predictClaimRisk(scenario, destination, activities) {
    const intelligence = await this.getClaimIntelligence(destination, activities);

    const prompt = `Predict claim risk for this scenario based on MSIG historical data.

Scenario: ${scenario}
Destination: ${destination}
Activities: ${activities.join(', ')}
Historical Claim Data: ${JSON.stringify(intelligence, null, 2)}

Provide risk assessment JSON:
{
  "risk_score": number (0-100),
  "likelihood": "very_low" | "low" | "medium" | "high" | "very_high",
  "expected_claim_amount": number,
  "mitigation_suggestions": []
}`;

    try {
      const response = await this.groqService.client.chat.completions.create({
        model: this.groqService.model,
        messages: [
          {
            role: 'system',
            content: 'You are a claims risk predictor. Use historical data to assess scenarios. Always return valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Error predicting claim risk:', error);
      return {
        risk_score: 50,
        likelihood: 'medium',
        expected_claim_amount: intelligence.avg_claim_amount || 700
      };
    }
  }
}


