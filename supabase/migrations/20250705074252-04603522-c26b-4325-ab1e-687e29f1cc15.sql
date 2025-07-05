-- Check if veritas_chain table exists and alter it if it does
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'veritas_chain') THEN
        -- Add new columns if they don't exist
        BEGIN
            ALTER TABLE public.veritas_chain ADD COLUMN verification_status TEXT;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END;
        
        BEGIN
            ALTER TABLE public.veritas_chain ADD COLUMN verification_confidence TEXT;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END;
    ELSE
        -- Create the table if it doesn't exist
        CREATE TABLE public.veritas_chain (
          id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
          statement TEXT NOT NULL,
          speaker TEXT NOT NULL,
          source_url TEXT,
          statement_date DATE,
          statement_hash TEXT NOT NULL,
          previous_hash TEXT,
          block_hash TEXT NOT NULL,
          verification_status TEXT,
          verification_confidence TEXT,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
    END IF;
END
$$;

-- Enable Row Level Security (does nothing if already enabled)
ALTER TABLE public.veritas_chain ENABLE ROW LEVEL SECURITY;

-- Create policies if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'veritas_chain' AND policyname = 'Anyone can view statements'
    ) THEN
        CREATE POLICY "Anyone can view statements" 
        ON public.veritas_chain 
        FOR SELECT 
        USING (true);
    END IF;
    
    IF NOT EXISTS (
        SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'veritas_chain' AND policyname = 'Admins can insert statements'
    ) THEN
        CREATE POLICY "Admins can insert statements" 
        ON public.veritas_chain 
        FOR INSERT 
        WITH CHECK (true);
    END IF;
END
$$;

-- Create function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_trigger WHERE tgname = 'update_veritas_chain_updated_at'
    ) THEN
        CREATE TRIGGER update_veritas_chain_updated_at
        BEFORE UPDATE ON public.veritas_chain
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END
$$;

-- Create indexes if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'veritas_chain' AND indexname = 'idx_veritas_chain_speaker'
    ) THEN
        CREATE INDEX idx_veritas_chain_speaker ON public.veritas_chain(speaker);
    END IF;
    
    IF NOT EXISTS (
        SELECT FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'veritas_chain' AND indexname = 'idx_veritas_chain_statement_text'
    ) THEN
        CREATE INDEX idx_veritas_chain_statement_text ON public.veritas_chain USING gin(to_tsvector('english', statement));
    END IF;
    
    IF NOT EXISTS (
        SELECT FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'veritas_chain' AND indexname = 'idx_veritas_chain_verification_status'
    ) THEN
        CREATE INDEX idx_veritas_chain_verification_status ON public.veritas_chain(verification_status);
    END IF;
END
$$;

-- Check if chat_history table exists and create it if it doesn't
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'chat_history') THEN
        CREATE TABLE public.chat_history (
          id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
          session_id TEXT NOT NULL,
          message_type TEXT NOT NULL CHECK (message_type IN ('user', 'bot')),
          content TEXT NOT NULL,
          sources JSONB,
          confidence TEXT CHECK (confidence IN ('low', 'medium', 'high')),
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
        
        -- Enable Row Level Security
        ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;
        
        -- Create policies
        CREATE POLICY "Anyone can view chat history" 
        ON public.chat_history 
        FOR SELECT 
        USING (true);
        
        CREATE POLICY "Anyone can insert chat messages" 
        ON public.chat_history 
        FOR INSERT 
        WITH CHECK (true);
        
        -- Create indexes
        CREATE INDEX idx_chat_history_session_id ON public.chat_history(session_id);
        CREATE INDEX idx_chat_history_created_at ON public.chat_history(created_at);
    END IF;
END
$$;