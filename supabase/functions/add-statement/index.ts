import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Simple hash function for demonstration
function simpleHash(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { statement, speaker, sourceUrl, statementDate } = await req.json()

    if (!statement || !speaker) {
      return new Response(
        JSON.stringify({ error: 'Statement and speaker are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Get the last block to chain hashes
    const { data: lastBlock } = await supabase
      .from('veritas_chain')
      .select('block_hash')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const previousHash = lastBlock?.block_hash || '0'
    
    // Create statement hash
    const statementHash = simpleHash(statement + speaker + (sourceUrl || ''))
    
    // Create block hash (combines statement hash with previous hash)
    const blockHash = simpleHash(statementHash + previousHash + Date.now().toString())

    // Insert the new statement
    const { data, error } = await supabase
      .from('veritas_chain')
      .insert({
        statement,
        speaker,
        source_url: sourceUrl,
        statement_date: statementDate,
        statement_hash: statementHash,
        previous_hash: previousHash,
        block_hash: blockHash
      })
      .select()

    if (error) {
      console.error('Database error:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to add statement' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    console.log('Statement added successfully:', data)
    return new Response(
      JSON.stringify({ 
        success: true, 
        data: data[0],
        message: 'Statement added to the Veritas chain' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in add-statement function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})