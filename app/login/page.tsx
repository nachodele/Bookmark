// app/login/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const supabase = createBrowserSupabaseClient()

  // Escucha cambios de autenticación (para Magic Link y OAuth)
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        router.replace(redirectTo)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase, router, redirectTo])

  const handleMagicLink = async () => {
    if (!email) return
    setLoading(true)
    setMessage(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    })

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: '✅ Revisa tu correo. Te hemos enviado un enlace mágico.' })
    }
    setLoading(false)
  }

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setMessage({ type: 'error', text: error.message })
    }
    setLoading(false)
  }

  const handleOAuth = async (provider: 'google' | 'github') => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    })
    if (error) console.error(error)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-6">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-10 pb-6 text-center border-b border-zinc-100 dark:border-zinc-800">
          <h1 className="text-4xl font-bold text-black dark:text-white mb-2">Bookmarks</h1>
          <p className="text-zinc-600 dark:text-zinc-400">Guarda, organiza y comparte enlaces con IA</p>
        </div>

        <div className="p-8 space-y-8">
          {/* OAuth */}
          <div className="space-y-3">
            <button
              onClick={() => handleOAuth('google')}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-2xl py-4 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all font-medium"
            >
              <img src="https://authjs.dev/img/providers/google.svg" alt="Google" className="w-5 h-5" />
              Continuar con Google
            </button>

            {/* Puedes añadir GitHub, Apple, etc. */}
            {/* <button onClick={() => handleOAuth('github')} ... >Continuar con GitHub</button> */}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-200 dark:border-zinc-700" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-widest text-zinc-400">
              <span className="bg-white dark:bg-zinc-900 px-4">o con email</span>
            </div>
          </div>

          {/* Formulario */}
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-5 py-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
            />

            <div className="relative">
              <input
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
              />
              <button
                type="submit"
                disabled={loading}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-600 hover:text-blue-700 font-medium text-sm"
              >
                Entrar
              </button>
            </div>

            {/* Magic Link */}
            <button
              type="button"
              onClick={handleMagicLink}
              disabled={loading || !email}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-2xl hover:brightness-105 transition-all disabled:opacity-70"
            >
              {loading ? 'Enviando enlace...' : 'Enviar enlace mágico'}
            </button>
          </form>

          {message && (
            <p
              className={`text-center text-sm font-medium ${
                message.type === 'error' ? 'text-red-500' : 'text-green-600'
              }`}
            >
              {message.text}
            </p>
          )}
        </div>

        <div className="px-8 py-6 text-center text-xs text-zinc-500 border-t border-zinc-100 dark:border-zinc-800">
          Al continuar aceptas nuestros{' '}
          <Link href="/terms" className="hover:underline">
            términos
          </Link>{' '}
          y{' '}
          <Link href="/privacy" className="hover:underline">
            privacidad
          </Link>
        </div>
      </div>
    </div>
  )
}