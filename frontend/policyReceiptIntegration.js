/**
 * LEA Insurance - E-Policy Receipt Integration
 * 
 * This script handles automatic display of e-policy receipts in the chat
 * after successful payment completion. It periodically checks for receipt
 * notifications and displays them in the conversational interface.
 */

class PolicyReceiptManager {
    constructor(apiBaseUrl = 'http://localhost:3001', pollInterval = 5000) {
        this.apiBaseUrl = apiBaseUrl;
        this.pollInterval = pollInterval;
        this.isPolling = false;
        this.currentUserId = null;
        this.displayedReceipts = new Set();
        
        // Bind methods
        this.checkForReceipts = this.checkForReceipts.bind(this);
        this.displayPolicyReceipt = this.displayPolicyReceipt.bind(this);
    }

    /**
     * Initialize receipt monitoring for a user
     */
    startMonitoring(userId) {
        this.currentUserId = userId;
        if (!this.isPolling) {
            this.isPolling = true;
            this.pollForReceipts();
        }
    }

    /**
     * Stop monitoring for receipts
     */
    stopMonitoring() {
        this.isPolling = false;
        this.currentUserId = null;
    }

    /**
     * Periodically check for new policy receipt notifications
     */
    async pollForReceipts() {
        if (!this.isPolling || !this.currentUserId) return;

        try {
            await this.checkForReceipts();
        } catch (error) {
            console.error('Receipt polling error:', error);
        }

        // Continue polling if still active
        if (this.isPolling) {
            setTimeout(this.pollForReceipts, this.pollInterval);
        }
    }

    /**
     * Check for pending receipt notifications
     */
    async checkForReceipts() {
        if (!this.currentUserId) return;

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/notifications/receipts/${this.currentUserId}`);
            
            if (response.ok) {
                const notifications = await response.json();
                
                for (const notification of notifications) {
                    if (notification.type === 'policy_receipt' && 
                        notification.status === 'pending' && 
                        !this.displayedReceipts.has(notification.policy_id)) {
                        
                        await this.displayPolicyReceipt(notification);
                        this.displayedReceipts.add(notification.policy_id);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to check for receipts:', error);
        }
    }

    /**
     * Display the e-policy receipt in chat
     */
    async displayPolicyReceipt(notification) {
        try {
            // Call MCP server to get formatted policy receipt
            const receiptResponse = await this.callMCPServer('get_policy_receipt', {
                user_id: notification.user_id,
                policy_id: notification.policy_id,
                payment_intent_id: notification.payment_intent_id
            });

            if (receiptResponse && receiptResponse.content && receiptResponse.content[0]) {
                const receiptText = receiptResponse.content[0].text;
                
                // Display in chat interface
                this.addChatMessage({
                    sender: 'lea',
                    type: 'policy-receipt',
                    content: receiptText,
                    timestamp: new Date(),
                    metadata: {
                        policy_id: notification.policy_id,
                        payment_intent_id: notification.payment_intent_id
                    }
                });

                // Mark notification as displayed
                await this.markNotificationDisplayed(notification.notification_id);

                // Show celebratory animation
                this.showSuccessAnimation();
            }
        } catch (error) {
            console.error('Failed to display policy receipt:', error);
        }
    }

    /**
     * Call MCP server for policy receipt
     */
    async callMCPServer(tool, args) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/mcp/call-tool`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: tool,
                    arguments: args
                })
            });

            if (response.ok) {
                return await response.json();
            } else {
                throw new Error(`MCP call failed: ${response.status}`);
            }
        } catch (error) {
            console.error('MCP server call error:', error);
            throw error;
        }
    }

    /**
     * Add message to chat interface
     */
    addChatMessage(message) {
        const chatContainer = document.getElementById('chat-messages');
        if (!chatContainer) {
            console.error('Chat container not found');
            return;
        }

        const messageElement = document.createElement('div');
        messageElement.className = 'message lea-message policy-receipt';
        
        // Special styling for policy receipt
        messageElement.innerHTML = `
            <div class="message-header">
                <div class="avatar">🛡️</div>
                <div class="sender-info">
                    <strong>LEA Insurance</strong>
                    <div class="message-type">Policy Certificate</div>
                </div>
                <div class="timestamp">${message.timestamp.toLocaleTimeString()}</div>
            </div>
            <div class="message-content policy-content">
                <pre>${message.content}</pre>
            </div>
            <div class="message-actions">
                <button onclick="window.policyReceiptManager.downloadReceipt('${message.metadata.policy_id}')" 
                        class="btn-download">
                    📄 Download PDF
                </button>
                <button onclick="window.policyReceiptManager.emailReceipt('${message.metadata.policy_id}')" 
                        class="btn-email">
                    📧 Email Copy
                </button>
                <button onclick="window.policyReceiptManager.shareReceipt('${message.metadata.policy_id}')" 
                        class="btn-share">
                    📤 Share
                </button>
            </div>
        `;

        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;

        // Auto-scroll to new message
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    /**
     * Show success animation for policy activation
     */
    showSuccessAnimation() {
        // Create confetti effect
        const confetti = document.createElement('div');
        confetti.className = 'confetti-container';
        confetti.innerHTML = `
            <div class="confetti">🎉</div>
            <div class="confetti">🎊</div>
            <div class="confetti">✨</div>
            <div class="confetti">🛡️</div>
            <div class="confetti">✈️</div>
        `;
        
        document.body.appendChild(confetti);
        
        // Remove after animation
        setTimeout(() => {
            document.body.removeChild(confetti);
        }, 3000);

        // Play success sound (if available)
        this.playSuccessSound();
    }

    /**
     * Play success notification sound
     */
    playSuccessSound() {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+D0u2kjBjGH0fXTgjMGHm7A7+OZURE=');
            audio.volume = 0.3;
            audio.play().catch(e => console.log('Audio play failed:', e));
        } catch (error) {
            // Audio not supported, ignore
        }
    }

    /**
     * Mark notification as displayed
     */
    async markNotificationDisplayed(notificationId) {
        try {
            await fetch(`${this.apiBaseUrl}/api/notifications/${notificationId}/displayed`, {
                method: 'POST'
            });
        } catch (error) {
            console.error('Failed to mark notification as displayed:', error);
        }
    }

    /**
     * Download policy receipt as PDF
     */
    async downloadReceipt(policyId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/policies/${policyId}/receipt.pdf`);
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `LEA_Policy_${policyId}.pdf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Download failed:', error);
            alert('Download temporarily unavailable. Please check your email for the policy document.');
        }
    }

    /**
     * Email policy receipt
     */
    async emailReceipt(policyId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/policies/${policyId}/email`, {
                method: 'POST'
            });
            
            if (response.ok) {
                this.showNotification('📧 Policy receipt sent to your email!', 'success');
            } else {
                throw new Error('Email sending failed');
            }
        } catch (error) {
            console.error('Email sending failed:', error);
            this.showNotification('❌ Failed to send email. Please try again later.', 'error');
        }
    }

    /**
     * Share policy receipt
     */
    shareReceipt(policyId) {
        if (navigator.share) {
            navigator.share({
                title: 'LEA Travel Insurance Policy',
                text: `My travel insurance policy ${policyId} is now active!`,
                url: `${window.location.origin}/policy/${policyId}`
            });
        } else {
            // Fallback: copy to clipboard
            const shareText = `🛡️ I'm now covered for my trip with LEA Travel Insurance! Policy: ${policyId}`;
            navigator.clipboard.writeText(shareText).then(() => {
                this.showNotification('📋 Policy info copied to clipboard!', 'success');
            });
        }
    }

    /**
     * Show notification to user
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 3000);
    }

    /**
     * Manually trigger policy receipt display (for testing or manual triggers)
     */
    async showPolicyReceipt(policyId, paymentIntentId) {
        if (!this.currentUserId) {
            console.error('No user ID set for receipt display');
            return;
        }

        await this.displayPolicyReceipt({
            user_id: this.currentUserId,
            policy_id: policyId,
            payment_intent_id: paymentIntentId,
            type: 'policy_receipt'
        });
    }
}

// Initialize global instance
window.policyReceiptManager = new PolicyReceiptManager();

// Auto-start monitoring when user ID is available
document.addEventListener('DOMContentLoaded', () => {
    // You can set user ID from your existing authentication
    const userId = window.currentUser?.id || localStorage.getItem('lea_user_id');
    if (userId) {
        window.policyReceiptManager.startMonitoring(userId);
    }
});

// CSS Styles for policy receipt display
const styles = `
    .policy-receipt {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: 2px solid #4f46e5;
        border-radius: 12px;
        margin: 16px 0;
        box-shadow: 0 8px 32px rgba(0,0,0,0.1);
    }

    .policy-receipt .message-header {
        background: rgba(255,255,255,0.1);
        padding: 12px 16px;
        border-radius: 10px 10px 0 0;
        backdrop-filter: blur(10px);
    }

    .policy-receipt .message-header .avatar {
        font-size: 24px;
        background: white;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .policy-content {
        background: white;
        padding: 20px;
        border-radius: 0 0 10px 10px;
        font-family: 'Courier New', monospace;
        font-size: 13px;
        line-height: 1.4;
        color: #333;
        white-space: pre-wrap;
        overflow-x: auto;
    }

    .message-actions {
        padding: 12px 16px;
        background: rgba(255,255,255,0.95);
        border-top: 1px solid rgba(0,0,0,0.1);
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }

    .message-actions button {
        background: #4f46e5;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        transition: background 0.2s;
    }

    .message-actions button:hover {
        background: #3730a3;
    }

    .confetti-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 9999;
    }

    .confetti {
        position: absolute;
        font-size: 24px;
        animation: confetti-fall 3s ease-in-out forwards;
    }

    @keyframes confetti-fall {
        0% {
            transform: translateY(-100vh) rotate(0deg);
            opacity: 1;
        }
        100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
        }
    }

    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 16px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slide-in 0.3s ease-out;
    }

    .notification-success {
        background: #059669;
    }

    .notification-error {
        background: #dc2626;
    }

    .notification-info {
        background: #2563eb;
    }

    @keyframes slide-in {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;

// Inject styles
const styleSheet = document.createElement('style');
styleSheet.textContent = styles;
document.head.appendChild(styleSheet);

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PolicyReceiptManager;
}