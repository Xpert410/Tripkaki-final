import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GroqService } from './groqService.js';
import { ConversationManager } from './conversationManager.js';
import { TaxonomyEngine } from './services/taxonomyEngine.js';
import { DocumentProcessor } from './services/documentProcessor.js';
import { MCPTools } from './services/mcpTools.js';
import { ClaimsIntelligence } from './services/claimsIntelligence.js';
import { GroqIntelligence } from './services/groqIntelligence.js';
import { PolicyDatabase } from './services/policyDatabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from frontend directory
app.use(express.static(join(__dirname, '../frontend')));

// Initialize services
const groqService = new GroqService();
const conversationManager = new ConversationManager();
const taxonomyEngine = new TaxonomyEngine();
const documentProcessor = new DocumentProcessor();
const mcpTools = new MCPTools();
const claimsIntelligence = new ClaimsIntelligence();
const groqIntelligence = new GroqIntelligence();
const policyDatabase = new PolicyDatabase();

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// API Routes
// Keep API root endpoint
app.get('/api', (req, res) => {
  res.json({ message: 'TripKaki Travel Insurance Concierge API' });
});

// API endpoints
app.post('/api/chat', async (req, res) => {
  try {
    const { session_id, message } = req.body;
    
    // Get or create session
    const sessionId = session_id || randomUUID();
    conversationManager.getOrCreateSession(sessionId);
    
    // Process message through conversation flow
    const result = await conversationManager.processMessage(
      sessionId,
      message,
      groqService,
      policyDatabase,
      claimsIntelligence
    );
    
    res.json(result);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = conversationManager.getSession(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json(session);
});

app.post('/api/session/:sessionId/confirm', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = conversationManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (session.step !== 'bind_check') {
      return res.status(400).json({ error: 'Not in bind check step' });
    }
    
    // Move to payment step
    session.step = 'payment';
    conversationManager.updateSession(sessionId, session);
    
    res.json({ status: 'confirmed', step: 'payment' });
  } catch (error) {
    console.error('Confirm error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/session/:sessionId/payment', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { quotation_id, plan_id, payment_details, customer_info } = req.body;
    const session = conversationManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (session.step !== 'payment') {
      return res.status(400).json({ error: 'Not in payment step' });
    }
    
    // Use MCP purchase tool
    const purchaseResult = await mcpTools.purchasePolicy(
      quotation_id,
      plan_id,
      payment_details,
      customer_info || session.trip_data
    );
    
    if (purchaseResult.success) {
      session.step = 'post_purchase';
      session.payment_status = 'completed';
      session.policy_number = purchaseResult.policy_number;
      session.policy_data = purchaseResult;
      conversationManager.updateSession(sessionId, session);
      
      res.json({
        status: 'paid',
        policy_number: purchaseResult.policy_number,
        policy_pdf_url: purchaseResult.policy_pdf_url,
        emergency_card_url: purchaseResult.emergency_card_url,
        step: 'post_purchase'
      });
    } else {
      res.status(400).json({ error: 'Payment failed', details: purchaseResult });
    }
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// BLOCK 1: Policy Wording Intelligence
app.post('/api/parse-policy', async (req, res) => {
  try {
    const { pdf_text, product_name } = req.body;
    
    if (!pdf_text) {
      return res.status(400).json({ error: 'PDF text is required' });
    }
    
    const extracted = await taxonomyEngine.parsePolicyDocument(pdf_text);
    const normalized = taxonomyEngine.normalizePolicy(extracted, product_name || 'Unknown Product');
    
    res.json({
      success: true,
      extracted,
      normalized
    });
  } catch (error) {
    console.error('Policy parse error:', error);
    res.status(500).json({ error: error.message });
  }
});

// BLOCK 1: Process all policy PDFs and store in database with progress updates
app.post('/api/process-policies', async (req, res) => {
  try {
    console.log('Starting policy processing...');
    
    // Set up Server-Sent Events for progress updates
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const progressUpdates = [];
    const progressCallback = (message) => {
      progressUpdates.push({
        timestamp: new Date().toISOString(),
        message
      });
      // Send progress update
      res.write(`data: ${JSON.stringify({ type: 'progress', message })}\n\n`);
    };

    try {
      console.log('[API] Starting processAllPolicyFiles...');
      const results = await policyDatabase.processAllPolicyFiles(progressCallback);
      console.log('[API] processAllPolicyFiles completed:', results);
      
      // Check if processing was successful
      const allSuccessful = results.results && results.results.every(r => r.success);
      const hasErrors = results.results && results.results.some(r => !r.success);
      
      // Send final result
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        success: results.success !== false && (allSuccessful || !hasErrors),
        results: results.results || [],
        message: results.warning || (allSuccessful ? 'Policy processing completed successfully' : 'Policy processing completed with some errors'),
        database_location: 'database/policies.json',
        stats: results.stats || null,
        combined_taxonomy_lines: results.stats?.total_lines || 0,
        progress_updates: progressUpdates,
        warning: results.warning || null
      })}\n\n`);
      
      res.end();
    } catch (error) {
      console.error('[API ERROR] Error in process-policies endpoint:', error);
      console.error('[API ERROR] Error name:', error.name);
      console.error('[API ERROR] Error message:', error.message);
      console.error('[API ERROR] Error stack:', error.stack);
      
      // Extract detailed error information
      const errorInfo = {
        type: 'error',
        success: false,
        error: error.message || 'Unknown error',
        error_step: error.step || error.subStep || 'unknown_step',
        error_product: error.product || 'unknown_product',
        error_details: error.toString(),
        error_name: error.name,
        error_code: error.code,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
      
      // Send detailed error information
      res.write(`data: ${JSON.stringify(errorInfo)}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('Policy processing error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }
});

// Get combined taxonomy
app.get('/api/taxonomy', (req, res) => {
  try {
    const taxonomy = policyDatabase.getCombinedTaxonomy();
    
    if (!taxonomy) {
      return res.status(404).json({ 
        error: 'Taxonomy not found. Please process policies first.',
        endpoint: '/api/process-policies'
      });
    }
    
    res.json({
      success: true,
      taxonomy,
      stats: {
        total_lines: JSON.stringify(taxonomy).split('\n').length,
        products: taxonomy.products,
        conditions: taxonomy.layers.layer_1_general_conditions.length,
        benefits: taxonomy.layers.layer_2_benefits.length
      }
    });
  } catch (error) {
    console.error('Error getting taxonomy:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get policy data for specific product
app.get('/api/policy/:productKey', (req, res) => {
  try {
    const { productKey } = req.params;
    const productData = policyDatabase.getPolicyData(productKey);
    
    if (!productData) {
      return res.status(404).json({ 
        error: 'Policy data not found',
        hint: 'Use Product A, Product B, or Product C'
      });
    }
    
    res.json({
      success: true,
      product: productKey,
      data: productData
    });
  } catch (error) {
    console.error('Error getting policy data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Compare policies
app.post('/api/compare-policies', (req, res) => {
  try {
    const { product_keys } = req.body;
    const productKeys = product_keys || ['Product A', 'Product B', 'Product C'];
    
    const comparison = policyDatabase.generateComparisonMatrix(productKeys);
    
    res.json({
      success: true,
      comparison,
      products: productKeys
    });
  } catch (error) {
    console.error('Error comparing policies:', error);
    res.status(500).json({ error: error.message });
  }
});

// BLOCK 2: Conversational FAQ & Query Routing
app.post('/api/faq', async (req, res) => {
  try {
    const { question, policy_context, query_type } = req.body;
    
    let response;
    
    switch (query_type) {
      case 'comparison':
        // Use normalized taxonomy for comparison
        response = await taxonomyEngine.comparePlans(policy_context.plans || []);
        break;
      
      case 'explanation':
        // Use raw text + context for detailed explanation
        response = await taxonomyEngine.getFAQResponse(question, policy_context);
        break;
      
      case 'eligibility':
        // Use both normalized and raw
        const condition = question.toLowerCase().includes('diabetes') ? 'diabetes' : 
                         question.toLowerCase().includes('age') ? 'age' : 'general';
        response = taxonomyEngine.checkEligibility(condition, policy_context);
        break;
      
      case 'scenario':
        // Use Groq to simulate coverage
        response = await groqIntelligence.simulateCoverage(question, policy_context);
        break;
      
      default:
        response = await taxonomyEngine.getFAQResponse(question, policy_context);
    }
    
    res.json({ response, query_type });
  } catch (error) {
    console.error('FAQ error:', error);
    res.status(500).json({ error: error.message });
  }
});

// BLOCK 3: Document Intelligence & Auto-Quotation
app.post('/api/upload-document', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const sessionId = req.body.session_id || randomUUID();
    
    // Process document
    const extracted = await documentProcessor.processTravelDocument(
      req.file.buffer,
      req.file.originalname
    );
    
    if (!extracted || !extracted.valid) {
      return res.status(400).json({ 
        error: 'Failed to extract trip information',
        details: extracted?.errors 
      });
    }
    
    // Merge extracted data into session
    const session = conversationManager.getOrCreateSession(sessionId);
    Object.assign(session.trip_data, extracted.data);
    
    // Set legacy fields for backward compatibility
    if (extracted.data.departure_date && !session.trip_data.trip_start_date) {
      session.trip_data.trip_start_date = extracted.data.departure_date;
    }
    if (extracted.data.return_date && !session.trip_data.trip_end_date) {
      session.trip_data.trip_end_date = extracted.data.return_date;
    }
    if (extracted.data.arrival_country && !session.trip_data.destination) {
      session.trip_data.destination = extracted.data.arrival_country;
    }
    if (extracted.data.number_of_adults && !session.trip_data.number_of_travellers) {
      session.trip_data.number_of_travellers = extracted.data.number_of_adults;
    }
    
    conversationManager.updateSession(sessionId, session);
    
    // Generate travel profile
    const travelProfile = await documentProcessor.generateTravelProfile(extracted.data);
    
    // Get claims intelligence
    const claimsIntel = await claimsIntelligence.getClaimIntelligence(
      travelProfile.destination?.country || '',
      travelProfile.activities || []
    );
    
    // Get tier recommendation
    const tierRecommendation = await claimsIntelligence.recommendTier(
      travelProfile.destination?.country || '',
      travelProfile.activities || [],
      travelProfile
    );
    
    // Generate quotation via MCP
    const quotation = await mcpTools.generateQuotation(travelProfile);
    
    // Check for missing required fields
    const missingFields = conversationManager.getMissingFields(session.trip_data);
    const needsMoreInfo = missingFields.length > 0;
    
    // Create humanized summary message
    let summaryMessage = '';
    if (needsMoreInfo && missingFields.length > 0) {
      // Field name to human prompt mapping
      const fieldPrompts = {
        'name': "What's your name?",
        'age': "How old are you?",
        'departure_date': "What's your departure date?",
        'return_date': "What's your return date?",
        'departure_country': "Which country are you leaving from?",
        'arrival_country': "Which country are you traveling to?",
        'number_of_adults': "How many adults are traveling?",
        'trip_type': "Is this a round trip or one-way?"
      };
      
      const firstMissing = missingFields[0];
      const humanPrompt = fieldPrompts[firstMissing] || `I need ${firstMissing.replace(/_/g, ' ')}`;
      
      summaryMessage = `I've scanned your document! To continue, ${humanPrompt}`;
    } else {
      summaryMessage = 'I\'ve scanned your document and extracted all the information I need!';
    }
    
    res.json({
      success: true,
      session_id: sessionId,
      extracted: extracted.data,
      travel_profile: travelProfile,
      claims_intelligence: claimsIntel,
      tier_recommendation: tierRecommendation,
      quotation,
      needs_more_info: needsMoreInfo,
      missing_fields: missingFields,
      summary_message: summaryMessage
    });
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// BLOCK 4: Purchase Engine (already handled above in /payment)

// BLOCK 5: MSIG Claims Intelligence
app.post('/api/claims-intelligence', async (req, res) => {
  try {
    const { destination, activities } = req.body;
    
    const intelligence = await claimsIntelligence.getClaimIntelligence(destination, activities || []);
    const recommendation = await claimsIntelligence.recommendTier(destination, activities || [], req.body.travel_profile);
    
    res.json({
      intelligence,
      recommendation
    });
  } catch (error) {
    console.error('Claims intelligence error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Comparison endpoint
app.post('/api/compare-plans', async (req, res) => {
  try {
    const { plan_ids, travel_profile } = req.body;
    
    const comparison = await mcpTools.comparePlans(plan_ids, travel_profile);
    
    res.json(comparison);
  } catch (error) {
    console.error('Comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Simulate coverage scenario
app.post('/api/simulate-coverage', async (req, res) => {
  try {
    const { scenario, policy_data } = req.body;
    
    const simulation = await groqIntelligence.simulateCoverage(scenario, policy_data);
    
    res.json(simulation);
  } catch (error) {
    console.error('Coverage simulation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Catch all handler: send back index.html for SPA routing (non-API routes)
app.get('*', (req, res) => {
  // Only serve index.html for non-API routes and non-static files
  if (!req.path.startsWith('/api') && !req.path.includes('.')) {
    res.sendFile(join(__dirname, '../frontend/index.html'));
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`TripKaki server running on http://localhost:${PORT}`);
  console.log(`Frontend available at http://localhost:${PORT}`);
});

