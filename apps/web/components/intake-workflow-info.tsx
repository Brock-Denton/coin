import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, Circle, Upload, FileText, DollarSign, Package } from 'lucide-react'

interface WorkflowStep {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  status?: 'completed' | 'current' | 'pending'
}

interface IntakeWorkflowInfoProps {
  currentStep?: 'intake' | 'attribution' | 'pricing' | 'product'
  showTitle?: boolean
}

export function IntakeWorkflowInfo({ currentStep, showTitle = true }: IntakeWorkflowInfoProps) {
  const steps: WorkflowStep[] = [
    {
      id: 'intake',
      title: 'Create Intake',
      description: 'Create a new intake record for a physical coin',
      icon: <FileText className="w-5 h-5" />,
      status: currentStep === 'intake' ? 'current' : currentStep ? 'completed' : 'pending'
    },
    {
      id: 'attribution',
      title: 'Add Attribution',
      description: 'Upload photos and identify the coin (year, mintmark, grade, etc.)',
      icon: <Upload className="w-5 h-5" />,
      status: currentStep === 'attribution' ? 'current' : currentStep === 'pricing' || currentStep === 'product' ? 'completed' : 'pending'
    },
    {
      id: 'pricing',
      title: 'Run Pricing',
      description: 'Collect sold listings and compute valuation',
      icon: <DollarSign className="w-5 h-5" />,
      status: currentStep === 'pricing' ? 'current' : currentStep === 'product' ? 'completed' : 'pending'
    },
    {
      id: 'product',
      title: 'Create Product',
      description: 'Publish to storefront for sale',
      icon: <Package className="w-5 h-5" />,
      status: currentStep === 'product' ? 'current' : 'pending'
    }
  ]

  return (
    <Card>
      <CardHeader>
        {showTitle && (
          <>
            <CardTitle>Coin Inventory Workflow</CardTitle>
            <CardDescription>
              Each coin goes through these steps from intake to product listing
            </CardDescription>
          </>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-0">
          {steps.map((step, index) => (
            <div key={step.id} className="relative">
              <div className="flex items-start gap-4 pb-6">
                <div className="flex flex-col items-center">
                  <div className="flex-shrink-0">
                    {step.status === 'completed' ? (
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                    ) : step.status === 'current' ? (
                      <div className="w-6 h-6 rounded-full border-2 border-blue-600 bg-blue-50 flex items-center justify-center">
                        <div className="w-3 h-3 rounded-full bg-blue-600" />
                      </div>
                    ) : (
                      <Circle className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  {index < steps.length - 1 && (
                    <div className="w-0.5 h-6 bg-border mt-1" />
                  )}
                </div>
                <div className="flex-1 pt-0.5">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={step.status === 'current' ? 'text-blue-600' : step.status === 'completed' ? 'text-green-600' : 'text-muted-foreground'}>
                      {step.icon}
                    </div>
                    <h4 className={`font-semibold ${step.status === 'current' ? 'text-blue-600' : step.status === 'completed' ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {step.title}
                    </h4>
                  </div>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

