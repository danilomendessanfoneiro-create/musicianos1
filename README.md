# Musicianos

App de gestão de carreira para músicos (CRM, Shows, Finanças, Projetos) + módulo de **Repertório & Cifras**
com compartilhamento de setlist (com tonalidades) para músicos freelancers, via link — sem precisar de login.

## O que mudou nesta reorganização

- Removido o login mockado e o `localStorage` como "banco de dados" — agora usa **Supabase** (Postgres real +
  autenticação real), o que é obrigatório para o recurso de compartilhamento funcionar entre pessoas diferentes.
- Removidos os arquivos em `components/` que não eram usados (o app antigo tinha tudo duplicado e inline em `App.tsx`).
- Novo módulo **Repertório & Cifras**: cadastro de música com letra+acorde no formato `[C]texto`, transposição de
  tom em tempo real, autoscroll, e **Setlists** vinculados a shows, com geração de link público de compartilhamento.
- O conteúdo das cifras é sempre cadastrado pelo próprio músico (não há scraping/cópia de sites como Cifra Club —
  isso violaria direitos autorais do conteúdo deles).

## 1. Criar o projeto no Supabase

1. Crie uma conta grátis em [supabase.com](https://supabase.com) e crie um novo projeto.
2. No painel, vá em **SQL Editor** → **New query**, cole todo o conteúdo do arquivo
   [`supabase/schema.sql`](supabase/schema.sql) deste projeto e clique em **Run**. Isso cria todas as tabelas,
   as regras de segurança (RLS) e a função de acesso público ao setlist compartilhado.
3. Vá em **Project Settings → API** e copie a **Project URL** e a **anon public key**.
4. No arquivo `.env.local` deste projeto, preencha:
   ```
   SUPABASE_URL=https://SEU_PROJETO.supabase.co
   SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLICA
   ```
5. (Opcional, recomendado para testes) Em **Authentication → Providers → Email**, desative
   "Confirm email" enquanto estiver testando, para poder logar assim que criar a conta.

## 2. Rodar localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`, clique em "Criar conta" e comece a usar.

## Como funciona o compartilhamento de repertório

1. Cadastre suas músicas em **Repertório & Cifras** (letra + acordes entre colchetes, ex: `[C]como assim`).
2. Crie um **Setlist**, vincule a um show (opcional) e adicione as músicas, definindo o tom de cada uma
   especificamente para aquele show.
3. Clique em **Gerar Link** — isso cria uma URL pública (`/s/<token>`) que qualquer pessoa pode abrir, sem
   conta, e ver o repertório já com as cifras no tom certo. Dá pra enviar direto pelo botão do WhatsApp.
4. Você pode revogar o link a qualquer momento (ele some da lista de links ativos).

## Estrutura

```
App.tsx                    # shell + rotas (área logada + /s/:token pública)
contexts/AuthContext.tsx   # autenticação real via Supabase
lib/
  supabaseClient.ts
  chordpro.ts               # parser de cifra + transposição de tom
  useSupabaseTable.ts        # hook genérico de CRUD (leads, gigs, transactions, projects, songs, setlists)
  useSetlistDetail.ts        # setlist + itens + links de compartilhamento
pages/
  Login.tsx, Dashboard.tsx, CRM.tsx, Gigs.tsx, Finance.tsx, Projects.tsx
  SharePage.tsx              # página pública do setlist compartilhado
  repertoire/
    RepertoireHome.tsx, SongForm.tsx, SongViewer.tsx, ChordProRenderer.tsx
    Setlists.tsx, SetlistEditor.tsx
supabase/schema.sql          # schema completo para rodar no Supabase
```

## Próximos passos sugeridos

- Reintroduzir o "AI Manager" (insights de carreira via Gemini) que existia na versão anterior, agora lendo
  dos dados do Supabase.
- Importação de cifra em lote (colar um texto e o app detecta os acordes automaticamente).
- Modo "banda": convidar outros usuários para colaborar num mesmo setlist com conta (hoje o freelancer só visualiza
  via link; virar colaborador com conta é o próximo passo natural).
