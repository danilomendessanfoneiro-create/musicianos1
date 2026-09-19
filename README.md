# Musicianos

App de gestão de carreira para músicos — **CRM, Shows, Finanças e Projetos** — somado a um conjunto de
ferramentas musicais que rodam inteiramente no navegador:

- **Repertório & Cifras** — cadastro de cifras, transposição de tom, autoscroll, importação de PDF.
- **Setlists compartilháveis** — monte o repertório de um show com as tonalidades e envie um link para os
  freelancers, que abrem sem precisar de conta.
- **Analisador de Áudio** — detecta tom e progressão de acordes de um arquivo, ou ao vivo (microfone ou
  áudio de uma aba do navegador).
- **Estúdio VS** — separa uma música em quatro pistas (voz, harmonia, baixo, bateria), com mixer de ensaio
  e acervo local.

Nada disso envia áudio para servidor nenhum: todo o processamento acontece na máquina do usuário.

---

## Rodando o projeto

**Pré-requisito:** Node.js 18 ou superior.

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`, clique em "Criar conta" e comece a usar.

Sem nenhuma configuração, o app roda em **modo local**: os dados ficam no `localStorage` do navegador. É
ótimo para testar, mas não sincroniza entre dispositivos nem entre pessoas — e limpar os dados do site
apaga tudo (há um botão de backup/restauração na barra lateral). Para dados de verdade, configure o
Supabase abaixo.

### Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o servidor de desenvolvimento |
| `npm run build` | Gera o build de produção em `dist/` |
| `npm run preview` | Serve o build de produção localmente |
| `npm run test:stems` | Roda o teste do motor de separação de pistas com um mix sintético |

---

## Configurando o Supabase (opcional, recomendado)

Sem isso o app funciona em modo local. Com isso, os dados passam a viver num Postgres real, sincronizam
entre dispositivos e os links de setlist funcionam de verdade com outras pessoas.

1. Crie uma conta grátis em [supabase.com](https://supabase.com) e crie um novo projeto.
2. No painel, vá em **SQL Editor → New query**, cole todo o conteúdo de
   [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. Isso cria as tabelas, as regras de
   segurança (RLS) e a função de acesso público ao setlist compartilhado.
   - Se o seu banco já existia antes da integração Shows↔Finanças, rode também
     [`supabase/migration_002_gig_finance_link.sql`](supabase/migration_002_gig_finance_link.sql).
3. Vá em **Project Settings → API** e copie a **Project URL** e a **anon public key**.
4. Copie o modelo de variáveis e preencha com os seus valores:
   ```bash
   cp .env.example .env.local
   ```
   ```
   SUPABASE_URL=https://SEU_PROJETO.supabase.co
   SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLICA
   ```
5. (Recomendado enquanto testa) Em **Authentication → Providers → Email**, desative "Confirm email" para
   poder logar assim que criar a conta.

> O `.env.local` está no `.gitignore` — suas chaves não vão para o GitHub. O `.env.example` é só o modelo.

---

## Deploy no Vercel

1. Suba o repositório para o GitHub e importe o projeto no Vercel (o `vercel.json` já traz o build command,
   o output directory e o rewrite de SPA — necessário para o link `/s/<token>` abrir direto).
2. Em **Settings → Environment Variables**, adicione `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
3. Vá em **Deployments → ⋯ → Redeploy**. Variáveis de ambiente só valem a partir de um build novo.

---

## As ferramentas musicais

### Repertório & Cifras
Cifras no formato `[C]texto` (ChordPro simplificado), com transposição de tom em tempo real, autoscroll e
tamanho de fonte ajustável. Tons maiores e menores. Dá para importar de um PDF com texto selecionável: o
app detecta a linha `Tom:`, reconhece as linhas de acorde e as encaixa sobre a letra — sempre deixando o
resultado para revisão antes de salvar.

O conteúdo das cifras é sempre cadastrado pelo próprio músico. Não há raspagem de sites de cifra.

### Setlists compartilháveis
Monte o repertório de um show, defina o tom de cada música *para aquele show* e gere um link. O freelancer
abre em `/s/<token>`, sem conta, e vê tudo já transposto. O link pode ser revogado a qualquer momento.

### Analisador de Áudio
Estima o tom e a progressão de acordes por análise de frequência (FFT → chroma → perfis de
Krumhansl-Kessler para o tom, template matching de tríades com desambiguação pelo baixo para os acordes).
Traz um player com os acordes destacando conforme a música toca, e um botão que cria a música no
repertório já com os acordes posicionados, deixando marcadores `____` para você digitar a letra ouvindo.

Também funciona **ao vivo**: microfone ou áudio de uma aba (Chrome/Edge, marcando "Compartilhar áudio da
guia"). O acorde aparece em tempo real; o tom é calculado sob demanda, somando tudo o que já foi ouvido.

### Estúdio VS
Separa uma faixa em **voz, harmonia, baixo e bateria** — STFT, HPSS e máscaras por frequência e coerência
estéreo, tudo em um Web Worker. Traz mixer com ganho, mute, solo, tom e andamento, acervo local em
IndexedDB e exportação em WAV. Cada pista tem um botão que a manda direto para o Analisador de Áudio.

Rode `npm run test:stems` para ver o motor sendo medido contra um mix sintético de fontes conhecidas.

---

## Estrutura

```
App.tsx                      # shell: rotas (/s/:token pública) + navegação por estado
index.tsx                    # ponto de entrada
types.ts                     # tipos do domínio
contexts/AuthContext.tsx     # autenticação (Supabase ou modo local)

lib/
  supabaseClient.ts          # escolhe entre Supabase real e backend local
  localBackend.ts            # backend em localStorage + backup/restauração
  useSupabaseTable.ts        # CRUD genérico por tabela
  useSetlistDetail.ts        # setlist + itens + links de compartilhamento
  chordpro.ts                # parser de cifra + transposição de tom
  pdfImport.ts               # PDF de cifra → ChordPro
  audioAnalysis.ts           # FFT, chroma, tom e acordes
  liveAudio.ts               # captura ao vivo (microfone / aba)
  stemEngine.ts              # motor de separação de pistas (DSP puro)
  stemWorker.ts              # o motor rodando em Web Worker
  stemAudio.ts               # decodificação, WAV, paleta das pistas
  multitrack.ts              # reprodutor multipista
  vsLibrary.ts               # acervo em IndexedDB
  audioHandoff.ts            # entrega de pista ao Analisador
  stemEngine.test.ts         # teste do motor (npm run test:stems)

components/                  # Sidebar, ui, ComparisonBar, LocalModeBanner
pages/
  Login, Dashboard, CRM, Gigs, Finance, Projects
  AudioAnalyzer, LiveListener, StudioVS
  SharePage                  # página pública do setlist
  repertoire/                # RepertoireHome, SongForm, SongViewer, ChordProRenderer,
                             # Setlists, SetlistEditor
supabase/
  schema.sql                 # schema completo
  migration_002_gig_finance_link.sql
```

Documentação técnica detalhada, com o funcionamento de cada algoritmo e as limitações conhecidas, em
[`DOCUMENTATION.md`](DOCUMENTATION.md).

---

## Limitações conhecidas

- O modo local não sincroniza entre dispositivos e some se os dados do site forem limpos — use o backup na
  barra lateral, ou configure o Supabase.
- A importação de PDF exige texto selecionável (PDF escaneado não funciona — precisaria de OCR).
- A detecção de acordes é uma estimativa por análise espectral: funciona bem em gravações limpas e erra
  mais em mixagens densas. Serve como ponto de partida, não como transcrição final.
- A separação de pistas não modela timbre — só posição no tempo/frequência/estéreo. Funciona
  bem pra bateria, baixo e voz em registro médio/agudo; ainda confunde instrumento harmônico
  centralizado com ataque percussivo (violão, piano tocando no tempo) e voz em registro grave
  perto da faixa do baixo. Números e investigação completa em `DOCUMENTATION.md` §16.4 —
  notadamente, gravações mono também não produzem pista de voz.
- Transposição e andamento no Estúdio VS andam juntos (usam `playbackRate`); separá-los pede um phase
  vocoder.

## Próximos passos sugeridos

- Biblioteca de repertório compartilhada entre usuários do app, com crédito de quem transcreveu.
- OCR para PDFs escaneados.
- Convite de colaboradores com conta própria num mesmo setlist.
- Phase vocoder no Estúdio VS, para mudar o tom sem alterar o andamento.
- Motor de separação baseado em rede neural (Demucs via API paga, por exemplo) para os casos
  que a heurística atual não resolve — o ponto de troca já está isolado em `stemAudio.ts`
  (`separateBuffer`), documentado em `DOCUMENTATION.md` §16.2.
