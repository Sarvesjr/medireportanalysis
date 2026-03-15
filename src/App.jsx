import { useState, useRef, useEffect } from 'react'

const GROQ_KEY = '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'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

const ANALYSIS_SYSTEM = `You are MedExplain, an expert AI medical report analysis agent (ERC-8004 identity: sarvesjr_bot on GOAT testnet).

Analyze ONLY the actual values in the medical report. Do not invent values.

For EVERY test value found output exactly one line:
[ABNORMAL] TestName: Value Unit — plain English explanation of what this means
[NORMAL] TestName: Value Unit — brief reassurance in plain English

After all values output exactly 5 lines:
[QUESTION] specific question this patient should ask their doctor

Final line:
[DISCLAIMER] This analysis is not a substitute for professional medical advice. Always consult your doctor.

Only output tagged lines. No extra text.`

const CHAT_SYSTEM = (reportSummary) => `You are MedExplain, a warm and knowledgeable medical report assistant (ERC-8004 agent: sarvesjr_bot).

This patient's medical report findings:
${reportSummary}

You have full context of their report. Answer questions specifically about THEIR results.
- Be warm, clear, and reassuring
- Use plain English, no medical jargon
- Be specific to their actual values
- Give practical, actionable advice
- Keep answers to 3-5 sentences
- Always end with: "Please consult your doctor for personalized medical advice."
- Never make definitive diagnoses
- If asked something unrelated to the report, gently redirect`

export default function App() {
  const [step, setStep] = useState(0)
  const [file, setFile] = useState(null)
  const [fileType, setFileType] = useState('')
  const [fileData, setFileData] = useState('')
  const [fileMime, setFileMime] = useState('')
  const [pdfText, setPdfText] = useState('')
  const [txHash, setTxHash] = useState('')
  const [payStep, setPayStep] = useState(-1)
  const [report, setReport] = useState([])
  const [progress, setProgress] = useState(0)
  const [statusMsg, setStatusMsg] = useState('')
  const [chat, setChat] = useState([])
  const [chatHistory, setChatHistory] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()
  const chatEndRef = useRef()
  const chatInputRef = useRef()

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat, chatLoading])

  const toBase64 = (f) => new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result.split(',')[1])
    r.onerror = rej
    r.readAsDataURL(f)
  })

  const processPDF = async (f) => {
    try {
      if (!window['pdfjs-dist/build/pdf']) {
        await new Promise((res) => {
          const s = document.createElement('script')
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
          s.onload = res
          document.head.appendChild(s)
        })
      }
      const lib = window['pdfjs-dist/build/pdf']
      lib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
      const ab = await f.arrayBuffer()
      const pdf = await lib.getDocument({ data: ab }).promise
      let text = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        text += content.items.map(it => it.str).join(' ') + '\n'
      }
      const page = await pdf.getPage(1)
      const viewport = page.getViewport({ scale: 2.0 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
      return { text: text.trim(), imageData: canvas.toDataURL('image/jpeg', 0.9).split(',')[1] }
    } catch { return { text: '', imageData: '' } }
  }

  const handleFile = async (f) => {
    if (!f) return
    setError('')
    const isPDF = f.type === 'application/pdf'
    const isImage = f.type.startsWith('image/')
    if (!isPDF && !isImage) { setError('Please upload a PDF or image file'); return }
    setFile(f)
    setStatusMsg('Reading file...')
    if (isPDF) {
      setFileType('pdf')
      const { text, imageData } = await processPDF(f)
      setPdfText(text)
      setFileData(imageData)
      setFileMime('image/jpeg')
    } else {
      setFileType('image')
      const b64 = await toBase64(f)
      setFileData(b64)
      setFileMime(f.type)
    }
    setStatusMsg('')
    setStep(1)
  }

  const handlePay = async () => {
    setStep(2); setPayStep(0)
    await new Promise(r => setTimeout(r, 900)); setPayStep(1)
    await new Promise(r => setTimeout(r, 1000)); setPayStep(2)
    await new Promise(r => setTimeout(r, 1000))
    const hash = '0x' + Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
    setTxHash(hash); setPayStep(3)
    await new Promise(r => setTimeout(r, 400))
    setStep(3); runAnalysis()
  }

  const callGroq = async (messages, vision = false) => {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: vision ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'llama-3.3-70b-versatile',
        max_tokens: 2000,
        temperature: 0.1,
        messages,
      }),
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || 'API error') }
    return (await res.json()).choices?.[0]?.message?.content || ''
  }

  const runAnalysis = async () => {
    let prog = 0
    const msgs = ['Reading your report...', 'Identifying test values...', 'Checking reference ranges...', 'Flagging abnormalities...', 'Preparing results...']
    let mi = 0
    setStatusMsg(msgs[0]); setProgress(0)
    const mt = setInterval(() => { mi = (mi + 1) % msgs.length; setStatusMsg(msgs[mi]) }, 2000)
    const pt = setInterval(() => { prog += 1; setProgress(Math.min(prog, 85)) }, 200)
    try {
      let raw = ''
      if (pdfText && pdfText.length > 50) {
        raw = await callGroq([
          { role: 'system', content: ANALYSIS_SYSTEM },
          { role: 'user', content: `Analyze this medical report:\n\n${pdfText}` }
        ], false)
      } else if (fileData) {
        raw = await callGroq([
          { role: 'system', content: ANALYSIS_SYSTEM },
          { role: 'user', content: [
            { type: 'image_url', image_url: { url: `data:${fileMime};base64,${fileData}` } },
            { type: 'text', text: 'Analyze every test value in this medical report.' }
          ]}
        ], true)
      } else throw new Error('Could not read file. Please try again.')

      clearInterval(mt); clearInterval(pt)
      if (!raw.trim()) throw new Error('AI could not read this file. Try a clearer image.')

      const lines = raw.split('\n').filter(l => l.trim()).map(l => {
        if (l.startsWith('[ABNORMAL]')) return { type: 'abnormal', text: l.replace('[ABNORMAL]', '').trim() }
        if (l.startsWith('[NORMAL]'))   return { type: 'normal',   text: l.replace('[NORMAL]', '').trim() }
        if (l.startsWith('[QUESTION]')) return { type: 'question', text: l.replace('[QUESTION]', '').trim() }
        if (l.startsWith('[DISCLAIMER]')) return { type: 'info',   text: l.replace('[DISCLAIMER]', '').trim() }
        return null
      }).filter(Boolean)

      if (!lines.length) throw new Error('Could not parse response. Please try again.')

      setProgress(100); setReport(lines)
      const abn = lines.filter(l => l.type === 'abnormal').length
      const reportSummary = lines.map(l => l.text).join('\n')
      const welcomeMsg = { role: 'agent', text: `Hi! I've analyzed your report and found **${abn} value${abn !== 1 ? 's' : ''}** that need attention. I have your full report in front of me — ask me anything about your specific results, what they mean, what to eat, medications, or next steps. I'm here to help! 💙` }
      setChat([welcomeMsg])
      setChatHistory([
        { role: 'system', content: CHAT_SYSTEM(reportSummary) },
        { role: 'assistant', content: welcomeMsg.text }
      ])
      setStep(4)
    } catch (err) {
      clearInterval(mt); clearInterval(pt)
      setError(err.message); setStep(1)
    }
  }

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return
    const q = chatInput.trim()
    setChatInput('')
    setChat(c => [...c, { role: 'user', text: q }])
    const newHistory = [...chatHistory, { role: 'user', content: q }]
    setChatHistory(newHistory)
    setChatLoading(true)
    try {
      const raw = await callGroq(newHistory, false)
      setChat(c => [...c, { role: 'agent', text: raw }])
      setChatHistory(h => [...h, { role: 'assistant', content: raw }])
    } catch {
      setChat(c => [...c, { role: 'agent', text: 'Sorry, I had trouble connecting. Please try again.' }])
    }
    setChatLoading(false)
    setTimeout(() => chatInputRef.current?.focus(), 100)
  }

  const reset = () => {
    setStep(0); setFile(null); setFileType(''); setFileData(''); setFileMime('')
    setPdfText(''); setTxHash(''); setPayStep(-1); setReport([]); setProgress(0)
    setChat([]); setChatHistory([]); setChatInput(''); setError(''); setStatusMsg('')
  }

  const cur = [0, 1].includes(step) ? 0 : step === 2 ? 1 : step === 3 ? 2 : 3
  const abnCount = report.filter(r => r.type === 'abnormal').length
  const norCount = report.filter(r => r.type === 'normal').length
  const queCount = report.filter(r => r.type === 'question').length

  const formatText = (text) => {
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  }

  return (
    <div className="app">
      <div className="top-bar">
        <div className="top-bar-inner">
          <div className="logo">
            <div className="logo-icon">
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="logo-text">MedExplain</span>
            <span className="logo-badge">AI Agent</span>
          </div>
          <div className="top-badges">
            <span className="tbadge">x402</span>
            <span className="tbadge">ERC-8004</span>
            <span className="tbadge green">sarvesjr_bot</span>
          </div>
        </div>
      </div>

      {step < 4 && (
        <div className="hero">
          <div className="hero-blob b1" /><div className="hero-blob b2" /><div className="hero-blob b3" />
          <div className="hero-content">
            <div className="hero-pill">🔬 Medical AI powered by GOAT testnet</div>
            <h1>Your personal<br /><span>medical report</span><br />analyst</h1>
            <p>Upload any blood test or lab report. Pay with crypto. Get instant AI analysis with plain-English explanations.</p>
            <div className="step-track">
              {['Upload', 'Pay', 'Analyze', 'Report'].map((s, i) => (
                <div key={s} className={`step-item ${i === cur ? 'active' : i < cur ? 'done' : ''}`}>
                  <div className="step-circle">{i < cur ? '✓' : i + 1}</div>
                  <span>{s}</span>
                  {i < 3 && <div className={`step-bar ${i < cur ? 'filled' : ''}`} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={`main ${step === 4 ? 'results-layout' : ''}`}>

        {error && step <= 1 && (
          <div className="err-box">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {/* STEP 0 — Upload */}
        {step === 0 && (
          <div className="upload-card">
            <div
              className={`drop-zone ${dragOver ? 'drag' : ''}`}
              onClick={() => fileRef.current.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
            >
              <div className="drop-icon">
                {dragOver ? '📂' : '🩺'}
              </div>
              <div className="drop-title">{dragOver ? 'Drop it here!' : 'Upload your medical report'}</div>
              <div className="drop-sub">Drag & drop or click to browse</div>
              <div className="drop-formats">
                <span>PDF</span><span>JPG</span><span>PNG</span><span>JPEG</span>
              </div>
              <input ref={fileRef} type="file" accept=".pdf,image/*" style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files[0])} />
            </div>
            {statusMsg && <div className="reading-msg"><div className="spinner-sm" />{statusMsg}</div>}
            <div className="upload-footer">
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              Your report is analyzed privately and never stored
            </div>
          </div>
        )}

        {/* STEP 1 — Pay */}
        {step === 1 && (
          <div className="pay-screen">
            <div className="file-confirm">
              <div className="fc-icon">
                {fileType === 'image' ? '🖼️' : '📄'}
              </div>
              <div className="fc-info">
                <div className="fc-name">{file?.name}</div>
                <div className="fc-meta">{fileType === 'pdf' ? 'PDF document' : 'Image file'} · Ready to analyze</div>
              </div>
              <button className="fc-change" onClick={reset}>Change</button>
            </div>

            <div className="pay-box">
              <div className="pay-box-header">
                <div className="pbh-left">
                  <div className="pbh-icon">💊</div>
                  <div>
                    <div className="pbh-title">Medical Report Analysis</div>
                    <div className="pbh-sub">AI-powered · Instant results · Private</div>
                  </div>
                </div>
                <div className="pbh-price">$0.50<span>USDC</span></div>
              </div>

              <div className="pay-details">
                <div className="pd-row"><span>Agent</span><code>sarvesjr_bot</code></div>
                <div className="pd-row"><span>Standard</span><code>ERC-8004</code></div>
                <div className="pd-row"><span>Network</span><code>GOAT testnet3</code></div>
                <div className="pd-row"><span>Protocol</span><code>x402</code></div>
              </div>

              <button className="pay-btn" onClick={handlePay}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                </svg>
                Pay 0.50 USDC & Analyze
              </button>

              <div className="pay-note">
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                Testnet demo — no real funds taken
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 — Payment processing */}
        {step === 2 && (
          <div className="processing-screen">
            <div className="proc-icon">⛓️</div>
            <h2>Processing payment</h2>
            <p>Confirming on GOAT testnet...</p>
            <div className="proc-steps">
              {['Create x402 order', 'Wallet sign & approve', 'Confirm on-chain'].map((s, i) => (
                <div key={s} className={`proc-step ${i < payStep ? 'done' : i === payStep ? 'active' : ''}`}>
                  <div className="proc-dot">
                    {i < payStep ? '✓' : i === payStep ? <div className="spinner-sm white" /> : i + 1}
                  </div>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3 — Analyzing */}
        {step === 3 && (
          <div className="analyzing-screen">
            <div className="dna-wrap">
              <div className="dna-anim">
                {[0,1,2,3,4,5].map(i => (
                  <div key={i} className="dna-ball" style={{
                    background: ['#1D9E75','#534AB7','#E24B4A','#EF9F27','#1D9E75','#534AB7'][i],
                    animationDelay: `${i * 0.15}s`
                  }} />
                ))}
              </div>
            </div>
            <h2>Analyzing your report</h2>
            <p className="anim-msg">{statusMsg}</p>
            <div className="prog-wrap">
              <div className="prog-track">
                <div className="prog-fill" style={{ width: progress + '%' }} />
              </div>
              <span className="prog-pct">{progress}%</span>
            </div>
            <div className="tx-pill">
              <div className="tx-dot" />
              {txHash.slice(0, 24)}...
            </div>
          </div>
        )}

        {/* STEP 4 — Results */}
        {step === 4 && report.length > 0 && (
          <div className="results-wrap">

            {/* Left: Report */}
            <div className="report-col">
              <div className="report-header">
                <div className="rh-left">
                  <h2>Your Report</h2>
                  <div className="rh-file">{file?.name}</div>
                </div>
                <button className="rh-new" onClick={reset}>+ New Report</button>
              </div>

              <div className="receipt-bar">
                <div className="rb-dot" />
                <span>ERC-8004 · sarvesjr_bot · {txHash.slice(0, 18)}...</span>
              </div>

              <div className="summary-cards">
                <div className="sc sc-red">
                  <div className="sc-num">{abnCount}</div>
                  <div className="sc-label">Abnormal</div>
                </div>
                <div className="sc sc-green">
                  <div className="sc-num">{norCount}</div>
                  <div className="sc-label">Normal</div>
                </div>
                <div className="sc sc-purple">
                  <div className="sc-num">{queCount}</div>
                  <div className="sc-label">Questions</div>
                </div>
              </div>

              {['abnormal', 'normal', 'question', 'info'].map(type => {
                const items = report.filter(r => r.type === type)
                if (!items.length) return null
                const config = {
                  abnormal: { icon: '🔴', title: 'Values needing attention', color: '#E24B4A' },
                  normal:   { icon: '🟢', title: 'Normal values',            color: '#639922' },
                  question: { icon: '💬', title: 'Ask your doctor',          color: '#534AB7' },
                  info:     { icon: '📋', title: 'Important note',           color: '#EF9F27' },
                }
                const c = config[type]
                return (
                  <div key={type} className="report-section">
                    <div className="rs-title">
                      <span>{c.icon}</span>{c.title}
                    </div>
                    {items.map((r, i) => (
                      <div key={i} className={`report-item ri-${type}`} style={{ animationDelay: `${i * 0.06}s` }}>
                        <div className={`ri-badge rb-${type}`}>
                          {type === 'abnormal' ? '⚠ Abnormal' : type === 'normal' ? '✓ Normal' : type === 'question' ? `Q${i + 1}` : 'Note'}
                        </div>
                        <div className="ri-text">{r.text}</div>
                      </div>
                    ))}
                  </div>
                )
              })}

              <div className="disclaimer-box">
                ⚠ This analysis is not a substitute for professional medical advice. Always consult your doctor.
              </div>
            </div>

            {/* Right: Chat */}
            <div className="chat-col">
              <div className="chat-header">
                <div className="ch-avatar">🤖</div>
                <div>
                  <div className="ch-name">MedExplain Agent</div>
                  <div className="ch-status"><div className="online-dot" />Online · Has your full report</div>
                </div>
              </div>

              <div className="chat-messages">
                {chat.map((m, i) => (
                  <div key={i} className={`msg-wrap ${m.role}`}>
                    {m.role === 'agent' && <div className="msg-avatar">🤖</div>}
                    <div className={`msg-bubble ${m.role}`}
                      dangerouslySetInnerHTML={{ __html: formatText(m.text) }} />
                  </div>
                ))}
                {chatLoading && (
                  <div className="msg-wrap agent">
                    <div className="msg-avatar">🤖</div>
                    <div className="msg-bubble agent typing">
                      <div className="typing-dots">
                        <span /><span /><span />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="chat-suggestions">
                {['What should I eat?', 'How serious is this?', 'What causes low hemoglobin?', 'Do I need medication?'].map(s => (
                  <button key={s} className="suggestion-chip"
                    onClick={() => { setChatInput(s); chatInputRef.current?.focus() }}>
                    {s}
                  </button>
                ))}
              </div>

              <div className="chat-input-area">
                <input
                  ref={chatInputRef}
                  className="chat-input"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                  placeholder="Ask anything about your results..."
                  disabled={chatLoading}
                />
                <button className="send-btn" onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}