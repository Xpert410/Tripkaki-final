import os
import json
import logging
from typing import Dict, Any
from datetime import datetime, timedelta
import uuid

import stripe
import boto3
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("stripe-webhook")

# Environment variables
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
AWS_REGION = os.getenv("AWS_REGION", "ap-southeast-1")
DYNAMODB_PAYMENTS_TABLE = os.getenv("DYNAMODB_PAYMENTS_TABLE", "lea-payments-local")
DDB_ENDPOINT = os.getenv("DDB_ENDPOINT")

# Initialize DynamoDB
if DDB_ENDPOINT:
    dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION, endpoint_url=DDB_ENDPOINT)
else:
    dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION)

# Table references
payments_table = dynamodb.Table(DYNAMODB_PAYMENTS_TABLE)
quotes_table = dynamodb.Table('lea-insurance-quotes')
policies_table = dynamodb.Table('lea-insurance-policies')
customers_table = dynamodb.Table('lea-customer-profiles')

app = FastAPI(title="LEA Insurance Stripe Webhook Service", version="1.0.0")

@app.get("/health")
async def health():
    """Enhanced health check with database connectivity"""
    health_status = {
        "status": "ok",
        "service": "stripe-webhook",
        "timestamp": datetime.utcnow().isoformat(),
        "config": {
            "webhook_secret_configured": bool(STRIPE_WEBHOOK_SECRET),
            "payments_table": DYNAMODB_PAYMENTS_TABLE,
            "aws_region": AWS_REGION
        }
    }
    
    # Test database connectivity
    try:
        payments_table.table_status
        health_status["database"] = "connected"
    except Exception as e:
        health_status["database"] = f"error: {str(e)}"
        health_status["status"] = "degraded"
    
    return health_status

@app.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Enhanced Stripe webhook handler for insurance payments"""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    
    logger.info(f"Webhook received - Secret configured: {len(STRIPE_WEBHOOK_SECRET) > 0}")
    
    if not STRIPE_WEBHOOK_SECRET:
        logger.error("STRIPE_WEBHOOK_SECRET not configured")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    
    try:
        # Verify webhook signature (skip for local testing)
        if len(STRIPE_WEBHOOK_SECRET) < 20 or not sig_header:
            logger.warning("Using webhook without signature verification (local testing)")
            event = json.loads(payload.decode('utf-8'))
        else:
            event = stripe.Webhook.construct_event(
                payload, sig_header, STRIPE_WEBHOOK_SECRET
            )
    except ValueError as e:
        logger.error(f"Invalid payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid payload")
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    
    event_type = event["type"]
    event_data = event["data"]["object"]
    
    logger.info(f"Processing Stripe event: {event_type}")
    
    # Handle different event types
    if event_type == "checkout.session.completed":
        await handle_payment_success(event_data)
    elif event_type == "checkout.session.expired":
        await handle_payment_expired(event_data)
    elif event_type == "payment_intent.payment_failed":
        await handle_payment_failed(event_data)
    else:
        logger.info(f"Unhandled event type: {event_type}")
    
    return JSONResponse({"status": "success"})

async def handle_payment_success(session_data: Dict[str, Any]):
    """Handle successful payment and create insurance policy"""
    session_id = session_data.get("id")
    client_reference_id = session_data.get("client_reference_id")
    payment_intent_id = session_data.get("payment_intent")
    
    logger.info(f"Payment successful for session: {session_id}")
    
    if not client_reference_id:
        logger.warning(f"No client_reference_id found for session {session_id}")
        return
    
    try:
        # Get payment record
        payment_response = payments_table.get_item(Key={"payment_intent_id": client_reference_id})
        payment_record = payment_response.get("Item")
        
        if not payment_record:
            logger.warning(f"Payment record not found for payment_intent_id: {client_reference_id}")
            return
        
        # Get quote record to access trip and customer details
        quote_response = quotes_table.get_item(Key={"quote_id": payment_record["quote_id"]})
        quote_record = quote_response.get("Item")
        
        if not quote_record:
            logger.warning(f"Quote record not found for quote_id: {payment_record['quote_id']}")
            return
        
        # Generate policy
        policy_id = await create_insurance_policy(payment_record, quote_record, session_data)
        
        # Update payment record
        payment_record["payment_status"] = "completed"
        payment_record["stripe_payment_intent"] = payment_intent_id
        payment_record["policy_id"] = policy_id
        payment_record["updated_at"] = datetime.utcnow().isoformat()
        payment_record["webhook_processed_at"] = datetime.utcnow().isoformat()
        
        payments_table.put_item(Item=payment_record)
        
        logger.info(f"Payment completed and policy created: {policy_id}")
        
        # Send confirmation email (placeholder - integrate with your email service)
        await send_policy_confirmation_email(payment_record, quote_record, policy_id)
        
        # Trigger e-policy receipt display in chat
        await trigger_chat_policy_receipt(payment_record["user_id"], policy_id, payment_record["payment_intent_id"])
        
    except Exception as e:
        logger.error(f"Failed to process payment success: {e}")

async def create_insurance_policy(payment_record: Dict, quote_record: Dict, session_data: Dict) -> str:
    """Create insurance policy record after successful payment"""
    
    policy_id = f"POL-{uuid.uuid4().hex[:8].upper()}"
    created_at = datetime.utcnow().isoformat()
    
    # Calculate policy period
    departure_date = datetime.fromisoformat(quote_record["departure_date"])
    return_date = datetime.fromisoformat(quote_record["return_date"]) if quote_record.get("return_date") else departure_date + timedelta(days=30)
    
    # Extend coverage period (typically starts few days before departure)
    coverage_start = departure_date - timedelta(days=1)
    coverage_end = return_date + timedelta(days=1)
    
    # Get customer details
    customer_response = customers_table.get_item(Key={"user_id": payment_record["user_id"]})
    customer = customer_response.get("Item", {})
    
    policy_record = {
        "policy_id": policy_id,
        "user_id": payment_record["user_id"],
        "quote_id": payment_record["quote_id"],
        "payment_intent_id": payment_record["payment_intent_id"],
        
        # Policy status
        "policy_status": "active",
        "issue_date": created_at,
        "coverage_start": coverage_start.isoformat(),
        "coverage_end": coverage_end.isoformat(),
        
        # Customer information
        "policyholder": {
            "name": customer.get("name"),
            "email": customer.get("email"),
            "phone": customer.get("phone"),
            "age": customer.get("age"),
            "existing_conditions": customer.get("existing_conditions", [])
        },
        
        # Trip details
        "trip_details": {
            "type": quote_record["trip_type"],
            "departure_date": quote_record["departure_date"],
            "return_date": quote_record.get("return_date"),
            "departure_country": quote_record["departure_country"],
            "arrival_country": quote_record["arrival_country"],
            "duration_days": quote_record.get("trip_duration"),
            "number_of_adults": quote_record["number_of_adults"],
            "number_of_children": quote_record.get("number_of_children", 0),
            "activities": quote_record.get("activities", [])
        },
        
        # Coverage details
        "selected_plan": payment_record["selected_plan"],
        "selected_riders": payment_record.get("selected_riders", []),
        "premium_paid": payment_record["total_amount"],
        "currency": payment_record["currency"],
        
        # Payment details
        "stripe_payment_intent": session_data.get("payment_intent"),
        "stripe_session_id": session_data.get("id"),
        
        # Metadata
        "traveller_persona": quote_record.get("traveller_persona"),
        "created_at": created_at,
        "updated_at": created_at
    }
    
    # Save policy to database
    policies_table.put_item(Item=policy_record)
    
    logger.info(f"Created insurance policy: {policy_id} for user: {payment_record['user_id']}")
    
    return policy_id

async def send_policy_confirmation_email(payment_record: Dict, quote_record: Dict, policy_id: str):
    """Send policy confirmation email (placeholder for email service integration)"""
    try:
        # Get customer details
        customer_response = customers_table.get_item(Key={"user_id": payment_record["user_id"]})
        customer = customer_response.get("Item", {})
        
        email_data = {
            "to": customer.get("email"),
            "template": "policy_confirmation",
            "data": {
                "customer_name": customer.get("name"),
                "policy_id": policy_id,
                "plan_name": payment_record["selected_plan"]["name"],
                "destination": quote_record["arrival_country"],
                "departure_date": quote_record["departure_date"],
                "premium_paid": payment_record["total_amount"],
                "currency": payment_record["currency"]
            }
        }
        
        logger.info(f"Email queued for {customer.get('email')}: Policy {policy_id} confirmation")
        
        # TODO: Integrate with your email service (SendGrid, SES, etc.)
        # await email_service.send_template_email(email_data)
        
    except Exception as e:
        logger.error(f"Failed to send confirmation email: {e}")

async def trigger_chat_policy_receipt(user_id: str, policy_id: str, payment_intent_id: str):
    """Trigger display of e-policy receipt in chat interface"""
    try:
        # Store receipt notification in database for chat to pick up
        receipt_notification = {
            "notification_id": f"receipt-{uuid.uuid4().hex[:8]}",
            "user_id": user_id,
            "type": "policy_receipt",
            "policy_id": policy_id,
            "payment_intent_id": payment_intent_id,
            "status": "pending",
            "created_at": datetime.utcnow().isoformat(),
            "expires_at": (datetime.utcnow() + timedelta(hours=24)).isoformat()
        }
        
        # Store in a notifications table (you can create this or use existing table)
        # For now, we'll add it to the payments table with a special prefix
        notification_key = f"RECEIPT_NOTIFY_{user_id}_{policy_id}"
        
        payments_table.put_item(Item={
            "payment_intent_id": notification_key,
            **receipt_notification
        })
        
        logger.info(f"Receipt notification created for user {user_id}, policy {policy_id}")
        
        # Optional: Send webhook to chat service if you have real-time notifications
        # await send_chat_webhook(user_id, "policy_receipt_ready", {
        #     "policy_id": policy_id,
        #     "message": "🎉 Your travel insurance is now active! Click here to view your e-policy."
        # })
        
    except Exception as e:
        logger.error(f"Failed to create receipt notification: {e}")

async def handle_payment_expired(session_data: Dict[str, Any]):
    """Handle expired payment session"""
    session_id = session_data.get("id")
    client_reference_id = session_data.get("client_reference_id")
    
    logger.info(f"Payment session expired: {session_id}")
    
    if not client_reference_id:
        logger.warning(f"No client_reference_id found for expired session {session_id}")
        return
    
    try:
        response = payments_table.get_item(Key={"payment_intent_id": client_reference_id})
        payment_record = response.get("Item")
        
        if not payment_record:
            logger.warning(f"Payment record not found for payment_intent_id: {client_reference_id}")
            return
        
        payment_record["payment_status"] = "expired"
        payment_record["updated_at"] = datetime.utcnow().isoformat()
        payment_record["webhook_processed_at"] = datetime.utcnow().isoformat()
        
        payments_table.put_item(Item=payment_record)
        
        logger.info(f"Updated payment status to expired for {client_reference_id}")
        
    except Exception as e:
        logger.error(f"Failed to update expired payment record: {e}")

async def handle_payment_failed(payment_intent_data: Dict[str, Any]):
    """Handle failed payment"""
    payment_intent_id = payment_intent_data.get("id")
    
    logger.info(f"Payment failed for intent: {payment_intent_id}")
    
    try:
        # Find payment record by stripe payment intent
        response = payments_table.scan(
            FilterExpression="stripe_payment_intent = :intent_id",
            ExpressionAttributeValues={":intent_id": payment_intent_id}
        )
        
        items = response.get("Items", [])
        if not items:
            logger.warning(f"Payment record not found for intent: {payment_intent_id}")
            return
        
        payment_record = items[0]
        payment_record["payment_status"] = "failed"
        payment_record["updated_at"] = datetime.utcnow().isoformat()
        payment_record["webhook_processed_at"] = datetime.utcnow().isoformat()
        
        payments_table.put_item(Item=payment_record)
        
        logger.info(f"Updated payment status to failed for {payment_record['payment_intent_id']}")
        
    except Exception as e:
        logger.error(f"Failed to update failed payment record: {e}")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8085))
    uvicorn.run(app, host="0.0.0.0", port=port)