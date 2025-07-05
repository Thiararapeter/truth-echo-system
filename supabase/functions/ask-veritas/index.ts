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
    const { query } = await req.json()

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log('Processing query:', query)

    const mistralApiKey = Deno.env.get('MISTRAL_API_KEY')
    
    if (!mistralApiKey) {
      return new Response(
        JSON.stringify({ error: 'Mistral API key not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Use Mistral AI directly without querying the database first
    const prompt = `You are Veritas, a fact-checking assistant. A user has asked the following question:

User Query: ${query}

Please provide a factual response that:
1. Directly addresses the query with accurate information
2. Cites sources where appropriate
3. Indicates your confidence level in the answer (HIGH, MEDIUM, or LOW)
4. Acknowledges any limitations or uncertainties
5. Is objective and unbiased

Your response should be informative, helpful, and factually accurate.`

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
            { role: 'system', content: 'You are Veritas, a precise fact-checking assistant that provides accurate information based on verified facts.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 800,
          temperature: 0.1
        }),
      });
    } catch (fetchError) {
      console.error('Mistral API network error:', fetchError);
      return new Response(
        JSON.stringify({
          answer: `I'm sorry, I couldn't connect to the fact-checking service. Please try again later.`,
          sources: [],
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
      
      return new Response(
        JSON.stringify({
          answer: `I'm sorry, I encountered an error while fact-checking. Please try again later.`,
          sources: [],
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
      return new Response(
        JSON.stringify({
          answer: `I'm sorry, I received an invalid response from the fact-checking service. Please try again later.`,
          sources: [],
          confidence: 'low',
          error: 'Invalid API response format'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!aiData.choices || !aiData.choices[0] || !aiData.choices[0].message || !aiData.choices[0].message.content) {
      console.error('Unexpected Mistral API response structure:', aiData);
      return new Response(
        JSON.stringify({
          answer: `I'm sorry, I received an unexpected response from the fact-checking service. Please try again later.`,
          sources: [],
          confidence: 'low',
          error: 'Unexpected API response structure'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const answer = aiData.choices[0].message.content;
    
    // Extract confidence level from the answer
    let confidence = 'medium';
    if (answer.includes('HIGH CONFIDENCE') || answer.includes('high confidence')) {
      confidence = 'high';
    } else if (answer.includes('LOW CONFIDENCE') || answer.includes('low confidence')) {
      confidence = 'low';
    }
    
    // Store the query and response in chat_history if needed
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? ''
      )
      
      // Optional: Store the query and response in chat_history
      // This is useful for analytics but not required for functionality
      await supabase.from('chat_history').insert({
        session_id: 'system',
        message_type: 'user',
        content: query,
        created_at: new Date().toISOString()
      });
      
      await supabase.from('chat_history').insert({
        session_id: 'system',
        message_type: 'bot',
        content: answer,
        confidence: confidence,
        created_at: new Date().toISOString()
      });
    } catch (dbError) {
      // Just log the error, don't fail the request
      console.error('Failed to store chat history:', dbError);
    }

    return new Response(
      JSON.stringify({
        answer,
        sources: [], // No sources from database since we're using direct API
        confidence
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