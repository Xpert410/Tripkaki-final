import os
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

app = FastAPI(title="LEA Insurance Payment Pages", version="1.0.0")

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "lea-insurance-payment-pages"}

@app.get("/success", response_class=HTMLResponse)
async def payment_success(request: Request):
    session_id = request.query_params.get("session_id", "")
    
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Successful - LEA Travel Insurance</title>
        <style>
            * {{
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }}
            
            body {{
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }}
            
            .container {{
                background: white;
                border-radius: 20px;
                box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
                padding: 50px;
                text-align: center;
                max-width: 600px;
                width: 100%;
                position: relative;
                overflow: hidden;
            }}
            
            .container::before {{
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 6px;
                background: linear-gradient(90deg, #10b981, #059669, #047857);
            }}
            
            .success-icon {{
                width: 100px;
                height: 100px;
                background: linear-gradient(135deg, #10b981, #059669);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 30px;
                animation: successPulse 2s ease-in-out infinite;
                box-shadow: 0 10px 30px rgba(16, 185, 129, 0.3);
            }}
            
            .success-icon svg {{
                width: 50px;
                height: 50px;
                color: white;
            }}
            
            @keyframes successPulse {{
                0%, 100% {{ 
                    transform: scale(1);
                    box-shadow: 0 10px 30px rgba(16, 185, 129, 0.3);
                }}
                50% {{ 
                    transform: scale(1.05);
                    box-shadow: 0 15px 40px rgba(16, 185, 129, 0.4);
                }}
            }}
            
            h1 {{
                color: #1f2937;
                font-size: 32px;
                font-weight: 800;
                margin-bottom: 16px;
                background: linear-gradient(135deg, #1f2937, #374151);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }}
            
            .subtitle {{
                color: #6b7280;
                font-size: 18px;
                margin-bottom: 40px;
                line-height: 1.6;
                font-weight: 500;
            }}
            
            .celebration {{
                font-size: 48px;
                margin-bottom: 20px;
                animation: bounce 1s ease-in-out infinite alternate;
            }}
            
            @keyframes bounce {{
                from {{ transform: translateY(0px); }}
                to {{ transform: translateY(-10px); }}
            }}
            
            .info-box {{
                background: linear-gradient(135deg, #f8fafc, #f1f5f9);
                border: 2px solid #e2e8f0;
                border-radius: 16px;
                padding: 25px;
                margin-bottom: 35px;
                text-align: left;
            }}
            
            .info-label {{
                color: #374151;
                font-size: 14px;
                font-weight: 700;
                margin-bottom: 12px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }}
            
            .session-id {{
                color: #6b7280;
                font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
                font-size: 13px;
                word-break: break-all;
                background: #f3f4f6;
                padding: 12px;
                border-radius: 8px;
                border: 1px solid #d1d5db;
            }}
            
            .next-steps {{
                text-align: left;
                margin-bottom: 35px;
            }}
            
            .next-steps h3 {{
                color: #1f2937;
                font-size: 20px;
                font-weight: 700;
                margin-bottom: 20px;
                display: flex;
                align-items: center;
                gap: 8px;
            }}
            
            .next-steps ul {{
                list-style: none;
                padding: 0;
            }}
            
            .next-steps li {{
                color: #4b5563;
                font-size: 15px;
                line-height: 1.6;
                margin-bottom: 12px;
                padding-left: 30px;
                position: relative;
                font-weight: 500;
            }}
            
            .next-steps li::before {{
                content: '✓';
                position: absolute;
                left: 0;
                color: #10b981;
                font-weight: bold;
                font-size: 16px;
            }}
            
            .coverage-highlights {{
                background: linear-gradient(135deg, #eff6ff, #dbeafe);
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 30px;
                border-left: 4px solid #3b82f6;
            }}
            
            .coverage-highlights h4 {{
                color: #1e40af;
                font-size: 16px;
                font-weight: 700;
                margin-bottom: 12px;
            }}
            
            .coverage-grid {{
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 10px;
                font-size: 14px;
            }}
            
            .coverage-item {{
                color: #1e40af;
                font-weight: 600;
            }}
            
            .action-buttons {{
                display: flex;
                gap: 15px;
                justify-content: center;
                margin-bottom: 35px;
                flex-wrap: wrap;
            }}
            
            .button {{
                padding: 14px 28px;
                border-radius: 12px;
                font-size: 16px;
                font-weight: 600;
                text-decoration: none;
                cursor: pointer;
                border: none;
                transition: all 0.3s ease;
                min-width: 140px;
                position: relative;
                overflow: hidden;
            }}
            
            .button-primary {{
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
            }}
            
            .button-primary:hover {{
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(102, 126, 234, 0.5);
            }}
            
            .button-secondary {{
                background: white;
                color: #374151;
                border: 2px solid #d1d5db;
            }}
            
            .button-secondary:hover {{
                background: #f9fafb;
                border-color: #9ca3af;
                transform: translateY(-1px);
            }}
            
            .footer {{
                margin-top: 40px;
                padding-top: 30px;
                border-top: 2px solid #f3f4f6;
                color: #9ca3af;
                font-size: 13px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 10px;
            }}
            
            .logo {{
                font-weight: 800;
                color: #667eea;
                font-size: 16px;
            }}
            
            @media (max-width: 480px) {{
                .container {{
                    padding: 30px 25px;
                    margin: 10px;
                }}
                
                h1 {{
                    font-size: 26px;
                }}
                
                .action-buttons {{
                    flex-direction: column;
                }}
                
                .footer {{
                    flex-direction: column;
                    text-align: center;
                    gap: 15px;
                }}
                
                .coverage-grid {{
                    grid-template-columns: 1fr;
                }}
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="celebration">🎉</div>
            
            <div class="success-icon">
                <svg fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                </svg>
            </div>
            
            <h1>You're Covered!</h1>
            <p class="subtitle">
                Congratulations! Your travel insurance payment has been processed successfully. 
                Your policy is now active and you're protected for your upcoming adventure.
            </p>
            
            <div class="coverage-highlights">
                <h4>🛡️ Your Coverage is Active</h4>
                <div class="coverage-grid">
                    <div class="coverage-item">✈️ Trip Protection</div>
                    <div class="coverage-item">🏥 Medical Coverage</div>
                    <div class="coverage-item">🧳 Baggage Protection</div>
                    <div class="coverage-item">⏰ 24/7 Support</div>
                </div>
            </div>
            
            <div class="info-box">
                <div class="info-label">Payment Confirmation ID</div>
                <div class="session-id">{session_id or 'Processing...'}</div>
            </div>
            
            <div class="next-steps">
                <h3>📋 What happens next?</h3>
                <ul>
                    <li>Policy documents will arrive in your inbox within 5 minutes</li>
                    <li>Download the LEA Travel App for instant access to your policy</li>
                    <li>Save our 24/7 emergency hotline: +65-6123-4567</li>
                    <li>Keep your policy number handy during travel</li>
                    <li>Enjoy your trip with complete peace of mind!</li>
                </ul>
            </div>
            
            <div class="action-buttons">
                <button class="button button-primary" onclick="returnToChat()">
                    Return to Chat
                </button>
                <button class="button button-secondary" onclick="downloadPolicy()">
                    Download Policy
                </button>
            </div>
            
            <div class="footer">
                <div class="logo">LEA Insurance</div>
                <div>Secure Payment Processing • Policy Activated</div>
            </div>
        </div>
        
        <script>
            // Auto-close functionality for popup windows
            if (window.opener) {{
                setTimeout(() => {{
                    try {{
                        window.opener.postMessage({{
                            type: 'PAYMENT_SUCCESS',
                            sessionId: '{session_id}',
                            timestamp: new Date().toISOString()
                        }}, '*');
                        window.close();
                    }} catch (e) {{
                        console.log('Parent communication failed, keeping window open');
                    }}
                }}, 5000);
            }}
            
            function returnToChat() {{
                if (window.opener) {{
                    window.opener.postMessage({{
                        type: 'RETURN_TO_CHAT',
                        sessionId: '{session_id}'
                    }}, '*');
                    window.close();
                }} else {{
                    // Fallback for direct navigation
                    window.location.href = '/';
                }}
            }}
            
            function downloadPolicy() {{
                // This would trigger policy PDF download
                console.log('Policy download requested for session:', '{session_id}');
                alert('Policy documents have been sent to your email. Check your inbox!');
            }}
            
            // Log success for analytics
            console.log('Payment Success - Session ID:', '{session_id}');
            console.log('Policy activation confirmed at:', new Date().toISOString());
            
            // Send success event to parent if in iframe
            if (window.parent !== window) {{
                window.parent.postMessage({{
                    type: 'PAYMENT_COMPLETED',
                    sessionId: '{session_id}'
                }}, '*');
            }}
        </script>
    </body>
    </html>
    """
    
    return HTMLResponse(content=html_content)

@app.get("/cancel", response_class=HTMLResponse)
async def payment_cancel(request: Request):
    quote_id = request.query_params.get("quote_id", "")
    
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Cancelled - LEA Travel Insurance</title>
        <style>
            * {{
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }}
            
            body {{
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }}
            
            .container {{
                background: white;
                border-radius: 20px;
                box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
                padding: 50px;
                text-align: center;
                max-width: 550px;
                width: 100%;
                position: relative;
                overflow: hidden;
            }}
            
            .container::before {{
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 6px;
                background: linear-gradient(90deg, #f59e0b, #d97706, #b45309);
            }}
            
            .cancel-icon {{
                width: 100px;
                height: 100px;
                background: linear-gradient(135deg, #ef4444, #dc2626);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 30px;
                animation: shake 0.5s ease-in-out;
            }}
            
            .cancel-icon svg {{
                width: 50px;
                height: 50px;
                color: white;
            }}
            
            @keyframes shake {{
                0%, 100% {{ transform: translateX(0); }}
                25% {{ transform: translateX(-5px); }}
                75% {{ transform: translateX(5px); }}
            }}
            
            h1 {{
                color: #1f2937;
                font-size: 32px;
                font-weight: 800;
                margin-bottom: 16px;
            }}
            
            .subtitle {{
                color: #6b7280;
                font-size: 18px;
                margin-bottom: 40px;
                line-height: 1.6;
                font-weight: 500;
            }}
            
            .reassurance {{
                background: linear-gradient(135deg, #fef3c7, #fde68a);
                border-radius: 16px;
                padding: 25px;
                margin-bottom: 35px;
                border-left: 4px solid #f59e0b;
            }}
            
            .reassurance h3 {{
                color: #92400e;
                font-size: 18px;
                font-weight: 700;
                margin-bottom: 12px;
                display: flex;
                align-items: center;
                gap: 8px;
            }}
            
            .reassurance p {{
                color: #78350f;
                font-size: 15px;
                line-height: 1.6;
                margin-bottom: 0;
            }}
            
            .actions {{
                display: flex;
                gap: 15px;
                justify-content: center;
                flex-wrap: wrap;
                margin-bottom: 35px;
            }}
            
            .button {{
                padding: 14px 28px;
                border-radius: 12px;
                font-size: 16px;
                font-weight: 600;
                text-decoration: none;
                cursor: pointer;
                border: none;
                transition: all 0.3s ease;
                min-width: 140px;
                position: relative;
                overflow: hidden;
            }}
            
            .button-primary {{
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
            }}
            
            .button-primary:hover {{
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(102, 126, 234, 0.5);
            }}
            
            .button-secondary {{
                background: white;
                color: #374151;
                border: 2px solid #d1d5db;
            }}
            
            .button-secondary:hover {{
                background: #f9fafb;
                border-color: #9ca3af;
                transform: translateY(-1px);
            }}
            
            .help-section {{
                background: #f8fafc;
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 30px;
                text-align: left;
            }}
            
            .help-section h4 {{
                color: #374151;
                font-size: 16px;
                font-weight: 700;
                margin-bottom: 15px;
            }}
            
            .help-list {{
                list-style: none;
                padding: 0;
            }}
            
            .help-list li {{
                color: #6b7280;
                font-size: 14px;
                line-height: 1.6;
                margin-bottom: 8px;
                padding-left: 20px;
                position: relative;
            }}
            
            .help-list li::before {{
                content: '💡';
                position: absolute;
                left: 0;
            }}
            
            .footer {{
                margin-top: 40px;
                padding-top: 30px;
                border-top: 2px solid #f3f4f6;
                color: #9ca3af;
                font-size: 13px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 10px;
            }}
            
            .logo {{
                font-weight: 800;
                color: #667eea;
                font-size: 16px;
            }}
            
            @media (max-width: 480px) {{
                .container {{
                    padding: 30px 25px;
                    margin: 10px;
                }}
                
                h1 {{
                    font-size: 26px;
                }}
                
                .actions {{
                    flex-direction: column;
                }}
                
                .footer {{
                    flex-direction: column;
                    text-align: center;
                    gap: 15px;
                }}
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="cancel-icon">
                <svg fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                </svg>
            </div>
            
            <h1>Payment Cancelled</h1>
            <p class="subtitle">
                No worries! Your payment was cancelled and no charges have been made to your account.
                Your travel insurance quote is still valid and waiting for you.
            </p>
            
            <div class="reassurance">
                <h3>🛡️ Don't leave without protection!</h3>
                <p>
                    Travel insurance is your safety net for unexpected events. Medical emergencies abroad 
                    can cost thousands, and trip cancellations happen more often than you think. 
                    Protect your investment and your peace of mind.
                </p>
            </div>
            
            <div class="help-section">
                <h4>💳 Having payment issues?</h4>
                <ul class="help-list">
                    <li>Try a different payment method or card</li>
                    <li>Check if your card has international transactions enabled</li>
                    <li>Contact your bank if payments are being declined</li>
                    <li>Use PayPal or digital wallet alternatives</li>
                    <li>Reach out to our support team for assistance</li>
                </ul>
            </div>
            
            <div class="actions">
                <button class="button button-primary" onclick="tryAgain()">
                    Try Payment Again
                </button>
                <button class="button button-secondary" onclick="returnToChat()">
                    Return to Chat
                </button>
            </div>
            
            <div class="footer">
                <div class="logo">LEA Insurance</div>
                <div>No Payment Processed • Your Quote is Safe</div>
            </div>
        </div>
        
        <script>
            const quoteId = '{quote_id}';
            
            // Auto-close functionality for popup windows
            if (window.opener) {{
                setTimeout(() => {{
                    try {{
                        window.opener.postMessage({{
                            type: 'PAYMENT_CANCELLED',
                            quoteId: quoteId,
                            timestamp: new Date().toISOString()
                        }}, '*');
                        // Don't auto-close on cancel, let user decide
                    }} catch (e) {{
                        console.log('Parent communication failed');
                    }}
                }}, 2000);
            }}
            
            function tryAgain() {{
                if (window.opener) {{
                    window.opener.postMessage({{
                        type: 'RETRY_PAYMENT',
                        quoteId: quoteId
                    }}, '*');
                    window.close();
                }} else {{
                    // Fallback - redirect to quote page
                    if (quoteId) {{
                        window.location.href = `/quote/${{quoteId}}`;
                    }} else {{
                        window.location.href = '/';
                    }}
                }}
            }}
            
            function returnToChat() {{
                if (window.opener) {{
                    window.opener.postMessage({{
                        type: 'RETURN_TO_CHAT',
                        quoteId: quoteId
                    }}, '*');
                    window.close();
                }} else {{
                    // Fallback for direct navigation
                    window.location.href = '/';
                }}
            }}
            
            // Log cancellation for analytics
            console.log('Payment Cancelled - Quote ID:', quoteId);
            console.log('Cancellation time:', new Date().toISOString());
            
            // Send cancellation event to parent if in iframe
            if (window.parent !== window) {{
                window.parent.postMessage({{
                    type: 'PAYMENT_CANCELLED',
                    quoteId: quoteId
                }}, '*');
            }}
        </script>
    </body>
    </html>
    """
    
    return HTMLResponse(content=html_content)

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8085))
    uvicorn.run(app, host="0.0.0.0", port=port)