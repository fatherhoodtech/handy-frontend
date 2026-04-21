import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function SignInPage() {
  const { login, isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  function handleChange(event) {
    const { name, value, type, checked } = event.target
    setFormData((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setErrorMessage('')
    try {
      await login(formData.email, formData.password)
      navigate('/dashboard')
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to sign in')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <main className="theme flex min-h-screen items-center justify-center bg-black text-zinc-200">
        Loading...
      </main>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <main className="theme grid min-h-screen md:grid-cols-2">
      <section className="relative flex min-h-screen items-center overflow-hidden bg-black px-8 py-12 text-white sm:px-12 lg:px-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(125,211,252,0.28),transparent_35%),radial-gradient(circle_at_80%_60%,rgba(56,189,248,0.2),transparent_35%)]" />
        <div className="relative z-10 max-w-xl space-y-8">
          <p className="text-xs uppercase tracking-[0.35em] text-sky-300">Handy Dudes</p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Welcome to Handy Dudes Sales & Dispatch Platform.
          </h1>
          <p className="max-w-lg text-base leading-relaxed text-zinc-300 sm:text-lg">
            Turn Jobber requests into accurate quotes faster with AI-assisted
            workflows, clear handoffs, and one place to manage the pipeline from
            intake to follow-up.
          </p>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-6 py-10 sm:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_45%)]" />
        <div className="relative w-full max-w-md rounded-2xl bg-[linear-gradient(120deg,#7dd3fc,#38bdf8,#a78bfa,#7dd3fc)] bg-[length:240%_240%] p-[2px] animate-[borderShift_8s_ease_infinite]">
          <Card className="rounded-[14px] border border-transparent bg-white shadow-[0_30px_90px_-35px_rgba(0,0,0,0.65)]">
            <CardHeader className="space-y-4">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-zinc-900 bg-zinc-950 text-sm font-bold text-white">
                HD
              </div>
              <div className="space-y-2">
                <CardTitle className="text-3xl font-extrabold tracking-tight text-zinc-950">
                  Sales Sign In
                </CardTitle>
                <CardDescription className="font-medium text-zinc-700">
                  Access the Handy Dudes sales workspace.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4" aria-label="Sales person sign in">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-zinc-900">
                    Work Email
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    className="h-11 border-zinc-400 focus-visible:border-zinc-900 focus-visible:ring-zinc-900/20"
                    placeholder="name@handydudes.com"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-zinc-900">
                    Password
                  </Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    className="h-11 border-zinc-400 focus-visible:border-zinc-900 focus-visible:ring-zinc-900/20"
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="rememberMe"
                    checked={formData.rememberMe}
                    onCheckedChange={(checked) =>
                      setFormData((current) => ({
                        ...current,
                        rememberMe: checked === true,
                      }))
                    }
                  />
                  <Label htmlFor="rememberMe" className="font-normal text-zinc-700">
                    Remember me
                  </Label>
                  <a
                    href="#"
                    className="ml-auto text-sm font-medium text-zinc-700 underline-offset-4 hover:text-zinc-900 hover:underline">
                    Forgot password?
                  </a>
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-11 w-full bg-zinc-950 font-bold tracking-wide text-white hover:bg-black disabled:opacity-70">
                  {isSubmitting ? 'Signing In...' : 'Sign In'}
                </Button>
              </form>

              {errorMessage && (
                <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {errorMessage}
                </p>
              )}

              <div className="mt-6 border-t border-zinc-300 pt-4">
                <p className="text-xs font-medium text-zinc-600">
                  Secure login for authorized Handy Dudes sales staff only.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  )
}

export default SignInPage
