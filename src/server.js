import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { paymentMiddleware } from 'x402-express'
import { facilitator } from '@coinbase/x402'

dotenv.config()

const app = express()
app.use(cors({ origin: 'http://localhost:5173', exposedHeaders: ['X-PAYMENT-RESPONSE'] }))
app.use(express.json({ limit: '20mb' }))

// Your wallet address — this receives the USDC payments
const WALLET_ADDRESS = process.env.WALLET_ADDRESS || '0xYourWalletAddressHere'

// x402 payment middleware — protects /api/analyze
app.use(paymentMiddleware(
  WALLET_ADDRESS,
  {
    '/api/analyze': {
      price: '$0.50',
      network: 'base-sepolia',  // testnet
      description: 'MedExplain AI medical report analysis',
    }
  },
  facilitator
))

// Protected route — only runs after payment confirmed
app.post('/api/analyze', async (req, res) => {
  const { reportText } = req.body

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.VITE_GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 2000,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: `You are MedExplain, an expert AI medical report analysis agent (ERC-8004 identity: sarvesjr_bot on GOAT testnet).

Analyze ONLY the actual values in the medical report. Do not invent values.

For EVERY test value found output exactly one line:
[ABNORMAL] TestName: Value Unit — plain English explanation
[NORMAL] TestName: Value Unit — brief reassurance

After all values output exactly 5 lines:
[QUESTION] specific question for doctor

Final line:
[DISCLAIMER] This analysis is not a substitute for professional medical advice.

Only output tagged lines.`
          },
          { role: 'user', content: `Analyze this medical report:\n\n${reportText}` }
        ],
      }),
    })

    const data = await groqRes.json()
    const analysis = data.choices?.[0]?.message?.content || ''
    res.json({ analysis, agent: 'sarvesjr_bot', standard: 'ERC-8004' })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Chat endpoint — also payment protected
app.use(paymentMiddleware(
  WALLET_ADDRESS,
  {
    '/api/chat': {
      price: '$0.10',
      network: 'base-sepolia',
      description: 'MedExplain AI chat response',
    }
  },
  facilitator
))

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.VITE_GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 500,
        temperature: 0.3,
        messages,
      }),
    })
    const data = await groqRes.json()
    res.json({ reply: data.choices?.[0]?.message?.content || '' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.listen(3001, () => console.log('MedExplain x402 backend running on :3001'))