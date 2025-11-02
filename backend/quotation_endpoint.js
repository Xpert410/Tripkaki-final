
// Travel Insurance Quotation API
app.post('/api/quotation', async (req, res) => {
  try {
    const { sessionId, tripType, departureDate, returnDate, departureCountry, arrivalCountry, adultsCount, childrenCount } = req.body;
    
    const quotationRequest = {
      market: "SG",
      languageCode: "en",
      channel: "white-label",
      deviceType: "DESKTOP",
      context: {
        tripType: tripType || "RT",
        departureDate,
        returnDate: tripType === "ST" ? undefined : returnDate,
        departureCountry: departureCountry || "SG",
        arrivalCountry,
        adultsCount: adultsCount || 1,
        childrenCount: childrenCount || 0
      }
    };

    // Remove undefined values
    if (quotationRequest.context.returnDate === undefined) {
      delete quotationRequest.context.returnDate;
    }

    const response = await fetch(`${TRAVEL_API_BASE}/pricing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TRAVEL_API_KEY
      },
      body: JSON.stringify(quotationRequest)
    });

    const result = await response.json();
    
    if (response.ok) {
      // Store quotation in session
      if (sessionId) {
        const session = conversationManager.getSession(sessionId);
        if (session) {
          session.quotationData = result;
          conversationManager.updateSession(sessionId, session);
        }
      }
      
      res.json(result);
    } else {
      console.error('Quotation API error:', result);
      res.status(response.status).json({ error: result.message || 'Quotation failed' });
    }
  } catch (error) {
    console.error('Quotation error:', error);
    res.status(500).json({ error: error.message });
  }
});

