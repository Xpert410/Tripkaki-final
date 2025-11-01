import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TaxonomyEngine } from './taxonomyEngine.js';
import { GroqIntelligence } from './groqIntelligence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class PolicyDatabase {
  constructor() {
    this.dbPath = join(__dirname, '../../database/policies.json');
    this.taxonomyEngine = new TaxonomyEngine();
    this.groqIntelligence = new GroqIntelligence();
    this.ensureDatabase();
  }

  ensureDatabase() {
    const dbDir = join(__dirname, '../../database');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    if (!fs.existsSync(this.dbPath)) {
      fs.writeFileSync(this.dbPath, JSON.stringify({
        policies: {},
        metadata: {
          created_at: new Date().toISOString(),
          last_updated: new Date().toISOString(),
          version: '1.0'
        }
      }, null, 2));
    }
  }

  /**
   * Load database
   */
  loadDatabase() {
    try {
      const data = fs.readFileSync(this.dbPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading database:', error);
      return { policies: {}, metadata: {} };
    }
  }

  /**
   * Save database
   */
  saveDatabase(data) {
    try {
      data.metadata.last_updated = new Date().toISOString();
      fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving database:', error);
      return false;
    }
  }

  /**
   * Read PDF file and extract text using pdf-parse
   */
  async readPDFFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileStats = fs.statSync(filePath);
      console.log(`Processing file: ${filePath} (${fileStats.size} bytes)`);
      
      // Use pdf-parse to extract text from PDF
      // pdf-parse is CommonJS, so we need to use dynamic import with createRequire
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      const pdfParse = require('pdf-parse');
      
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      
      return pdfData.text;
    } catch (error) {
      console.error(`Error reading PDF file ${filePath}:`, error);
      // If pdf-parse fails, try reading as text (for non-PDF files or fallback)
      try {
        return fs.readFileSync(filePath, 'utf8');
      } catch (e) {
        throw new Error(`Failed to read file: ${error.message}`);
      }
    }
  }

  /**
   * Parse policy PDF and fill taxonomy template directly
   */
  async parsePolicyPDFToTaxonomy(filePath, productName, baseTaxonomy, progressCallback = null) {
    const step = { current: 'initialization', error: null };
    
    try {
      // STEP 1: Read PDF content
      step.current = 'reading_pdf';
      if (progressCallback) {
        progressCallback(`📄 [STEP 1/4] Reading PDF file: ${productName}...`);
      }
      console.log(`Reading PDF: ${filePath}`);
      
      const pdfContent = await this.readPDFFile(filePath);
      
      if (!pdfContent || pdfContent.length < 100) {
        throw new Error(`[STEP 1 FAILED] PDF content too short or empty (${pdfContent?.length || 0} characters)`);
      }

      if (progressCallback) {
        progressCallback(`✅ [STEP 1/4] PDF read successfully (${(pdfContent.length / 1000).toFixed(1)}K characters)`);
        progressCallback(`🤖 [STEP 2/4] Using Groq AI to analyze PDF and fill taxonomy template...`);
      }

      // STEP 2: Create template copy
      step.current = 'creating_template';
      const taxonomyTemplate = JSON.parse(JSON.stringify(baseTaxonomy));
      if (!taxonomyTemplate || !taxonomyTemplate.layers) {
        throw new Error('[STEP 2 FAILED] Failed to create taxonomy template copy');
      }

      // STEP 3: Fill taxonomy with Groq
      step.current = 'filling_taxonomy';
      const filledTaxonomy = await this.fillTaxonomyFromPDF(
        pdfContent,
        productName,
        taxonomyTemplate,
        progressCallback
      );
      
      if (!filledTaxonomy) {
        throw new Error('[STEP 3 FAILED] Groq returned empty taxonomy');
      }

      // STEP 4: Validation
      step.current = 'validation';
      if (progressCallback) {
        progressCallback(`✅ [STEP 4/4] ${productName} taxonomy filled successfully!`);
        progressCallback(`   ✓ Validated taxonomy structure`);
      }
      
      return filledTaxonomy;
    } catch (error) {
      const errorMsg = `[${step.current.toUpperCase()}] Error processing ${productName}: ${error.message}`;
      console.error(errorMsg, error);
      console.error('Failed at step:', step.current);
      console.error('Error stack:', error.stack);
      
      if (progressCallback) {
        progressCallback(`❌ ${errorMsg}`);
        progressCallback(`   Failed at: ${step.current}`);
      }
      
      // Add step info to error
      error.step = step.current;
      error.product = productName;
      throw error;
    }
  }

  /**
   * Use Groq to directly fill taxonomy template from PDF content
   */
  async fillTaxonomyFromPDF(pdfContent, productKey, taxonomyTemplate, progressCallback = null) {
    const subStep = { current: 'initialization', error: null };
    
    try {
      // SUBSTEP 1: Validate taxonomy structure
      subStep.current = 'validating_taxonomy';
      if (!taxonomyTemplate || !taxonomyTemplate.layers) {
        throw new Error('[SUBSTEP 1 FAILED] Invalid taxonomy template structure');
      }
      
      // Get summary of taxonomy structure for Groq context
      const layer1Count = taxonomyTemplate.layers.layer_1_general_conditions.length;
      const layer2Count = taxonomyTemplate.layers.layer_2_benefits.length;
      const layer3Count = taxonomyTemplate.layers.layer_3_benefit_specific_conditions?.length || 0;
      const layer4Count = taxonomyTemplate.layers.layer_4_operational_parameters?.length || 0;

      if (progressCallback) {
        progressCallback(`📋 [SUBSTEP 1/5] Analyzing ${layer1Count} conditions, ${layer2Count} benefits, ${layer3Count} benefit conditions...`);
      }

      // Get all condition and benefit names for comprehensive mapping
      const allConditions = taxonomyTemplate.layers.layer_1_general_conditions.map(c => c.condition);
      const allBenefits = taxonomyTemplate.layers.layer_2_benefits.map(b => b.benefit_name);
      const allBenefitConditions = taxonomyTemplate.layers.layer_3_benefit_specific_conditions?.map(c => 
        `${c.benefit_name}:${c.condition}`
      ) || [];
      
      // Sample for context (first 30 of each)
      const sampleConditions = allConditions.slice(0, 30).join(', ');
      const sampleBenefits = allBenefits.slice(0, 30).join(', ');

      // SUBSTEP 2: Prepare PDF content
      subStep.current = 'preparing_pdf_content';
      const pdfText = pdfContent.length > 50000 
        ? pdfContent.substring(0, 25000) + '\n\n[CONTINUED...]\n\n' + pdfContent.substring(pdfContent.length - 25000)
        : pdfContent;
      
      if (progressCallback) {
        progressCallback(`📝 [SUBSTEP 2/5] Prepared PDF content (${(pdfText.length / 1000).toFixed(1)}K chars)`);
      }
      
      // SUBSTEP 3: Build prompt
      subStep.current = 'building_prompt';
      const prompt = `You are analyzing a travel insurance policy document. Your task is to fill in the taxonomy template structure for ${productKey}.

Policy Document (excerpt):
${pdfText}

Taxonomy Structure:
- Layer 1: ${layer1Count} general conditions (eligibility & exclusions)
- Layer 2: ${layer2Count} benefits
- Layer 3: ${layer3Count} benefit-specific conditions
- Layer 4: ${layer4Count} operational parameters

Sample conditions: ${sampleConditions}
Sample benefits: ${sampleBenefits}

For each entry in the taxonomy structure, you need to:
1. Check if that condition/benefit/parameter exists in the policy document
2. Set condition_exist: true if found, false if NOT found
3. Extract original_text: relevant quote from the policy document
4. Extract parameters: actual values (limits, amounts, age ranges, etc.) from the policy

You must return a JSON object where each key is the exact condition/benefit name from the taxonomy, and the value contains the filled data.

For Layer 1 (General Conditions), the keys are: ${allConditions.slice(0, 10).join(', ')} ... (${layer1Count} total)
For Layer 2 (Benefits), the keys are: ${allBenefits.slice(0, 10).join(', ')} ... (${layer2Count} total)
For Layer 3 (Benefit Conditions), combine benefit_name + condition like: "accidental_death_permanent_disablement_injury_time_limit_for_compensation" ... (${layer3Count} total)

Return structure:
{
  "layer_1_general_conditions": {
    "trip_start_singapore": { "condition_exist": true/false, "original_text": "exact quote from policy", "parameters": {} },
    "age_eligibility": { "condition_exist": true/false, "original_text": "exact quote", "parameters": { "min": number, "max": number } },
    ... (ALL ${layer1Count} conditions - use exact names from taxonomy)
  },
  "layer_2_benefits": {
    "accidental_death_permanent_disablement": { "condition_exist": true/false, "parameters": { "limit": "actual amount from policy", "deductible": "amount" } },
    "overseas_medical_expenses": { "condition_exist": true/false, "parameters": { "limit": "amount" } },
    ... (ALL ${layer2Count} benefits - use exact names from taxonomy)
  },
  "layer_3_benefit_specific_conditions": {
    "accidental_death_permanent_disablement_injury_time_limit_for_compensation": { "condition_exist": true/false, "original_text": "exact quote", "parameters": {} },
    ... (ALL ${layer3Count} benefit conditions - format: benefit_name_condition)
  }
}

CRITICAL: 
- Fill ALL entries in ALL layers
- Search the policy document thoroughly for each condition/benefit
- Extract actual values where present (amounts, limits, age ranges)
- Include direct quotes from policy in original_text
- Be comprehensive and accurate`;

      if (progressCallback) {
        progressCallback(`🔄 [SUBSTEP 3/5] Built Groq prompt`);
        progressCallback(`🤖 [SUBSTEP 4/5] Sending request to Groq AI...`);
      }
      
      // SUBSTEP 4: Call Groq API
      subStep.current = 'calling_groq';

      // Instead of listing all conditions (which would be too long), provide a structured instruction
      // Groq will know to check all conditions from the taxonomy structure
      const detailedPrompt = `${prompt}

IMPORTANT INSTRUCTIONS:
1. The taxonomy has ${layer1Count} general conditions and ${layer2Count} benefits to fill
2. For Layer 1, check conditions like: trip_start_singapore, age_eligibility, good_health, pre_existing_conditions, travel_advisory_exclusion, etc.
3. For Layer 2, check benefits like: accidental_death_permanent_disablement, overseas_medical_expenses, trip_cancellation, baggage_loss, personal_liability, etc.
4. You must check EVERY condition and benefit name from the taxonomy structure
5. For conditions/benefits found: set condition_exist=true, extract original_text, extract parameters
6. For conditions/benefits NOT found: set condition_exist=false
7. Return a JSON object with ALL ${layer1Count + layer2Count} entries filled`;

      const response = await this.groqIntelligence.groq.client.chat.completions.create({
        model: this.groqIntelligence.groq.model,
        messages: [
          {
            role: 'system',
            content: `You are a travel insurance policy analyzer. You read policy PDF documents and fill taxonomy templates with accurate information extracted directly from the policy text.

CRITICAL INSTRUCTIONS:
1. Read the policy document carefully
2. For EVERY condition/benefit in the taxonomy, check if it exists in the policy
3. Set condition_exist: true if found in policy, false if NOT found
4. Extract original_text: quote the exact text from the policy where the condition/benefit is mentioned
5. Extract parameters: actual numeric values, amounts, limits, age ranges from the policy
6. Fill ALL ${layer1Count + layer2Count + layer3Count} entries - do not skip any
7. Return valid JSON matching the exact structure requested`
          },
          {
            role: 'user',
            content: detailedPrompt
          }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
        max_tokens: 32768  // Maximum tokens for comprehensive filling
      });

      if (!response || !response.choices || !response.choices[0]) {
        throw new Error('[SUBSTEP 4 FAILED] Groq API returned invalid response structure');
      }

      if (progressCallback) {
        progressCallback(`✅ [SUBSTEP 4/5] Received response from Groq (${response.usage?.total_tokens || 'unknown'} tokens used)`);
        progressCallback(`🔄 [SUBSTEP 5/5] Parsing Groq response...`);
      }
      
      // SUBSTEP 5: Parse response
      subStep.current = 'parsing_response';
      let filledData;
      try {
        const responseContent = response.choices[0].message.content;
        console.log(`Groq response length: ${responseContent.length} characters`);
        
        // Clean up response if needed (remove markdown code blocks)
        let cleanedContent = responseContent;
        if (cleanedContent.includes('```json')) {
          cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (cleanedContent.includes('```')) {
          cleanedContent = cleanedContent.replace(/```\n?/g, '');
        }
        
        filledData = JSON.parse(cleanedContent);
        
        if (!filledData || typeof filledData !== 'object') {
          throw new Error('Groq returned invalid JSON structure');
        }
        
        console.log(`Successfully parsed Groq response. Keys: ${Object.keys(filledData).join(', ')}`);
      } catch (parseError) {
        console.error('[SUBSTEP 5 FAILED] Error parsing Groq response:', parseError);
        const responseContent = response.choices[0]?.message?.content || 'No content';
        const responsePreview = responseContent.substring(0, 1000);
        console.error('Response preview:', responsePreview);
        throw new Error(`[SUBSTEP 5 FAILED] Failed to parse Groq JSON response: ${parseError.message}. Response preview (first 200 chars): ${responsePreview.substring(0, 200)}`);
      }

      // SUBSTEP 6: Apply filled data
      subStep.current = 'applying_data';
      if (progressCallback) {
        progressCallback(`✅ [SUBSTEP 5/5] Groq analysis complete!`);
        progressCallback(`🔄 Applying filled data to taxonomy template...`);
      }

      if (!filledData || typeof filledData !== 'object') {
        throw new Error('[SUBSTEP 6 FAILED] Filled data is invalid or empty');
      }

      // Apply the filled data to the taxonomy template
      const updateCounts = this.applyFilledDataToTaxonomy(taxonomyTemplate, filledData, productKey, progressCallback);

      if (progressCallback) {
        progressCallback(`✅ Applied ${updateCounts.total} updates to taxonomy`);
        progressCallback(`   • Layer 1: ${updateCounts.layer1} conditions`);
        progressCallback(`   • Layer 2: ${updateCounts.layer2} benefits`);
        progressCallback(`   • Layer 3: ${updateCounts.layer3} benefit conditions`);
        progressCallback(`   • Layer 4: ${updateCounts.layer4} parameters`);
      }

      return taxonomyTemplate;
    } catch (error) {
      const errorMsg = `[${subStep.current.toUpperCase()}] Error filling taxonomy: ${error.message}`;
      console.error(errorMsg, error);
      console.error('Failed at substep:', subStep.current);
      
      if (progressCallback) {
        progressCallback(`❌ ${errorMsg}`);
        progressCallback(`   Failed at substep: ${subStep.current}`);
      }
      
      error.subStep = subStep.current;
      throw error;
    }
  }

  /**
   * Apply Groq-filled data to taxonomy template structure
   */
  applyFilledDataToTaxonomy(taxonomy, filledData, productKey, progressCallback = null) {
    const counts = {
      layer1: 0,
      layer2: 0,
      layer3: 0,
      layer4: 0,
      total: 0
    };

    // Layer 1: General Conditions
    if (filledData.layer_1_general_conditions && taxonomy.layers.layer_1_general_conditions) {
      taxonomy.layers.layer_1_general_conditions.forEach(condition => {
        const conditionKey = condition.condition;
        const filled = filledData.layer_1_general_conditions[conditionKey];
        
        if (filled && condition.products && condition.products[productKey]) {
          // Update condition_exist (convert "boolean" string or boolean to actual boolean)
          if (typeof filled.condition_exist === 'boolean') {
            condition.products[productKey].condition_exist = filled.condition_exist;
          } else if (filled.condition_exist === true || filled.condition_exist === 'true') {
            condition.products[productKey].condition_exist = true;
          } else {
            condition.products[productKey].condition_exist = false;
          }
          
          if (filled.original_text && filled.original_text.trim()) {
            condition.products[productKey].original_text = filled.original_text;
          }
          if (filled.parameters && Object.keys(filled.parameters).length > 0) {
            condition.products[productKey].parameters = { 
              ...condition.products[productKey].parameters, 
              ...filled.parameters 
            };
          }
          counts.layer1++;
          counts.total++;
        }
      });
      if (progressCallback && counts.layer1 > 0) {
        progressCallback(`✓ Updated ${counts.layer1} Layer 1 conditions`);
      }
    }

    // Layer 2: Benefits
    if (filledData.layer_2_benefits && taxonomy.layers.layer_2_benefits) {
      taxonomy.layers.layer_2_benefits.forEach(benefit => {
        const benefitKey = benefit.benefit_name;
        const filled = filledData.layer_2_benefits[benefitKey];
        
        if (filled && benefit.products && benefit.products[productKey]) {
          // Update condition_exist
          if (typeof filled.condition_exist === 'boolean') {
            benefit.products[productKey].condition_exist = filled.condition_exist;
          } else if (filled.condition_exist === true || filled.condition_exist === 'true') {
            benefit.products[productKey].condition_exist = true;
          } else {
            benefit.products[productKey].condition_exist = false;
          }
          
          if (filled.parameters && Object.keys(filled.parameters).length > 0) {
            benefit.products[productKey].parameters = { 
              ...benefit.products[productKey].parameters, 
              ...filled.parameters 
            };
          }
          if (filled.original_text && filled.original_text.trim()) {
            benefit.products[productKey].original_text = filled.original_text;
          }
          counts.layer2++;
          counts.total++;
        }
      });
      if (progressCallback && counts.layer2 > 0) {
        progressCallback(`✓ Updated ${counts.layer2} Layer 2 benefits`);
      }
    }

    // Layer 3: Benefit-Specific Conditions
    if (filledData.layer_3_benefit_specific_conditions && taxonomy.layers.layer_3_benefit_specific_conditions) {
      taxonomy.layers.layer_3_benefit_specific_conditions.forEach(condition => {
        // Try multiple key formats
        const key1 = `${condition.benefit_name}_${condition.condition}`;
        const key2 = condition.condition;
        const key3 = `${condition.benefit_name}:${condition.condition}`;
        
        const filled = filledData.layer_3_benefit_specific_conditions[key1] || 
                      filledData.layer_3_benefit_specific_conditions[key2] ||
                      filledData.layer_3_benefit_specific_conditions[key3];
        
        if (filled && condition.products && condition.products[productKey]) {
          // Update condition_exist
          if (typeof filled.condition_exist === 'boolean') {
            condition.products[productKey].condition_exist = filled.condition_exist;
          } else if (filled.condition_exist === true || filled.condition_exist === 'true') {
            condition.products[productKey].condition_exist = true;
          } else {
            condition.products[productKey].condition_exist = false;
          }
          
          if (filled.original_text && filled.original_text.trim()) {
            condition.products[productKey].original_text = filled.original_text;
          }
          if (filled.parameters && Object.keys(filled.parameters).length > 0) {
            condition.products[productKey].parameters = { 
              ...condition.products[productKey].parameters, 
              ...filled.parameters 
            };
          }
          counts.layer3++;
          counts.total++;
        }
      });
      if (progressCallback && counts.layer3 > 0) {
        progressCallback(`✓ Updated ${counts.layer3} Layer 3 benefit conditions`);
      }
    }

    // Layer 4: Operational Parameters (if exists in taxonomy)
    if (filledData.layer_4_operational_parameters && taxonomy.layers.layer_4_operational_parameters) {
      taxonomy.layers.layer_4_operational_parameters.forEach(param => {
        const paramKey = param.parameter_name;
        const filled = filledData.layer_4_operational_parameters[paramKey];
        
        if (filled && param.products && param.products[productKey]) {
          if (typeof filled.condition_exist === 'boolean') {
            param.products[productKey].condition_exist = filled.condition_exist;
          } else if (filled.condition_exist === true || filled.condition_exist === 'true') {
            param.products[productKey].condition_exist = true;
          } else {
            param.products[productKey].condition_exist = false;
          }
          
          if (filled.parameters && Object.keys(filled.parameters).length > 0) {
            param.products[productKey].parameters = { 
              ...param.products[productKey].parameters, 
              ...filled.parameters 
            };
          }
          counts.layer4++;
          counts.total++;
        }
      });
      if (progressCallback && counts.layer4 > 0) {
        progressCallback(`✓ Updated ${counts.layer4} Layer 4 operational parameters`);
      }
    }

    return counts;
  }

  /**
   * Load base taxonomy structure from Taxonomy_Hackathon.json
   */
  loadBaseTaxonomy() {
    try {
      const taxonomyPath = join(__dirname, '../../Taxonomy_Hackathon.json');
      const taxonomyData = fs.readFileSync(taxonomyPath, 'utf8');
      return JSON.parse(taxonomyData);
    } catch (error) {
      console.error('Error loading base taxonomy:', error);
      return null;
    }
  }
  /**
   * DEPRECATED: applyTaxonomyMappings - replaced by applyFilledDataToTaxonomy
   * Keeping for backwards compatibility but should not be called
   */
  applyTaxonomyMappings(taxonomy, mapping, productKey, progressCallback = null) {
    let updatedCount = 0;

    // Layer 1: General Conditions
    if (mapping.layer_1_updates && taxonomy.layers.layer_1_general_conditions) {
      taxonomy.layers.layer_1_general_conditions.forEach((condition, idx) => {
        const conditionKey = condition.condition;
        if (mapping.layer_1_updates[conditionKey] && condition.products[productKey]) {
          const update = mapping.layer_1_updates[conditionKey];
          condition.products[productKey].condition_exist = update.condition_exist !== false;
          if (update.original_text) {
            condition.products[productKey].original_text = update.original_text;
          }
          if (update.parameters) {
            condition.products[productKey].parameters = { ...condition.products[productKey].parameters, ...update.parameters };
          }
          updatedCount++;
        } else if (condition.products[productKey] && !mapping.layer_1_updates[conditionKey]) {
          // If not found in mapping, mark as not existing (unless explicitly found)
          condition.products[productKey].condition_exist = false;
        }
      });
      if (progressCallback && updatedCount > 0) {
        progressCallback(`✓ Updated ${updatedCount} Layer 1 conditions`);
      }
    }

    // Layer 2: Benefits
    if (mapping.layer_2_updates && taxonomy.layers.layer_2_benefits) {
      updatedCount = 0;
      taxonomy.layers.layer_2_benefits.forEach(benefit => {
        const benefitKey = benefit.benefit_name;
        if (mapping.layer_2_updates[benefitKey] && benefit.products[productKey]) {
          const update = mapping.layer_2_updates[benefitKey];
          benefit.products[productKey].condition_exist = update.condition_exist !== false;
          if (update.parameters) {
            benefit.products[productKey].parameters = { ...benefit.products[productKey].parameters, ...update.parameters };
          }
          updatedCount++;
        } else if (benefit.products[productKey] && !mapping.layer_2_updates[benefitKey]) {
          benefit.products[productKey].condition_exist = false;
        }
      });
      if (progressCallback && updatedCount > 0) {
        progressCallback(`✓ Updated ${updatedCount} Layer 2 benefits`);
      }
    }

    // Layer 3: Benefit-Specific Conditions
    if (mapping.layer_3_updates && taxonomy.layers.layer_3_benefit_conditions) {
      updatedCount = 0;
      taxonomy.layers.layer_3_benefit_conditions.forEach(condition => {
        const key1 = `${condition.benefit_name}_${condition.condition}`;
        const key2 = condition.condition;
        
        const update = mapping.layer_3_updates[key1] || mapping.layer_3_updates[key2];
        if (update && condition.products[productKey]) {
          condition.products[productKey].condition_exist = update.condition_exist !== false;
          if (update.original_text) {
            condition.products[productKey].original_text = update.original_text;
          }
          if (update.parameters) {
            condition.products[productKey].parameters = { ...condition.products[productKey].parameters, ...update.parameters };
          }
          updatedCount++;
        } else if (condition.products[productKey]) {
          condition.products[productKey].condition_exist = false;
        }
      });
      if (progressCallback && updatedCount > 0) {
        progressCallback(`✓ Updated ${updatedCount} Layer 3 benefit conditions`);
      }
    }

    // Layer 4: Operational Parameters
    if (mapping.layer_4_updates && taxonomy.layers.layer_4_operational_parameters) {
      updatedCount = 0;
      taxonomy.layers.layer_4_operational_parameters.forEach(param => {
        const paramKey = param.parameter_name;
        if (mapping.layer_4_updates[paramKey] && param.products[productKey]) {
          const update = mapping.layer_4_updates[paramKey];
          param.products[productKey].condition_exist = update.condition_exist !== false;
          if (update.parameters) {
            param.products[productKey].parameters = { ...param.products[productKey].parameters, ...update.parameters };
          }
          updatedCount++;
        } else if (param.products[productKey]) {
          param.products[productKey].condition_exist = false;
        }
      });
      if (progressCallback && updatedCount > 0) {
        progressCallback(`✓ Updated ${updatedCount} Layer 4 operational parameters`);
      }
    }
  }

  /**
   * DEPRECATED: applyBasicTaxonomyMapping - no longer used with new template approach
   */
  applyBasicTaxonomyMapping(extracted, productKey, taxonomy) {
    // This method is no longer used - we use fillTaxonomyFromPDF instead
    return taxonomy;
  }

  /**
   * Merge multiple policy taxonomies into one combined taxonomy
   */
  mergeTaxonomies(taxonomies) {
    // Start with base taxonomy
    const baseTaxonomy = this.loadBaseTaxonomy();
    if (!baseTaxonomy) {
      throw new Error('Failed to load base taxonomy');
    }

    // Merge all product data into the base taxonomy
    taxonomies.forEach((taxonomy, index) => {
      const productKey = ['Product A', 'Product B', 'Product C'][index];
      
      // Merge each layer
      const layerKeys = ['layer_1_general_conditions', 'layer_2_benefits', 'layer_3_benefit_specific_conditions', 'layer_4_operational_parameters'];
      
      layerKeys.forEach(layerKey => {
        if (baseTaxonomy.layers[layerKey] && taxonomy.layers[layerKey]) {
          baseTaxonomy.layers[layerKey].forEach((baseEntry, idx) => {
            const taxEntry = taxonomy.layers[layerKey][idx];
            if (taxEntry && taxEntry.products && baseEntry.products) {
              if (taxEntry.products[productKey] && baseEntry.products[productKey]) {
                // Merge the product data - preserve all fields
                Object.assign(baseEntry.products[productKey], taxEntry.products[productKey]);
              }
            }
          });
        }
      });
    });

    // Update metadata
    baseTaxonomy.metadata = {
      processed_at: new Date().toISOString(),
      products: ['Scootsurance (Product A)', 'TravelEasy Policy (Product B)', 'TravelEasy Pre-Ex Policy (Product C)'],
      version: '1.0'
    };

    return baseTaxonomy;
  }

  /**
   * Store combined taxonomy in database
   * COMPLETELY OVERWRITES policies.json with new data - no merging, fresh start each time
   */
  async storeCombinedTaxonomy(taxonomy) {
    try {
      // Create a completely fresh database structure - overwrite everything
      const db = {
        taxonomy_name: taxonomy.taxonomy_name || "Travel Insurance Product Taxonomy",
        products: taxonomy.products || ["Product A", "Product B", "Product C"],
        layers: taxonomy.layers,
        metadata: {
          created_at: new Date().toISOString(),
          last_processed: new Date().toISOString(),
          total_products: 3,
          total_conditions: taxonomy.layers.layer_1_general_conditions.length,
          total_benefits: taxonomy.layers.layer_2_benefits.length,
          total_benefit_conditions: taxonomy.layers.layer_3_benefit_specific_conditions?.length || 0,
          total_parameters: taxonomy.layers.layer_4_operational_parameters?.length || 0,
          version: "1.0"
        },
        processed_at: new Date().toISOString(),
        version: "1.0"
      };
      
      // Write directly to file, completely overwriting previous content
      const dbPath = this.dbPath || join(__dirname, '../../database/policies.json');
      const dbDir = dirname(dbPath);
      
      // Ensure database directory exists
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      // Write the new database, completely replacing old file
      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
      
      console.log(`✅ Successfully overwrote policies.json with new taxonomy data`);
      console.log(`   • ${db.metadata.total_conditions} conditions`);
      console.log(`   • ${db.metadata.total_benefits} benefits`);
      console.log(`   • ${db.metadata.total_benefit_conditions} benefit conditions`);
      console.log(`   • File: ${dbPath}`);
      
      return { success: true, path: dbPath, taxonomy: db };
    } catch (error) {
      console.error('Error storing combined taxonomy:', error);
      console.error('Error stack:', error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get combined taxonomy from database
   */
  getCombinedTaxonomy() {
    const db = this.loadDatabase();
    return db.combined_taxonomy || null;
  }

  /**
   * Get policy data for specific product (Product A, B, or C)
   */
  getPolicyData(productKey) {
    const taxonomy = this.getCombinedTaxonomy();
    if (!taxonomy) return null;

    // Extract data for specific product
    const productData = {
      product: productKey,
      layer_1_general_conditions: [],
      layer_2_benefits: [],
      layer_3_benefit_conditions: [],
      layer_4_operational_parameters: []
    };

    ['layer_1_general_conditions', 'layer_2_benefits', 'layer_3_benefit_conditions', 'layer_4_operational_parameters'].forEach(layerKey => {
      if (taxonomy.layers[layerKey]) {
        taxonomy.layers[layerKey].forEach(entry => {
          if (entry.products && entry.products[productKey]) {
            productData[layerKey].push({
              ...entry,
              product_data: entry.products[productKey]
            });
          }
        });
      }
    });

    return productData;
  }

  /**
   * Process all policy PDFs and merge into combined taxonomy
   * Returns progress events via callback
   */
  async processAllPolicyFiles(progressCallback = null) {
    const policyFiles = [
      {
        name: 'Scootsurance',
        productKey: 'Product A',
        path: join(__dirname, '../../Scootsurance QSR022206_updated.pdf')
      },
      {
        name: 'TravelEasy Policy',
        productKey: 'Product B',
        path: join(__dirname, '../../TravelEasy Policy QTD032212.pdf')
      },
      {
        name: 'TravelEasy Pre-Ex Policy',
        productKey: 'Product C',
        path: join(__dirname, '../../TravelEasy Pre-Ex Policy QTD032212-PX.pdf')
      }
    ];

    // Verify all PDF files exist before processing
    for (const file of policyFiles) {
      if (!fs.existsSync(file.path)) {
        throw new Error(`PDF file not found: ${file.path}\nPlease ensure all policy PDFs are in the project root directory.`);
      }
    }

    if (progressCallback) {
      progressCallback('🚀 Starting policy processing...');
      progressCallback(`📚 Loading base taxonomy structure...`);
    }

    // Load base taxonomy structure
    const baseTaxonomy = this.loadBaseTaxonomy();
    if (!baseTaxonomy) {
      throw new Error('Failed to load base taxonomy structure');
    }

    if (progressCallback) {
      progressCallback(`✅ Base taxonomy loaded:`);
      progressCallback(`   • ${baseTaxonomy.layers.layer_1_general_conditions.length} conditions`);
      progressCallback(`   • ${baseTaxonomy.layers.layer_2_benefits.length} benefits`);
      progressCallback(`   • ${baseTaxonomy.layers.layer_3_benefit_specific_conditions?.length || 0} benefit-specific conditions`);
      progressCallback(`   • ${baseTaxonomy.layers.layer_4_operational_parameters?.length || 0} operational parameters`);
      progressCallback(`   • Processing ${policyFiles.length} policy PDFs...`);
    }

    const taxonomies = [];
    const results = [];

    // Process each policy file
    for (let i = 0; i < policyFiles.length; i++) {
      const policyFile = policyFiles[i];
      
      if (progressCallback) {
        progressCallback(`\n━━━ Processing ${i + 1}/${policyFiles.length}: ${policyFile.name} (${policyFile.productKey}) ━━━`);
      }

      try {
        // Create progress callback for this file
        const fileProgressCallback = progressCallback ? (msg) => {
          progressCallback(`   ${msg}`);
        } : null;

        // Parse PDF and map to taxonomy
        // Create a fresh copy of base taxonomy for each product
        const productTaxonomy = JSON.parse(JSON.stringify(baseTaxonomy));
        
        const mappedTaxonomy = await this.parsePolicyPDFToTaxonomy(
          policyFile.path,
          policyFile.productKey,
          productTaxonomy,
          fileProgressCallback
        );
        
        taxonomies.push(mappedTaxonomy);
        
        results.push({
          product: policyFile.name,
          productKey: policyFile.productKey,
          success: true,
          message: `Successfully processed ${policyFile.name} and mapped to ${policyFile.productKey}`,
          mapped_conditions: mappedTaxonomy.layers.layer_1_general_conditions.filter(c => 
            c.products[policyFile.productKey]?.condition_exist === true || c.products[policyFile.productKey]?.condition_exist !== false
          ).length,
          mapped_benefits: mappedTaxonomy.layers.layer_2_benefits.filter(b => 
            b.products[policyFile.productKey]?.condition_exist === true || b.products[policyFile.productKey]?.condition_exist !== false
          ).length
        });
        
        if (progressCallback) {
          progressCallback(`✅ ${policyFile.name} → ${policyFile.productKey} COMPLETE!`);
        }
      } catch (error) {
        console.error(`✗ Error processing ${policyFile.name}:`, error);
        console.error(`Error stack:`, error.stack);
        
        const errorMessage = error.message || error.toString();
        results.push({
          product: policyFile.name,
          productKey: policyFile.productKey,
          success: false,
          error: errorMessage,
          error_details: error.stack ? error.stack.split('\n')[0] : undefined
        });
        
        if (progressCallback) {
          progressCallback(`❌ ${policyFile.name} FAILED: ${errorMessage}`);
          if (error.stack) {
            progressCallback(`   Error details: ${error.stack.split('\n').slice(0, 2).join(' ')}`);
          }
        }
        
        // Continue processing other files even if one fails
      }
    }

    // Merge all taxonomies into one combined structure
    if (taxonomies.length === 0) {
      throw new Error('No taxonomies were successfully processed. All PDF processing failed.');
    }

    if (taxonomies.length < policyFiles.length) {
      if (progressCallback) {
        progressCallback(`⚠️ Warning: Only ${taxonomies.length} out of ${policyFiles.length} policies processed successfully`);
      }
    }

    if (progressCallback) {
      progressCallback(`\n🔄 Merging ${taxonomies.length} taxonomies into combined structure...`);
    }
    
    try {
      // Step: Merge taxonomies
      const mergeStep = { current: 'merging_taxonomies', error: null };
      
      if (progressCallback) {
        progressCallback(`\n🔄 [MERGE STEP 1/3] Merging ${taxonomies.length} taxonomies into combined structure...`);
      }
      
      mergeStep.current = 'merging';
      const combinedTaxonomy = this.mergeTaxonomies(taxonomies);
      
      if (!combinedTaxonomy) {
        throw new Error('[MERGE STEP 1 FAILED] mergeTaxonomies returned null or undefined');
      }
      
      if (progressCallback) {
        progressCallback(`✅ [MERGE STEP 1/3] Merging complete!`);
        progressCallback(`💾 [MERGE STEP 2/3] Overwriting policies.json with new data...`);
      }
      
      // Step: Store taxonomy
      mergeStep.current = 'storing_taxonomy';
      const storeResult = await this.storeCombinedTaxonomy(combinedTaxonomy);
      
      if (!storeResult.success) {
        throw new Error(`[MERGE STEP 2 FAILED] ${storeResult.error || 'Failed to store combined taxonomy'}`);
      }
      
      if (progressCallback) {
        progressCallback(`✅ [MERGE STEP 2/3] policies.json completely overwritten with fresh taxonomy data`);
        progressCallback(`📊 [MERGE STEP 3/3] Calculating statistics...`);
      }
      
      // Step: Calculate stats
      mergeStep.current = 'calculating_stats';
      
      if (!combinedTaxonomy || !combinedTaxonomy.layers) {
        throw new Error('[MERGE STEP 3 FAILED] Combined taxonomy is invalid or missing layers');
      }
      
      const stats = {
        total_lines: JSON.stringify(combinedTaxonomy).split('\n').length,
        total_conditions: combinedTaxonomy.layers.layer_1_general_conditions.length,
        total_benefits: combinedTaxonomy.layers.layer_2_benefits.length,
        total_benefit_conditions: combinedTaxonomy.layers.layer_3_benefit_specific_conditions?.length || 0,
        total_parameters: combinedTaxonomy.layers.layer_4_operational_parameters?.length || 0
      };

      if (progressCallback) {
        progressCallback(`✅ [MERGE STEP 3/3] Statistics calculated!`);
        progressCallback(`📊 Final Statistics:`);
        progressCallback(`   • Total lines: ${stats.total_lines}`);
        progressCallback(`   • Total conditions: ${stats.total_conditions}`);
        progressCallback(`   • Total benefits: ${stats.total_benefits}`);
        progressCallback(`   • Total benefit conditions: ${stats.total_benefit_conditions}`);
        progressCallback(`   • Total parameters: ${stats.total_parameters}`);
        progressCallback(`   • All policies ready for queries!`);
      }
      
      return {
        success: true,
        results,
        combined_taxonomy: combinedTaxonomy,
        stats
      };
    } catch (mergeError) {
      console.error('[MERGE ERROR] Error during merge/store:', mergeError);
      console.error('[MERGE ERROR] Failed at step:', mergeStep?.current || 'unknown');
      console.error('[MERGE ERROR] Error stack:', mergeError.stack);
      
      if (progressCallback) {
        progressCallback(`❌ [MERGE ERROR] Error at ${mergeStep?.current || 'unknown'}: ${mergeError.message}`);
      }
      
      // Add step info to error
      mergeError.step = mergeStep?.current || 'merging';
      mergeError.product = 'merging_all_products';
      throw mergeError;
    }

    // This should not be reached if taxonomies.length > 0 check above works
    throw new Error('No taxonomies were successfully processed');
  }

  /**
   * Generate comparison matrix from stored taxonomy
   */
  generateComparisonMatrix(productKeys = ['Product A', 'Product B', 'Product C']) {
    const taxonomy = this.getCombinedTaxonomy();
    if (!taxonomy) {
      throw new Error('No combined taxonomy found. Please process policies first.');
    }

    const comparison = {
      products: productKeys,
      eligibility_matrix: {},
      benefits_matrix: {},
      exclusions_matrix: {},
      limits_matrix: {}
    };

    // Extract eligibility conditions
    taxonomy.layers.layer_1_general_conditions
      .filter(c => c.condition_type === 'eligibility')
      .forEach(condition => {
        if (!comparison.eligibility_matrix[condition.condition]) {
          comparison.eligibility_matrix[condition.condition] = {};
        }
        productKeys.forEach(productKey => {
          if (condition.products && condition.products[productKey]) {
            comparison.eligibility_matrix[condition.condition][productKey] = 
              condition.products[productKey].condition_exist;
          }
        });
      });

    // Extract exclusions
    taxonomy.layers.layer_1_general_conditions
      .filter(c => c.condition_type === 'exclusion')
      .forEach(exclusion => {
        if (!comparison.exclusions_matrix[exclusion.condition]) {
          comparison.exclusions_matrix[exclusion.condition] = {};
        }
        productKeys.forEach(productKey => {
          if (exclusion.products && exclusion.products[productKey]) {
            comparison.exclusions_matrix[exclusion.condition][productKey] = 
              exclusion.products[productKey].condition_exist;
          }
        });
      });

    // Extract benefits
    taxonomy.layers.layer_2_benefits.forEach(benefit => {
      if (!comparison.benefits_matrix[benefit.benefit_name]) {
        comparison.benefits_matrix[benefit.benefit_name] = {};
      }
      productKeys.forEach(productKey => {
        if (benefit.products && benefit.products[productKey]) {
          comparison.benefits_matrix[benefit.benefit_name][productKey] = {
            exists: benefit.products[productKey].condition_exist,
            parameters: benefit.products[productKey].parameters || {}
          };
        }
      });
    });

    // Extract limits
    taxonomy.layers.layer_4_operational_parameters
      .filter(p => p.parameter_type === 'limit')
      .forEach(param => {
        if (!comparison.limits_matrix[param.parameter_name]) {
          comparison.limits_matrix[param.parameter_name] = {};
        }
        productKeys.forEach(productKey => {
          if (param.products && param.products[productKey]) {
            comparison.limits_matrix[param.parameter_name][productKey] = 
              param.products[productKey].parameters || {};
          }
        });
      });

    return comparison;
  }

  /**
   * Recommend a product based on trip profile
   */
  async recommendProduct(tripData) {
    const { age, existing_conditions, activities, trip_type, departure_date, return_date, number_of_adults, number_of_children } = tripData;
    
    // Calculate trip duration in days
    let duration = 7; // default 7 days
    if (departure_date && return_date) {
      try {
        const depDate = new Date(departure_date);
        const retDate = new Date(return_date);
        const diffTime = Math.abs(retDate - depDate);
        duration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 7;
      } catch (error) {
        console.error('Error calculating duration:', error);
      }
    }
    
    // Calculate number of travelers
    const travelers = (number_of_adults || 1) + (number_of_children || 0);
    
    // Base prices per day per traveler
    const basePrices = {
      'Product A': 8,   // Scootsurance: $8 per day per person
      'Product B': 12,  // TravelEasy Policy: $12 per day per person
      'Product C': 15   // TravelEasy Pre-Ex Policy: $15 per day per person
    };
    
    // Product mapping
    const products = [
      { 
        key: 'Product A', 
        name: 'Scootsurance',
        basePrice: basePrices['Product A']
      },
      { 
        key: 'Product B', 
        name: 'TravelEasy Policy',
        basePrice: basePrices['Product B']
      },
      { 
        key: 'Product C', 
        name: 'TravelEasy Pre-Ex Policy',
        basePrice: basePrices['Product C']
      }
    ];
    
    // Decision logic based on key factors
    let recommendedProduct = products[0]; // Default: Scootsurance
    
    // If has existing medical conditions -> Pre-Ex (Product C)
    if (existing_conditions) {
      recommendedProduct = products[2]; // TravelEasy Pre-Ex
    }
    // If round trip and multiple benefits needed -> TravelEasy Policy (Product B)
    else if (trip_type === 'RT' && (activities && activities.length > 0)) {
      recommendedProduct = products[1]; // TravelEasy Policy
    }
    
    // Calculate total price
    const totalPrice = recommendedProduct.basePrice * duration * travelers;
    
    // Return product with pricing information
    return {
      ...recommendedProduct,
      duration,
      travelers,
      price: totalPrice
    };
  }
}

