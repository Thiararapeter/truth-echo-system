-- Create the veritas_chain table for storing statements and their blockchain-like verification
CREATE TABLE public.veritas_chain (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  statement TEXT NOT NULL,
  speaker TEXT NOT NULL,
  source_url TEXT,
  statement_date DATE,
  statement_hash TEXT NOT NULL,
  previous_hash TEXT,
  block_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.veritas_chain ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access (chatbot needs to query)
CREATE POLICY "Anyone can view statements" 
ON public.veritas_chain 
FOR SELECT 
USING (true);

-- Create policy for admin insert (we'll add admin auth later)
CREATE POLICY "Admins can insert statements" 
ON public.veritas_chain 
FOR INSERT 
WITH CHECK (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_veritas_chain_updated_at
  BEFORE UPDATE ON public.veritas_chain
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster searches
CREATE INDEX idx_veritas_chain_speaker ON public.veritas_chain(speaker);
CREATE INDEX idx_veritas_chain_statement_text ON public.veritas_chain USING gin(to_tsvector('english', statement));

-- Create chat_history table to store past conversations
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

-- Create policies for public access (anyone can read/write their own chat history)
CREATE POLICY "Anyone can view chat history" 
ON public.chat_history 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert chat messages" 
ON public.chat_history 
FOR INSERT 
WITH CHECK (true);

-- Create index for faster chat history retrieval
CREATE INDEX idx_chat_history_session_id ON public.chat_history(session_id);
CREATE INDEX idx_chat_history_created_at ON public.chat_history(created_at);