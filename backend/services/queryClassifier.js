import { GroqService } from '../groqService.js';
import { PolicyDatabase } from './policyDatabase.js';

/**
 * Intelligent Query Classification System for MICA
 * Uses Groq AI to classify user queries and route them to appropriate handlers
 */
export class QueryClassifier {
  constructor() {
    this.groqService = new GroqService();
    this.queryTypes = ['comparison', 'explanation', 'eligibility', 'scenario'];
  }

  /**
   * Classify user query into one of 4 types using Groq
   */
  async classifyQuery(userQuery) {
    const classificationPrompt = `Analyze this user question about travel insurance and classify it into ONE of these categories:

1. comparison - User wants to compare different plans, policies, or benefits side-by-side
   Examples: "What's the difference between Plan A and Plan B?", "Compare coverage limits", "Which plan has better medical coverage?"

2. explanation - User wants to understand what a benefit/term means or how something works
   Examples: "What does medical expenses cover?", "Explain trip cancellation", "What is personal liability?"

3. eligibility - User wants to know if they qualify or if something is covered under their conditions
   Examples: "Am I covered if I have diabetes?", "What's the age limit?", "Can I get coverage for pre-existing conditions?"

4. scenario - User describes a specific situation and wants to know if/how it's covered
   Examples: "What if I break my leg while skiing?", "My luggage was lost, am I covered?", "I need to cancel due to illness, what happens?"

User Question: "${userQuery}"

Return ONLY a JSON object with:
{
  "query_type": "comparison" | "explanation" | "eligibility" | "scenario",
  "confidence": number (0.0 to 1.0),
  "reasoning": "brief explanation of why this classification"
}`;

    try {
      const response = await this.groqService.client.chat.completions.create({
        model: this.groqService.model,
        messages: [
          {
            role: 'system',
            content: 'You are an intelligent query classification system. Analyze user questions and classify them accurately. Return ONLY valid JSON.'
          },
          {
            role: 'user',
            content: classificationPrompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const classification = JSON.parse(response.choices[0].message.content);
      
      // Validate classification
      if (!this.queryTypes.includes(classification.query_type)) {
        // Default to explanation if classification fails
        return {
          query_type: 'explanation',
          confidence: 0.5,
          reasoning: 'Default classification due to parsing error'
        };
      }

      return classification;
    } catch (error) {
      console.error('Error classifying query:', error);
      // Default to explanation
      return {
        query_type: 'explanation',
        confidence: 0.5,
        reasoning: 'Error in classification, defaulting to explanation'
      };
    }
  }

  /**
   * Compare policies - returns side-by-side matrix
   */
  async comparePolicies(userQuery, policyDatabase, tripData) {
    try {
      // Get all available products from database
      const db = policyDatabase.loadDatabase();
      if (!db) {
        throw new Error('Policy database not available');
      }

      // Get products from taxonomy (Product A, B, C)
      const products = db.products || ['Product A', 'Product B', 'Product C'];
      const productKeys = products.slice(0, 3); // Compare first 3 products

      // Get policy data for each product using PolicyDatabase method
      const productsData = productKeys.map(key => {
        const productData = policyDatabase.getPolicyData(key);
        return {
          name: key,
          key: key,
          benefits: productData?.layer_2_benefits || [],
          conditions: productData?.layer_1_general_conditions || []
        };
      });

      const comparisonPrompt = `Compare these travel insurance policies based on the user's question.

User Question: "${userQuery}"

Policies to Compare:
${JSON.stringify(productsData, null, 2)}

Generate a comparison matrix showing:
- Key benefits and their limits/coverage
- Differences between policies
- Which policy is better for what scenarios

Return JSON:
{
  "query_type": "comparison",
  "plans_compared": [array of plan names],
  "matrix": [
    {"Benefit": "Medical Coverage", "Plan1": "$250k", "Plan2": "$100k", "Plan3": "$200k"},
    {"Benefit": "Trip Cancellation", "Plan1": "Yes", "Plan2": "No", "Plan3": "Yes"}
  ],
  "summary": "Brief comparison summary",
  "recommendation": "Which plan is better for what"
}`;

      const response = await this.groqService.client.chat.completions.create({
        model: this.groqService.model,
        messages: [
          {
            role: 'system',
            content: 'You are a travel insurance comparison expert. Generate accurate side-by-side comparisons. Return ONLY valid JSON.'
          },
          {
            role: 'user',
            content: comparisonPrompt
          }
        ],
        temperature: 0.4,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Error comparing policies:', error);
      return {
        query_type: 'comparison',
        error: 'Failed to generate comparison',
        message: 'Sorry, I had trouble comparing the plans. Could you try rephrasing?'
      };
    }
  }

  /**
   * Explain coverage - returns detailed explanation with references
   */
  async explainCoverage(userQuery, policyDatabase, tripData) {
    try {
      const db = policyDatabase.loadDatabase();
      if (!db || !db.layers) {
        throw new Error('Policy database not available');
      }

      // Get relevant benefits and conditions from layers
      const benefits = db.layers?.layer_2_benefits || [];
      const conditions = db.layers?.layer_1_general_conditions || [];
      
      // Extract benefit names and original text
      const benefitList = benefits.slice(0, 20).map(benefit => {
        const productData = benefit.products || {};
        const firstProduct = Object.keys(productData)[0];
        return {
          benefit_name: benefit.benefit || benefit.benefit_name || 'Unknown',
          original_text: firstProduct ? productData[firstProduct]?.original_text : '',
          products: productData
        };
      });
      
      const conditionList = conditions.slice(0, 10).map(condition => {
        const productData = condition.products || {};
        const firstProduct = Object.keys(productData)[0];
        return {
          condition: condition.condition || 'Unknown',
          original_text: firstProduct ? productData[firstProduct]?.original_text : '',
          products: productData
        };
      });

      const explanationPrompt = `Explain this travel insurance concept based on the policy documents.

User Question: "${userQuery}"

Policy Benefits:
${JSON.stringify(benefitList, null, 2)}

General Conditions:
${JSON.stringify(conditionList, null, 2)}

Provide a detailed explanation that:
- Explains what the benefit/term means in simple language
- References specific policy sections when possible
- Includes coverage limits, exclusions, and conditions
- Is helpful and easy to understand

Return JSON:
{
  "query_type": "explanation",
  "benefit": "Name of benefit or topic being explained",
  "explanation": "Detailed explanation in natural language",
  "reference_text": "Section reference if available (e.g., 'Section 3.1 – Medical Expenses')",
  "coverage_details": {
    "limit": "Coverage limit if applicable",
    "exclusions": ["List of exclusions"],
    "conditions": ["Any special conditions"]
  }
}`;

      const response = await this.groqService.client.chat.completions.create({
        model: this.groqService.model,
        messages: [
          {
            role: 'system',
            content: 'You are a travel insurance expert explaining coverage to customers. Be clear, accurate, and helpful. Return ONLY valid JSON.'
          },
          {
            role: 'user',
            content: explanationPrompt
          }
        ],
        temperature: 0.5,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Error explaining coverage:', error);
      return {
        query_type: 'explanation',
        error: 'Failed to generate explanation',
        message: 'Sorry, I had trouble explaining that. Could you try rephrasing?'
      };
    }
  }

  /**
   * Check eligibility - returns yes/no with conditions
   */
  async checkEligibility(userQuery, policyDatabase, tripData) {
    try {
      const db = policyDatabase.loadDatabase();
      if (!db || !db.layers) {
        throw new Error('Policy database not available');
      }

      const conditions = db.layers?.layer_1_general_conditions || [];
      const benefitConditions = db.layers?.layer_3_benefit_conditions || [];
      
      // Format conditions with product data
      const conditionList = conditions.map(condition => {
        const productData = condition.products || {};
        const firstProduct = Object.keys(productData)[0];
        return {
          condition: condition.condition || 'Unknown',
          condition_type: condition.condition_type || 'general',
          original_text: firstProduct ? productData[firstProduct]?.original_text : '',
          parameters: firstProduct ? productData[firstProduct]?.parameters : {},
          products: productData
        };
      });
      
      const benefitConditionList = benefitConditions.slice(0, 10).map(benefitCondition => {
        const productData = benefitCondition.products || {};
        const firstProduct = Object.keys(productData)[0];
        return {
          benefit: benefitCondition.benefit || 'Unknown',
          original_text: firstProduct ? productData[firstProduct]?.original_text : '',
          products: productData
        };
      });

      const eligibilityPrompt = `Determine if the user is eligible for coverage based on their question and policy conditions.

User Question: "${userQuery}"

User Trip Data:
${JSON.stringify(tripData || {}, null, 2)}

General Conditions (Eligibility Rules):
${JSON.stringify(conditionList, null, 2)}

Benefit-Specific Conditions:
${JSON.stringify(benefitConditionList, null, 2)}

Analyze eligibility and return:
- Is the user/condition covered? (yes/no/maybe)
- What are the specific eligibility requirements?
- Any exclusions that apply?
- Advice on how to qualify if not eligible

Return JSON:
{
  "query_type": "eligibility",
  "condition": "The specific condition/question being checked",
  "is_covered": boolean,
  "reason": "Why it is or isn't covered, referencing policy sections",
  "requirements": ["List of eligibility requirements"],
  "exclusions": ["Any exclusions that apply"],
  "advice": "Advice on coverage or how to qualify"
}`;

      const response = await this.groqService.client.chat.completions.create({
        model: this.groqService.model,
        messages: [
          {
            role: 'system',
            content: 'You are an eligibility assessment system. Check policy rules accurately and provide clear yes/no answers with explanations. Return ONLY valid JSON.'
          },
          {
            role: 'user',
            content: eligibilityPrompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Error checking eligibility:', error);
      return {
        query_type: 'eligibility',
        error: 'Failed to check eligibility',
        message: 'Sorry, I had trouble checking eligibility. Could you try rephrasing?'
      };
    }
  }

  /**
   * Simulate scenario - returns step-by-step coverage analysis
   */
  async simulateScenario(userQuery, policyDatabase, tripData) {
    try {
      const db = policyDatabase.loadDatabase();
      if (!db || !db.layers) {
        throw new Error('Policy database not available');
      }

      const benefits = db.layers?.layer_2_benefits || [];
      const conditions = db.layers?.layer_1_general_conditions || [];
      const benefitConditions = db.layers?.layer_3_benefit_conditions || [];
      
      // Format data with product information
      const benefitList = benefits.slice(0, 20).map(benefit => {
        const productData = benefit.products || {};
        const firstProduct = Object.keys(productData)[0];
        return {
          benefit_name: benefit.benefit || benefit.benefit_name || 'Unknown',
          original_text: firstProduct ? productData[firstProduct]?.original_text : '',
          products: productData
        };
      });
      
      const conditionList = conditions.slice(0, 10).map(condition => {
        const productData = condition.products || {};
        const firstProduct = Object.keys(productData)[0];
        return {
          condition: condition.condition || 'Unknown',
          original_text: firstProduct ? productData[firstProduct]?.original_text : '',
          products: productData
        };
      });
      
      const benefitConditionList = benefitConditions.slice(0, 10).map(benefitCondition => {
        const productData = benefitCondition.products || {};
        const firstProduct = Object.keys(productData)[0];
        return {
          benefit: benefitCondition.benefit || 'Unknown',
          original_text: firstProduct ? productData[firstProduct]?.original_text : '',
          products: productData
        };
      });

      const scenarioPrompt = `Simulate this scenario and determine coverage step-by-step.

User Question/Scenario: "${userQuery}"

User Trip Data:
${JSON.stringify(tripData || {}, null, 2)}

Available Benefits:
${JSON.stringify(benefitList, null, 2)}

General Conditions:
${JSON.stringify(conditionList, null, 2)}

Benefit Conditions:
${JSON.stringify(benefitConditionList, null, 2)}

Analyze the scenario step-by-step:
1. Identify which benefit(s) might apply
2. Check eligibility and conditions
3. Determine coverage status (full/partial/excluded)
4. Calculate coverage limits
5. Identify any exclusions
6. Provide claim guidance

Return JSON:
{
  "query_type": "scenario",
  "scenario": "Brief description of the scenario",
  "covered": boolean,
  "coverage_status": "full" | "partial" | "excluded",
  "applicable_benefits": ["List of benefits that apply"],
  "coverage_steps": [
    "Step 1: Description of first step",
    "Step 2: Description of second step"
  ],
  "coverage_details": {
    "limit": "Coverage limit if applicable",
    "deductible": "Deductible amount if any",
    "exclusions": ["List of exclusions that apply"]
  },
  "claim_guidance": "Instructions on how to file a claim for this scenario"
}`;

      const response = await this.groqService.client.chat.completions.create({
        model: this.groqService.model,
        messages: [
          {
            role: 'system',
            content: 'You are a scenario simulation system. Analyze travel insurance scenarios step-by-step and determine coverage accurately. Return ONLY valid JSON.'
          },
          {
            role: 'user',
            content: scenarioPrompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Error simulating scenario:', error);
      return {
        query_type: 'scenario',
        error: 'Failed to simulate scenario',
        message: 'Sorry, I had trouble analyzing that scenario. Could you try rephrasing?'
      };
    }
  }

  /**
   * Main router - classifies query and routes to appropriate handler
   */
  async processQuery(userQuery, policyDatabase, tripData = {}) {
    try {
      // Step 1: Classify the query
      console.log(`[QueryClassifier] Classifying query: "${userQuery}"`);
      const classification = await this.classifyQuery(userQuery);
      console.log(`[QueryClassifier] Classification result:`, classification);

      let result;

      // Step 2: Route to appropriate handler
      switch (classification.query_type) {
        case 'comparison':
          result = await this.comparePolicies(userQuery, policyDatabase, tripData);
          break;

        case 'explanation':
          result = await this.explainCoverage(userQuery, policyDatabase, tripData);
          break;

        case 'eligibility':
          result = await this.checkEligibility(userQuery, policyDatabase, tripData);
          break;

        case 'scenario':
          result = await this.simulateScenario(userQuery, policyDatabase, tripData);
          break;

        default:
          result = {
            query_type: 'explanation',
            error: 'Unknown query type',
            message: "Sorry, I couldn't understand that question. Could you try rephrasing?"
          };
      }

      // Add classification metadata
      result.classification = classification;
      
      return result;
    } catch (error) {
      console.error('Error processing query:', error);
      return {
        query_type: 'explanation',
        error: 'Processing failed',
        message: 'Sorry, I encountered an error processing your question. Please try again.'
      };
    }
  }
}

