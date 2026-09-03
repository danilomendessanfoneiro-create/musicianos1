import React from 'react';
import ReactDOM from 'react-dom/client';
import { isSupabaseConfigured } from './lib/supabaseClient';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);

function renderSetupScreen() {
  root.render(
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 480 }}>
        <h1 style={{ color: '#818cf8', fontSize: 24, marginBottom: 12 }}>
          Musicianos — configuração pendente
        </h1>
        <p style={{ color: '#d4d4d8', lineHeight: 1.6 }}>
          As variáveis <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code> não foram
          encontradas (ou ainda estão com o valor de exemplo).
        </p>
        <p style={{ color: '#a1a1aa', lineHeight: 1.6, marginTop: 8 }}>
          Se você está rodando localmente: preencha o arquivo <code>.env.local</code>.<br />
          Se está na Vercel: vá em <b>Project Settings → Environment Variables</b>, adicione as
          duas chaves e faça um novo deploy (Redeploy) — variáveis de ambiente só entram em
          efeito depois de um novo build.
        </p>
        <p style={{ color: '#71717a', fontSize: 13, marginTop: 16 }}>
          Veja o passo a passo completo no README.md do projeto.
        </p>
      </div>
    </div>
  );
}

async function bootstrap() {
  if (!isSupabaseConfigured) {
    renderSetupScreen();
    return;
  }

  const { default: App } = await import('./App');
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();
