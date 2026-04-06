import { useState } from 'react'
import './App.css'

function App() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  })
  const [statusMessage, setStatusMessage] = useState('')

  function handleChange(event) {
    const { name, value, type, checked } = event.target
    setFormData((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    setStatusMessage(`Welcome back, ${formData.email}. Sales portal access granted.`)
  }

  return (
    <main className="app">
      <section className="welcome-panel">
        <p className="eyebrow">Handy Dudes</p>
        <h1>Your trusted home service partner</h1>
        <p className="description">
          Handy Dudes connects homeowners with dependable professionals for repairs,
          maintenance, and improvement projects. Our mission is to make every service
          visit simple, transparent, and stress-free.
        </p>
        <ul className="highlights">
          <li>Fast booking and responsive support</li>
          <li>Trusted technicians with quality workmanship</li>
          <li>Reliable service for homes and small businesses</li>
        </ul>
      </section>

      <section className="signin-panel" aria-label="Sales person sign in">
        <h2>Sales Sign In</h2>
        <p className="signin-help">Use your Handy Dudes sales account credentials.</p>

        <form onSubmit={handleSubmit} className="signin-form">
          <label htmlFor="email">Work Email</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="name@handydudes.com"
            value={formData.email}
            onChange={handleChange}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Enter your password"
            value={formData.password}
            onChange={handleChange}
            required
          />

          <label className="checkbox-row" htmlFor="rememberMe">
            <input
              id="rememberMe"
              name="rememberMe"
              type="checkbox"
              checked={formData.rememberMe}
              onChange={handleChange}
            />
            <span>Remember me</span>
          </label>

          <button type="submit">Sign In</button>
        </form>

        {statusMessage && <p className="status-message">{statusMessage}</p>}
      </section>
    </main>
  )
}

export default App
