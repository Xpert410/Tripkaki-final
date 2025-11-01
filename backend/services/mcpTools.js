/**
 * MCP (MSIG Comparison & Purchase) Tools Integration
 * Simulates MSIG's proprietary quotation, comparison, and purchase engines
 */

export class MCPTools {
  constructor() {
    // In production, this would connect to actual MSIG MCP SDK
    this.apiEndpoint = process.env.MCP_API_ENDPOINT || 'https://api.msig.com/mcp';
    this.apiKey = process.env.MCP_API_KEY || '';
  }

  /**
   * Generate quotation based on travel profile
   */
  async generateQuotation(travelProfile) {
    // Simulate MCP quotation tool
    const {
      destination,
      trip_dates,
      travellers,
      activities = [],
      estimated_cost = 0
    } = travelProfile;

    const duration = this.calculateDuration(trip_dates.start, trip_dates.end);
    const basePrice = this.calculateBasePrice(duration, travellers.length);
    
    // Add risk multipliers
    let riskMultiplier = 1.0;
    if (activities.some(a => ['skiing', 'diving', 'hiking'].includes(a))) {
      riskMultiplier = 1.3;
    }

    const plans = [
      {
        plan_id: 'ADVENTURE_LITE',
        name: 'Adventure Lite',
        price: Math.round(basePrice * riskMultiplier),
        coverage: {
          medical_emergency: 'SGD 100,000',
          trip_cancellation: 'SGD 10,000',
          baggage_loss: 'SGD 1,000'
        },
        features: ['Medical', 'Trip Cancellation', 'Baggage'],
        exclusions: ['Extreme sports', 'Pre-existing conditions']
      },
      {
        plan_id: 'ADVENTURE_PRO',
        name: 'Adventure Pro',
        price: Math.round(basePrice * riskMultiplier * 1.4),
        coverage: {
          medical_emergency: 'SGD 250,000',
          trip_cancellation: 'SGD 20,000',
          baggage_loss: 'SGD 3,000'
        },
        features: ['Medical', 'Trip Cancellation', 'Baggage', 'Adventure Sports'],
        exclusions: ['Pre-existing conditions without declaration']
      },
      {
        plan_id: 'ADVENTURE_PREMIUM',
        name: 'Adventure Premium',
        price: Math.round(basePrice * riskMultiplier * 1.8),
        coverage: {
          medical_emergency: 'SGD 500,000',
          trip_cancellation: 'SGD 50,000',
          baggage_loss: 'SGD 5,000'
        },
        features: ['Medical', 'Trip Cancellation', 'Baggage', 'Adventure Sports', 'Pre-existing conditions'],
        exclusions: []
      }
    ];

    return {
      quotation_id: `QUO-${Date.now()}`,
      travel_profile: travelProfile,
      plans: plans,
      valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      currency: 'SGD'
    };
  }

  /**
   * Compare multiple plans side-by-side
   */
  async comparePlans(planIds, travelProfile) {
    // In production, this would call actual MCP comparison API
    const quotation = await this.generateQuotation(travelProfile);
    const selectedPlans = quotation.plans.filter(p => planIds.includes(p.plan_id));

    const comparison = {
      plans: selectedPlans,
      comparison_matrix: {
        price: selectedPlans.map(p => p.price),
        coverage: {},
        features: {},
        exclusions: {}
      },
      recommendation: this.generateRecommendation(selectedPlans, travelProfile)
    };

    // Build coverage matrix
    selectedPlans.forEach(plan => {
      Object.keys(plan.coverage).forEach(benefit => {
        if (!comparison.comparison_matrix.coverage[benefit]) {
          comparison.comparison_matrix.coverage[benefit] = {};
        }
        comparison.comparison_matrix.coverage[benefit][plan.plan_id] = plan.coverage[benefit];
      });
    });

    return comparison;
  }

  /**
   * Purchase and issue policy
   */
  async purchasePolicy(quotationId, planId, paymentDetails, customerInfo) {
    // Simulate MCP purchase tool
    // In production, this would call actual MSIG purchase API with payment gateway

    const policyNumber = `POL-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    return {
      success: true,
      policy_number: policyNumber,
      policy_pdf_url: `/api/policies/${policyNumber}/download`, // Simulated
      emergency_card_url: `/api/policies/${policyNumber}/emergency-card`, // Simulated
      activation_date: new Date().toISOString(),
      expiry_date: customerInfo.trip_dates?.end || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active'
    };
  }

  /**
   * Helper: Calculate trip duration
   */
  calculateDuration(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Helper: Calculate base price
   */
  calculateBasePrice(duration, numTravellers) {
    const basePricePerDay = 15;
    return basePricePerDay * duration * numTravellers;
  }

  /**
   * Generate recommendation based on travel profile
   */
  generateRecommendation(plans, travelProfile) {
    const activities = travelProfile.activities || [];
    const hasAdventureActivities = activities.some(a => ['skiing', 'diving', 'hiking'].includes(a));
    
    if (hasAdventureActivities) {
      return {
        recommended_plan: plans.find(p => p.plan_id === 'ADVENTURE_PRO')?.plan_id || plans[0].plan_id,
        rationale: 'Adventure activities detected - Pro plan recommended for comprehensive coverage'
      };
    }

    return {
      recommended_plan: plans[0].plan_id,
      rationale: 'Standard coverage sufficient for trip profile'
    };
  }
}


