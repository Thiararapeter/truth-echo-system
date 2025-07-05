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

    const mistralApiKey = Deno.env.get('MISTRAL_API_KEY')
    
    if (!mistralApiKey) {
      return new Response(
        JSON.stringify({ error: 'Mistral API key not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // First, get all statements from the database to provide to Mistral
    const { data: allStatements, error: fetchError } = await supabase
      .from('veritas_chain')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)  // Limit to recent statements to avoid token limits

    if (fetchError) {
      console.error('Error fetching statements:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch statements from database' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    if (!allStatements || allStatements.length === 0) {
      return new Response(
        JSON.stringify({ 
          answer: "There are no statements in the Veritas database yet.",
          sources: [],
          confidence: 'low'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Format statements for the AI
    const statementsContext = allStatements.map(stmt => 
      JSON.stringify({
        id: stmt.id,
        statement: stmt.statement,
        speaker: stmt.speaker,
        date: stmt.statement_date || 'Unknown',
        source: stmt.source_url || 'No source provided',
        block_hash: stmt.block_hash
      })
    ).join('\n')

    // First Mistral API call to find relevant statements
    let searchResponse;
    try {
      searchResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mistralApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: [
            { 
              role: 'system', 
              content: 'You are a database search assistant. Your task is to find the most relevant statements from the database based on the user query. Return ONLY the IDs of the relevant statements as a JSON array with no additional text.' 
            },
            { 
              role: 'user', 
              content: `User query: "${query}"\n\nAvailable statements in database (each line is a JSON object):\n${statementsContext}\n\nReturn the IDs of the 3-5 most relevant statements as a JSON array like this: ["id1", "id2", "id3"]` 
            }
          ],
          max_tokens: 500,
          temperature: 0.1
        }),
      });
    } catch (fetchError) {
      console.error('Mistral API search error:', fetchError);
      // Fallback to direct database search
      return fallbackToDirectSearch(supabase, query, corsHeaders);
    }

    if (!searchResponse.ok) {
      console.error('Mistral API search error:', await searchResponse.text());
      // Fallback to direct database search
      return fallbackToDirectSearch(supabase, query, corsHeaders);
    }

    const searchData = await searchResponse.json();
    let relevantIds;

    try {
      // Extract the array of IDs from the AI response
      const content = searchData.choices[0].message.content;
      // Try to parse the content as JSON
      relevantIds = JSON.parse(content);
      
      if (!Array.isArray(relevantIds)) {
        throw new Error('Response is not an array');
      }
    } catch (parseError) {
      console.error('Failed to parse relevant IDs:', parseError);
      // Fallback to direct database search
      return fallbackToDirectSearch(supabase, query, corsHeaders);
    }

    // Get the relevant statements based on the IDs
    const { data: relevantStatements } = await supabase
      .from('veritas_chain')
      .select('*')
      .in('id', relevantIds)
      .limit(5);

    if (!relevantStatements || relevantStatements.length === 0) {
      return new Response(
        JSON.stringify({ 
          answer: "I couldn't find any relevant statements in the Veritas database for your query.",
          sources: [],
          confidence: 'low'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Found statements:', relevantStatements.length)

    // Prepare context for AI
    const context = relevantStatements.map(stmt => 
      `Statement: "${stmt.statement}"\nSpeaker: ${stmt.speaker}\nDate: ${stmt.statement_date || 'Unknown'}\nSource: ${stmt.source_url || 'No source provided'}`
    ).join('\n\n')

    // Make request to Mistral AI for the answer
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

// Fallback function for direct database search
async function fallbackToDirectSearch(supabase, query, corsHeaders) {
  console.log('Falling back to direct database search');
  
  // Search for relevant statements using text search
  const { data: statements, error: searchError } = await supabase
    .from('veritas_chain')
    .select('*')
    .textSearch('statement', query, { type: 'websearch' })
    .limit(5);

  if (searchError) {
    console.error('Search error:', searchError);
    // Fallback to simple word matching
    const words = query.toLowerCase().split(' ').filter(word => word.length > 2);
    const { data: fallbackStatements } = await supabase
      .from('veritas_chain')
      .select('*')
      .or(words.map(word => `statement.ilike.%${word}%`).join(','))
      .limit(5);
    
    if (!fallbackStatements || fallbackStatements.length === 0) {
      return new Response(
        JSON.stringify({ 
          answer: "I couldn't find any relevant statements in the Veritas database for your query.",
          sources: [],
          confidence: 'low'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({
        answer: `Based on the Veritas database, I found ${fallbackStatements.length} relevant statement(s) that might answer your query.`,
        sources: fallbackStatements.map(stmt => ({
          statement: stmt.statement,
          speaker: stmt.speaker,
          date: stmt.statement_date,
          source_url: stmt.source_url,
          block_hash: stmt.block_hash
        })),
        confidence: 'medium'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!statements || statements.length === 0) {
    return new Response(
      JSON.stringify({ 
        answer: "I couldn't find any relevant statements in the Veritas database for your query.",
        sources: [],
        confidence: 'low'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      answer: `Based on the Veritas database, I found ${statements.length} relevant statement(s) that might answer your query.`,
      sources: statements.map(stmt => ({
        statement: stmt.statement,
        speaker: stmt.speaker,
        date: stmt.statement_date,
        source_url: stmt.source_url,
        block_hash: stmt.block_hash
      })),
      confidence: 'medium'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}