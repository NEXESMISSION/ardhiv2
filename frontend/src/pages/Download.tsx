import { useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download as DownloadIcon, Smartphone, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import { showNotification } from '@/components/ui/notification'

export function Download() {
  const { t } = useLanguage()
  const [downloading, setDownloading] = useState(false)

  // APK file path in Supabase Storage or public URL
  // Option 1: From Supabase Storage (bucket: 'app-downloads', file: 'app.apk')
  // Option 2: Direct URL from public folder or CDN
  const apkStoragePath = 'app-downloads/app.apk'
  const apkDirectUrl = '/app.apk' // If APK is in public folder
  const appVersion = '1.0.0'
  const lastUpdated = new Date().toLocaleDateString('ar-TN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  const handleDownload = async () => {
    setDownloading(true)
    
    try {
      // Try method 1: Download from Supabase Storage
      try {
        const { data, error } = await supabase.storage
          .from('app-downloads')
          .download('app.apk')

        if (!error && data) {
          // Create blob URL and trigger download
          const url = window.URL.createObjectURL(data)
          const link = document.createElement('a')
          link.href = url
          link.download = 'LandDev.apk'
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          window.URL.revokeObjectURL(url)
          
          showNotification('تم بدء التحميل بنجاح', 'success')
          setDownloading(false)
          return
        }
      } catch (storageError) {
        console.log('Supabase Storage not available, trying direct URL...')
      }

      // Try method 2: Direct download from public folder or URL
      try {
        const response = await fetch(apkDirectUrl)
        if (response.ok) {
          const blob = await response.blob()
          const url = window.URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = 'LandDev.apk'
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          window.URL.revokeObjectURL(url)
          
          showNotification('تم بدء التحميل بنجاح', 'success')
          setDownloading(false)
          return
        }
      } catch (fetchError) {
        console.log('Direct URL not available')
      }

      // Try method 3: Get public URL from Supabase Storage
      try {
        const { data: urlData } = supabase.storage
          .from('app-downloads')
          .getPublicUrl('app.apk')

        if (urlData?.publicUrl) {
          // Open in new tab for download
          const link = document.createElement('a')
          link.href = urlData.publicUrl
          link.download = 'LandDev.apk'
          link.target = '_blank'
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          
          showNotification('تم فتح رابط التحميل', 'success')
          setDownloading(false)
          return
        }
      } catch (urlError) {
        console.log('Public URL not available')
      }

      // If all methods fail
      throw new Error('لم يتم العثور على ملف APK. يرجى التواصل مع المسؤول.')
    } catch (error: any) {
      console.error('Download error:', error)
      showNotification(
        error.message || 'حدث خطأ أثناء التحميل. يرجى المحاولة مرة أخرى.',
        'error'
      )
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Card className="shadow-lg">
        <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 border-b">
          <div className="flex items-center gap-3">
            <Smartphone className="h-6 w-6 text-green-600" />
            <CardTitle className="text-2xl font-bold">تحميل التطبيق</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-6">
            {/* App Info */}
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl shadow-lg">
                <Smartphone className="h-12 w-12 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-2">LandDev</h2>
                <p className="text-muted-foreground">تطبيق إدارة الأراضي والعقارات</p>
              </div>
            </div>

            {/* Version Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-blue-900">الإصدار:</span>
                  <span className="mr-2 text-blue-700">{appVersion}</span>
                </div>
                <div>
                  <span className="font-medium text-blue-900">آخر تحديث:</span>
                  <span className="mr-2 text-blue-700">{lastUpdated}</span>
                </div>
              </div>
            </div>

            {/* Download Button */}
            <div className="flex flex-col items-center gap-4">
              <Button
                onClick={handleDownload}
                disabled={downloading}
                size="lg"
                className="w-full sm:w-auto min-w-[200px] bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading ? (
                  <>
                    <Loader2 className="h-5 w-5 ml-2 animate-spin" />
                    جاري التحميل...
                  </>
                ) : (
                  <>
                    <DownloadIcon className="h-5 w-5 ml-2" />
                    تحميل APK للأندرويد
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center max-w-md">
                اضغط على الزر أعلاه لتحميل ملف APK للتطبيق على جهاز Android الخاص بك
              </p>
              
              {/* Info Alert */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 max-w-md">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-blue-800">
                    <strong>ملاحظة:</strong> إذا لم يعمل التحميل، تأكد من أن ملف APK موجود في Supabase Storage (bucket: app-downloads) أو في مجلد public باسم app.apk
                  </p>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-yellow-600" />
                تعليمات التثبيت
              </h3>
              <ol className="space-y-2 text-sm list-decimal list-inside text-muted-foreground">
                <li>قم بتحميل ملف APK من الزر أعلاه</li>
                <li>افتح إعدادات جهازك واسمح بتثبيت التطبيقات من مصادر غير معروفة</li>
                <li>افتح ملف APK الذي تم تحميله واضغط على "تثبيت"</li>
                <li>انتظر حتى يكتمل التثبيت ثم افتح التطبيق</li>
              </ol>
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold mb-2">المميزات</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• إدارة الأراضي والعقارات</li>
                  <li>• تتبع المبيعات والأقساط</li>
                  <li>• إدارة العملاء</li>
                  <li>• التقارير المالية</li>
                </ul>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold mb-2">المتطلبات</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• Android 6.0 أو أحدث</li>
                  <li>• اتصال بالإنترنت</li>
                  <li>• حساب مستخدم نشط</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

