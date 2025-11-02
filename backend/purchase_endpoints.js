
// BLOCK 5: Purchase Flow - Stripe Integration
app.post('/api/purchase/intent', async (req, res) => {
  try {
    const { sessionId, quoteId, selectedOffer, customerInfo } = req.body;
    
    const session = conversationManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(selectedOffer.totalPrice * 100), // Convert to cents
      currency: selectedOffer.currency.toLowerCase(),
      metadata: {
        sessionId,
        quoteId,
        offerId: selectedOffer.offerId,
        productCode: selectedOffer.productCode
      }
    });

    // Store purchase data in session
    session.purchaseData = {
      quoteId,
      selectedOffer,
      customerInfo,
      paymentIntentId: paymentIntent.id,
      status: 'payment_pending'
    };
    conversationManager.updateSession(sessionId, session);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: selectedOffer.totalPrice,
      currency: selectedOffer.currency
    });
  } catch (error) {
    console.error('Purchase intent error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Purchase status polling endpoint
app.get('/api/purchase/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = conversationManager.getSession(sessionId);
    
    if (!session || !session.purchaseData) {
      return res.status(404).json({ error: 'Purchase session not found' });
    }

    // Check Stripe payment status
    const paymentIntent = await stripe.paymentIntents.retrieve(
      session.purchaseData.paymentIntentId
    );

    if (paymentIntent.status === 'succeeded' && session.purchaseData.status !== 'completed') {
      // Payment succeeded, finalize insurance purchase
      await finalizePurchase(sessionId, session);
    }

    res.json({
      status: paymentIntent.status,
      purchaseStatus: session.purchaseData.status,
      policyNumber: session.policy_number,
      policyPdfUrl: session.policy_pdf_url
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stripe webhook handler
app.post('/api/purchase/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.log('Webhook signature verification failed.', err.message);
    return res.status(400).send('Webhook Error: ${err.message}');
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const sessionId = paymentIntent.metadata.sessionId;
    
    if (sessionId) {
      const session = conversationManager.getSession(sessionId);
      if (session) {
        await finalizePurchase(sessionId, session);
      }
    }
  }

  res.json({ received: true });
});

// Helper function to finalize purchase with travel insurance API
async function finalizePurchase(sessionId, session) {
  try {
    const { quoteId, selectedOffer, customerInfo } = session.purchaseData;
    
    // Prepare purchase request for travel insurance API
    const purchaseRequest = {
      market: "SG",
      languageCode: "en", 
      channel: "white-label",
      quoteId: quoteId,
      purchaseOffers: [{
        productType: "travel-insurance",
        offerId: selectedOffer.offerId,
        productCode: selectedOffer.productCode,
        unitPrice: selectedOffer.unitPrice,
        currency: selectedOffer.currency,
        quantity: 1,
        totalPrice: selectedOffer.totalPrice,
        isSendEmail: true
      }],
      insureds: [{
        id: "1",
        title: customerInfo.title || "Mr",
        firstName: customerInfo.firstName,
        lastName: customerInfo.lastName,
        nationality: customerInfo.nationality || "SG",
        dateOfBirth: customerInfo.dateOfBirth,
        passport: customerInfo.passport,
        email: customerInfo.email,
        phoneType: "mobile",
        phoneNumber: customerInfo.phoneNumber,
        relationship: "main"
      }],
      mainContact: {
        id: "1",
        title: customerInfo.title || "Mr",
        firstName: customerInfo.firstName,
        lastName: customerInfo.lastName,
        nationality: customerInfo.nationality || "SG",
        dateOfBirth: customerInfo.dateOfBirth,
        passport: customerInfo.passport,
        email: customerInfo.email,
        phoneType: "mobile",
        phoneNumber: customerInfo.phoneNumber,
        address: customerInfo.address || "Singapore",
        city: customerInfo.city || "Singapore",
        zipCode: customerInfo.zipCode || "123456",
        countryCode: customerInfo.countryCode || "SG"
      }
    };

    // Call travel insurance purchase API
    const response = await fetch(`${TRAVEL_API_BASE}/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TRAVEL_API_KEY
      },
      body: JSON.stringify(purchaseRequest)
    });

    const result = await response.json();
    
    if (response.ok) {
      // Update session with policy details
      session.purchaseData.status = 'completed';
      session.policy_number = result.policyNumber || `POL-${Date.now()}`;
      session.policy_pdf_url = result.policyPdfUrl || '#';
      session.step = 'post_purchase';
      conversationManager.updateSession(sessionId, session);
    } else {
      console.error('Purchase API error:', result);
      session.purchaseData.status = 'failed';
      session.purchaseData.error = result.message || 'Purchase failed';
      conversationManager.updateSession(sessionId, session);
    }
  } catch (error) {
    console.error('Finalize purchase error:', error);
    session.purchaseData.status = 'failed';
    session.purchaseData.error = error.message;
    conversationManager.updateSession(sessionId, session);
  }
}

