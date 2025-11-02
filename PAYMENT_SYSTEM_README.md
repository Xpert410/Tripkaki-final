# LEA Travel Insurance Payment System

A comprehensive Stripe-integrated payment system for travel insurance purchases, built for the Ancileo x MSIG Hackathon.

## 🎯 What This System Does

This payment system seamlessly integrates with your travel insurance recommendation engine to handle the complete purchase flow:

### 🔄 Complete Purchase Flow
1. **Customer Journey**: Collects traveller data and generates personalized insurance recommendations
2. **Quote Generation**: Creates detailed quotes with persona-based plan scoring
3. **Payment Processing**: Secure Stripe checkout with real-time status updates
4. **Policy Creation**: Automatic policy generation upon successful payment
5. **Confirmation**: Beautiful success pages and email confirmations

### 🏗️ System Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend App  │    │  Backend API    │    │ DynamoDB Local  │
│   Port: 3000    │◄──►│  Port: 3001     │◄──►│  Port: 8000     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       ▼                       │
         │              ┌─────────────────┐              │
         └─────────────►│ Stripe Webhook  │◄─────────────┘
                        │  Port: 8086     │
                        └─────────────────┘
                                 │
                        ┌─────────────────┐
                        │ Payment Pages   │
                        │  Port: 8085     │
                        └─────────────────┘
```

## 🚀 Quick Start

### 1. Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your Stripe keys
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_WEBHOOK_SECRET=whsec_...
```

### 2. Start All Services
```bash
# Start the complete system
docker-compose up -d

# Check service health
curl http://localhost:3001/health     # Backend API
curl http://localhost:8086/health     # Stripe Webhook
curl http://localhost:8085/health     # Payment Pages
```

### 3. Verify Setup
- **DynamoDB Admin**: http://localhost:8010
- **Backend API**: http://localhost:3001
- **Frontend App**: http://localhost:3000

## 📊 Database Schema

The system creates 4 DynamoDB tables:

### `lea-payments-local` (Payment Records)
```json
{
  "payment_intent_id": "payment_abc123",
  "user_id": "user_xyz789", 
  "quote_id": "quote_def456",
  "policy_id": "POL-ABC12345",
  "payment_status": "completed",
  "amount": 4250,
  "currency": "SGD",
  "selected_plan": { "name": "Gold Plan", "tier": "Gold" },
  "selected_riders": [{ "name": "COVID Coverage", "price": 15.00 }],
  "total_amount": 57.50,
  "stripe_session_id": "cs_test_...",
  "created_at": "2025-11-02T10:30:00Z"
}
```

### `lea-insurance-quotes` (Quote Records)
```json
{
  "quote_id": "quote_def456",
  "user_id": "user_xyz789",
  "traveller_persona": "adventure",
  "trip_type": "RT",
  "departure_country": "SG", 
  "arrival_country": "JP",
  "departure_date": "2025-12-15",
  "return_date": "2025-12-22",
  "number_of_adults": 2,
  "activities": ["skiing", "snowboarding"],
  "recommended_plans": [...],
  "status": "active",
  "expires_at": "2025-11-03T10:30:00Z"
}
```

### `lea-insurance-policies` (Active Policies)
```json
{
  "policy_id": "POL-ABC12345",
  "user_id": "user_xyz789",
  "quote_id": "quote_def456", 
  "payment_intent_id": "payment_abc123",
  "policy_status": "active",
  "coverage_start": "2025-12-14T00:00:00Z",
  "coverage_end": "2025-12-23T23:59:59Z",
  "selected_plan": { "name": "Gold Plan", "coverage": {...} },
  "trip_details": {...},
  "policyholder": {...}
}
```

### `lea-customer-profiles` (Customer Data)
```json
{
  "user_id": "user_xyz789",
  "name": "John Doe",
  "email": "john@example.com",
  "age": 32,
  "existing_conditions": []
}
```

## 🔌 API Endpoints

### Quote Management
```http
POST /api/quotes/create
# Create new insurance quote with traveller data

GET /api/quotes/:quote_id  
# Retrieve existing quote

POST /api/quotes/:quote_id/purchase
# Initiate Stripe checkout for selected plan
```

### Payment Tracking
```http
GET /api/payments/:payment_intent_id/status
# Real-time payment status (for frontend polling)

POST /api/payments/:payment_intent_id/finalize  
# Get policy details after successful payment

GET /api/payments/user/:user_id/history
# Payment history for customer service
```

### Admin Analytics
```http
GET /api/payments/analytics/dashboard
# Payment analytics and conversion metrics
```

## 💳 Payment Flow Integration

### Frontend Implementation
```javascript
// 1. Create quote
const response = await fetch('/api/quotes/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: "John Doe",
    age: 32,
    email: "john@example.com",
    trip_type: "RT",
    departure_date: "2025-12-15",
    return_date: "2025-12-22",
    departure_country: "SG",
    arrival_country: "JP",
    activities: ["skiing"],
    number_of_adults: 2
  })
});

const quote = await response.json();

// 2. Show recommendations to user
displayPersonaRecommendations(quote.traveller_persona, quote.recommended_plans);

// 3. User selects plan and initiates purchase
const purchaseResponse = await fetch(`/api/quotes/${quote.quote_id}/purchase`, {
  method: 'POST',
  body: JSON.stringify({
    selected_plan_id: 'gold_standard',
    selected_riders: ['covid_coverage']
  })
});

const purchase = await purchaseResponse.json();

// 4. Redirect to Stripe Checkout
window.location.href = purchase.checkout_url;

// 5. Poll for payment completion
const pollPaymentStatus = async () => {
  const status = await fetch(`/api/payments/${purchase.payment_intent_id}/status`);
  const payment = await status.json();
  
  if (payment.status === 'completed') {
    // Show success message and policy details
    const policy = await fetch(`/api/payments/${purchase.payment_intent_id}/finalize`);
    showPolicyConfirmation(await policy.json());
  } else if (payment.status === 'pending') {
    // Continue polling
    setTimeout(pollPaymentStatus, 2000);
  }
};
```

### Traveller Persona System
The system automatically determines traveller personas based on input:

- **🧗‍♂️ Adventure**: High-risk activities (skiing, diving, etc.)
- **👨‍👩‍👧‍👦 Family**: Age 25-45 with multiple travellers  
- **💼 Business**: Short trips (≤7 days) with high budget
- **✨ Luxury**: Premium budget preferences
- **💰 Budget**: Cost-conscious selections
- **🏖️ Relax**: Default for leisure travel

### Plan Scoring Algorithm
Plans are scored (0-100) based on:
- Persona match (Adventure + Sports Coverage = +30 points)
- Age appropriateness (Seniors + High Medical = +15 points)  
- Budget alignment (Budget persona + Low cost = +20 points)
- Activity coverage (Extreme sports + Adventure rider = +25 points)

## 🎨 Frontend Integration

### Chat Integration
```javascript
// Agent flow example
const processInsurancePurchase = async (userMessage) => {
  if (userMessage.includes("buy") || userMessage.includes("purchase")) {
    // Get existing quote from session
    const quote = getSessionQuote();
    
    if (!quote) {
      return "Let me create a personalized quote for you first. What's your destination?";
    }
    
    // Show plan selection
    return generatePlanCards(quote.recommended_plans);
  }
};

// Payment status updates
const trackPayment = (paymentIntentId) => {
  const interval = setInterval(async () => {
    const status = await checkPaymentStatus(paymentIntentId);
    
    updateUI({
      pending: "💳 Processing payment...",
      completed: "✅ You're covered! Policy activated.",
      failed: "❌ Payment failed. Let's try again.",
      expired: "⏰ Session expired. Creating new quote..."
    }[status.payment_status]);
    
    if (['completed', 'failed', 'expired'].includes(status.payment_status)) {
      clearInterval(interval);
    }
  }, 2000);
};
```

### Plan Card Component
```html
<div class="plan-card gold">
  <div class="plan-header">
    <h3>Gold Plan</h3>
    <div class="score-ring">92%</div>
  </div>
  
  <div class="coverage-grid">
    <div class="coverage-item">
      <span class="icon">🩺</span>
      <span class="amount">SGD 100,000</span>
      <span class="label">Medical</span>
    </div>
    <div class="coverage-item highlight">
      <span class="icon">🎿</span>
      <span class="status">✅ Includes Ski</span>
    </div>
  </div>
  
  <div class="price">
    <span class="amount">SGD 42.50</span>
    <span class="period">per policy</span>
  </div>
  
  <button onclick="selectPlan('gold_standard')">Select Plan</button>
</div>
```

## 🧪 Testing

### Interactive Payment Testing
```bash
# Run the enhanced test script
python test_payment_flow.py

# The test will:
# 1. Create a payment record in DynamoDB
# 2. Generate a real Stripe checkout URL  
# 3. Wait for you to complete payment
# 4. Verify webhook processing
# 5. Confirm policy creation
```

### Test Cards
Use these Stripe test cards:
- **Success**: `4242 4242 4242 4242`
- **Declined**: `4000 0000 0000 9995`  
- **Requires Auth**: `4000 0027 6000 3184`

## 🔧 Configuration

### Environment Variables
```bash
# Required
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Optional
AWS_REGION=ap-southeast-1
DYNAMODB_PAYMENTS_TABLE=lea-payments-local
FRONTEND_URL=http://localhost:3000
```

### Webhook Setup
For production, configure Stripe webhook endpoint:
1. Go to Stripe Dashboard > Webhooks
2. Add endpoint: `https://yourdomain.com/webhook/stripe`
3. Select events:
   - `checkout.session.completed`
   - `checkout.session.expired` 
   - `payment_intent.payment_failed`

## 📈 Analytics & Monitoring

### Payment Analytics
```http
GET /api/payments/analytics/dashboard?timeframe=30d

{
  "total_payments": 156,
  "completed_payments": 142,
  "conversion_rate": "91.03",
  "total_revenue": 6850.75,
  "average_order_value": "48.24",
  "popular_plans": {
    "Gold Plan": 67,
    "Platinum Plan": 45,
    "Silver Plan": 30
  }
}
```

### Health Monitoring
```bash
# Check all service health
curl http://localhost:3001/health
curl http://localhost:8086/health  
curl http://localhost:8085/health
```

## 🔒 Security Features

- ✅ Stripe webhook signature verification
- ✅ Input validation and sanitization  
- ✅ Secure environment variable handling
- ✅ CORS protection
- ✅ Rate limiting ready
- ✅ SQL injection prevention (NoSQL)

## 🚦 Deployment

### Local Development
```bash
docker-compose up -d
```

### Production Checklist
- [ ] Set real Stripe keys in production
- [ ] Configure production webhook URL
- [ ] Set up real AWS DynamoDB (remove local endpoint)
- [ ] Enable SSL/TLS certificates
- [ ] Configure email service for confirmations
- [ ] Set up monitoring and logging
- [ ] Configure backup strategies

## 🆘 Troubleshooting

### Common Issues
1. **Webhook not receiving events**: Check `STRIPE_WEBHOOK_SECRET` 
2. **Database connection failed**: Verify DynamoDB is running
3. **Payment status not updating**: Check webhook logs
4. **CORS errors**: Verify `FRONTEND_URL` configuration

### Debug Commands
```bash
# View webhook logs
docker-compose logs stripe-webhook-hackathon

# Check database tables  
curl http://localhost:8010

# Test webhook endpoint
curl http://localhost:8086/health
```

## 📞 Support

For questions about this payment system implementation:
- Check the logs: `docker-compose logs`
- Review the API documentation above
- Test with the included test script
- Verify environment configuration

Built for Ancileo x MSIG Hackathon 🚀