import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Instead of expecting a statementId, we now expect the statement directly
    const { statement, speaker, sourceUrl, statementDate } = await req.json()

    if (!statement) {
      return new Response(
        JSON.stringify({ error: 'Statement is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const mistralApiKey = Deno.env.get('MISTRAL_API_KEY')
    
    if (!mistralApiKey) {
      return new Response(
        JSON.stringify({ error: 'Mistral API key not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Create verification prompt
    const prompt = `As a fact-checking expert, analyze this statement for accuracy:

Statement: "${statement}"
Speaker: ${speaker || 'Unknown'}
Date: ${statementDate || 'Unknown'}
Source: ${sourceUrl || 'No source provided'}

Please provide:
1. Verification Status: VERIFIED, UNVERIFIED, or DISPUTED
2. Confidence Level: HIGH, MEDIUM, or LOW
3. Key Facts: List 2-3 key factual claims that can be verified
4. Issues Found: Any factual errors, misleading context, or concerns
5. Additional Context: Relevant background information
6. Recommendation: Whether this statement should be trusted

Format your response as JSON with these exact keys: status, confidence, keyFacts, issues, context, recommendation, reasoning`

    // Call Mistral API
    let aiResponse;
    try {
      aiResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mistralApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: [
            { role: 'system', content: 'You are a professional fact-checker. Always respond with valid JSON only.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 1000,
          temperature: 0.1
        }),
      });
    } catch (fetchError) {
      console.error('Mistral API network error:', fetchError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to connect to Mistral API', 
          details: fetchError.message 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      );
    }

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      let errorDetails;
      
      try {
        // Try to parse error as JSON
        errorDetails = JSON.parse(errorText);
      } catch {
        // If not JSON, use text as is
        errorDetails = errorText;
      }
      
      console.error('Mistral API error response:', errorDetails);
      
      return new Response(
        JSON.stringify({ 
          error: 'Mistral API returned an error', 
          status: aiResponse.status,
          details: errorDetails
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      );
    }

    let aiData;
    try {
      aiData = await aiResponse.json();
    } catch (jsonError) {
      console.error('Failed to parse Mistral API response as JSON:', jsonError);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid response from Mistral API', 
          details: 'Response could not be parsed as JSON' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      );
    }
    
    if (!aiData.choices || !aiData.choices[0] || !aiData.choices[0].message || !aiData.choices[0].message.content) {
      console.error('Unexpected Mistral API response structure:', aiData);
      return new Response(
        JSON.stringify({ 
          error: 'Unexpected response structure from Mistral API',
          details: aiData
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      );
    }

    let verification;
    try {
      // Try to parse the AI response as JSON
      verification = JSON.parse(aiData.choices[0].message.content);
      
      // Validate required fields
      const requiredFields = ['status', 'confidence', 'keyFacts', 'issues', 'context', 'recommendation', 'reasoning'];
      const missingFields = requiredFields.filter(field => !verification[field]);
      
      if (missingFields.length > 0) {
        console.warn('Missing fields in verification response:', missingFields);
        // Add missing fields with default values
        missingFields.forEach(field => {
          if (field === 'keyFacts' || field === 'issues') {
            verification[field] = [];
          } else {
            verification[field] = field === 'status' ? 'UNVERIFIED' : 
                                 field === 'confidence' ? 'LOW' : 
                                 'Not provided';
          }
        });
      }
      
    } catch (parseError) {
      console.error('Failed to parse AI content as JSON:', parseError);
      // Fallback to raw text if JSON parsing fails
      verification = {
        status: 'UNVERIFIED',
        confidence: 'LOW',
        reasoning: aiData.choices[0].message.content,
        keyFacts: [],
        issues: ['AI response parsing failed'],
        context: '',
        recommendation: 'Manual review required'
      };
    }

    console.log('Verification completed for statement');

    // Optionally store the verification result in the database
    try {
      if (statement && speaker) {
        // Generate a simple hash for the statement
        const statementHash = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(statement + speaker)
        );
        
        // Convert hash to hex string
        const hashArray = Array.from(new Uint8Array(statementHash));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        // Get the last block to chain hashes
        const { data: lastBlock } = await supabase
          .from('veritas_chain')
          .select('block_hash')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        const previousHash = lastBlock?.block_hash || '0';
        
        // Create block hash (combines statement hash with previous hash)
        const blockHashData = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(hashHex + previousHash + Date.now().toString())
        );
        
        // Convert block hash to hex string
        const blockHashArray = Array.from(new Uint8Array(blockHashData));
        const blockHash = blockHashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Store in database with verification result
        await supabase
          .from('veritas_chain')
          .insert({
            statement,
            speaker,
            source_url: sourceUrl,
            statement_date: statementDate,
            statement_hash: hashHex,
            previous_hash: previousHash,
            block_hash: blockHash,
            verification_status: verification.status,
            verification_confidence: verification.confidence
          });
      }
    } catch (dbError) {
      // Just log the error, don't fail the request
      console.error('Failed to store verification in database:', dbError);
    }

    return new Response(
      JSON.stringify({
        statement,
        speaker: speaker || 'Unknown',
        verification,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in verify-statement function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        stack: error.stack
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});