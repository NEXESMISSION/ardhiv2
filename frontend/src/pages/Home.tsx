import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Map, TrendingDown } from 'lucide-react'

export function Home() {
  const navigate = useNavigate()

  return (
    <div className="flex h-[calc(100vh-4rem)] items-center justify-center p-6">
      <div className="w-full max-w-4xl space-y-6">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-2">نظام إدارة الأراضي</h1>
          <p className="text-muted-foreground">اختر النظام الذي تريد الوصول إليه</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* نظام الأراضي Button */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary">
            <CardContent className="p-8">
              <Button
                variant="ghost"
                className="w-full h-auto flex flex-col items-center justify-center gap-4 p-6"
                onClick={() => navigate('/land')}
              >
                <div className="bg-blue-100 p-6 rounded-full">
                  <Map className="h-16 w-16 text-blue-600" />
                </div>
                <div className="text-center">
                  <h2 className="text-2xl font-bold mb-2">نظام الأراضي</h2>
                  <p className="text-sm text-muted-foreground">
                    إدارة قطع الأراضي والمبيعات والعملاء
                  </p>
                </div>
              </Button>
            </CardContent>
          </Card>

          {/* الديون Button */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary">
            <CardContent className="p-8">
              <Button
                variant="ghost"
                className="w-full h-auto flex flex-col items-center justify-center gap-4 p-6"
                onClick={() => navigate('/debts')}
              >
                <div className="bg-red-100 p-6 rounded-full">
                  <TrendingDown className="h-16 w-16 text-red-600" />
                </div>
                <div className="text-center">
                  <h2 className="text-2xl font-bold mb-2">الديون</h2>
                  <p className="text-sm text-muted-foreground">
                    تتبع الديون وإدارة سدادها
                  </p>
                </div>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

