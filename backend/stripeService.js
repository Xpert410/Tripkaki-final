import Stripe from 'stripe';

// Use environment variable if set, otherwise fall back to provided test secret for hackathon
const STRIPE_SECRET = process.env.STRIPE_SECRET || 'sk_test_51SOou8KIVh1pb6k1cROoDW1fBAJMLPtzUYt9dDlWstmYpfrQB6DMIejaDKoChzr8NJizhMqJplpZHR8REnoMgKSF00XlqmHMoj';

export const stripe = new Stripe(STRIPE_SECRET, {
  apiVersion: '2022-11-15'
});

export async function createPaymentIntent({ amount, currency = 'sgd', receipt_email = null, metadata = {} }) {
  // amount must be integer (cents)
  const pi = await stripe.paymentIntents.create({
    amount,
    currency,
    receipt_email,
    metadata,
    // enable automatic payment methods so test card works smoothly
    automatic_payment_methods: { enabled: true }
  });
  return pi;
}

export async function retrievePaymentIntent(id) {
  return stripe.paymentIntents.retrieve(id);
}
