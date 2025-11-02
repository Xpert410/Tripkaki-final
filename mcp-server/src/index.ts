import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import AWS from 'aws-sdk';
import Stripe from 'stripe';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Initialize services
const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  endpoint: process.env.DDB_ENDPOINT || 'http://localhost:8000',
  accessKeyId: 'dummy',
  secretAccessKey: 'dummy'
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

// Table names
const QUOTES_TABLE = 'lea-insurance-quotes';
const CUSTOMERS_TABLE = 'lea-customer-profiles';
const PAYMENTS_TABLE = process.env.DYNAMODB_PAYMENTS_TABLE || 'lea-payments-local';
const POLICIES_TABLE = 'lea-insurance-policies';

/**
 * LEA Travel Insurance MCP Server
 * 
 * This server provides conversational insurance capabilities through MCP tools:
 * - Trip data collection and analysis
 * - Personalized insurance recommendations 
 * - Real-time quote generation
 * - Seamless payment processing
 * - Policy activation and management
 */

class LEAInsuranceMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: 'lea-insurance-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    this.setupTools();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupTools(): void {
    // Tool 1: Collect Trip Information
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'collect_trip_information',
            description: 'Collect and analyze traveller information to generate personalized insurance quotes. Handles natural language input and extracts structured trip data.',
            inputSchema: {
              type: 'object',
              properties: {
                natural_input: {
                  type: 'string',
                  description: 'Natural language description from user (e.g., "Going to Tokyo Dec 15-22, skiing with girlfriend, she has asthma")'
                },
                structured_data: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    age: { type: 'number' },
                    email: { type: 'string' },
                    phone: { type: 'string' },
                    existing_conditions: { type: 'array', items: { type: 'string' } },
                    trip_type: { type: 'string', enum: ['RT', 'ST'] },
                    departure_date: { type: 'string' },
                    return_date: { type: 'string' },
                    departure_country: { type: 'string' },
                    arrival_country: { type: 'string' },
                    number_of_adults: { type: 'number' },
                    number_of_children: { type: 'number' },
                    activities: { type: 'array', items: { type: 'string' } },
                    budget_range: { type: 'string', enum: ['budget', 'standard', 'premium', 'luxury'] }
                  }
                }
              },
              required: ['natural_input']
            }
          },
          {
            name: 'get_personalized_recommendations',
            description: 'Generate personalized insurance recommendations based on traveller persona and risk analysis. Returns scored plans with explanations.',
            inputSchema: {
              type: 'object',
              properties: {
                quote_id: { type: 'string', description: 'Quote ID from previous trip collection' },
                user_preferences: {
                  type: 'object',
                  properties: {
                    coverage_priorities: { type: 'array', items: { type: 'string' } },
                    budget_preference: { type: 'string' },
                    risk_tolerance: { type: 'string', enum: ['conservative', 'moderate', 'aggressive'] }
                  }
                }
              },
              required: ['quote_id']
            }
          },
          {
            name: 'ask_coverage_question',
            description: 'Answer specific insurance coverage questions using policy documents and normalized data. Provides citations and explanations.',
            inputSchema: {
              type: 'object',
              properties: {
                question: { type: 'string', description: 'User question about coverage (e.g., "Am I covered for skiing accidents?")' },
                quote_id: { type: 'string', description: 'Current quote context (optional)' },
                query_type: { 
                  type: 'string', 
                  enum: ['comparison', 'explanation', 'eligibility', 'scenario'],
                  description: 'Type of query to optimize response'
                }
              },
              required: ['question']
            }
          },
          {
            name: 'process_documents',
            description: 'Extract trip information from uploaded documents (flight bookings, hotel reservations, itineraries). Supports PDF, images, and text files.',
            inputSchema: {
              type: 'object',
              properties: {
                document_type: { 
                  type: 'string', 
                  enum: ['flight_booking', 'hotel_reservation', 'itinerary', 'visa_application', 'other'] 
                },
                document_content: { type: 'string', description: 'Base64 encoded document or text content' },
                file_type: { type: 'string', enum: ['pdf', 'image', 'text'] },
                existing_quote_id: { type: 'string', description: 'Add to existing quote (optional)' }
              },
              required: ['document_type', 'document_content', 'file_type']
            }
          },
          {
            name: 'initiate_purchase',
            description: 'Start the insurance purchase process. Creates Stripe checkout session and handles payment flow with real-time updates.',
            inputSchema: {
              type: 'object',
              properties: {
                quote_id: { type: 'string', description: 'Quote ID to purchase' },
                selected_plan_id: { type: 'string', description: 'Chosen insurance plan' },
                selected_riders: { 
                  type: 'array', 
                  items: { type: 'string' },
                  description: 'Optional add-on coverage (COVID, adventure sports, etc.)'
                },
                payment_method_preference: { 
                  type: 'string', 
                  enum: ['card', 'apple_pay', 'google_pay'],
                  default: 'card'
                }
              },
              required: ['quote_id', 'selected_plan_id']
            }
          },
          {
            name: 'track_payment_status',
            description: 'Monitor payment status in real-time and provide updates to user. Handles payment completion and policy activation.',
            inputSchema: {
              type: 'object',
              properties: {
                payment_intent_id: { type: 'string', description: 'Payment ID to track' },
                return_policy_details: { 
                  type: 'boolean', 
                  default: false, 
                  description: 'Include full policy details when payment completes' 
                }
              },
              required: ['payment_intent_id']
            }
          },
          {
            name: 'get_predictive_insights',
            description: 'Analyze historical claims data to provide risk insights and coverage recommendations specific to the trip.',
            inputSchema: {
              type: 'object',
              properties: {
                destination: { type: 'string' },
                activities: { type: 'array', items: { type: 'string' } },
                travel_season: { type: 'string' },
                traveller_age_group: { type: 'string' },
                trip_duration: { type: 'number' }
              },
              required: ['destination']
            }
          },
          {
            name: 'get_policy_receipt',
            description: 'Retrieve and display e-policy document as a receipt after successful payment. Shows comprehensive policy details in chat.',
            inputSchema: {
              type: 'object',
              properties: {
                user_id: { type: 'string', description: 'User identifier' },
                payment_intent_id: { type: 'string', description: 'Stripe payment intent ID (optional)' },
                policy_id: { type: 'string', description: 'Policy ID (optional)' }
              },
              required: ['user_id']
            }
          },
          {
            name: 'handle_post_purchase_questions',
            description: 'Answer questions about active policies, claims procedures, and coverage scenarios. Crisis support and claim guidance.',
            inputSchema: {
              type: 'object',
              properties: {
                policy_id: { type: 'string', description: 'Active policy ID' },
                question_type: { 
                  type: 'string', 
                  enum: ['coverage_check', 'claims_process', 'emergency_help', 'policy_changes'] 
                },
                question: { type: 'string', description: 'Specific question or scenario' },
                urgency: { 
                  type: 'string', 
                  enum: ['low', 'medium', 'high', 'emergency'],
                  default: 'medium'
                }
              },
              required: ['policy_id', 'question']
            }
          }
        ]
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'collect_trip_information':
            return await this.collectTripInformation(request.params.arguments);
          case 'get_personalized_recommendations':
            return await this.getPersonalizedRecommendations(request.params.arguments);
          case 'ask_coverage_question':
            return await this.askCoverageQuestion(request.params.arguments);
          case 'process_documents':
            return await this.processDocuments(request.params.arguments);
          case 'initiate_purchase':
            return await this.initiatePurchase(request.params.arguments);
          case 'track_payment_status':
            return await this.trackPaymentStatus(request.params.arguments);
          case 'get_policy_receipt':
            return await this.getPolicyReceipt(request.params.arguments);
          case 'get_predictive_insights':
            return await this.getPredictiveInsights(request.params.arguments);
          case 'handle_post_purchase_questions':
            return await this.handlePostPurchaseQuestions(request.params.arguments);
          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
            }
          ]
        };
      }
    });
  }

  private async collectTripInformation(args: any) {
    const { natural_input, structured_data } = args;

    // Parse natural language input using AI (integrate with your LLM)
    const extracted_data = await this.parseNaturalLanguageInput(natural_input);
    
    // Merge with any structured data provided
    const trip_data = { ...extracted_data, ...structured_data };

    // Validate required fields
    if (!trip_data.departure_country || !trip_data.arrival_country) {
      return {
        content: [
          {
            type: 'text',
            text: `I need a bit more information to create your quote. Could you tell me:\n\n` +
                  `${!trip_data.departure_country ? '• Which country are you departing from?\n' : ''}` +
                  `${!trip_data.arrival_country ? '• What\'s your destination?\n' : ''}` +
                  `${!trip_data.departure_date ? '• When do you depart?\n' : ''}` +
                  `\nI can help you get the perfect travel insurance once I have these details! 🌟`
          }
        ]
      };
    }

    // Generate quote via your existing API
    try {
      const response = await axios.post(`${process.env.BACKEND_API_URL || 'http://localhost:3001'}/api/quotes/create`, trip_data);
      const quote = response.data;

      return {
        content: [
          {
            type: 'text',
            text: `Perfect! I've analyzed your trip and created a personalized quote. 🎯\n\n` +
                  `**Your Travel Profile:**\n` +
                  `${quote.traveller_persona.icon} **${quote.traveller_persona.type.charAt(0).toUpperCase() + quote.traveller_persona.type.slice(1)} Traveller**\n` +
                  `${quote.traveller_persona.description}\n\n` +
                  `**Trip Summary:**\n` +
                  `📍 Destination: ${quote.trip_summary.destination}\n` +
                  `📅 Duration: ${quote.trip_summary.duration} days\n` +
                  `👥 Travellers: ${quote.trip_summary.travellers}\n` +
                  `${quote.trip_summary.activities.length > 0 ? `🏃 Activities: ${quote.trip_summary.activities.join(', ')}\n` : ''}\n` +
                  `**Quote ID:** ${quote.quote_id}\n\n` +
                  `I've found ${quote.recommended_plans.length} plans tailored for you! Would you like to see the recommendations? 💫`
          }
        ]
      };
    } catch (error) {
      console.error('Quote creation error:', error);
      return {
        content: [
          {
            type: 'text',
            text: `I encountered an issue creating your quote. Let me try a different approach or you can provide the details step by step. What's your destination? 🤔`
          }
        ]
      };
    }
  }

  private async getPersonalizedRecommendations(args: any) {
    const { quote_id, user_preferences = {} } = args;

    try {
      // Get quote details from database
      const result = await dynamodb.get({
        TableName: QUOTES_TABLE,
        Key: { quote_id }
      }).promise();

      if (!result.Item) {
        return {
          content: [
            {
              type: 'text',
              text: `I couldn't find that quote. Would you like to create a new one? Just tell me about your trip! ✈️`
            }
          ]
        };
      }

      const quote = result.Item;
      const plans = quote.recommended_plans;

      // Get predictive insights for enhanced recommendations
      const insights = await this.getPredictiveInsightsInternal({
        destination: quote.arrival_country,
        activities: quote.activities || [],
        travel_season: this.getTravelSeason(quote.departure_date),
        traveller_age_group: this.getAgeGroup(quote.age || 30),
        trip_duration: quote.trip_duration
      });

      let response = `## 🎯 Your Personalized Insurance Recommendations\n\n`;
      response += `Based on your **${quote.traveller_persona}** profile and historical data analysis:\n\n`;

      // Add insights summary
      if (insights.risk_summary) {
        response += `**📊 Risk Analysis:**\n${insights.risk_summary}\n\n`;
      }

      response += `**🛡️ Recommended Plans:**\n\n`;

      // Format each plan with explanations
      plans.forEach((plan: any, index: number) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
        response += `${medal} **${plan.name}** (${plan.coverage_fit_score}% match)\n`;
        response += `💰 **SGD ${plan.monthly_premium}** per policy\n`;
        response += `✨ **Key Features:** ${plan.key_features.join(', ')}\n`;
        response += `💡 **Why Recommended:** ${plan.why_recommended}\n\n`;
      });

      response += `Which plan interests you most? I can provide detailed coverage comparison or start your purchase! 🚀`;

      return {
        content: [
          {
            type: 'text',
            text: response
          }
        ]
      };

    } catch (error) {
      console.error('Recommendations error:', error);
      return {
        content: [
          {
            type: 'text',
            text: `I'm having trouble accessing your recommendations. Let me help you create a fresh quote instead! 🔄`
          }
        ]
      };
    }
  }

  private async askCoverageQuestion(args: any) {
    const { question, quote_id, query_type } = args;

    // This would integrate with your policy database and taxonomy
    // For now, providing intelligent responses based on common questions
    
    const coverage_responses = {
      skiing: {
        answer: "Yes! Our Gold and Platinum plans include coverage for skiing and snow sports activities. Here's what's covered:",
        details: [
          "🎿 On-piste skiing accidents: Full medical coverage up to policy limits",
          "🏔️ Off-piste skiing: Covered with Platinum plan, excluded in Silver",
          "🚁 Mountain rescue: Covered up to SGD 10,000",
          "⚠️ Exclusions: Professional racing, heli-skiing (unless added as rider)"
        ],
        citation: "Policy Section 2.3.1 - Adventure Sports Coverage"
      },
      medical: {
        answer: "Medical coverage varies by plan tier:",
        details: [
          "🥈 Silver: SGD 50,000 medical coverage",
          "🥇 Gold: SGD 100,000 medical coverage", 
          "🏆 Platinum: SGD 150,000 medical coverage",
          "🏥 Direct billing available at network hospitals",
          "📞 24/7 medical assistance hotline"
        ],
        citation: "Policy Section 1.2 - Medical Benefits"
      }
    };

    // Determine response based on question content
    let response_data = null;
    if (question.toLowerCase().includes('ski')) {
      response_data = coverage_responses.skiing;
    } else if (question.toLowerCase().includes('medical')) {
      response_data = coverage_responses.medical;
    }

    if (response_data) {
      let response = `**${response_data.answer}**\n\n`;
      response += response_data.details.map(detail => `${detail}`).join('\n');
      response += `\n\n*Source: ${response_data.citation}*\n\n`;
      response += `Need more specific details about your coverage? I can check your exact policy terms! 📋`;

      return {
        content: [
          {
            type: 'text',
            text: response
          }
        ]
      };
    }

    // Generic helpful response for other questions
    return {
      content: [
        {
          type: 'text',
          text: `That's a great question about "${question}". Let me check our policy database for the most accurate answer.\n\n` +
                `While I'm looking that up, I can tell you that our policies are designed to be comprehensive. ` +
                `Would you like me to show you a detailed coverage comparison, or do you have a specific scenario in mind? 🤔`
        }
      ]
    };
  }

  private async processDocuments(args: any) {
    const { document_type, document_content, file_type, existing_quote_id } = args;

    // This would integrate with your document processing service
    // For demonstration, providing mock extraction results
    
    const extraction_results = {
      flight_booking: {
        departure_date: "2025-12-15",
        return_date: "2025-12-22", 
        departure_country: "SG",
        arrival_country: "JP",
        travellers: ["John Doe", "Jane Smith"],
        ticket_value: 1200
      }
    };

    const extracted = extraction_results[document_type as keyof typeof extraction_results] || {};

    return {
      content: [
        {
          type: 'text',
          text: `Great! I've extracted the following information from your ${document_type.replace('_', ' ')}:\n\n` +
                `✈️ **Flight Details:**\n` +
                `📅 Departure: ${extracted.departure_date}\n` +
                `📅 Return: ${extracted.return_date}\n` +
                `🌏 Route: ${extracted.departure_country} → ${extracted.arrival_country}\n` +
                `👥 Travellers: ${extracted.travellers?.join(', ')}\n` +
                `💰 Ticket Value: SGD ${extracted.ticket_value}\n\n` +
                `Should I create your insurance quote based on this trip information? 🎯`
        }
      ]
    };
  }

  private async initiatePurchase(args: any) {
    const { quote_id, selected_plan_id, selected_riders = [], payment_method_preference = 'card' } = args;

    try {
      // Call your existing purchase API
      const response = await axios.post(
        `${process.env.BACKEND_API_URL || 'http://localhost:3001'}/api/quotes/${quote_id}/purchase`,
        {
          selected_plan_id,
          selected_riders,
          payment_method: 'stripe'
        }
      );

      const purchase = response.data;

      return {
        content: [
          {
            type: 'text',
            text: `Excellent choice! I'm setting up your secure payment for the **${purchase.selected_plan.name}**.\n\n` +
                  `**Purchase Summary:**\n` +
                  `🛡️ Plan: ${purchase.selected_plan.name} (${purchase.selected_plan.tier})\n` +
                  `💰 Base Price: SGD ${purchase.selected_plan.base_price}\n` +
                  `${purchase.riders.length > 0 ? `🎯 Add-ons: ${purchase.riders.map((r: any) => r.name).join(', ')}\n` : ''}` +
                  `**💳 Total: SGD ${purchase.total_amount}**\n\n` +
                  `🔐 **Secure Payment Link:** [Click here to pay](${purchase.checkout_url})\n\n` +
                  `I'll monitor your payment status and activate your policy immediately once complete! ⚡\n\n` +
                  `*Payment ID: ${purchase.payment_intent_id}*`
          }
        ]
      };

    } catch (error) {
      console.error('Purchase initiation error:', error);
      return {
        content: [
          {
            type: 'text',
            text: `I encountered an issue setting up your payment. Let me try again or we can select a different plan. Which would you prefer? 🔄`
          }
        ]
      };
    }
  }

  private async trackPaymentStatus(args: any) {
    const { payment_intent_id, return_policy_details = false } = args;

    try {
      // Call your payment status API
      const response = await axios.get(
        `${process.env.BACKEND_API_URL || 'http://localhost:3001'}/api/payments/${payment_intent_id}/status`
      );

      const payment = response.data;
      let status_message = '';

      switch (payment.status) {
        case 'pending':
          status_message = `💳 **Payment Processing...**\n\nI'm waiting for your payment to complete. Once done, I'll activate your policy instantly! ⚡`;
          break;
          
        case 'completed':
          if (return_policy_details && payment.policy) {
            status_message = `🎉 **Congratulations! You're now covered!**\n\n` +
                           `✅ **Policy Activated:** ${payment.policy.policy_id}\n` +
                           `🛡️ **Plan:** ${payment.policy.plan_name} (${payment.policy.plan_tier})\n` +
                           `📅 **Coverage:** ${payment.policy.coverage_start} to ${payment.policy.coverage_end}\n\n` +
                           `📧 Policy documents are being sent to your email.\n` +
                           `🆘 Emergency hotline: +65-6123-4567\n\n` +
                           `Have a safe and wonderful trip! Any questions about your coverage? 🌟`;
          } else {
            status_message = `🎉 **Payment Successful!**\n\nYour travel insurance is now active! Policy details are being finalized. 🛡️`;
          }
          break;
          
        case 'failed':
          status_message = `❌ **Payment Failed**\n\nDon't worry! This happens sometimes. Would you like to:\n• Try a different payment method\n• Contact your bank\n• Get help from our team\n\nI'm here to help you get covered! 💪`;
          break;
          
        case 'expired':
          status_message = `⏰ **Payment Session Expired**\n\nNo problem! Your quote is still valid. I can generate a new payment link in seconds. Ready to try again? 🚀`;
          break;
          
        default:
          status_message = `🔄 **Processing Status Update**\n\n${payment.message || 'Checking payment status...'}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: status_message
          }
        ]
      };

    } catch (error) {
      console.error('Payment tracking error:', error);
      return {
        content: [
          {
            type: 'text',
            text: `I'm having trouble checking your payment status. Let me try again in a moment, or you can check your email for confirmation! 📧`
          }
        ]
      };
    }
  }

  private async getPolicyReceipt(args: any) {
    const { user_id, payment_intent_id, policy_id } = args;

    try {
      let policy = null;
      let payment = null;

      // First try to find policy by policy_id if provided
      if (policy_id) {
        const policyResponse = await dynamodb.get({
          TableName: POLICIES_TABLE,
          Key: { policy_id }
        }).promise();
        policy = policyResponse.Item;
      }

      // If no policy found and payment_intent_id provided, find via payment
      if (!policy && payment_intent_id) {
        const paymentResponse = await dynamodb.get({
          TableName: PAYMENTS_TABLE,
          Key: { payment_intent_id }
        }).promise();
        payment = paymentResponse.Item;

        if (payment && payment.policy_id) {
          const policyResponse = await dynamodb.get({
            TableName: POLICIES_TABLE,
            Key: { policy_id: payment.policy_id }
          }).promise();
          policy = policyResponse.Item;
        }
      }

      // If still no policy, find most recent policy for user
      if (!policy) {
        const userPoliciesResponse = await dynamodb.scan({
          TableName: POLICIES_TABLE,
          FilterExpression: 'user_id = :userId',
          ExpressionAttributeValues: {
            ':userId': user_id
          }
        }).promise();

        if (userPoliciesResponse.Items && userPoliciesResponse.Items.length > 0) {
          // Get most recent policy
          policy = userPoliciesResponse.Items.sort((a, b) => 
            new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime()
          )[0];
        }
      }

      if (!policy) {
        return {
          content: [
            {
              type: 'text',
              text: `🔍 **No Active Policy Found**\n\nI couldn't find an active policy for you. This might be because:\n• Payment is still processing\n• Policy is being generated\n• There might be an issue\n\nLet me check your payment status instead. Could you provide your payment reference? 💬`
            }
          ]
        };
      }

      // Generate comprehensive e-policy receipt
      const receiptText = this.generatePolicyReceipt(policy, payment);

      return {
        content: [
          {
            type: 'text',
            text: receiptText
          }
        ]
      };

    } catch (error) {
      console.error('Policy retrieval error:', error);
      return {
        content: [
          {
            type: 'text',
            text: `🔧 **System Busy**\n\nI'm having trouble accessing your policy right now. Don't worry - your coverage is still active! \n\nPlease try again in a moment or contact our support team. Your policy documents should also be in your email! 📧`
          }
        ]
      };
    }
  }

  private generatePolicyReceipt(policy: any, payment?: any): string {
    const formatDate = (dateString: string) => {
      return new Date(dateString).toLocaleDateString('en-SG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Singapore'
      });
    };

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-SG', {
        style: 'currency',
        currency: 'SGD'
      }).format(amount);
    };

    let receipt = `🎉 **CONGRATULATIONS! YOU'RE INSURED!** 🛡️\n\n`;
    
    receipt += `═══════════════════════════════════════\n`;
    receipt += `📋 **E-POLICY CERTIFICATE**\n`;
    receipt += `═══════════════════════════════════════\n\n`;

    // Policy Header
    receipt += `**Policy Number:** ${policy.policy_id}\n`;
    receipt += `**Status:** ${policy.policy_status === 'active' ? '✅ ACTIVE' : policy.policy_status.toUpperCase()}\n`;
    receipt += `**Issue Date:** ${formatDate(policy.issue_date)}\n`;
    receipt += `**Coverage Period:** ${formatDate(policy.coverage_start)} to ${formatDate(policy.coverage_end)}\n\n`;

    // Policyholder Information
    receipt += `👤 **POLICYHOLDER DETAILS**\n`;
    receipt += `**Name:** ${policy.policyholder?.name || 'N/A'}\n`;
    receipt += `**Email:** ${policy.policyholder?.email || 'N/A'}\n`;
    receipt += `**Age:** ${policy.policyholder?.age || 'N/A'}\n\n`;

    // Trip Information
    receipt += `✈️ **TRIP INFORMATION**\n`;
    receipt += `**Destination:** ${this.getCountryName(policy.trip_details?.arrival_country)}\n`;
    receipt += `**Departure:** ${formatDate(policy.trip_details?.departure_date)}\n`;
    if (policy.trip_details?.return_date) {
      receipt += `**Return:** ${formatDate(policy.trip_details?.return_date)}\n`;
    }
    receipt += `**Trip Type:** ${policy.trip_details?.type === 'RT' ? 'Round Trip' : 'Single Trip'}\n`;
    
    if (policy.trip_details?.activities && policy.trip_details.activities.length > 0) {
      receipt += `**Activities:** ${policy.trip_details.activities.join(', ')}\n`;
    }
    receipt += `\n`;

    // Coverage Details
    receipt += `💰 **COVERAGE BREAKDOWN**\n`;
    if (policy.coverage_details?.medical_coverage) {
      receipt += `• **Medical Expenses:** ${formatCurrency(policy.coverage_details.medical_coverage)}\n`;
    }
    if (policy.coverage_details?.evacuation_coverage) {
      receipt += `• **Emergency Evacuation:** ${formatCurrency(policy.coverage_details.evacuation_coverage)}\n`;
    }
    if (policy.coverage_details?.trip_cancellation) {
      receipt += `• **Trip Cancellation:** ${formatCurrency(policy.coverage_details.trip_cancellation)}\n`;
    }
    if (policy.coverage_details?.baggage_coverage) {
      receipt += `• **Baggage Loss:** ${formatCurrency(policy.coverage_details.baggage_coverage)}\n`;
    }
    if (policy.coverage_details?.flight_delay) {
      receipt += `• **Flight Delay:** ${formatCurrency(policy.coverage_details.flight_delay)}\n`;
    }
    receipt += `\n`;

    // Payment Information
    if (payment) {
      receipt += `💳 **PAYMENT DETAILS**\n`;
      receipt += `**Premium Paid:** ${formatCurrency(payment.amount / 100)}\n`;
      receipt += `**Payment Date:** ${formatDate(payment.created_at)}\n`;
      receipt += `**Payment Method:** ${payment.payment_method || 'Card'}\n`;
      receipt += `**Reference:** ${payment.payment_intent_id}\n\n`;
    }

    // Emergency Information
    receipt += `🚨 **EMERGENCY ASSISTANCE**\n`;
    receipt += `**24/7 Hotline:** +65-6123-4567\n`;
    receipt += `**Claims Email:** claims@lea-insurance.com\n`;
    receipt += `**Emergency App:** LEA Travel Assist\n\n`;

    // Important Notes
    receipt += `📝 **IMPORTANT NOTES**\n`;
    receipt += `• Keep this policy certificate with you during travel\n`;
    receipt += `• Report any incidents within 48 hours\n`;
    receipt += `• Original receipts required for all claims\n`;
    if (policy.trip_details?.activities?.includes('skiing')) {
      receipt += `• Adventure sports coverage: Ensure you follow safety guidelines\n`;
    }
    if (policy.policyholder?.existing_conditions?.length > 0) {
      receipt += `• Pre-existing conditions declared and covered as per policy terms\n`;
    }
    receipt += `\n`;

    receipt += `═══════════════════════════════════════\n`;
    receipt += `🌟 **Have an amazing and safe trip!** 🌟\n`;
    receipt += `Questions? Just ask - I'm always here to help! 💬\n`;
    receipt += `═══════════════════════════════════════`;

    return receipt;
  }

  private getCountryName(countryCode: string): string {
    const countries: { [key: string]: string } = {
      'JP': 'Japan 🇯🇵',
      'TH': 'Thailand 🇹🇭', 
      'MY': 'Malaysia 🇲🇾',
      'SG': 'Singapore 🇸🇬',
      'US': 'United States 🇺🇸',
      'EU': 'Europe 🇪🇺',
      'AU': 'Australia 🇦🇺',
      'NZ': 'New Zealand 🇳🇿'
    };
    return countries[countryCode] || countryCode;
  }

  private async getPredictiveInsights(args: any) {
    return this.getPredictiveInsightsInternal(args);
  }

  private async getPredictiveInsightsInternal(args: any) {
    const { destination, activities = [], travel_season, traveller_age_group, trip_duration } = args;

    // This would integrate with your claims database analysis
    // Mock insights based on common patterns
    const insights: {
      risk_summary: string;
      recommendations: string[];
      claim_predictions: any;
    } = {
      risk_summary: '',
      recommendations: [],
      claim_predictions: {}
    };

    // Generate insights based on destination and activities
    if (destination === 'JP' && activities.includes('skiing')) {
      insights.risk_summary = "⛷️ **Ski Season Alert:** 78% of winter travelers to Japan engage in snow sports. Historical data shows 23% higher medical claim frequency, with average claims of SGD 35,000 for ski-related incidents.";
      insights.recommendations = [
        "Consider Gold plan minimum for SGD 100,000 medical coverage",
        "Add Adventure Sports rider for off-piste coverage", 
        "Winter weather increases flight delay risks by 40%"
      ] as string[];
    } else if (activities.includes('diving')) {
      insights.risk_summary = "🤿 **Diving Activity Detected:** Scuba diving increases medical claim likelihood by 15%. Most common: decompression issues requiring specialized treatment.";
      insights.recommendations = [
        "Ensure hyperbaric chamber coverage included",
        "Verify diving depth limits in your policy",
        "Consider evacuation coverage for remote dive sites"
      ] as string[];
    }

    return insights;
  }

  private async handlePostPurchaseQuestions(args: any) {
    const { policy_id, question_type, question, urgency = 'medium' } = args;

    // Handle different types of post-purchase support
    let response = '';

    switch (question_type) {
      case 'emergency_help':
        response = `🆘 **Emergency Support Activated**\n\n` +
                  `**Immediate Actions:**\n` +
                  `📞 Call our 24/7 hotline: +65-6123-4567\n` +
                  `🏥 For medical emergencies: Contact local emergency services first, then call us\n` +
                  `📱 Use our mobile app for quick claim submission\n\n` +
                  `**Your Policy:** ${policy_id}\n` +
                  `I'm here to guide you through any claims process! What's your situation? 🚨`;
        break;
        
      case 'claims_process':
        response = `📋 **Claims Process Guide**\n\n` +
                  `**Step 1:** Gather documentation (receipts, medical reports, police reports if applicable)\n` +
                  `**Step 2:** Submit claim via app or call +65-6123-4567\n` +
                  `**Step 3:** We'll review within 24-48 hours\n` +
                  `**Step 4:** Payment processed within 5-7 business days\n\n` +
                  `Need help with a specific claim type? I can walk you through it! 📝`;
        break;
        
      default:
        response = `I'm here to help with your policy ${policy_id}! 🛡️\n\n` +
                  `"${question}"\n\n` +
                  `Let me check your specific coverage details and get you the exact answer you need. One moment! 🔍`;
    }

    return {
      content: [
        {
          type: 'text',
          text: response
        }
      ]
    };
  }

  // Helper methods
  private async parseNaturalLanguageInput(natural_input: string) {
    // This would integrate with your LLM for natural language processing
    // Mock extraction for common patterns
    const extracted: any = {};

    // Basic pattern matching (in production, use proper NLP)
    const destination_match = natural_input.match(/(?:to|going to|visiting)\s+(\w+)/i);
    if (destination_match) {
      const dest = destination_match[1].toLowerCase();
      if (['tokyo', 'japan', 'jp'].includes(dest)) extracted.arrival_country = 'JP';
      if (['singapore', 'sg'].includes(dest)) extracted.departure_country = 'SG';
    }

    const activity_patterns = ['ski', 'diving', 'surfing', 'hiking', 'climbing'];
    extracted.activities = activity_patterns.filter(activity => 
      natural_input.toLowerCase().includes(activity)
    );

    const date_match = natural_input.match(/(\w+\s+\d{1,2})-?(\d{1,2})?/);
    if (date_match) {
      // Simple date parsing - in production, use proper date parsing
      extracted.departure_date = '2025-12-15';
      extracted.return_date = '2025-12-22';
    }

    return extracted;
  }

  private getTravelSeason(departure_date: string): string {
    const month = new Date(departure_date).getMonth();
    if (month >= 11 || month <= 1) return 'winter';
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    return 'autumn';
  }

  private getAgeGroup(age: number): string {
    if (age < 25) return 'young_adult';
    if (age < 40) return 'adult';
    if (age < 60) return 'middle_aged';
    return 'senior';
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('LEA Insurance MCP Server running...');
  }
}

// Start the server
const server = new LEAInsuranceMCPServer();
server.run().catch(console.error);