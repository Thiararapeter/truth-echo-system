import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { Shield, Database, CheckCircle } from 'lucide-react'

export default function Admin() {
  const [statement, setStatement] = useState('')
  const [speaker, setSpeaker] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [statementDate, setStatementDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!statement.trim() || !speaker.trim()) {
      toast.error('Statement and speaker are required')
      return
    }

    setIsSubmitting(true)

    try {
      const { data, error } = await supabase.functions.invoke('add-statement', {
        body: {
          statement: statement.trim(),
          speaker: speaker.trim(),
          sourceUrl: sourceUrl.trim() || null,
          statementDate: statementDate || null
        }
      })

      if (error) {
        console.error('Function error:', error)
        toast.error('Failed to add statement')
        return
      }

      console.log('Statement added:', data)
      toast.success('Statement successfully added to the Veritas chain!')
      
      // Clear form
      setStatement('')
      setSpeaker('')
      setSourceUrl('')
      setStatementDate('')

    } catch (error) {
      console.error('Submit error:', error)
      toast.error('An error occurred while adding the statement')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-2xl mx-auto pt-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Shield className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Veritas Admin Portal</h1>
          </div>
          <p className="text-muted-foreground">
            Add verified statements to the truth blockchain
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Add New Statement
            </CardTitle>
            <CardDescription>
              Enter a verified statement to add to the Veritas chain. Each statement will be cryptographically hashed and linked to the previous block.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="statement" className="text-sm font-medium">
                  Statement *
                </Label>
                <Textarea
                  id="statement"
                  placeholder="Enter the verified statement or quote..."
                  value={statement}
                  onChange={(e) => setStatement(e.target.value)}
                  className="min-h-24 resize-none"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="speaker" className="text-sm font-medium">
                  Speaker *
                </Label>
                <Input
                  id="speaker"
                  placeholder="Name of the person who made this statement"
                  value={speaker}
                  onChange={(e) => setSpeaker(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sourceUrl" className="text-sm font-medium">
                  Source URL
                </Label>
                <Input
                  id="sourceUrl"
                  type="url"
                  placeholder="https://example.com/article"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="statementDate" className="text-sm font-medium">
                  Statement Date
                </Label>
                <Input
                  id="statementDate"
                  type="date"
                  value={statementDate}
                  onChange={(e) => setStatementDate(e.target.value)}
                />
              </div>

              <Button 
                type="submit" 
                className="w-full h-11"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Adding to Chain...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Add to Veritas Chain
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <Button variant="outline" onClick={() => window.location.href = '/'}>
            Back to Chatbot
          </Button>
        </div>
      </div>
    </div>
  )
}