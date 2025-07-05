import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/integrations/supabase/client'
import { Send, Bot, User, ExternalLink, Shield, Clock } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'

interface Message {
  id: string
  type: 'user' | 'bot'
  content: string
  timestamp: Date
  sources?: Array<{
    statement: string
    speaker: string
    date?: string
    source_url?: string
    block_hash: string
  }>
  confidence?: 'low' | 'medium' | 'high'
}

export default function Chatbot() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'bot',
      content: "Hello! I'm Veritas, your fact-checking assistant. I can help you verify statements and quotes using our blockchain-verified database. What would you like to fact-check?",
      timestamp: new Date(),
      confidence: 'high'
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState('')
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Initialize session ID and load chat history
  useEffect(() => {
    // Get or create session ID
    let existingSessionId = localStorage.getItem('veritas_session_id')
    if (!existingSessionId) {
      existingSessionId = uuidv4()
      localStorage.setItem('veritas_session_id', existingSessionId)
    }
    setSessionId(existingSessionId)
    
    // Load chat history
    const loadChatHistory = async () => {
      try {
        const { data, error } = await supabase
          .from('chat_history')
          .select('*')
          .eq('session_id', existingSessionId)
          .order('created_at', { ascending: true })
        
        if (error) {
          console.error('Error loading chat history:', error)
          return
        }
        
        if (data && data.length > 0) {
          // Convert data to Message format
          const historyMessages: Message[] = data.map(msg => ({
            id: msg.id,
            type: msg.message_type as 'user' | 'bot',
            content: msg.content,
            timestamp: new Date(msg.created_at),
            sources: msg.sources,
            confidence: msg.confidence as 'low' | 'medium' | 'high' | undefined
          }))
          
          setMessages(historyMessages)
        }
      } catch (err) {
        console.error('Failed to load chat history:', err)
      } finally {
        setIsLoadingHistory(false)
      }
    }
    
    loadChatHistory()
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Store message in database
  const saveChatMessage = async (message: Message) => {
    if (!sessionId) return
    
    try {
      const { error } = await supabase
        .from('chat_history')
        .insert({
          id: message.id,
          session_id: sessionId,
          message_type: message.type,
          content: message.content,
          sources: message.sources || null,
          confidence: message.confidence || null
        })
      
      if (error) {
        console.error('Error saving chat message:', error)
      }
    } catch (err) {
      console.error('Failed to save chat message:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: uuidv4(),
      type: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    
    // Save user message to database
    await saveChatMessage(userMessage)

    try {
      const { data, error } = await supabase.functions.invoke('ask-veritas', {
        body: { query: input.trim() }
      })

      if (error) {
        console.error('Function error:', error)
        throw new Error('Failed to get response')
      }

      const botMessage: Message = {
        id: uuidv4(),
        type: 'bot',
        content: data.answer,
        timestamp: new Date(),
        sources: data.sources,
        confidence: data.confidence
      }

      setMessages(prev => [...prev, botMessage])
      
      // Save bot message to database
      await saveChatMessage(botMessage)

    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage: Message = {
        id: uuidv4(),
        type: 'bot',
        content: "I'm sorry, I encountered an error while processing your request. Please try again.",
        timestamp: new Date(),
        confidence: 'low'
      }
      setMessages(prev => [...prev, errorMessage])
      
      // Save error message to database
      await saveChatMessage(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const getConfidenceBadge = (confidence?: string) => {
    if (!confidence) return null
    
    const colors = {
      high: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800', 
      low: 'bg-red-100 text-red-800'
    }

    return (
      <Badge variant="secondary" className={`text-xs ${colors[confidence as keyof typeof colors]}`}>
        {confidence} confidence
      </Badge>
    )
  }

  const clearChatHistory = async () => {
    if (!sessionId || !window.confirm('Are you sure you want to clear your chat history?')) return
    
    try {
      // Delete from database
      const { error } = await supabase
        .from('chat_history')
        .delete()
        .eq('session_id', sessionId)
      
      if (error) {
        console.error('Error clearing chat history:', error)
        return
      }
      
      // Reset UI
      setMessages([{
        id: uuidv4(),
        type: 'bot',
        content: "Hello! I'm Veritas, your fact-checking assistant. I can help you verify statements and quotes using our blockchain-verified database. What would you like to fact-check?",
        timestamp: new Date(),
        confidence: 'high'
      }])
    } catch (err) {
      console.error('Failed to clear chat history:', err)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-3xl mx-auto pt-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Shield className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Veritas</h1>
          </div>
          <p className="text-muted-foreground">
            AI-powered fact-checking using blockchain-verified statements
          </p>
        </div>

        <Card className="shadow-lg mb-4">
          <CardContent className="p-0">
            <div className="flex justify-between items-center p-4 border-b">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                <span className="font-medium">Veritas Chatbot</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={clearChatHistory}
                className="text-xs flex items-center gap-1"
              >
                <Clock className="h-3 w-3" />
                Clear History
              </Button>
            </div>

            <div className="h-[500px] overflow-y-auto p-4 space-y-4">
              {isLoadingHistory ? (
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.type === 'bot' ? 'justify-start' : 'justify-end'
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        message.type === 'bot'
                          ? 'bg-muted text-foreground'
                          : 'bg-primary text-primary-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {message.type === 'bot' ? (
                          <Bot className="h-4 w-4" />
                        ) : (
                          <User className="h-4 w-4" />
                        )}
                        <span className="text-xs font-medium">
                          {message.type === 'bot' ? 'Veritas' : 'You'}
                        </span>
                        {message.type === 'bot' && getConfidenceBadge(message.confidence)}
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      
                      {message.sources && message.sources.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-t-gray-200">
                          <p className="text-xs font-medium mb-1">Sources:</p>
                          <ul className="space-y-2">
                            {message.sources.map((source, index) => (
                              <li key={index} className="text-xs">
                                <p className="italic">"{source.statement}"</p>
                                <p className="flex items-center gap-1">
                                  — {source.speaker}
                                  {source.source_url && (
                                    <a
                                      href={source.source_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center text-primary hover:underline"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <Input
                  placeholder="Ask a question about a statement or fact..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button type="submit" disabled={isLoading || !input.trim()}>
                  {isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <Button variant="outline" onClick={() => window.location.href = '/admin'}>
            Admin Portal
          </Button>
        </div>
      </div>
    </div>
  )
}