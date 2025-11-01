import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GroqService } from '../groqService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class TaxonomyEngine {
  constructor() {
    this.taxonomy = null;
    this.groqService = new GroqService();
    this.loadTaxonomy();
  }

  loadTaxonomy() {
    try {
      const taxonomyPath = join(__dirname, '../../Taxonomy_Hackathon.json');
      const taxonomyData = fs.readFileSync(taxonomyPath, 'utf8');
      this.taxonomy = JSON.parse(taxonomyData);
    } catch (error) {
      console.error('Error loading taxonomy:', error);
      this.taxonomy = null;
    }
  }

  /**
   * Extract and normalize policy document using Groq
   */
  async parsePolicyDocument(pdfText) {
    const prompt = `You are a travel insurance policy parser. Extract structured information from this policy text.

Policy Text:
${pdfText}

Extract and return a JSON object with this structure:
{
  "eligibility": {
    "age_min": number,
    "age_max": number,
    "trip_start_singapore": boolean,
    "good_health": boolean,
    "child_accompaniment_required": boolean
  },
  "exclusions": [
    {"type": "string", "description": "string", "original_text": "string"}
  ],
  "benefits": [
    {
      "name": "string",
      "limit": "string or number",
      "sub_limits": {},
      "deductible": "string or number",
      "conditions": []
    }
  ],
  "limits": {
    "medical_emergency": "string",
    "trip_cancellation": "string",
    "baggage_loss": "string"
  },
  "deductibles": {},
  "zones": []
}

Be precise and extract actual values from the text.`;

    try {
      const response = await this.groqService.client.chat.completions.create({
        model: this.groqService.model,
        messages: [
          {
            role: 'system',
            content: 'You are a policy document parser. Always return valid JSON only.'
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
      console.error('Error parsing policy:', error);
      return null;
    }
  }

  /**
   * Map extracted policy to normalized taxonomy structure
   */
  normalizePolicy(extractedPolicy, productName) {
    if (!this.taxonomy || !extractedPolicy) return null;

    const normalized = {
      product: productName,
      eligibility: {},
      exclusions: [],
      benefits: {},
      limits: {},
      deductibles: {},
      raw_text: extractedPolicy
    };

    // Map eligibility
    if (extractedPolicy.eligibility) {
      normalized.eligibility = extractedPolicy.eligibility;
    }

    // Map exclusions
    if (extractedPolicy.exclusions) {
      normalized.exclusions = extractedPolicy.exclusions.map(ex => ({
        condition: ex.type,
        description: ex.description,
        original_text: ex.original_text
      }));
    }

    // Map benefits
    if (extractedPolicy.benefits) {
      extractedPolicy.benefits.forEach(benefit => {
        normalized.benefits[benefit.name] = {
          limit: benefit.limit,
          sub_limits: benefit.sub_limits || {},
          deductible: benefit.deductible,
          conditions: benefit.conditions || []
        };
      });
    }

    return normalized;
  }

  /**
   * Compare multiple plans using normalized taxonomy
   */
  comparePlans(plans) {
    if (!plans || plans.length === 0) return null;

    const comparison = {
      products: plans.map(p => p.product),
      eligibility_matrix: {},
      benefits_matrix: {},
      exclusions_matrix: {},
      recommendation: null
    };

    // Build eligibility comparison
    plans.forEach(plan => {
      Object.keys(plan.eligibility || {}).forEach(key => {
        if (!comparison.eligibility_matrix[key]) {
          comparison.eligibility_matrix[key] = {};
        }
        comparison.eligibility_matrix[key][plan.product] = plan.eligibility[key];
      });
    });

    // Build benefits comparison
    plans.forEach(plan => {
      Object.keys(plan.benefits || {}).forEach(benefitName => {
        if (!comparison.benefits_matrix[benefitName]) {
          comparison.benefits_matrix[benefitName] = {};
        }
        comparison.benefits_matrix[benefitName][plan.product] = plan.benefits[benefitName];
      });
    });

    return comparison;
  }

  /**
   * Get FAQ response using both normalized and raw text
   */
  async getFAQResponse(question, policyContext) {
    const prompt = `Based on this travel insurance policy information, answer the user's question accurately.

Question: ${question}

Policy Context:
${JSON.stringify(policyContext, null, 2)}

Provide a clear, accurate answer. If the question asks about coverage, cite specific benefits. If asking about exclusions, cite specific exclusions. Always be precise and reference the policy terms when relevant.`;

    try {
      const response = await this.groqService.client.chat.completions.create({
        model: this.groqService.model,
        messages: [
          {
            role: 'system',
            content: 'You are a travel insurance FAQ assistant. Provide accurate, helpful answers based on policy documents.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.5
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error generating FAQ response:', error);
      return "I'm having trouble answering that. Could you rephrase?";
    }
  }

  /**
   * Check eligibility for specific condition
   */
  checkEligibility(condition, policyData) {
    const eligibility = policyData.eligibility || {};
    
    // Simple rule-based checks
    if (condition === 'diabetes' || condition === 'pre-existing') {
      return {
        eligible: eligibility.good_health === false || eligibility.pre_existing_allowed === true,
        conditions: eligibility.pre_existing_conditions || [],
        message: eligibility.pre_existing_allowed 
          ? "Pre-existing conditions may be covered with declaration"
          : "Pre-existing conditions are excluded"
      };
    }

    if (condition === 'age') {
      return {
        eligible: true,
        age_range: `${eligibility.age_min || 'N/A'} - ${eligibility.age_max || 'N/A'}`,
        message: `Age eligibility: ${eligibility.age_min || 'N/A'} to ${eligibility.age_max || 'N/A'} years`
      };
    }

    return {
      eligible: eligibility[condition] !== false,
      message: eligibility[condition] ? "Covered" : "Not covered"
    };
  }
}


