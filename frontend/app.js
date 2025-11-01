// Use relative URLs so it works with the same server
const API_BASE = '';
let sessionId = null;
let walletBalance = 0;
let isCrisisMode = false;

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
const voiceMuteBtn = document.getElementById('voiceMuteBtn');
const muteIcon = document.getElementById('muteIcon');

// Speech Recognition State
let recognition = null;
let isListening = false;
let isSpeaking = false;
let lipSyncInterval = null;
let isMuted = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
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
    
    // Voice Selection handlers
    const voiceSelectBtn = document.getElementById('voiceSelectBtn');
    const voiceModalOverlay = document.getElementById('voiceModalOverlay');
    const closeVoiceModal = document.getElementById('closeVoiceModal');
    const cancelVoiceModal = document.getElementById('cancelVoiceModal');
    
    if (voiceSelectBtn) {
        voiceSelectBtn.addEventListener('click', () => {
            voiceModalOverlay.style.display = 'flex';
        });
    }
    if (closeVoiceModal) {
        closeVoiceModal.addEventListener('click', () => {
            voiceModalOverlay.style.display = 'none';
        });
    }
    if (cancelVoiceModal) {
        cancelVoiceModal.addEventListener('click', () => {
            voiceModalOverlay.style.display = 'none';
        });
    }
    
    // Voice option selection
    document.querySelectorAll('.voice-option').forEach(option => {
        option.addEventListener('click', () => {
            const voiceType = option.dataset.voice;
            selectVoice(voiceType);
            voiceModalOverlay.style.display = 'none';
        });
    });
    
    // Load saved voice
    const savedVoice = localStorage.getItem('tripkaki_voice') || 'singaporean';
    selectVoice(savedVoice);
    
    // Voice Review handlers
    const voiceReviewBtn = document.getElementById('voiceReviewBtn');
    const voiceReviewModalOverlay = document.getElementById('voiceReviewModalOverlay');
    const closeVoiceReviewModal = document.getElementById('closeVoiceReviewModal');
    const cancelVoiceReviewModal = document.getElementById('cancelVoiceReviewModal');
    const submitVoiceReview = document.getElementById('submitVoiceReview');
    
    if (voiceReviewBtn) {
        voiceReviewBtn.addEventListener('click', () => {
            voiceReviewModalOverlay.style.display = 'flex';
            initVoiceRating();
        });
    }
    if (closeVoiceReviewModal) {
        closeVoiceReviewModal.addEventListener('click', () => {
            voiceReviewModalOverlay.style.display = 'none';
        });
    }
    if (cancelVoiceReviewModal) {
        cancelVoiceReviewModal.addEventListener('click', () => {
            voiceReviewModalOverlay.style.display = 'none';
        });
    }
    if (submitVoiceReview) {
        submitVoiceReview.addEventListener('click', handleVoiceReview);
    }
    
    // Star rating
    const stars = document.querySelectorAll('.star');
    stars.forEach(star => {
        star.addEventListener('click', () => {
            const rating = parseInt(star.dataset.rating);
            setRating(rating);
        });
    });
    
    // Mute button
    if (voiceMuteBtn) {
        voiceMuteBtn.addEventListener('click', toggleMute);
    }
    
    // Load saved mute state
    isMuted = localStorage.getItem('tripkaki_muted') === 'true';
    updateMuteButton();
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
                            messagesContainer.scrollTop = messagesContainer.scrollHeight;
                            
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
    
    bubble.appendChild(content);
    messageDiv.appendChild(bubble);
    messagesContainer.appendChild(messageDiv);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
        const response = await fetch(`${API_BASE}/api/session/${sessionId}/payment`, {
            method: 'POST'
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
    // Include session ID if available
    if (sessionId) {
        formData.append('session_id', sessionId);
    }

    try {
        const response = await fetch(`${API_BASE}/api/upload-document`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        // Store session ID if returned
        if (data.session_id && !sessionId) {
            sessionId = data.session_id;
        }

        if (data.success) {
            const profile = data.travel_profile;
            const quotation = data.quotation;
            
            // Display summary message from backend (already handles one-by-one prompts)
            addMessage(
                data.summary_message || 
                `✅ Document processed! I found:\n` +
                `📍 Destination: ${profile.destination?.country || 'N/A'}\n` +
                `📅 Dates: ${profile.trip_dates?.start} to ${profile.trip_dates?.end}\n` +
                `👥 Travellers: ${profile.travellers?.length || 0}\n`,
                'assistant'
            );
            
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
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
    
    // Check if muted
    if (isMuted) {
        return;
    }
    
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

// Initialize wallet balance
updateWallet();
