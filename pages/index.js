// pages/index.js

import { useState } from 'react';

export default function Home() {
  const [status, setStatus] = useState('Idle');
  const [response, setResponse] = useState(null);

  const checkWebhook = async () => {
    setStatus('Checking...');
    try {
      const res = await fetch('/api/webhook?hub.mode=subscribe&hub.verify_token=success20242&hub.challenge=1234');
      const text = await res.text();

      if (res.ok) {
        setStatus('✅ Webhook working!');
        setResponse(text);
      } else {
        setStatus(`❌ Error: ${res.status}`);
        setResponse(text);
      }
    } catch (err) {
      setStatus('❌ Request failed');
      setResponse(err.message);
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', lineHeight: 1.6 }}>
      <h1>👋 Welcome to AI Nwanne</h1>
      <p>This app is connected to the Meta Webhook successfully.</p>

      <p><strong>Status:</strong> {status}</p>

      <button 
        onClick={checkWebhook} 
        style={{
          padding: '0.6rem 1rem',
          backgroundColor: '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer'
        }}
      >
        🔄 Check Webhook Status
      </button>

      {response && (
        <pre 
          style={{
            marginTop: '1rem',
            padding: '1rem',
            background: '#f5f5f5',
            borderRadius: '6px',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word'
          }}
        >
          {response}
        </pre>
      )}

      <footer style={{ marginTop: '3rem', fontSize: '0.9rem', color: '#666' }}>
        © 2025 Onyekachi Ebosi — <a href="https://github.com/success20242/AI-Nwanne" target="_blank" rel="noreferrer">GitHub Repo</a>
      </footer>
    </div>
  );
}
