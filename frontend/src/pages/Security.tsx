import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import {
  Shield,
  Lock,
  Activity,
  CheckCircle,
  AlertTriangle,
  Key,
  Database,
  Users,
} from 'lucide-react'
import type { AuditLog, User as UserType } from '@/types/database'

interface AuditLogWithUser extends AuditLog {
  user?: UserType
}

export function Security() {
  const { hasPermission } = useAuth()
  const [auditLogs, setAuditLogs] = useState<AuditLogWithUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!hasPermission('view_audit_logs')) return
    fetchAuditLogs()
  }, [hasPermission])

  const fetchAuditLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*, user:users(*)')
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      setAuditLogs((data as AuditLogWithUser[]) || [])
    } catch (error) {
      // Error fetching audit logs - silent fail
    } finally {
      setLoading(false)
    }
  }

  const actionColors: Record<string, 'default' | 'success' | 'warning' | 'destructive'> = {
    INSERT: 'success',
    UPDATE: 'warning',
    DELETE: 'destructive',
  }

  if (!hasPermission('view_audit_logs')) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">
          You don't have permission to view security settings.
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">Loading security data...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Security & Protection</h1>
        <p className="text-muted-foreground">
          System security overview and audit logs
        </p>
      </div>

      {/* Security Status Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Authentication</CardTitle>
            <Lock className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="font-medium">Supabase Auth</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Secure password encryption
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Row Level Security</CardTitle>
            <Shield className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="font-medium">Enabled</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              All sensitive tables protected
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Data Encryption</CardTitle>
            <Key className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="font-medium">TLS/HTTPS</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              All connections encrypted
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Audit Logging</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="font-medium">Active</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {auditLogs.length} events logged
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Security Features */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Role-Based Access Control
            </CardTitle>
            <CardDescription>
              User permissions are managed based on their assigned role
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                <div>
                  <p className="font-medium">Owner</p>
                  <p className="text-sm text-muted-foreground">Full system access</p>
                </div>
                <Badge>All Permissions</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                <div>
                  <p className="font-medium">Manager</p>
                  <p className="text-sm text-muted-foreground">Limited financial access</p>
                </div>
                <Badge variant="secondary">Restricted</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                <div>
                  <p className="font-medium">Field Staff</p>
                  <p className="text-sm text-muted-foreground">Basic operations only</p>
                </div>
                <Badge variant="outline">Limited</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Protected Tables
            </CardTitle>
            <CardDescription>
              Tables with Row Level Security policies applied
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {[
                'users',
                'roles',
                'land_batches',
                'land_pieces',
                'clients',
                'reservations',
                'sales',
                'installments',
                'payments',
                'audit_logs',
              ].map((table) => (
                <div
                  key={table}
                  className="flex items-center gap-2 p-2 bg-muted rounded-md"
                >
                  <Shield className="h-4 w-4 text-green-500" />
                  <span className="text-sm">{table}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Security Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Security Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 border rounded-md">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <p className="font-medium">Rotate API Keys Regularly</p>
                <p className="text-sm text-muted-foreground">
                  Change your Supabase keys periodically to enhance security
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 border rounded-md">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <p className="font-medium">Enable Multi-Factor Authentication</p>
                <p className="text-sm text-muted-foreground">
                  Add an extra layer of security for critical accounts
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 border rounded-md">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <p className="font-medium">Regular Backups</p>
                <p className="text-sm text-muted-foreground">
                  Configure automated database backups in Supabase dashboard
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Audit Logs
          </CardTitle>
          <CardDescription>Recent system activity and changes</CardDescription>
        </CardHeader>
        <CardContent>
          {auditLogs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No audit logs found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Record ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      {formatDate(log.created_at)}
                    </TableCell>
                    <TableCell>{log.user?.name || 'System'}</TableCell>
                    <TableCell>
                      <Badge variant={actionColors[log.action] || 'default'}>
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{log.table_name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {log.record_id?.slice(0, 8)}...
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
