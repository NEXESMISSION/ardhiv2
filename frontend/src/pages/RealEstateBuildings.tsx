import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2 } from 'lucide-react'

export function RealEstateBuildings() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
            <Building2 className="h-8 w-8 text-primary" />
            التطوير والبناء
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base mt-2">
            إدارة المشاريع العقارية والمباني
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>قيد التطوير</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Building2 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">صفحة التطوير والبناء</h3>
            <p className="text-muted-foreground">
              هذه الصفحة منفصلة عن نظام إدارة الأراضي
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              سيتم تطويرها لاحقاً لإدارة المشاريع العقارية والمباني
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

