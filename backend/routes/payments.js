const express = require('express');
const boto3 = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Initialize AWS DynamoDB
const dynamodb = new boto3.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION || 'ap-southeast-1',
    endpoint: process.env.DDB_ENDPOINT || 'http://localhost:8000',
    accessKeyId: 'dummy',
    secretAccessKey: 'dummy'
});

// Table names
const PAYMENTS_TABLE = process.env.DYNAMODB_PAYMENTS_TABLE || 'lea-payments-local';
const POLICIES_TABLE = 'lea-insurance-policies';
const QUOTES_TABLE = 'lea-insurance-quotes';

/**
 * GET /api/payments/:payment_intent_id/status
 * Real-time payment status for frontend polling
 */
router.get('/:payment_intent_id/status', async (req, res) => {
    try {
        const { payment_intent_id } = req.params;

        const result = await dynamodb.get({
            TableName: PAYMENTS_TABLE,
            Key: { payment_intent_id }
        }).promise();

        if (!result.Item) {
            return res.status(404).json({ 
                success: false, 
                error: 'Payment not found' 
            });
        }

        const payment = result.Item;
        
        // Build response with different data based on status
        const response = {
            success: true,
            payment_intent_id,
            status: payment.payment_status,
            amount: payment.total_amount,
            currency: payment.currency,
            created_at: payment.created_at,
            updated_at: payment.updated_at
        };

        // Add policy information if payment completed
        if (payment.payment_status === 'completed' && payment.policy_id) {
            try {
                const policyResult = await dynamodb.get({
                    TableName: POLICIES_TABLE,
                    Key: { policy_id: payment.policy_id }
                }).promise();

                if (policyResult.Item) {
                    response.policy = {
                        policy_id: policyResult.Item.policy_id,
                        status: policyResult.Item.policy_status,
                        coverage_start: policyResult.Item.coverage_start,
                        coverage_end: policyResult.Item.coverage_end,
                        plan_name: policyResult.Item.selected_plan?.name,
                        plan_tier: policyResult.Item.selected_plan?.tier
                    };
                }
            } catch (policyError) {
                console.error('Error fetching policy details:', policyError);
            }
        }

        // Add helpful messages based on status
        switch (payment.payment_status) {
            case 'pending':
                response.message = 'Awaiting payment completion...';
                response.next_action = 'Please complete payment in the checkout window';
                break;
            case 'completed':
                response.message = 'Payment successful! Your travel insurance policy is now active.';
                response.next_action = 'Check your email for policy documents';
                break;
            case 'failed':
                response.message = 'Payment failed. Please try again.';
                response.next_action = 'Contact support if the issue persists';
                break;
            case 'expired':
                response.message = 'Payment session expired. Please create a new quote.';
                response.next_action = 'Start a new quote process';
                break;
            default:
                response.message = 'Processing payment...';
        }

        res.json(response);

    } catch (error) {
        console.error('Payment status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get payment status',
            message: error.message
        });
    }
});

/**
 * POST /api/payments/:payment_intent_id/finalize
 * Finalize purchase after successful payment (called by frontend)
 */
router.post('/:payment_intent_id/finalize', async (req, res) => {
    try {
        const { payment_intent_id } = req.params;

        // Get payment record
        const paymentResult = await dynamodb.get({
            TableName: PAYMENTS_TABLE,
            Key: { payment_intent_id }
        }).promise();

        if (!paymentResult.Item) {
            return res.status(404).json({ 
                success: false, 
                error: 'Payment not found' 
            });
        }

        const payment = paymentResult.Item;

        if (payment.payment_status !== 'completed') {
            return res.status(400).json({
                success: false,
                error: 'Payment not completed',
                status: payment.payment_status
            });
        }

        // Get policy details
        const policyResult = await dynamodb.get({
            TableName: POLICIES_TABLE,
            Key: { policy_id: payment.policy_id }
        }).promise();

        if (!policyResult.Item) {
            return res.status(404).json({ 
                success: false, 
                error: 'Policy not found' 
            });
        }

        const policy = policyResult.Item;

        // Get quote for additional context
        const quoteResult = await dynamodb.get({
            TableName: QUOTES_TABLE,
            Key: { quote_id: payment.quote_id }
        }).promise();

        const quote = quoteResult.Item || {};

        // Build comprehensive response for frontend
        const response = {
            success: true,
            message: "You're covered! 🎉",
            policy: {
                policy_id: policy.policy_id,
                status: policy.policy_status,
                issue_date: policy.issue_date,
                coverage_start: policy.coverage_start,
                coverage_end: policy.coverage_end,
                
                // Plan details
                plan: {
                    name: policy.selected_plan?.name,
                    tier: policy.selected_plan?.tier,
                    coverage: policy.selected_plan?.coverage
                },
                
                // Trip summary
                trip: {
                    destination: policy.trip_details?.arrival_country,
                    departure_date: policy.trip_details?.departure_date,
                    return_date: policy.trip_details?.return_date,
                    duration: policy.trip_details?.duration_days,
                    travellers: (policy.trip_details?.number_of_adults || 0) + (policy.trip_details?.number_of_children || 0)
                },
                
                // Customer details
                policyholder: {
                    name: policy.policyholder?.name,
                    email: policy.policyholder?.email
                },
                
                // Payment summary
                premium: {
                    amount: payment.total_amount,
                    currency: payment.currency,
                    payment_date: payment.webhook_processed_at || payment.updated_at
                }
            },
            
            // Next steps for user
            next_steps: [
                'Policy documents have been sent to your email',
                'Save your policy number for future reference',
                'Contact us if you have any questions about your coverage',
                'Have a safe and wonderful trip!'
            ],
            
            // Context preservation for chat
            context: {
                quote_id: payment.quote_id,
                user_id: payment.user_id,
                traveller_persona: quote.traveller_persona,
                session_active: true
            }
        };

        res.json(response);

    } catch (error) {
        console.error('Payment finalize error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to finalize payment',
            message: error.message
        });
    }
});

/**
 * GET /api/payments/user/:user_id/history
 * Get payment history for a user
 */
router.get('/user/:user_id/history', async (req, res) => {
    try {
        const { user_id } = req.params;
        const { limit = 10, status } = req.query;

        const params = {
            TableName: PAYMENTS_TABLE,
            IndexName: 'user_id-index',
            KeyConditionExpression: 'user_id = :user_id',
            ExpressionAttributeValues: {
                ':user_id': user_id
            },
            Limit: parseInt(limit),
            ScanIndexForward: false // Most recent first
        };

        // Filter by status if provided
        if (status) {
            params.FilterExpression = 'payment_status = :status';
            params.ExpressionAttributeValues[':status'] = status;
        }

        const result = await dynamodb.query(params).promise();

        const payments = result.Items.map(payment => ({
            payment_intent_id: payment.payment_intent_id,
            quote_id: payment.quote_id,
            policy_id: payment.policy_id,
            status: payment.payment_status,
            amount: payment.total_amount,
            currency: payment.currency,
            plan_name: payment.selected_plan?.name,
            plan_tier: payment.selected_plan?.tier,
            created_at: payment.created_at,
            updated_at: payment.updated_at
        }));

        res.json({
            success: true,
            payments,
            count: payments.length,
            has_more: !!result.LastEvaluatedKey
        });

    } catch (error) {
        console.error('Payment history error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get payment history',
            message: error.message
        });
    }
});

/**
 * GET /api/payments/analytics/dashboard
 * Payment analytics for admin dashboard
 */
router.get('/analytics/dashboard', async (req, res) => {
    try {
        const { timeframe = '30d' } = req.query;
        
        // Calculate date range
        const now = new Date();
        const startDate = new Date();
        
        switch (timeframe) {
            case '7d':
                startDate.setDate(now.getDate() - 7);
                break;
            case '30d':
                startDate.setDate(now.getDate() - 30);
                break;
            case '90d':
                startDate.setDate(now.getDate() - 90);
                break;
            default:
                startDate.setDate(now.getDate() - 30);
        }

        // Scan payments table for analytics (in production, use time-based indexes)
        const result = await dynamodb.scan({
            TableName: PAYMENTS_TABLE,
            FilterExpression: 'created_at >= :start_date',
            ExpressionAttributeValues: {
                ':start_date': startDate.toISOString()
            }
        }).promise();

        const payments = result.Items;

        // Calculate analytics
        const analytics = {
            total_payments: payments.length,
            completed_payments: payments.filter(p => p.payment_status === 'completed').length,
            failed_payments: payments.filter(p => p.payment_status === 'failed').length,
            pending_payments: payments.filter(p => p.payment_status === 'pending').length,
            expired_payments: payments.filter(p => p.payment_status === 'expired').length,
            
            total_revenue: payments
                .filter(p => p.payment_status === 'completed')
                .reduce((sum, p) => sum + (p.total_amount || 0), 0),
            
            average_order_value: 0,
            
            conversion_rate: 0,
            
            popular_plans: {},
            
            timeframe
        };

        // Calculate conversion rate
        if (analytics.total_payments > 0) {
            analytics.conversion_rate = (analytics.completed_payments / analytics.total_payments * 100).toFixed(2);
        }

        // Calculate average order value
        if (analytics.completed_payments > 0) {
            analytics.average_order_value = (analytics.total_revenue / analytics.completed_payments).toFixed(2);
        }

        // Calculate popular plans
        const planCounts = {};
        payments.filter(p => p.payment_status === 'completed').forEach(payment => {
            const planName = payment.selected_plan?.name || 'Unknown';
            planCounts[planName] = (planCounts[planName] || 0) + 1;
        });
        
        analytics.popular_plans = Object.entries(planCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .reduce((obj, [plan, count]) => {
                obj[plan] = count;
                return obj;
            }, {});

        res.json({
            success: true,
            analytics,
            generated_at: now.toISOString()
        });

    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate analytics',
            message: error.message
        });
    }
});

module.exports = router;