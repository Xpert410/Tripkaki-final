// Debug script to check if DOM elements are properly loaded
console.log('🔍 LEA Chat Debug Check');
console.log('messagesContainer:', document.getElementById('messages'));
console.log('messageInput:', document.getElementById('messageInput'));
console.log('sendButton:', document.getElementById('sendButton'));

// Test if we can add a message
const messagesContainer = document.getElementById('messages');
if (messagesContainer) {
    console.log('✅ Messages container found');
    
    // Add a test message
    const testMessage = document.createElement('div');
    testMessage.innerHTML = `
        <div style="background: #e3f2fd; padding: 10px; margin: 5px; border-radius: 8px;">
            🧪 <strong>Debug Test:</strong> DOM elements are working! You should be able to type and send messages now.
        </div>
    `;
    messagesContainer.appendChild(testMessage);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
} else {
    console.error('❌ Messages container NOT found');
}

const messageInput = document.getElementById('messageInput');
if (messageInput) {
    console.log('✅ Message input found');
    messageInput.placeholder = "✅ Debug: Input is working! Type here...";
    
    // Force focus on the input
    messageInput.focus();
    
    // Test event listener
    messageInput.addEventListener('input', () => {
        console.log('📝 User is typing:', messageInput.value);
    });
    
} else {
    console.error('❌ Message input NOT found');
}

const sendButton = document.getElementById('sendButton');
if (sendButton) {
    console.log('✅ Send button found');
    
    // Add a test click handler
    sendButton.onclick = function() {
        console.log('🚀 Send button clicked!');
        const message = messageInput ? messageInput.value : 'Test message';
        console.log('Message to send:', message);
        
        if (messagesContainer && message.trim()) {
            const userMessage = document.createElement('div');
            userMessage.innerHTML = `
                <div style="background: #4CAF50; color: white; padding: 10px; margin: 5px; border-radius: 8px; text-align: right;">
                    👤 ${message}
                </div>
            `;
            messagesContainer.appendChild(userMessage);
            
            if (messageInput) messageInput.value = '';
            
            // Simulate LEA response
            setTimeout(() => {
                const botMessage = document.createElement('div');
                botMessage.innerHTML = `
                    <div style="background: #2196F3; color: white; padding: 10px; margin: 5px; border-radius: 8px;">
                        🛡️ LEA: Thanks for your message "${message}". I'm working on connecting to the backend system!
                    </div>
                `;
                messagesContainer.appendChild(botMessage);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 1000);
        }
        
        return false;
    };
} else {
    console.error('❌ Send button NOT found');
}

// Check if the original app.js is loaded
console.log('🔍 Checking if main app functions exist:');
console.log('sendMessage function:', typeof sendMessage !== 'undefined' ? '✅ Found' : '❌ Not found');
console.log('addMessage function:', typeof addMessage !== 'undefined' ? '✅ Found' : '❌ Not found');

// Show a welcome message
if (messagesContainer) {
    const welcomeMsg = document.createElement('div');
    welcomeMsg.innerHTML = `
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; margin: 10px; border-radius: 12px; text-align: center;">
            <h3>🛡️ LEA Insurance Assistant</h3>
            <p>Hello! I'm LEA, your intelligent travel insurance assistant.</p>
            <p><strong>Try typing:</strong> "I need travel insurance for Japan" or "What does travel insurance cover?"</p>
            <small>If you can't type, check the browser console for debug information.</small>
        </div>
    `;
    messagesContainer.appendChild(welcomeMsg);
}