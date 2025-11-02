// Updated payment step for seamless purchase flow
// Replace lines 519-534 in conversationManager.js

    // STEP 5: PAYMENT - Seamless Purchase Flow
    else if (step === 'payment') {
      if (!session.payment_message_shown) {
        const totalPrice = this._calculateTotal(session);
        responseText = `Perfect! Ready to secure your coverage?\n\n`;
        responseText += `í²° Total: $${totalPrice} SGD for ${tripData.number_of_travellers || 1} traveller(s)\n`;
        responseText += `í³… Coverage: ${tripData.trip_start_date} to ${tripData.trip_end_date}\n\n`;
        responseText += "I'll process your payment securely and activate your policy instantly. Ready?";
        
        // Trigger seamless purchase flow
        data = {
          triggerPurchase: true,
          selectedPlan: {
            offerId: session.selectedPlan?.offerId || 'default-offer-id',
            productCode: session.selectedPlan?.productCode || 'SG_AXA_SCOOT_COMP',
            unitPrice: totalPrice,
            totalPrice: totalPrice,
            currency: 'SGD'
          },
          customerInfo: {
            firstName: tripData.traveller_name?.split(' ')[0] || 'John',
            lastName: tripData.traveller_name?.split(' ').slice(1).join(' ') || 'Doe',
            email: tripData.email || 'customer@example.com',
            phoneNumber: tripData.phone || '+6512345678',
            dateOfBirth: tripData.date_of_birth || '1990-01-01',
            passport: tripData.passport_number || 'P1234567',
            nationality: tripData.nationality || 'SG',
            address: tripData.address || '123 Main Street',
            city: tripData.city || 'Singapore',
            zipCode: tripData.zipCode || '123456',
            countryCode: 'SG'
          }
        };
        
        requiresAction = 'seamless_purchase';
        session.payment_message_shown = true;
      } else {
        responseText = "Please complete the payment above to activate your coverage.";
      }
    }
