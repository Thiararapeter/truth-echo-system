import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const { query } = await req.json()

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log('Processing query:', query)

    // Search for relevant statements using text search
    const { data: statements, error: searchError } = await supabase
      .from('veritas_chain')
      .select('*')
      .textSearch('statement', query, { type: 'websearch' })
      .limit(5)

    if (searchError) {
      console.error('Search error:', searchError)
      // Fallback to simple word matching
      const words = query.toLowerCase().split(' ').filter(word => word.length > 2)
      const { data: fallbackStatements } = await supabase
        .from('veritas_chain')
        .select('*')
        .or(words.map(word => `statement.ilike.%${word}%`).join(','))
        .limit(5)
      
      if (!fallbackStatements || fallbackStatements.length === 0) {
        return new Response(
          JSON.stringify({ 
            answer: "I couldn't find any relevant statements in the Veritas database for your query.",
            sources: [],
            confidence: 'low'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    const relevantStatements = statements || []
    console.log('Found statements:', relevantStatements.length)

    if (relevantStatements.length === 0) {
      return new Response(
        JSON.stringify({ 
          answer: "I couldn't find any relevant statements in the Veritas database for your query.",
          sources: [],
          confidence: 'low'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Prepare context for AI
    const context = relevantStatements.map(stmt => 
      `Statement: "${stmt.statement}"\nSpeaker: ${stmt.speaker}\nDate: ${stmt.statement_date || 'Unknown'}\nSource: ${stmt.source_url || 'No source provided'}`
    ).join('\n\n')

    const mistralApiKey = Deno.env.get('MISTRAL_API_KEY')
    
    if (!mistralApiKey) {
      // Return basic response without AI when API key is not available
      return new Response(
        JSON.stringify({
          answer: `Based on the Veritas database, I found ${relevantStatements.length} relevant statement(s). Here are the details: ${context}`,
          sources: relevantStatements.map(stmt => ({
            statement: stmt.statement,
            speaker: stmt.speaker,
            date: stmt.statement_date,
            source_url: stmt.source_url,
            block_hash: stmt.block_hash
          })),
          confidence: 'medium'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Make request to Mistral AI
    const prompt = `You are Veritas, a fact-checking assistant. Based on the following verified statements from our database, answer the user's query accurately and concisely.

Context from Veritas Database:
${context}

User Query: ${query}

Instructions:
- Only use information from the provided context
- If the context doesn't contain relevant information, say so clearly
- Cite the speaker and source when referencing statements
- Be factual and objective
- Keep your response concise but informative`

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
            { role: 'system', content: 'You are Veritas, a precise fact-checking assistant that only uses verified information from a trusted database.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 500,
          temperature: 0.1
        }),
      });
    } catch (fetchError) {
      console.error('Mistral API network error:', fetchError);
      // Fallback to basic response without AI
      return new Response(
        JSON.stringify({
          answer: `I found relevant information but couldn't connect to the AI service. Here's what I found: ${relevantStatements.length} relevant statements about your query.`,
          sources: relevantStatements.map(stmt => ({
            statement: stmt.statement,
            speaker: stmt.speaker,
            date: stmt.statement_date,
            source_url: stmt.source_url,
            block_hash: stmt.block_hash
          })),
          confidence: 'low',
          error: `API connection error: ${fetchError.message}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      
      // Fallback to basic response without AI
      return new Response(
        JSON.stringify({
          answer: `I found relevant information but encountered an error with the AI service. Here's what I found: ${relevantStatements.length} relevant statements about your query.`,
          sources: relevantStatements.map(stmt => ({
            statement: stmt.statement,
            speaker: stmt.speaker,
            date: stmt.statement_date,
            source_url: stmt.source_url,
            block_hash: stmt.block_hash
          })),
          confidence: 'low',
          error: `API error (${aiResponse.status}): ${JSON.stringify(errorDetails)}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let aiData;
    try {
      aiData = await aiResponse.json();
    } catch (jsonError) {
      console.error('Failed to parse Mistral API response as JSON:', jsonError);
      // Fallback to basic response
      return new Response(
        JSON.stringify({
          answer: `I found relevant information but received an invalid response from the AI service. Here's what I found: ${relevantStatements.length} relevant statements about your query.`,
          sources: relevantStatements.map(stmt => ({
            statement: stmt.statement,
            speaker: stmt.speaker,
            date: stmt.statement_date,
            source_url: stmt.source_url,
            block_hash: stmt.block_hash
          })),
          confidence: 'low',
          error: 'Invalid API response format'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!aiData.choices || !aiData.choices[0] || !aiData.choices[0].message || !aiData.choices[0].message.content) {
      console.error('Unexpected Mistral API response structure:', aiData);
      // Fallback to basic response
      return new Response(
        JSON.stringify({
          answer: `I found relevant information but received an unexpected response from the AI service. Here's what I found: ${relevantStatements.length} relevant statements about your query.`,
          sources: relevantStatements.map(stmt => ({
            statement: stmt.statement,
            speaker: stmt.speaker,
            date: stmt.statement_date,
            source_url: stmt.source_url,
            block_hash: stmt.block_hash
          })),
          confidence: 'low',
          error: 'Unexpected API response structure'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const answer = aiData.choices[0].message.content;

    return new Response(
      JSON.stringify({
        answer,
        sources: relevantStatements.map(stmt => ({
          statement: stmt.statement,
          speaker: stmt.speaker,
          date: stmt.statement_date,
          source_url: stmt.source_url,
          block_hash: stmt.block_hash
        })),
        confidence: 'high'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ask-veritas function:', error);
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