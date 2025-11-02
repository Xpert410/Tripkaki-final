const express = require('express');
const boto3 = require('aws-sdk');
const stripe = require('stripe');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Initialize AWS DynamoDB
const dynamodb = new boto3.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION || 'ap-southeast-1',
    endpoint: process.env.DDB_ENDPOINT || 'http://localhost:8000',
    accessKeyId: 'dummy',
    secretAccessKey: 'dummy'
});

// Initialize Stripe
const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

// Table names
const QUOTES_TABLE = 'lea-insurance-quotes';
const CUSTOMERS_TABLE = 'lea-customer-profiles';
const PAYMENTS_TABLE = process.env.DYNAMODB_PAYMENTS_TABLE || 'lea-payments-local';
const POLICIES_TABLE = 'lea-insurance-policies';

/**
 * POST /api/quotes/create
 * Create a new insurance quote based on traveller data
 */
router.post('/create', async (req, res) => {
    try {
        const {
            // Customer info
            name,
            age,
            email,
            phone,
            existing_conditions,
            
            // Trip details
            trip_type, // "RT" or "ST"
            departure_date, // YYYY-MM-DD
            return_date, // YYYY-MM-DD (optional for ST)
            departure_country, // ISO code
            arrival_country, // ISO code
            number_of_adults,
            number_of_children,
            
            // Preferences
            budget_range,
            activities = [] // ["skiing", "diving", etc.]
        } = req.body;

        // Validate required fields
        if (!name || !age || !email || !trip_type || !departure_date || !departure_country || !arrival_country) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['name', 'age', 'email', 'trip_type', 'departure_date', 'departure_country', 'arrival_country']
            });
        }

        // Generate IDs
        const user_id = uuidv4();
        const quote_id = uuidv4();
        const created_at = new Date().toISOString();

        // Calculate trip duration
        const departure = new Date(departure_date);
        const returnDate = return_date ? new Date(return_date) : null;
        const trip_duration = returnDate ? 
            Math.ceil((returnDate - departure) / (1000 * 60 * 60 * 24)) : 
            null;

        // Determine traveller persona based on input
        const traveller_persona = determineTravellerPersona({
            age,
            activities,
            budget_range,
            trip_duration,
            destination: arrival_country
        });

        // Get available insurance plans
        const available_plans = await getInsurancePlans({
            departure_country,
            arrival_country,
            trip_duration,
            number_of_adults,
            number_of_children,
            existing_conditions,
            activities
        });

        // Score and rank plans for this traveller
        const recommended_plans = scoreAndRankPlans(available_plans, {
            persona: traveller_persona,
            age,
            activities,
            existing_conditions,
            budget_range
        });

        // Create customer profile
        const customer_profile = {
            user_id,
            name,
            email,
            phone,
            age,
            existing_conditions,
            created_at,
            updated_at: created_at
        };

        // Create quote record
        const quote_record = {
            quote_id,
            user_id,
            
            // Trip details
            trip_type,
            departure_date,
            return_date,
            departure_country,
            arrival_country,
            number_of_adults,
            number_of_children,
            trip_duration,
            activities,
            
            // Recommendations
            traveller_persona,
            recommended_plans,
            budget_range,
            
            // Metadata
            status: 'active',
            created_at,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
        };

        // Save to database
        await Promise.all([
            dynamodb.put({
                TableName: CUSTOMERS_TABLE,
                Item: customer_profile,
                ConditionExpression: 'attribute_not_exists(user_id)'
            }).promise(),
            
            dynamodb.put({
                TableName: QUOTES_TABLE,
                Item: quote_record
            }).promise()
        ]);

        // Return response for frontend
        res.json({
            success: true,
            quote_id,
            user_id,
            traveller_persona: {
                type: traveller_persona,
                description: getPersonaDescription(traveller_persona),
                icon: getPersonaIcon(traveller_persona)
            },
            trip_summary: {
                destination: arrival_country,
                duration: trip_duration,
                travellers: number_of_adults + (number_of_children || 0),
                activities: activities
            },
            recommended_plans: recommended_plans.map(plan => ({
                plan_id: plan.plan_id,
                name: plan.name,
                tier: plan.tier, // Silver, Gold, Platinum
                coverage_fit_score: plan.score,
                monthly_premium: plan.price,
                currency: 'SGD',
                key_features: plan.highlights,
                coverage_details: plan.coverage,
                why_recommended: plan.recommendation_reason
            })),
            expires_at: quote_record.expires_at
        });

    } catch (error) {
        console.error('Quote creation error:', error);
        res.status(500).json({
            error: 'Failed to create quote',
            message: error.message
        });
    }
});

/**
 * GET /api/quotes/:quote_id
 * Retrieve existing quote
 */
router.get('/:quote_id', async (req, res) => {
    try {
        const { quote_id } = req.params;

        const result = await dynamodb.get({
            TableName: QUOTES_TABLE,
            Key: { quote_id }
        }).promise();

        if (!result.Item) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = result.Item;
        
        // Check if quote expired
        if (new Date() > new Date(quote.expires_at)) {
            return res.status(410).json({ error: 'Quote expired' });
        }

        res.json({
            success: true,
            quote
        });

    } catch (error) {
        console.error('Quote retrieval error:', error);
        res.status(500).json({
            error: 'Failed to retrieve quote',
            message: error.message
        });
    }
});

/**
 * POST /api/quotes/:quote_id/purchase
 * Initiate purchase process for selected plan
 */
router.post('/:quote_id/purchase', async (req, res) => {
    try {
        const { quote_id } = req.params;
        const { 
            selected_plan_id,
            selected_riders = [],
            payment_method = 'stripe',
            customer_updates = {} // Any updated customer info
        } = req.body;

        // Get quote
        const quoteResult = await dynamodb.get({
            TableName: QUOTES_TABLE,
            Key: { quote_id }
        }).promise();

        if (!quoteResult.Item) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteResult.Item;

        // Check if quote expired
        if (new Date() > new Date(quote.expires_at)) {
            return res.status(410).json({ error: 'Quote expired' });
        }

        // Find selected plan
        const selected_plan = quote.recommended_plans.find(p => p.plan_id === selected_plan_id);
        if (!selected_plan) {
            return res.status(400).json({ error: 'Invalid plan selection' });
        }

        // Calculate total price including riders
        let total_amount = selected_plan.price;
        const rider_details = [];
        
        for (const rider_id of selected_riders) {
            const rider = await getRiderDetails(rider_id);
            if (rider) {
                total_amount += rider.price;
                rider_details.push(rider);
            }
        }

        // Convert to cents for Stripe
        const amount_cents = Math.round(total_amount * 100);

        // Generate payment intent ID
        const payment_intent_id = `payment_${uuidv4()}`;

        // Create payment record
        const payment_record = {
            payment_intent_id,
            user_id: quote.user_id,
            quote_id,
            payment_status: 'pending',
            amount: amount_cents,
            currency: 'SGD',
            product_name: `${selected_plan.name} Travel Insurance`,
            selected_plan: selected_plan,
            selected_riders: rider_details,
            total_amount,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        // Create Stripe checkout session
        const checkout_session = await stripeClient.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'sgd',
                        unit_amount: amount_cents,
                        product_data: {
                            name: `${selected_plan.name} Travel Insurance`,
                            description: `Coverage for ${quote.arrival_country} trip`,
                            metadata: {
                                plan_tier: selected_plan.tier,
                                traveller_persona: quote.traveller_persona
                            }
                        }
                    },
                    quantity: 1
                },
                // Add riders as separate line items
                ...rider_details.map(rider => ({
                    price_data: {
                        currency: 'sgd',
                        unit_amount: Math.round(rider.price * 100),
                        product_data: {
                            name: rider.name,
                            description: rider.description
                        }
                    },
                    quantity: 1
                }))
            ],
            mode: 'payment',
            success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/cancel?quote_id=${quote_id}`,
            client_reference_id: payment_intent_id,
            metadata: {
                quote_id,
                user_id: quote.user_id,
                selected_plan_id
            }
        });

        // Update payment record with Stripe session ID
        payment_record.stripe_session_id = checkout_session.id;

        // Save payment record
        await dynamodb.put({
            TableName: PAYMENTS_TABLE,
            Item: payment_record
        }).promise();

        res.json({
            success: true,
            payment_intent_id,
            checkout_url: checkout_session.url,
            session_id: checkout_session.id,
            total_amount,
            currency: 'SGD',
            selected_plan: {
                name: selected_plan.name,
                tier: selected_plan.tier,
                base_price: selected_plan.price
            },
            riders: rider_details,
            expires_in: 3600 // Stripe session expires in 1 hour
        });

    } catch (error) {
        console.error('Purchase initiation error:', error);
        res.status(500).json({
            error: 'Failed to initiate purchase',
            message: error.message
        });
    }
});

/**
 * GET /api/quotes/payment/:payment_intent_id/status
 * Check payment status for real-time updates
 */
router.get('/payment/:payment_intent_id/status', async (req, res) => {
    try {
        const { payment_intent_id } = req.params;

        const result = await dynamodb.get({
            TableName: PAYMENTS_TABLE,
            Key: { payment_intent_id }
        }).promise();

        if (!result.Item) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        const payment = result.Item;

        res.json({
            success: true,
            payment_status: payment.payment_status,
            amount: payment.total_amount,
            currency: payment.currency,
            updated_at: payment.updated_at,
            policy_id: payment.policy_id || null,
            webhook_processed_at: payment.webhook_processed_at || null
        });

    } catch (error) {
        console.error('Payment status error:', error);
        res.status(500).json({
            error: 'Failed to get payment status',
            message: error.message
        });
    }
});

// Helper Functions

function determineTravellerPersona({ age, activities, budget_range, trip_duration, destination }) {
    // Adventure traveller detection
    const adventureActivities = ['skiing', 'snowboarding', 'scuba_diving', 'bungee_jumping', 'rock_climbing', 'mountaineering'];
    if (activities.some(activity => adventureActivities.includes(activity))) {
        return 'adventure';
    }
    
    // Family traveller detection  
    if (age >= 25 && age <= 45) {
        return 'family';
    }
    
    // Business traveller detection
    if (trip_duration && trip_duration <= 7 && budget_range === 'high') {
        return 'business';
    }
    
    // Luxury traveller detection
    if (budget_range === 'luxury') {
        return 'luxury';
    }
    
    // Budget traveller detection
    if (budget_range === 'budget') {
        return 'budget';
    }
    
    // Default to relax
    return 'relax';
}

function getPersonaDescription(persona) {
    const descriptions = {
        adventure: "We noticed your trip involves high-risk activities. Here's coverage that protects your adventures.",
        family: "Perfect for family travels with comprehensive coverage for all family members.",
        business: "Quick, efficient coverage for business travelers with priority claim processing.",
        luxury: "Premium coverage with exclusive benefits and white-glove service.",
        budget: "Affordable protection that covers the essentials without breaking the bank.",
        relax: "Comprehensive coverage for a worry-free vacation experience."
    };
    return descriptions[persona] || descriptions.relax;
}

function getPersonaIcon(persona) {
    const icons = {
        adventure: '🧗‍♂️',
        family: '👨‍👩‍👧‍👦',
        business: '💼',
        luxury: '✨',
        budget: '💰',
        relax: '🏖️'
    };
    return icons[persona] || icons.relax;
}

async function getInsurancePlans({ departure_country, arrival_country, trip_duration, number_of_adults, number_of_children, existing_conditions, activities }) {
    // This would integrate with your taxonomy engine and policy database
    // For now, return mock data that matches your requirements
    
    return [
        {
            plan_id: 'silver_basic',
            name: 'Silver Plan',
            tier: 'Silver',
            price: 32.80,
            coverage: {
                medical: 50000,
                baggage_loss: 2000,
                trip_delay_hours: 12,
                sports_coverage: false,
                direct_billing: true
            },
            highlights: ['SGD 50K Medical', 'Basic Coverage', '12h Trip Delay'],
            exclusions: ['Extreme Sports', 'Pre-existing Conditions']
        },
        {
            plan_id: 'gold_standard',
            name: 'Gold Plan', 
            tier: 'Gold',
            price: 42.50,
            coverage: {
                medical: 100000,
                baggage_loss: 3000,
                trip_delay_hours: 6,
                sports_coverage: true,
                direct_billing: true
            },
            highlights: ['SGD 100K Medical', 'Sports Coverage', '6h Trip Delay'],
            exclusions: ['Pre-existing Conditions']
        },
        {
            plan_id: 'platinum_premium',
            name: 'Platinum Plan',
            tier: 'Platinum', 
            price: 58.90,
            coverage: {
                medical: 150000,
                baggage_loss: 5000,
                trip_delay_hours: 4,
                sports_coverage: true,
                direct_billing: true,
                priority_clinics: true
            },
            highlights: ['SGD 150K Medical', 'All Sports', '4h Trip Delay', 'Priority Clinics'],
            exclusions: []
        }
    ];
}

function scoreAndRankPlans(plans, { persona, age, activities, existing_conditions, budget_range }) {
    return plans.map(plan => {
        let score = 50; // Base score
        let recommendation_reason = [];
        
        // Score based on persona
        if (persona === 'adventure' && plan.coverage.sports_coverage) {
            score += 30;
            recommendation_reason.push(`Covers ${activities.join(', ')} activities`);
        }
        
        if (persona === 'family' && plan.coverage.medical >= 100000) {
            score += 25;
            recommendation_reason.push('High medical coverage for family peace of mind');
        }
        
        if (persona === 'budget' && plan.price < 40) {
            score += 20;
            recommendation_reason.push('Best value for essential coverage');
        }
        
        if (persona === 'luxury' && plan.tier === 'Platinum') {
            score += 35;
            recommendation_reason.push('Premium benefits and priority service');
        }
        
        // Age-based scoring
        if (age > 60 && plan.coverage.medical >= 100000) {
            score += 15;
            recommendation_reason.push('Enhanced medical coverage for senior travelers');
        }
        
        return {
            ...plan,
            score: Math.min(score, 100), // Cap at 100
            recommendation_reason: recommendation_reason.join('. ')
        };
    }).sort((a, b) => b.score - a.score); // Sort by score descending
}

async function getRiderDetails(rider_id) {
    // Mock rider data - integrate with your policy database
    const riders = {
        'covid_coverage': {
            rider_id: 'covid_coverage',
            name: 'COVID-19 Coverage',
            description: 'Coverage for COVID-19 related medical expenses and quarantine',
            price: 15.00
        },
        'adventure_sports': {
            rider_id: 'adventure_sports',
            name: 'Extreme Adventure Sports',
            description: 'Coverage for extreme sports like skydiving, paragliding',
            price: 25.00
        },
        'gadget_protection': {
            rider_id: 'gadget_protection', 
            name: 'Gadget Protection',
            description: 'Protection for laptops, cameras, and electronic devices',
            price: 12.00
        }
    };
    
    return riders[rider_id] || null;
}

module.exports = router;