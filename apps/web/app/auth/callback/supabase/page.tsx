'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '@lib/supabaseClient'
import { useAuth } from '@hooks/useAuth'

function SupabaseCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { updateSession } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleCallback = async () => {
      // 1. Lấy session từ Supabase sau redirect
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        setError(sessionError?.message || 'Không tìm thấy phiên đăng nhập Supabase.')
        return
      }

      const redirectUrl = searchParams.get('redirect') || '/dash'

      try {
        // 2. Gửi Supabase JWT lên LearnHouse Backend để đổi lấy LearnHouse JWT
        const res = await fetch('/api/auth/exchange/supabase', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            supabase_token: session.access_token,
            redirect_url: redirectUrl
          }),
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => null)
          setError(errData?.detail || 'Lỗi khi xác thực với hệ thống LearnHouse.')
          return
        }

        // 3. Cập nhật AuthContext và chuyển hướng
        await updateSession()
        window.location.href = redirectUrl

      } catch (err) {
        setError('Đã xảy ra lỗi hệ thống.')
      }
    }

    handleCallback()
  }, [searchParams, updateSession])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-red-100 rounded-full">
              <AlertTriangle className="w-10 h-10 text-red-600" />
            </div>
          </div>
          <h1 className="text-xl font-semibold text-gray-800 mb-2">Đăng nhập thất bại</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <a
            href="/login"
            className="inline-block px-6 py-2.5 bg-black text-white rounded-lg hover:bg-black/90 transition-colors text-sm font-semibold"
          >
            Quay lại Đăng nhập
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <Loader2 className="w-10 h-10 text-gray-600 animate-spin" />
        </div>
        <h1 className="text-lg font-semibold text-gray-800 mb-1">Đang hoàn tất đăng nhập...</h1>
        <p className="text-gray-500 text-sm">Vui lòng chờ trong giây lát.</p>
      </div>
    </div>
  )
}

export default function SupabaseCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Loader2 className="w-10 h-10 text-gray-600 animate-spin" />
        </div>
      }
    >
      <SupabaseCallbackInner />
    </Suspense>
  )
}