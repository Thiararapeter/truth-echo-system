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

    const { statementId } = await req.json()

    if (!statementId) {
      return new Response(
        JSON.stringify({ error: 'Statement ID is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Fetch the statement
    const { data: statement, error: fetchError } = await supabase
      .from('veritas_chain')
      .select('*')
      .eq('id', statementId)
      .single()

    if (fetchError || !statement) {
      return new Response(
        JSON.stringify({ error: 'Statement not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
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

Statement: "${statement.statement}"
Speaker: ${statement.speaker}
Date: ${statement.statement_date || 'Unknown'}
Source: ${statement.source_url || 'No source provided'}

Please provide:
1. Verification Status: VERIFIED, UNVERIFIED, or DISPUTED
2. Confidence Level: HIGH, MEDIUM, or LOW
3. Key Facts: List 2-3 key factual claims that can be verified
4. Issues Found: Any factual errors, misleading context, or concerns
5. Additional Context: Relevant background information
6. Recommendation: Whether this statement should be trusted

Format your response as JSON with these exact keys: status, confidence, keyFacts, issues, context, recommendation, reasoning`

    // Call Mistral API
    const aiResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
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
    })

    if (!aiResponse.ok) {
      console.error('Mistral API error:', await aiResponse.text())
      throw new Error('Failed to get AI verification')
    }

    const aiData = await aiResponse.json()
    let verification

    try {
      // Try to parse the AI response as JSON
      verification = JSON.parse(aiData.choices[0].message.content)
    } catch (parseError) {
      // Fallback to raw text if JSON parsing fails
      verification = {
        status: 'UNVERIFIED',
        confidence: 'LOW',
        reasoning: aiData.choices[0].message.content,
        keyFacts: [],
        issues: ['AI response parsing failed'],
        context: '',
        recommendation: 'Manual review required'
      }
    }

    console.log('Verification completed for statement:', statementId)

    return new Response(
      JSON.stringify({
        statementId,
        statement: statement.statement,
        speaker: statement.speaker,
        verification,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in verify-statement function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})