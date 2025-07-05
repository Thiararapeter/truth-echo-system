import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/integrations/supabase/client'
import { Send, Bot, User, ExternalLink, Shield, Clock } from 'lucide-react'

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
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const { data, error } = await supabase.functions.invoke('ask-veritas', {
        body: { query: input.trim() }
      })

      if (error) {
        console.error('Function error:', error)
        throw new Error('Failed to get response')
      }

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: data.answer,
        timestamp: new Date(),
        sources: data.sources,
        confidence: data.confidence
      }

      setMessages(prev => [...prev, botMessage])

    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: "I'm sorry, I encountered an error while processing your request. Please try again.",
        timestamp: new Date(),
        confidence: 'low'
      }
      setMessages(prev => [...prev, errorMessage])
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Veritas</h1>
            <Badge variant="outline" className="text-xs">
              Truth Verification System
            </Badge>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.location.href = '/admin'}>
            Admin Portal
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-3 max-w-3xl ${message.type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${message.type === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
                  {message.type === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                
                <Card className={`${message.type === 'user' ? 'bg-primary text-primary-foreground' : 'bg-white'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="text-sm opacity-70 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {message.timestamp.toLocaleTimeString()}
                      </div>
                      {message.confidence && getConfidenceBadge(message.confidence)}
                    </div>
                    
                    <p className="text-sm leading-relaxed">{message.content}</p>
                    
                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-border/20">
                        <p className="text-xs font-medium mb-2 opacity-70">Sources:</p>
                        <div className="space-y-2">
                          {message.sources.map((source, index) => (
                            <div key={index} className="text-xs bg-background/10 rounded p-2">
                              <p className="font-medium">"{source.statement}"</p>
                              <p className="opacity-70">— {source.speaker} {source.date && `(${source.date})`}</p>
                              {source.source_url && (
                                <a 
                                  href={source.source_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline mt-1"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Source
                                </a>
                              )}
                              <p className="text-xs opacity-50 mt-1">Block: {source.block_hash}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex gap-3 max-w-3xl">
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-secondary text-secondary-foreground">
                  <Bot className="h-4 w-4" />
                </div>
                <Card className="bg-white">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                      Veritas is thinking...
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white/80 backdrop-blur-sm border-t p-4">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me to verify a statement or quote..."
              className="flex-1"
              disabled={isLoading}
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}