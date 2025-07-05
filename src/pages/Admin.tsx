import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, Database, CheckCircle, Search, AlertTriangle, ExternalLink } from 'lucide-react'

export default function Admin() {
  const [statement, setStatement] = useState('')
  const [speaker, setSpeaker] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [statementDate, setStatementDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [verificationResults, setVerificationResults] = useState<any>({})
  
  const queryClient = useQueryClient()

  // Query to fetch existing statements
  const { data: statements, isLoading: statementsLoading } = useQuery({
    queryKey: ['statements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('veritas_chain')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)
      
      if (error) throw error
      return data
    }
  })

  // Mutation for verifying statements
  const verifyMutation = useMutation({
    mutationFn: async (statementId: string) => {
      const { data, error } = await supabase.functions.invoke('verify-statement', {
        body: { statementId }
      })
      
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      setVerificationResults(prev => ({
        ...prev,
        [data.statementId]: data.verification
      }))
      toast.success('Statement verification completed!')
    },
    onError: (error) => {
      console.error('Verification error:', error)
      toast.error('Failed to verify statement')
    }
  })

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

      // Refresh statements list
      queryClient.invalidateQueries({ queryKey: ['statements'] })

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

        {/* Statement Verification Section */}
        <Card className="shadow-lg mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Fact Verification Pipeline
            </CardTitle>
            <CardDescription>
              Use AI to verify the accuracy of existing statements in the Veritas chain.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statementsLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading statements...
              </div>
            ) : statements && statements.length > 0 ? (
              <div className="space-y-4">
                {statements.map((stmt) => (
                  <div key={stmt.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <p className="font-medium text-sm">"{stmt.statement}"</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          — {stmt.speaker} {stmt.statement_date && `(${stmt.statement_date})`}
                        </p>
                        {stmt.source_url && (
                          <a 
                            href={stmt.source_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Source
                          </a>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => verifyMutation.mutate(stmt.id)}
                        disabled={verifyMutation.isPending}
                      >
                        {verifyMutation.isPending && verifyMutation.variables === stmt.id ? (
                          <>
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary mr-1" />
                            Verifying...
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Verify
                          </>
                        )}
                      </Button>
                    </div>
                    
                    {/* Display verification results */}
                    {verificationResults[stmt.id] && (
                      <div className="mt-3 p-3 bg-muted rounded-md">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge 
                            variant={
                              verificationResults[stmt.id].status === 'VERIFIED' ? 'default' :
                              verificationResults[stmt.id].status === 'DISPUTED' ? 'destructive' : 'secondary'
                            }
                          >
                            {verificationResults[stmt.id].status}
                          </Badge>
                          <Badge variant="outline">
                            {verificationResults[stmt.id].confidence} confidence
                          </Badge>
                        </div>
                        
                        {verificationResults[stmt.id].reasoning && (
                          <p className="text-xs text-muted-foreground">
                            {verificationResults[stmt.id].reasoning}
                          </p>
                        )}
                        
                        {verificationResults[stmt.id].issues && verificationResults[stmt.id].issues.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium">Issues Found:</p>
                            <ul className="text-xs text-muted-foreground list-disc list-inside">
                              {verificationResults[stmt.id].issues.map((issue: string, index: number) => (
                                <li key={index}>{issue}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No statements found. Add some statements first to enable fact verification.
              </div>
            )}
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