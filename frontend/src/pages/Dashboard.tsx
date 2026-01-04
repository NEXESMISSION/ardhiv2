import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Map,
  Users,
  ShoppingCart,
  AlertTriangle,
  TrendingUp,
  Clock,
} from 'lucide-react'
import type { LandStatus, Installment, Sale, Client } from '@/types/database'
import { retryWithBackoff, isRetryableError } from '@/lib/retry'
import { LoadingState } from '@/components/ui/loading-progress'

interface LandStats {
  Available: number
  Reserved: number
  Sold: number
  Cancelled: number
}

interface OverdueInstallment extends Installment {
  sale?: Sale & { client?: Client }
}

export function Dashboard() {
  const { hasPermission } = useAuth()
  const [landStats, setLandStats] = useState<LandStats>({
    Available: 0,
    Reserved: 0,
    Sold: 0,
    Cancelled: 0,
  })
  const [activeClients, setActiveClients] = useState(0)
  const [monthlyRevenue, setMonthlyRevenue] = useState(0)
  const [overdueInstallments, setOverdueInstallments] = useState<OverdueInstallment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Fetch all data in parallel with retry mechanism
      const [landRes, salesRes, revenueRes, overdueRes] = await retryWithBackoff(
        async () => {
          return await Promise.all([
            supabase.from('land_pieces').select('status'),
            supabase.from('sales').select('client_id').neq('status', 'Cancelled'),
            supabase.from('sales').select('total_selling_price').eq('status', 'Completed'),
            supabase.from('installments').select(`*, sale:sales (*, client:clients (*))`).eq('status', 'Late').order('due_date', { ascending: true }).limit(10)
          ])
        },
        {
          maxRetries: 3,
          timeout: 10000,
          onRetry: (attempt) => {
            console.log(`Retrying dashboard data fetch (attempt ${attempt})...`)
          },
        }
      )

      // Check for table errors
      if (landRes.error?.code === '42P01' || landRes.error?.message?.includes('does not exist')) {
        setError('Database tables not found. Please run the SQL schema in Supabase first.')
        return
      }

      // Process land stats
      if (landRes.data) {
        const stats: LandStats = { Available: 0, Reserved: 0, Sold: 0, Cancelled: 0 }
        landRes.data.forEach((piece: { status: string }) => {
          stats[piece.status as LandStatus]++
        })
        setLandStats(stats)
      }

      // Process clients
      if (salesRes.data) {
        const uniqueClients = new Set(salesRes.data.map((s: { client_id: string }) => s.client_id))
        setActiveClients(uniqueClients.size)
      }

      // Process revenue
      if (revenueRes.data) {
        const total = revenueRes.data.reduce((sum: number, sale: { total_selling_price: number }) => sum + (sale.total_selling_price || 0), 0)
        setMonthlyRevenue(total)
      }

      // Process overdue
      if (overdueRes.data) {
        setOverdueInstallments(overdueRes.data as OverdueInstallment[])
      }
    } catch (err) {
      const error = err as Error
      console.error('Dashboard fetch error:', error)
      
      if (isRetryableError(error)) {
        setError('فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.')
      } else if (error.message.includes('timeout')) {
        setError('انتهت مهلة الاتصال. يرجى المحاولة مرة أخرى.')
      } else {
        setError('فشل تحميل بيانات لوحة التحكم. يرجى المحاولة مرة أخرى.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (error && error.includes('Database tables not found')) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
              <p className="text-destructive font-medium">{error}</p>
              <p className="text-sm text-muted-foreground">
                Make sure you have run the <code className="bg-muted px-1 rounded">supabase_schema.sql</code> file in your Supabase SQL Editor.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalLand = landStats.Available + landStats.Reserved + landStats.Sold + landStats.Cancelled

  return (
    <LoadingState
      loading={loading}
      error={error}
      onRetry={fetchDashboardData}
      loadingMessage="جاري تحميل لوحة التحكم..."
      errorTitle="خطأ في تحميل لوحة التحكم"
    >
      <div className="space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Overview of your real estate operations</p>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Land Pieces</CardTitle>
              <Map className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalLand}</div>
              <div className="flex gap-2 mt-2">
                <Badge variant="success">{landStats.Available} Available</Badge>
                <Badge variant="warning">{landStats.Reserved} Reserved</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sold Pieces</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{landStats.Sold}</div>
              <p className="text-xs text-muted-foreground">
                {totalLand > 0 ? ((landStats.Sold / totalLand) * 100).toFixed(1) : 0}% of total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeClients}</div>
              <p className="text-xs text-muted-foreground">With active sales</p>
            </CardContent>
          </Card>

          {hasPermission('view_financial') && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(monthlyRevenue)}</div>
                <p className="text-xs text-muted-foreground">This month</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Overdue Installments */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <CardTitle>Overdue Installments</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {overdueInstallments.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No overdue installments
              </p>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
                <Table className="min-w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Amount Due</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Stacked</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overdueInstallments.map((installment) => (
                      <TableRow key={installment.id}>
                        <TableCell className="font-medium">
                          {installment.sale?.client?.name || 'Unknown'}
                        </TableCell>
                        <TableCell>{formatCurrency(installment.amount_due)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-destructive" />
                            {formatDate(installment.due_date)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {installment.stacked_amount > 0 && (
                            <Badge variant="destructive">
                              +{formatCurrency(installment.stacked_amount)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="destructive">Late</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </LoadingState>
  )
}
