// Use relative URLs so it works with the same server
const API_BASE = '';
let sessionId = null;
let walletBalance = 0;
let isCrisisMode = false;

// Initialize Stripe
const stripe = Stripe('pk_test_51SOou8KIVh1pb6k1as4zm0jmLTarZHL6avr2reNRK4BbSSV7Ot8nlSKxfcPIxdvBxtBnHfGjkhODlcWmbJyUOPvK00cE3PmZ2X');
let paymentElement = null;
let elements = null;

// DOM Elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const actionButtons = document.getElementById('actionButtons');
const confirmButton = document.getElementById('confirmButton');
const paymentButton = document.getElementById('paymentButton');
const avatarStatus = document.getElementById('avatarStatus');
const fileUploadArea = document.getElementById('fileUploadArea');
const fileInput = document.getElementById('fileInput');
const uploadButton = document.getElementById('uploadButton');
const fileName = document.getElementById('fileName');
const modeIndicator = document.getElementById('modeIndicator');
const modeText = document.getElementById('modeText');
const walletAmount = document.getElementById('walletAmount');
const walletBalanceEl = document.getElementById('walletBalance');
const careerContent = document.getElementById('careerContent');
const quickReplies = document.getElementById('quickReplies');
const excerptContent = document.getElementById('excerptContent');
const statsContent = document.getElementById('statsContent');
const timelineContent = document.getElementById('timelineContent');
const ttsAudio = document.getElementById('ttsAudio');
const micButton = document.getElementById('micButton');
const avatarEmoji = document.getElementById('avatarEmoji');
const avatarMouth = document.getElementById('avatarMouth');
const avatarCustomizeBtn = document.getElementById('avatarCustomizeBtn');
const avatarModalOverlay = document.getElementById('avatarModalOverlay');
const closeAvatarModal = document.getElementById('closeAvatarModal');
const cancelAvatarModal = document.getElementById('cancelAvatarModal');

// Speech Recognition State
let recognition = null;
let isListening = false;
let isSpeaking = false;
let lipSyncInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Initial scroll to bottom
    setTimeout(() => {
        scrollToBottom(false); // Instant scroll on load
    }, 100);
    
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    sendButton.addEventListener('click', sendMessage);
    confirmButton.addEventListener('click', handleConfirm);
    paymentButton.addEventListener('click', handlePayment);
    
    // File upload handlers
    uploadButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
    
    // Block handlers
    document.querySelectorAll('.block-item').forEach(item => {
        item.addEventListener('click', () => handleBlockClick(item.dataset.block));
    });
    
    // Wallet handlers
    document.getElementById('earnRewards').addEventListener('click', earnRewards);
    document.getElementById('redeemRewards').addEventListener('click', showRedeemOptions);
    
    // Speech-to-text (Mic button) - only for Block 2
    if (micButton) {
        initializeSpeechRecognition();
        micButton.addEventListener('click', toggleSpeechRecognition);
    }
    
    // Avatar customization
    if (avatarCustomizeBtn) {
        avatarCustomizeBtn.addEventListener('click', () => {
            avatarModalOverlay.style.display = 'flex';
        });
    }
    if (closeAvatarModal) {
        closeAvatarModal.addEventListener('click', () => {
            avatarModalOverlay.style.display = 'none';
        });
    }
    if (cancelAvatarModal) {
        cancelAvatarModal.addEventListener('click', () => {
            avatarModalOverlay.style.display = 'none';
        });
    }
    
    // Emoji selection
    document.querySelectorAll('.emoji-option').forEach(option => {
        option.addEventListener('click', () => {
            const emoji = option.dataset.emoji;
            changeAvatarEmoji(emoji);
            avatarModalOverlay.style.display = 'none';
        });
    });
    
    // Load saved avatar emoji
    const savedEmoji = localStorage.getItem('tripkaki_avatar_emoji') || '🤖';
    changeAvatarEmoji(savedEmoji);
    
    // Update wallet display
    updateWallet();
});

// Handle Block Clicks
function handleBlockClick(blockNumber) {
    document.querySelectorAll('.block-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
    
    const blockMessages = {
        '1': {
            title: 'BLOCK 1: Policy Intelligence',
            message: 'I can parse and normalize policy documents using our 4-layer taxonomy engine. I\'ll process Scootsurance, TravelEasy Policy, and TravelEasy Pre-Ex Policy PDFs and convert them to taxonomy format stored in the database!',
            query: 'Process policy PDFs',
            action: 'processPolicies'
        },
        '2': {
            title: 'BLOCK 2: Conversational FAQ',
            message: 'I use intelligent query routing to answer questions—whether you need comparisons, explanations, eligibility checks, or scenario simulations. You can now speak to me using the microphone button! 🎤',
            query: 'How does your FAQ system work?',
            action: 'enableVoiceChat'
        },
        '3': {
            title: 'BLOCK 3: Document Intelligence',
            message: 'Upload your travel documents (flight confirmations, itineraries) and I\'ll extract trip details and generate instant quotations in seconds!',
            query: 'Upload a travel document'
        },
        '4': {
            title: 'BLOCK 4: Purchase Engine',
            message: 'Once you select a plan, I handle the complete purchase flow through MCP tools, including payment processing and policy issuance.',
            query: 'I want to purchase a policy'
        },
        '5': {
            title: 'BLOCK 5: MSIG Intelligence',
            message: 'I use historical claims data to provide evidence-based recommendations. I analyze claim frequencies, risk levels, and suggest optimal coverage tiers.',
            query: 'Show me claims intelligence for my trip'
        }
    };
    
    const block = blockMessages[blockNumber];
    if (block) {
        addMessage(`${block.title}\n\n${block.message}`, 'assistant');
        speakText(block.message);
        
        // Special actions for blocks
        if (block.action === 'processPolicies') {
            showProcessPoliciesButton();
        } else if (block.action === 'enableVoiceChat') {
            // Enable mic button for Block 2
            if (micButton) {
                micButton.style.display = 'flex';
            }
            showBlockQuickAction(blockNumber, block.query);
        } else {
            // Hide mic button for other blocks
            if (micButton) {
                micButton.style.display = 'none';
            }
            // Show quick action button
            showBlockQuickAction(blockNumber, block.query);
        }
    }
}

async function processPolicyPDFs() {
    addMessage('🚀 Starting policy processing...\n\nProcessing:\n• Scootsurance → Product A\n• TravelEasy Policy → Product B\n• TravelEasy Pre-Ex Policy → Product C', 'user');
    updateAvatarStatus('Processing policies...');
    animateAvatar();
    
    // Create a progress message container
    const progressContainer = document.createElement('div');
    progressContainer.className = 'message assistant';
    progressContainer.id = 'progressContainer';
    const progressBubble = document.createElement('div');
    progressBubble.className = 'message-bubble';
    const progressContent = document.createElement('div');
    progressContent.className = 'message-content';
    progressContent.innerHTML = '<div class="progress-updates" id="progressUpdates"></div>';
    progressBubble.appendChild(progressContent);
    progressContainer.appendChild(progressBubble);
    messagesContainer.appendChild(progressContainer);
    
    const progressUpdates = document.getElementById('progressUpdates');
    
    try {
        const response = await fetch(`${API_BASE}/api/process-policies`, {
            method: 'POST',
            headers: {
                'Accept': 'text/event-stream'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalData = null;

        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        
                        if (data.type === 'progress') {
                            // Add progress update
                            const updateDiv = document.createElement('div');
                            updateDiv.style.cssText = 'padding: 4px 0; font-size: 14px; color: var(--text-secondary);';
                            updateDiv.textContent = data.message;
                            progressUpdates.appendChild(updateDiv);
                            scrollToBottom(true);
                            
                            // Update avatar status
                            if (data.message.includes('Processing')) {
                                updateAvatarStatus('Processing...');
                            } else if (data.message.includes('✅')) {
                                updateAvatarStatus('Success!');
                            }
                        } else if (data.type === 'complete') {
                            finalData = data;
                            // Replace progress container with final summary
                            progressContent.innerHTML = '';
                            
                            const successCount = data.results.filter(r => r.success).length;
                            const failureCount = data.results.filter(r => !r.success).length;
                            
                            let message = '';
                            if (data.success && successCount === data.results.length) {
                                message = '✅ <strong>Policy Processing Completed Successfully!</strong>\n\n';
                            } else if (successCount > 0) {
                                message = `⚠️ <strong>Policy Processing Completed with ${failureCount} error(s)</strong>\n\n`;
                            } else {
                                message = '❌ <strong>Policy Processing Failed</strong>\n\n';
                            }
                            
                            message += `📊 <strong>Processed ${data.results.length} policies:</strong>\n\n`;
                            data.results.forEach(result => {
                                if (result.success) {
                                    message += `✅ ${result.product} (${result.productKey})\n`;
                                    if (result.mapped_conditions !== undefined) {
                                        message += `   • Mapped ${result.mapped_conditions} conditions\n`;
                                    }
                                    if (result.mapped_benefits !== undefined) {
                                        message += `   • Mapped ${result.mapped_benefits} benefits\n`;
                                    }
                                } else {
                                    message += `❌ ${result.product} - ${result.error || result.message || 'Unknown error'}\n`;
                                }
                            });
                            
                            if (data.stats) {
                                message += `\n📈 <strong>Final Statistics:</strong>\n`;
                                message += `   • Total lines: ${data.stats.total_lines}\n`;
                                message += `   • Total conditions: ${data.stats.total_conditions}\n`;
                                message += `   • Total benefits: ${data.stats.total_benefits}\n`;
                                message += `   • Total benefit conditions: ${data.stats.total_benefit_conditions}\n`;
                                message += `   • Total parameters: ${data.stats.total_parameters || 0}\n`;
                            }
                            
                            message += `\n💾 Database: ${data.database_location}`;
                            
                            if (data.success && successCount === data.results.length) {
                                message += `\n\n🎉 All policies mapped to taxonomy structure! Ready for queries.`;
                            } else if (data.warning) {
                                message += `\n\n⚠️ ${data.warning}`;
                            }
                            
                            progressContent.innerHTML = message.replace(/\n/g, '<br>');
                            
                            if (data.success && successCount === data.results.length) {
                                speakText('Policy processing completed successfully. All policies are now mapped and stored.');
                                earnRewards(100);
                            } else {
                                speakText(`Policy processing completed with ${failureCount} error. ${successCount} policies were successfully processed.`);
                            }
                            updatePolicyInsights(data.results, data.stats);
                            } else if (data.type === 'error') {
                                let errorMsg = `❌ <strong>Processing Failed</strong>\n\n`;
                                errorMsg += `<strong>Error:</strong> ${data.error}\n\n`;
                                
                                if (data.error_step) {
                                    errorMsg += `📍 <strong>Failed at Step:</strong> ${data.error_step}\n`;
                                }
                                if (data.error_product) {
                                    errorMsg += `📄 <strong>Failed Product:</strong> ${data.error_product}\n`;
                                }
                                if (data.error_details) {
                                    errorMsg += `\n<details><summary>Error Details</summary><pre>${data.error_details}</pre></details>`;
                                }
                                
                                progressContent.innerHTML = errorMsg.replace(/\n/g, '<br>');
                                addMessage(`❌ Processing failed at ${data.error_step || 'unknown step'}: ${data.error}`, 'assistant');
                                updateAvatarStatus('Error');
                            }
                    } catch (e) {
                        console.error('Error parsing SSE data:', e);
                    }
                }
            }
        }
        
        // Only show error message if there was a critical failure
        if (!finalData) {
            addMessage('❌ Processing failed. Check progress above for details.', 'assistant');
        } else if (!finalData.success && finalData.type !== 'complete') {
            addMessage('❌ Processing failed. Check progress above for details.', 'assistant');
        }
        
    } catch (error) {
        console.error('Error processing policies:', error);
        progressContent.innerHTML = `❌ <strong>Error:</strong> ${error.message}`;
        addMessage('Error processing policies. Please check the console for details.', 'assistant');
        updateAvatarStatus('Error');
    }
}

function showProcessPoliciesButton() {
    const quickAction = document.createElement('button');
    quickAction.className = 'block-quick-action';
    quickAction.textContent = '🚀 Process Policy PDFs';
    quickAction.style.cssText = `
        margin-top: 12px;
        padding: 12px 20px;
        background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
        color: white;
        border: none;
        border-radius: var(--radius-md);
        font-weight: 600;
        cursor: pointer;
        width: 100%;
        font-size: 14px;
    `;
    quickAction.addEventListener('click', () => {
        processPolicyPDFs();
        quickAction.remove();
    });
    
    const lastMessage = messagesContainer.lastElementChild;
    if (lastMessage && lastMessage.querySelector('.message-bubble')) {
        lastMessage.querySelector('.message-bubble').appendChild(quickAction);
    }
}

function updatePolicyInsights(results, stats) {
    const successful = results.filter(r => r.success);
    let html = `
        <div style="padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 8px; margin-bottom: 8px;">
            <p><strong>✓ Processed Policies:</strong> ${successful.length}</p>
        </div>
        ${successful.map(r => `<p>• ${r.product} → ${r.productKey}</p>`).join('')}
    `;
    
    if (stats) {
        html += `
            <div style="margin-top: 12px; padding: 12px; background: rgba(79, 70, 229, 0.1); border-radius: 8px;">
                <p><strong>Taxonomy Stats:</strong></p>
                <p>• Total lines: ~${stats.total_lines || 'N/A'}</p>
                <p>• Conditions: ${stats.total_conditions}</p>
                <p>• Benefits: ${stats.total_benefits}</p>
            </div>
        `;
    }
    
    html += `<p style="margin-top: 12px; font-size: 12px; color: var(--text-secondary);">
        Policies mapped to taxonomy and ready for queries
    </p>`;
    
    excerptContent.innerHTML = html;
}

function showBlockQuickAction(blockNumber, query) {
    const quickAction = document.createElement('button');
    quickAction.className = 'block-quick-action';
    quickAction.textContent = `Try ${query}`;
    quickAction.style.cssText = `
        margin-top: 12px;
        padding: 10px 16px;
        background: var(--primary);
        color: white;
        border: none;
        border-radius: var(--radius-md);
        font-weight: 500;
        cursor: pointer;
        width: 100%;
    `;
    quickAction.addEventListener('click', () => {
        if (blockNumber === '3') {
            fileInput.click();
        } else {
            sendMessageWithText(query);
        }
        quickAction.remove();
    });
    
    const lastMessage = messagesContainer.lastElementChild;
    if (lastMessage && lastMessage.querySelector('.message-bubble')) {
        lastMessage.querySelector('.message-bubble').appendChild(quickAction);
    }
}

function sendMessageWithText(text) {
    messageInput.value = text;
    sendMessage();
}

// Enhanced Send Message
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;
    
    // Add user message to UI
    addMessage(message, 'user');
    messageInput.value = '';
    
    // Hide quick replies
    quickReplies.innerHTML = '';
    
    // Show typing indicator
    showTypingIndicator();
    updateAvatarStatus('Thinking...');
    animateAvatar();
    
    try {
        const response = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                session_id: sessionId,
                message: message
            })
        });
        
        const data = await response.json();
        
        // Store session ID
        if (!sessionId) {
            sessionId = data.session_id;
        }
        
        // Hide typing indicator
        hideTypingIndicator();
        updateAvatarStatus(getStatusForStep(data.step));
        
        // Add assistant response
        addMessage(data.response, 'assistant');
        
        // Text-to-Speech
        if (data.response) {
            speakText(data.response);
        }
        
        // Update insights panel
        updateInsightsPanel(data);
        
        // Update career prediction
        updateCareerPrediction(data);
        
        // Show quick replies
        showQuickReplies(data.step);
        
        // Handle actions
        if (data.requires_action === 'confirm_binding') {
            showActionButton('confirm');
        } else if (data.requires_action === 'payment') {
            showActionButton('payment');
        } else {
            hideActionButtons();
        }
        
        // Update data if provided
        if (data.data) {
            if (data.data.policy_number) {
                addMessage(`Policy Number: ${data.data.policy_number}`, 'assistant');
                // Earn rewards for purchase
                earnRewards(50);
            }
            if (data.data.emergency_card) {
                addMessage(`Emergency: ${data.data.emergency_card}`, 'assistant');
            }
        }
        
    } catch (error) {
        console.error('Error:', error);
        hideTypingIndicator();
        addMessage("I'm having trouble connecting. Please try again.", 'assistant');
        updateAvatarStatus('Error');
    }
}

// Add Message
// Helper function to smoothly scroll to bottom of messages
function scrollToBottom(smooth = true) {
    if (smooth) {
        messagesContainer.scrollTo({
            top: messagesContainer.scrollHeight,
            behavior: 'smooth'
        });
    } else {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function addMessage(text, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    // Format message with line breaks
    const formattedText = text.replace(/\n/g, '<br>');
    content.innerHTML = formattedText;
    
    // Check if this is an assistant message about payment
    if (type === 'assistant' && (
        text.toLowerCase().includes('pay') ||
        text.toLowerCase().includes('purchase') ||
        text.toLowerCase().includes('buy') ||
        text.toLowerCase().includes('payment') ||
        text.toLowerCase().includes('proceed to checkout')
    )) {
        // Add payment button to assistant messages about payment
        const paymentButton = document.createElement('button');
        paymentButton.className = 'payment-trigger-btn';
        paymentButton.innerHTML = '💳 Proceed to Payment';
        paymentButton.style.cssText = `
            background: linear-gradient(135deg, var(--primary), var(--primary-dark));
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            margin-top: 12px;
            cursor: pointer;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.3s;
        `;
        
        paymentButton.addEventListener('click', () => {
            // Extract payment details from the conversation context
            const paymentDetails = {
                destination: 'Japan', // You can make this dynamic based on chat context
                coverage: 'Comprehensive Travel Insurance',
                duration: '7 days',
                travelers: '1 Adult',
                amount: 'SGD $89.00'
            };
            triggerPayment(paymentDetails);
        });
        
        paymentButton.addEventListener('mouseenter', () => {
            paymentButton.style.transform = 'translateY(-2px)';
            paymentButton.style.boxShadow = 'var(--shadow-lg)';
        });
        
        paymentButton.addEventListener('mouseleave', () => {
            paymentButton.style.transform = 'translateY(0)';
            paymentButton.style.boxShadow = 'none';
        });
        
        content.appendChild(paymentButton);
    }
    
    bubble.appendChild(content);
    messageDiv.appendChild(bubble);
    messagesContainer.appendChild(messageDiv);
    
    // Scroll to bottom smoothly after DOM update
    requestAnimationFrame(() => {
        scrollToBottom(true);
    });
}

// Typing Indicator
function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant typing-indicator';
    typingDiv.id = 'typingIndicator';
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    
    const dots = document.createElement('div');
    dots.style.display = 'flex';
    dots.style.gap = '4px';
    dots.style.padding = '8px';
    
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.style.width = '8px';
        dot.style.height = '8px';
        dot.style.background = 'var(--text-secondary)';
        dot.style.borderRadius = '50%';
        dot.style.animation = `typing 1.4s infinite`;
        dot.style.animationDelay = `${i * 0.2}s`;
        dots.appendChild(dot);
    }
    
    bubble.appendChild(dots);
    typingDiv.appendChild(bubble);
    messagesContainer.appendChild(typingDiv);
    requestAnimationFrame(() => {
        scrollToBottom(true);
    });
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

// Action Buttons
function showActionButton(action) {
    actionButtons.style.display = 'flex';
    confirmButton.style.display = action === 'confirm' ? 'block' : 'none';
    paymentButton.style.display = action === 'payment' ? 'block' : 'none';
}

function hideActionButtons() {
    actionButtons.style.display = 'none';
}

async function handleConfirm() {
    if (!sessionId) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/session/${sessionId}/confirm`, {
            method: 'POST'
        });
        
        const data = await response.json();
        hideActionButtons();
        updateAvatarStatus(getStatusForStep(data.step));
        
        messageInput.value = "yes confirm";
        sendMessage();
        
    } catch (error) {
        console.error('Error confirming:', error);
    }
}

async function handlePayment() {
    if (!sessionId) return;
    
    try {
        // Send payment request - backend will use fake credentials automatically
        const response = await fetch(`${API_BASE}/api/session/${sessionId}/payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // No payment_details sent - backend will use fake ones
            })
        });
        
        const data = await response.json();
        hideActionButtons();
        updateAvatarStatus('Coverage Active');
        
        if (data.status === 'paid') {
            messageInput.value = "payment complete";
            await sendMessage();
            
            if (data.policy_number) {
                setTimeout(() => {
                    addMessage(`Policy Number: ${data.policy_number}`, 'assistant');
                }, 500);
            }
            
            // Earn rewards
            earnRewards(100);
        } else {
            addMessage('Payment processed successfully! Your policy is now active.', 'assistant');
        }
        
    } catch (error) {
        console.error('Error processing payment:', error);
        addMessage('Payment processing failed. Please try again.', 'assistant');
    }
}

// File Upload
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    fileName.textContent = file.name;
    addMessage(`Uploading ${file.name}...`, 'user');
    updateAvatarStatus('Processing document...');
    animateAvatar();

    const formData = new FormData();
    formData.append('document', file);

    try {
        const response = await fetch(`${API_BASE}/api/upload-document`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            const profile = data.travel_profile;
            const quotation = data.quotation;
            
            addMessage(
                `✅ Document processed! I found:\n` +
                `📍 Destination: ${profile.destination?.country || 'N/A'}\n` +
                `📅 Dates: ${profile.trip_dates?.start} to ${profile.trip_dates?.end}\n` +
                `👥 Travellers: ${profile.travellers?.length || 0}\n` +
                `💰 Instant quote generated!`,
                'assistant'
            );

            if (quotation && quotation.plans) {
                displayQuotation(quotation);
            }

            if (data.claims_intelligence) {
                displayClaimsIntelligence(data.claims_intelligence, data.tier_recommendation);
                updateStatsPanel(data.claims_intelligence);
            }
            
            // Earn rewards for uploading
            earnRewards(25);
        } else {
            addMessage('Sorry, I couldn\'t extract trip information from that document. Could you describe your trip instead?', 'assistant');
        }
    } catch (error) {
        console.error('Upload error:', error);
        addMessage('Error processing document. Please try again or describe your trip.', 'assistant');
    }

    fileInput.value = '';
    fileName.textContent = '';
}

// Display Quotation
function displayQuotation(quotation) {
    let html = '<div class="quotation-section"><h4>Available Plans</h4>';
    
    quotation.plans.forEach(plan => {
        html += `
            <div class="plan-card">
                <h5>${plan.name}</h5>
                <div class="plan-price">SGD ${plan.price}</div>
                <div class="plan-coverage">
                    <strong>Coverage:</strong>
                    <ul>
                        ${Object.entries(plan.coverage).map(([key, value]) => 
                            `<li>${key.replace(/_/g, ' ').toUpperCase()}: ${value}</li>`
                        ).join('')}
                    </ul>
                </div>
                <div class="plan-features">
                    <strong>Features:</strong> ${plan.features.join(', ')}
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    messageDiv.innerHTML = `<div class="message-bubble"><div class="message-content">${html}</div></div>`;
    messagesContainer.appendChild(messageDiv);
    requestAnimationFrame(() => {
        scrollToBottom(true);
    });
}

// Display Claims Intelligence
function displayClaimsIntelligence(intelligence, recommendation) {
    const html = `
        <div class="claims-intel">
            <h4>📊 Claims Intelligence</h4>
            <p><strong>Risk Level:</strong> ${intelligence.risk_level}</p>
            <p><strong>Average Claim:</strong> SGD ${intelligence.avg_claim_amount}</p>
            ${recommendation ? `<p><strong>Recommended Tier:</strong> ${recommendation.recommended_tier}</p>` : ''}
            ${recommendation ? `<p><strong>Rationale:</strong> ${recommendation.rationale}</p>` : ''}
        </div>
    `;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    messageDiv.innerHTML = `<div class="message-bubble"><div class="message-content">${html}</div></div>`;
    messagesContainer.appendChild(messageDiv);
    requestAnimationFrame(() => {
        scrollToBottom(true);
    });
}

// Avatar Functions
function updateAvatarStatus(status) {
    avatarStatus.textContent = status;
}

function animateAvatar() {
    const avatar = document.querySelector('.avatar-placeholder');
    avatar.style.animation = 'pulse 0.5s ease-in-out';
    setTimeout(() => {
        avatar.style.animation = 'pulse 2s ease-in-out infinite';
    }, 500);
}

function getStatusForStep(step) {
    const statusMap = {
        'trip_intake': 'Listening...',
        'persona_classification': 'Analyzing...',
        'plan_recommendation': 'Finding plans...',
        'add_ons': 'Suggesting add-ons...',
        'coverage_gap': 'Checking coverage...',
        'bind_check': 'Confirming details...',
        'payment': 'Processing payment...',
        'post_purchase': 'Coverage Active'
    };
    return statusMap[step] || 'Listening...';
}

// Initialize Speech Recognition
function initializeSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        
        recognition.onstart = () => {
            isListening = true;
            if (micButton) {
                micButton.classList.add('listening');
                micButton.querySelector('.mic-icon').textContent = '🔴';
            }
            updateAvatarStatus('Listening...');
        };
        
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            messageInput.value = transcript;
            isListening = false;
            if (micButton) {
                micButton.classList.remove('listening');
                micButton.querySelector('.mic-icon').textContent = '🎤';
            }
            updateAvatarStatus('Ready');
        };
        
        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            isListening = false;
            if (micButton) {
                micButton.classList.remove('listening');
                micButton.querySelector('.mic-icon').textContent = '🎤';
            }
            updateAvatarStatus('Speech recognition error');
        };
        
        recognition.onend = () => {
            isListening = false;
            if (micButton) {
                micButton.classList.remove('listening');
                micButton.querySelector('.mic-icon').textContent = '🎤';
            }
            if (!isSpeaking) {
                updateAvatarStatus('Ready');
            }
        };
    } else {
        // Browser doesn't support speech recognition
        if (micButton) {
            micButton.style.display = 'none';
        }
        console.warn('Speech recognition not supported in this browser');
    }
}

// Toggle Speech Recognition
function toggleSpeechRecognition() {
    if (!recognition) return;
    
    if (isListening) {
        recognition.stop();
    } else {
        try {
            recognition.start();
        } catch (error) {
            console.error('Error starting speech recognition:', error);
        }
    }
}

// Change Avatar Emoji
function changeAvatarEmoji(emoji) {
    if (avatarEmoji) {
        avatarEmoji.textContent = emoji;
        localStorage.setItem('tripkaki_avatar_emoji', emoji);
    }
}

// Text-to-Speech with Lip Sync
function speakText(text) {
    if (!text) return;
    
    // Use browser TTS
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.9;
        utterance.pitch = 1.1;
        utterance.volume = 0.8;
        
        // Start lip sync animation
        startLipSync();
        isSpeaking = true;
        
        utterance.onstart = () => {
            isSpeaking = true;
            updateAvatarStatus('Speaking...');
        };
        
        utterance.onend = () => {
            isSpeaking = false;
            stopLipSync();
            updateAvatarStatus('Ready');
        };
        
        utterance.onerror = () => {
            isSpeaking = false;
            stopLipSync();
            updateAvatarStatus('Ready');
        };
        
        speechSynthesis.speak(utterance);
    } else {
        // Fallback if speech synthesis not available
        stopLipSync();
    }
}

// Lip Sync Animation - Makes emoji appear to talk
function startLipSync() {
    if (!avatarEmoji) return;
    
    // Remove any existing animation
    stopLipSync();
    
    // Add speaking class to emoji for CSS animation
    avatarEmoji.classList.add('speaking');
    
    // Create more dynamic talking effect with random variations
    lipSyncInterval = setInterval(() => {
        if (avatarEmoji && isSpeaking) {
            // Create subtle random variations to make it more dynamic
            const randomScale = 0.98 + Math.random() * 0.04; // Between 0.98 and 1.02
            const randomY = -50 + (Math.random() - 0.5) * 2; // Slight vertical movement
            
            // Apply dynamic transform for more natural talking effect
            avatarEmoji.style.transform = `translate(-50%, ${randomY}%) scale(${randomScale})`;
        }
    }, 150);
}

function stopLipSync() {
    if (avatarEmoji) {
        avatarEmoji.classList.remove('speaking');
        avatarEmoji.style.transform = 'translate(-50%, -50%) scale(1)';
    }
    
    if (lipSyncInterval) {
        clearInterval(lipSyncInterval);
        lipSyncInterval = null;
    }
}

// Quick Replies
function showQuickReplies(step) {
    const replies = {
        'trip_intake': ['2 travelers', 'December 15-20', 'Japan'],
        'plan_recommendation': ['Show me details', 'Compare plans', 'I like this one'],
        'add_ons': ['Yes, add it', 'No thanks', 'Tell me more'],
        'coverage_gap': ['That\'s fine', 'I need more coverage', 'Show exclusions'],
        'bind_check': ['Yes, correct', 'Let me check'],
        'payment': ['Proceed to payment', 'I need help']
    };
    
    const stepReplies = replies[step] || [];
    quickReplies.innerHTML = '';
    
    stepReplies.forEach(reply => {
        const btn = document.createElement('button');
        btn.className = 'quick-reply';
        btn.textContent = reply;
        btn.addEventListener('click', () => {
            messageInput.value = reply;
            sendMessage();
        });
        quickReplies.appendChild(btn);
    });
}

// Insights Panel Updates
function updateInsightsPanel(data) {
    // Update policy excerpts
    if (data.data?.policy_excerpts) {
        excerptContent.innerHTML = data.data.policy_excerpts.map(excerpt => 
            `<p><strong>${excerpt.title}:</strong> ${excerpt.text}</p>`
        ).join('');
    }
    
    // Update stats
    if (data.data?.statistics) {
        statsContent.innerHTML = `
            <p><strong>Claims Frequency:</strong> ${data.data.statistics.frequency}%</p>
            <p><strong>Average Claim:</strong> SGD ${data.data.statistics.avg_claim}</p>
        `;
    }
    
    // Update timeline
    if (data.data?.timeline) {
        timelineContent.innerHTML = data.data.timeline.map(event => 
            `<p><strong>${event.date}:</strong> ${event.description}</p>`
        ).join('');
    }
}

function updateStatsPanel(claimsIntel) {
    if (claimsIntel) {
        statsContent.innerHTML = `
            <div style="padding: 12px; background: rgba(79, 70, 229, 0.05); border-radius: 8px; margin-bottom: 8px;">
                <p><strong>Risk Level:</strong> <span style="color: var(--${claimsIntel.risk_level === 'high' ? 'error' : claimsIntel.risk_level === 'medium' ? 'warning' : 'success'});">${claimsIntel.risk_level.toUpperCase()}</span></p>
            </div>
            <p><strong>Claim Frequency:</strong> ${(claimsIntel.claim_frequency * 100).toFixed(1)}%</p>
            <p><strong>Average Claim:</strong> SGD ${claimsIntel.avg_claim_amount}</p>
            ${claimsIntel.top_claim_causes?.length > 0 ? `<p><strong>Top Causes:</strong> ${claimsIntel.top_claim_causes.join(', ')}</p>` : ''}
        `;
    }
}

// Career Prediction
function updateCareerPrediction(data) {
    if (data.persona) {
        const predictions = {
            'Adventurous Explorer': '🎒 You\'re an adventure seeker! You value experiences and are willing to take calculated risks. Consider roles in outdoor tourism, adventure sports, or expedition planning.',
            'Family Guardian': '👨‍👩‍👧‍👦 You prioritize safety and protection. Perfect for roles in family services, healthcare coordination, or child safety advocacy.',
            'Business Nomad': '💼 You\'re organized and schedule-focused. Great fit for project management, business consulting, or logistics coordination.',
            'Chill Voyager': '🏖️ You appreciate relaxation and low-stress experiences. Consider hospitality management, wellness coaching, or travel blogging.',
            'Romantic Escaper': '💑 You value connection and memorable moments. Perfect for event planning, relationship counseling, or luxury travel services.',
            'Cultural Explorer': '🏛️ You\'re curious and appreciate diversity. Great for roles in cultural exchange programs, museum curation, or international education.'
        };
        
        careerContent.innerHTML = `<p class="career-text">${predictions[data.persona] || 'Complete more trips to see your traveler type!'}</p>`;
    }
}

// Wallet Functions
function updateWallet() {
    walletAmount.textContent = `${walletBalance} MSIG`;
    const balanceAmount = walletBalanceEl.querySelector('.balance-amount');
    if (balanceAmount) {
        balanceAmount.textContent = walletBalance;
    }
}

function earnRewards(amount) {
    walletBalance += amount;
    updateWallet();
    
    // Show notification
    showNotification(`+${amount} MSIG Tokens earned!`);
    
    // Animate wallet
    walletBalanceEl.style.animation = 'pulse 0.5s ease-in-out';
    setTimeout(() => {
        walletBalanceEl.style.animation = '';
    }, 500);
}

function showRedeemOptions() {
    alert(`Redeem ${walletBalance} MSIG Tokens for:\n- Discount vouchers\n- Travel accessories\n- Premium features\n\n(Coming soon!)`);
}

// Crisis Mode Toggle
function toggleCrisisMode() {
    isCrisisMode = !isCrisisMode;
    modeIndicator.classList.toggle('crisis', isCrisisMode);
    modeText.textContent = isCrisisMode ? 'Crisis Mode' : 'Normal Mode';
    
    if (isCrisisMode) {
        addMessage('🚨 Crisis mode activated. I\'m prioritizing emergency assistance and faster response times.', 'assistant');
    }
}

// Notification System
function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 24px;
        background: var(--success);
        color: white;
        padding: 16px 24px;
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        z-index: 1000;
        animation: slideInRight 0.3s ease-out;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes typing {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.7; }
        30% { transform: translateY(-10px); opacity: 1; }
    }
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Mobile menu toggle (if needed)
function toggleMobileMenu() {
    document.querySelector('.left-panel').classList.toggle('active');
    document.querySelector('.right-panel').classList.toggle('active');
}

<<<<<<< Updated upstream
// Mute Functions
function toggleMute() {
    isMuted = !isMuted;
    localStorage.setItem('tripkaki_muted', isMuted);
    updateMuteButton();
    
    // Stop any current speech if muting
    if (isMuted && isSpeaking) {
        if (ttsAudio) {
            ttsAudio.pause();
            ttsAudio.currentTime = 0;
        }
    }
}

function updateMuteButton() {
    if (voiceMuteBtn && muteIcon) {
        if (isMuted) {
            muteIcon.textContent = '🔇';
            voiceMuteBtn.classList.add('muted');
            voiceMuteBtn.title = 'Click to unmute voice';
        } else {
            muteIcon.textContent = '🔊';
            voiceMuteBtn.classList.remove('muted');
            voiceMuteBtn.title = 'Click to mute voice';
        }
    }
}

// Voice Selection Functions
function selectVoice(voiceType) {
    // Update visual selection
    document.querySelectorAll('.voice-option').forEach(option => {
        option.classList.remove('active');
        if (option.dataset.voice === voiceType) {
            option.classList.add('active');
        }
    });
    
    // Update current voice display
    const currentVoiceName = document.getElementById('currentVoiceName');
    if (currentVoiceName) {
        const voiceNames = {
            'singaporean': 'Singaporean',
            'professional': 'Professional',
            'casual': 'Casual',
            'energetic': 'Energetic'
        };
        currentVoiceName.textContent = voiceNames[voiceType] || 'Singaporean';
    }
    
    // Save to localStorage
    localStorage.setItem('tripkaki_voice', voiceType);
    
    // Show notification
    showNotification(`Voice changed to ${voiceType}!`);
}

let currentRating = 0;

function initVoiceRating() {
    currentRating = 0;
    document.querySelectorAll('.star').forEach(star => {
        star.classList.remove('active');
    });
    const ratingValue = document.getElementById('ratingValue');
    if (ratingValue) {
        ratingValue.textContent = '';
    }
}

function setRating(rating) {
    currentRating = rating;
    const stars = document.querySelectorAll('.star');
    stars.forEach((star, index) => {
        if (index < rating) {
            star.classList.add('active');
        } else {
            star.classList.remove('active');
        }
    });
    
    const ratingValue = document.getElementById('ratingValue');
    if (ratingValue) {
        const ratings = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
        ratingValue.textContent = `Your rating: ${ratings[rating] || ''}`;
    }
}

function handleVoiceReview() {
    const feedback = document.getElementById('voiceFeedback').value;
    
    if (currentRating === 0) {
        alert('Please select a rating before submitting.');
        return;
    }
    
    // Show thank you message
    showNotification(`Thank you for your ${currentRating}-star review!`);
    
    // Here you could send to backend
    console.log('Voice review submitted:', {
        rating: currentRating,
        feedback: feedback
    });
    
    // Close modal
    document.getElementById('voiceReviewModalOverlay').style.display = 'none';
    
    // Clear form
    initVoiceRating();
    document.getElementById('voiceFeedback').value = '';
}

// Show initial travel insurance quick replies
function showInitialQuickReplies() {
    const initialReplies = [
        '🇯🇵 I need travel insurance for Japan',
        '📋 What does travel insurance cover?',  
        '💰 How much does insurance cost?',
        '🛒 I want to buy insurance now'
    ];
    
    quickReplies.innerHTML = '';
    
    initialReplies.forEach(reply => {
        const btn = document.createElement('button');
        btn.className = 'quick-reply';
        btn.textContent = reply;
        btn.addEventListener('click', () => {
            messageInput.value = reply;
            sendMessage();
        });
        quickReplies.appendChild(btn);
    });
}

// Show initial quick replies when page loads
setTimeout(() => {
    if (quickReplies && quickReplies.children.length === 0) {
        showInitialQuickReplies();
    }
}, 1000);

=======
>>>>>>> Stashed changes
// Initialize wallet balance
updateWallet();

// ===============================================
// PAYMENT & RECEIPT FUNCTIONALITY
// ===============================================

// Payment Modal Elements
const paymentModalOverlay = document.getElementById('paymentModalOverlay');
const closePaymentModal = document.getElementById('closePaymentModal');
const cancelPayment = document.getElementById('cancelPayment');
const processPayment = document.getElementById('processPayment');

// Receipt Modal Elements
const receiptModalOverlay = document.getElementById('receiptModalOverlay');
const closeReceiptModal = document.getElementById('closeReceiptModal');
const closeReceiptBtn = document.getElementById('closeReceiptBtn');
const downloadReceipt = document.getElementById('downloadReceipt');
const emailReceipt = document.getElementById('emailReceipt');

// Payment Form Elements
const cardNumber = document.getElementById('cardNumber');
const expiryDate = document.getElementById('expiryDate');
const cvv = document.getElementById('cvv');
const cardholderName = document.getElementById('cardholderName');
const billingEmail = document.getElementById('billingEmail');

// Payment Data
let currentPaymentData = {
    destination: 'Japan',
    coverage: 'Comprehensive Travel Insurance',
    duration: '7 days',
    travelers: '1 Adult',
    amount: 'SGD $89.00'
};

// Show Payment Modal Function
async function showPaymentModal(paymentData = null) {
    if (paymentData) {
        currentPaymentData = { ...currentPaymentData, ...paymentData };
        
        // Update payment summary
        document.getElementById('paymentDestination').textContent = currentPaymentData.destination;
        document.getElementById('paymentCoverage').textContent = currentPaymentData.coverage;
        document.getElementById('paymentDuration').textContent = currentPaymentData.duration;
        document.getElementById('paymentTravelers').textContent = currentPaymentData.travelers;
        document.getElementById('paymentAmount').textContent = currentPaymentData.amount;
        
        // Update payment button
        processPayment.querySelector('.btn-text').textContent = `Pay ${currentPaymentData.amount}`;
    }
    
    paymentModalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    // Initialize Stripe Elements if not already done
    try {
        const amountText = document.getElementById('paymentAmount').textContent;
        const amount = parseFloat(amountText.replace(/[^\d.]/g, '')) || 89.00;
        
        // Create payment intent
        const intentResponse = await fetch(`${API_BASE}/api/create-payment-intent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amount,
                currency: 'sgd',
                session_id: sessionId
            })
        });
        
        const intentData = await intentResponse.json();
        
        if (intentData.clientSecret) {
            // Create Stripe Elements
            if (!elements) {
                elements = stripe.elements({
                    clientSecret: intentData.clientSecret
                });
            } else {
                // Update client secret if elements already exist
                elements.update({ clientSecret: intentData.clientSecret });
            }
            
            // Create and mount payment element
            const container = document.getElementById('payment-element-container');
            if (container && !paymentElement) {
                paymentElement = elements.create('payment');
                paymentElement.mount('#payment-element-container');
            } else if (paymentElement && intentData.clientSecret) {
                // Update existing element with new client secret
                elements.update({ clientSecret: intentData.clientSecret });
            }
        }
    } catch (error) {
        console.error('Error initializing Stripe Elements:', error);
        // Fallback to manual form if Stripe fails
    }
}

// Hide Payment Modal Function
function hidePaymentModal() {
    paymentModalOverlay.style.display = 'none';
    document.body.style.overflow = 'auto';
    
    // Reset form
    document.getElementById('paymentForm').reset();
    processPayment.disabled = false;
    processPayment.querySelector('.btn-text').style.display = 'inline';
    processPayment.querySelector('.btn-loading').style.display = 'none';
}

// Show Receipt Modal Function
function showReceiptModal() {
    const now = new Date();
    const receiptNumber = Math.floor(Math.random() * 900000) + 100000;
    const policyNumber = `MSIG-${currentPaymentData.destination.substring(0,2).toUpperCase()}-${receiptNumber}`;
    const transactionId = `TXN-${receiptNumber}-${Math.floor(Math.random() * 1000)}`;
    
    // Update receipt details
    document.getElementById('receiptNumber').textContent = receiptNumber;
    document.getElementById('receiptDate').textContent = now.toLocaleString();
    document.getElementById('receiptPolicyNumber').textContent = policyNumber;
    document.getElementById('receiptDestination').textContent = currentPaymentData.destination;
    document.getElementById('receiptCoverage').textContent = currentPaymentData.coverage;
    document.getElementById('receiptPeriod').textContent = currentPaymentData.duration;
    document.getElementById('receiptTransactionId').textContent = transactionId;
    document.getElementById('receiptEmail').textContent = billingEmail.value;
    
    // Update card details (last 4 digits)
    const cardNum = cardNumber.value.replace(/\s/g, '');
    const last4 = cardNum.slice(-4);
    document.getElementById('receiptCardLast4').textContent = last4;
    
    receiptModalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

// Hide Receipt Modal Function
function hideReceiptModal() {
    receiptModalOverlay.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Format Card Number Input
function formatCardNumber(input) {
    let value = input.replace(/\D/g, '');
    value = value.replace(/(\d{4})(?=\d)/g, '$1 ');
    return value;
}

// Format Expiry Date Input
function formatExpiryDate(input) {
    let value = input.replace(/\D/g, '');
    if (value.length >= 2) {
        value = value.substring(0, 2) + '/' + value.substring(2, 4);
    }
    return value;
}

// Validate Payment Form
function validatePaymentForm() {
    const cardNum = cardNumber.value.replace(/\s/g, '');
    const expiry = expiryDate.value;
    const cvvValue = cvv.value;
    const name = cardholderName.value.trim();
    const email = billingEmail.value.trim();
    
    if (cardNum.length < 13 || cardNum.length > 19) return false;
    if (!/^\d{2}\/\d{2}$/.test(expiry)) return false;
    if (cvvValue.length < 3 || cvvValue.length > 4) return false;
    if (name.length < 2) return false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
    
    return true;
}

// Process Payment with Stripe
async function handlePayment() {
    if (!sessionId) {
        alert('Session not found. Please refresh the page.');
        return;
    }
    
    // Show loading state
    processPayment.disabled = true;
    processPayment.querySelector('.btn-text').style.display = 'none';
    processPayment.querySelector('.btn-loading').style.display = 'inline';
    
    try {
        // Check if Stripe Elements is initialized
        if (!elements || !paymentElement) {
            // Fallback: Use the original payment endpoint without Stripe Elements
            const response = await fetch(`${API_BASE}/api/session/${sessionId}/payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Payment endpoint error:', errorText);
                throw new Error('Payment failed. Please try again.');
            }
            
            const data = await response.json();
            
            if (data.status === 'paid') {
                hidePaymentModal();
                showReceiptModal();
                
                // Add success message to chat
                addMessage('TripKaki', `🎉 Payment successful! Your travel insurance policy is now active. Policy Number: ${data.policy_number || 'N/A'}. Have a safe trip!`, 'assistant');
                
                // Earn rewards
                earnRewards(100);
                
                processPayment.disabled = false;
                processPayment.querySelector('.btn-text').style.display = 'inline';
                processPayment.querySelector('.btn-loading').style.display = 'none';
                return;
            } else {
                throw new Error(data.error || 'Payment failed');
            }
        }
        
        // Extract amount from payment summary (remove SGD $ and parse)
        const amountText = document.getElementById('paymentAmount').textContent;
        const amount = parseFloat(amountText.replace(/[^\d.]/g, '')) || 89.00;
        
        // Create payment intent
        const intentResponse = await fetch(`${API_BASE}/api/create-payment-intent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amount,
                currency: 'sgd',
                session_id: sessionId
            })
        });
        
        if (!intentResponse.ok) {
            const errorText = await intentResponse.text();
            console.error('Payment intent error:', errorText);
            throw new Error('Failed to create payment intent. Please try again.');
        }
        
        const intentData = await intentResponse.json();
        
        if (!intentData.clientSecret) {
            throw new Error('Failed to create payment intent');
        }
        
        // Confirm payment with Stripe Payment Element
        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            clientSecret: intentData.clientSecret,
            confirmParams: {
                return_url: window.location.href,
                payment_method_data: {
                    billing_details: {
                        name: document.getElementById('cardholderName')?.value || 'Customer',
                        email: document.getElementById('billingEmail')?.value || 'customer@example.com'
                    }
                }
            },
            redirect: 'if_required'
        });
        
        if (error) {
            throw new Error(error.message);
        }
        
        if (paymentIntent && paymentIntent.status === 'succeeded') {
            // Confirm payment on backend
            const confirmResponse = await fetch(`${API_BASE}/api/confirm-payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    paymentIntentId: paymentIntent.id,
                    sessionId: sessionId
                })
            });
            
            if (!confirmResponse.ok) {
                const errorText = await confirmResponse.text();
                console.error('Confirm payment error:', errorText);
                throw new Error('Payment confirmation failed');
            }
            
            const confirmData = await confirmResponse.json();
            
            if (confirmData.status === 'paid') {
                hidePaymentModal();
                showReceiptModal();
                
                // Add success message to chat
                addMessage('TripKaki', `🎉 Payment successful! Your travel insurance policy is now active. Policy Number: ${confirmData.policy_number || 'N/A'}. Have a safe trip!`, 'assistant');
                
                // Earn rewards
                earnRewards(100);
            } else {
                throw new Error('Payment confirmation failed');
            }
        } else {
            throw new Error('Payment not completed');
        }
    } catch (error) {
        console.error('Payment error:', error);
        alert(`Payment failed: ${error.message}`);
        processPayment.disabled = false;
        processPayment.querySelector('.btn-text').style.display = 'inline';
        processPayment.querySelector('.btn-loading').style.display = 'none';
    }
}

// Download Receipt as PDF
function downloadReceiptPDF() {
    // Show loading state
    downloadReceipt.disabled = true;
    downloadReceipt.innerHTML = '📄 Generating PDF...';
    
    try {
        // Get receipt data
        const receiptNumber = document.getElementById('receiptNumber').textContent;
        const receiptDate = document.getElementById('receiptDate').textContent;
        const policyNumber = document.getElementById('receiptPolicyNumber').textContent;
        const destination = document.getElementById('receiptDestination').textContent;
        const coverage = document.getElementById('receiptCoverage').textContent;
        const period = document.getElementById('receiptPeriod').textContent;
        const transactionId = document.getElementById('receiptTransactionId').textContent;
        const email = document.getElementById('receiptEmail').textContent;
        const cardLast4 = document.getElementById('receiptCardLast4').textContent;
        const customerName = cardholderName.value;
        
        // Create new PDF document
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Set document properties
        doc.setProperties({
            title: `TripKaki Receipt ${receiptNumber}`,
            subject: 'Travel Insurance Receipt',
            author: 'TripKaki',
            keywords: 'travel insurance, receipt, MSIG'
        });
        
        // Colors
        const primaryColor = [79, 70, 229]; // Indigo
        const secondaryColor = [20, 184, 166]; // Teal
        const textColor = [31, 41, 55]; // Gray-800
        const lightColor = [107, 114, 128]; // Gray-500
        
        // Header with logo and company info
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, 210, 40, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text('🛡️ TripKaki Insurance', 20, 25);
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text('MSIG Intelligent Conversational Agent', 20, 32);
        
        // Receipt header
        doc.setTextColor(...textColor);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('E-RECEIPT', 20, 55);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...lightColor);
        doc.text(`Receipt #TK-${receiptNumber}`, 20, 62);
        doc.text(`Date: ${receiptDate}`, 20, 68);
        
        // Customer Information
        let yPos = 85;
        doc.setTextColor(...textColor);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Customer Information', 20, yPos);
        
        yPos += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Name: ${customerName}`, 25, yPos);
        yPos += 6;
        doc.text(`Email: ${email}`, 25, yPos);
        yPos += 6;
        doc.text(`Payment Method: **** **** **** ${cardLast4}`, 25, yPos);
        
        // Policy Information
        yPos += 15;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Policy Information', 20, yPos);
        
        yPos += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Policy Number: ${policyNumber}`, 25, yPos);
        yPos += 6;
        doc.text(`Destination: ${destination}`, 25, yPos);
        yPos += 6;
        doc.text(`Coverage Type: ${coverage}`, 25, yPos);
        yPos += 6;
        doc.text(`Coverage Period: ${period}`, 25, yPos);
        yPos += 6;
        doc.text(`Transaction ID: ${transactionId}`, 25, yPos);
        
        // Payment Summary Box
        yPos += 20;
        doc.setFillColor(248, 250, 255);
        doc.setDrawColor(...primaryColor);
        doc.roundedRect(20, yPos - 5, 170, 35, 3, 3, 'FD');
        
        doc.setTextColor(...primaryColor);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Payment Summary', 25, yPos + 5);
        
        doc.setTextColor(...textColor);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Insurance Premium:', 25, yPos + 12);
        doc.text('SGD $79.00', 160, yPos + 12, { align: 'right' });
        
        doc.text('Service Fee:', 25, yPos + 18);
        doc.text('SGD $5.00', 160, yPos + 18, { align: 'right' });
        
        doc.text('GST (8%):', 25, yPos + 24);
        doc.text('SGD $5.00', 160, yPos + 24, { align: 'right' });
        
        // Total amount
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('TOTAL PAID:', 25, yPos + 32);
        doc.text('SGD $89.00', 160, yPos + 32, { align: 'right' });
        
        // Important Information
        yPos += 50;
        doc.setTextColor(...primaryColor);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Important Information', 20, yPos);
        
        yPos += 8;
        doc.setTextColor(...textColor);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        
        const infoLines = [
            '• Your policy is active immediately upon payment',
            '• Policy documents will be emailed to your registered address',
            '• 24/7 Emergency Assistance: +65 6123 4567',
            '• Claims Hotline: +65 6789 0123',
            '• Keep this receipt for your records'
        ];
        
        infoLines.forEach(line => {
            doc.text(line, 25, yPos);
            yPos += 5;
        });
        
        // Footer
        yPos = 280;
        doc.setFillColor(...secondaryColor);
        doc.rect(0, yPos, 210, 17, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('TripKaki - Your Trusted Travel Insurance Partner | support@tripkaki.com | www.tripkaki.com', 105, yPos + 10, { align: 'center' });
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `TripKaki-Receipt-${receiptNumber}-${timestamp}.pdf`;
        
        // Save the PDF
        doc.save(filename);
        
        // Reset button state
        downloadReceipt.disabled = false;
        downloadReceipt.innerHTML = '📄 Download PDF';
        
        // Show success message
        setTimeout(() => {
            alert('✅ Receipt downloaded successfully! Check your Downloads folder.');
        }, 500);
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        
        // Reset button state
        downloadReceipt.disabled = false;
        downloadReceipt.innerHTML = '📄 Download PDF';
        
        alert('❌ Error generating PDF. Please try again or take a screenshot of the receipt.');
    }
}

// Email Receipt Function
function emailReceiptToUser() {
    const email = billingEmail.value;
    const receiptNumber = document.getElementById('receiptNumber').textContent;
    
    // Show processing state
    emailReceipt.disabled = true;
    emailReceipt.innerHTML = '📧 Sending...';
    
    // Simulate email sending
    setTimeout(() => {
        // Reset button
        emailReceipt.disabled = false;
        emailReceipt.innerHTML = '📧 Email Receipt';
        
        // Show success message
        alert(`✅ Receipt #TK-${receiptNumber} has been sent to ${email}\n\nPlease check your inbox (and spam folder) for the email receipt with your policy documents.`);
    }, 2000);
}

// Event Listeners for Payment Modal
closePaymentModal.addEventListener('click', hidePaymentModal);
cancelPayment.addEventListener('click', hidePaymentModal);
processPayment.addEventListener('click', handlePayment);

// Event Listeners for Receipt Modal
closeReceiptModal.addEventListener('click', hideReceiptModal);
closeReceiptBtn.addEventListener('click', hideReceiptModal);
downloadReceipt.addEventListener('click', downloadReceiptPDF);
emailReceipt.addEventListener('click', emailReceiptToUser);

// Form Input Formatting
cardNumber.addEventListener('input', (e) => {
    e.target.value = formatCardNumber(e.target.value);
});

expiryDate.addEventListener('input', (e) => {
    e.target.value = formatExpiryDate(e.target.value);
});

cvv.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
});

// Close modals when clicking outside
paymentModalOverlay.addEventListener('click', (e) => {
    if (e.target === paymentModalOverlay) {
        hidePaymentModal();
    }
});

receiptModalOverlay.addEventListener('click', (e) => {
    if (e.target === receiptModalOverlay) {
        hideReceiptModal();
    }
});

// Function to trigger payment from chat
function triggerPayment(paymentDetails = null) {
    showPaymentModal(paymentDetails);
}

// Make payment function available globally
window.triggerPayment = triggerPayment;
