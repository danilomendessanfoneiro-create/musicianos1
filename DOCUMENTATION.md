# Musicianos — Documentação Técnica

> App de gestão de carreira para músicos (CRM, Shows, Finanças, Projetos) + módulo de
> **Repertório & Cifras** com transposição de tom, importação de PDF e compartilhamento
> de setlist para músicos freelancers via link público.

Última atualização desta documentação: cobre o estado do projeto após a reorganização
completa (migração para Supabase/modo local, módulo de repertório, importador de PDF,
integração Shows↔Finanças e o novo painel de Previsto x Realizado no Dashboard).

---

## Sumário

1. [Visão geral e stack](#1-visão-geral-e-stack)
2. [Arquitetura em duas camadas de backend](#2-arquitetura-em-duas-camadas-de-backend)
3. [Estrutura de pastas — arquivo por arquivo](#3-estrutura-de-pastas--arquivo-por-arquivo)
4. [Modelo de dados](#4-modelo-de-dados)
5. [Autenticação](#5-autenticação)
6. [Motor de cifra: parsing e transposição](#6-motor-de-cifra-parsing-e-transposição)
7. [Importador de PDF](#7-importador-de-pdf)
8. [Repertório, Setlists e compartilhamento público](#8-repertório-setlists-e-compartilhamento-público)
9. [Integração Shows ↔ Finanças](#9-integração-shows--finanças)
10. [Dashboard](#10-dashboard)
11. [Roteamento](#11-roteamento)
12. [Como rodar o projeto](#12-como-rodar-o-projeto)
13. [Limitações conhecidas](#13-limitações-conhecidas)
14. [Roadmap sugerido](#14-roadmap-sugerido)
15. [Analisador de Áudio (tom e acordes a partir do áudio)](#15-analisador-de-áudio-tom-e-acordes-a-partir-do-áudio)

---

## 1. Visão geral e stack

| Camada | Tecnologia |
|---|---|
| Framework | React 19 + TypeScript |
| Build tool | Vite 6 |
| Estilo | Tailwind CSS (via CDN no `index.html`) |
| Roteamento | React Router 6 (`BrowserRouter`) |
| Backend (opcional) | Supabase (Postgres + Auth + RLS) |
| Backend (padrão/local) | Camada própria em `localStorage`, com a mesma "forma" de API do Supabase |
| Leitura de PDF | `pdfjs-dist` (carregado sob demanda) |
| Ícones | `lucide-react` |

O projeto **não depende de um backend próprio (Node/Express etc.)** — ou fala direto com
o Supabase (Postgres gerenciado), ou roda inteiramente no navegador usando o backend local
como substituto para testes. Não existe servidor intermediário.

---

## 2. Arquitetura em duas camadas de backend

Esta é a decisão arquitetural mais importante do projeto e vale entender bem.

Toda a aplicação fala com um único objeto importado de `lib/supabaseClient.ts`:

```ts
import { supabase } from '../lib/supabaseClient';
```

Esse módulo decide, em tempo de execução, **qual implementação usar**:

```ts
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)   // cliente real do @supabase/supabase-js
  : localSupabase;                                // implementação própria (lib/localBackend.ts)
```

`isSupabaseConfigured` é `true` somente quando `SUPABASE_URL` e `SUPABASE_ANON_KEY` estão
preenchidas com valores reais (não os de exemplo do `.env.local`).

### 2.1 Por que isso existe

O app foi desenhado para que a pessoa consiga testar tudo **sem precisar criar/configurar
um projeto Supabase primeiro**. Para isso, `lib/localBackend.ts` implementa, do zero, um
objeto que imita a API do `@supabase/supabase-js` na parte usada pelo app:

- `supabase.auth.signInWithPassword / signUp / signOut / getSession / getUser / onAuthStateChange`
- `supabase.from(tabela).select().insert().update().delete().eq().order().single()`
- `supabase.rpc('get_shared_setlist', { token })`

Como nenhuma tela importa o Supabase real diretamente (todas importam `supabase` de
`lib/supabaseClient.ts`), **nenhum componente precisa saber qual das duas implementações
está rodando por baixo**. Configurar as variáveis de ambiente depois e fazer um novo
deploy troca o backend inteiro sem alterar uma linha de UI.

### 2.2 Modo local (`lib/localBackend.ts`)

- Os dados ficam em duas chaves do `localStorage` do navegador:
  - `musicianos_local_db_v1` — todas as "tabelas" (leads, gigs, transactions, projects,
    songs, setlists, setlist_items, setlist_shares, profiles), como um objeto
    `{ [nomeDaTabela]: Row[] }`.
  - `musicianos_local_auth_v1` — lista de usuários locais (`{id, email, password}`, sem
    hashing — **não é seguro, é só para teste**) e o id do usuário atualmente logado.
- `LocalQueryBuilder` é uma classe que implementa `PromiseLike<{data, error}>` — ou seja,
  dá para fazer `await supabase.from('gigs').select('*').eq('id', x)` exatamente como no
  Supabase real, porque a classe implementa `.then()` manualmente e monta a query com
  filtros (`.eq`), ordenação (`.order`) e o modificador `.single()` antes de executar.
- Não há RLS (Row Level Security) no modo local — a filtragem por usuário é feita no
  código do hook (`useSupabaseTable`), não no "banco".
- `supabase.rpc('get_shared_setlist', ...)` é reimplementado manualmente em JS, fazendo o
  mesmo "join" que a função SQL equivalente faz no Supabase real (ver seção 8).
- **Limitação intencional**: dados presos ao navegador/dispositivo. Não sincroniza entre
  pessoas nem entre aparelhos — é exatamente isso que o Supabase resolve depois.

### 2.3 Modo Supabase (produção)

Quando configurado, todas as tabelas, políticas de segurança (RLS) e a função pública de
compartilhamento vivem no Postgres do Supabase — ver `supabase/schema.sql`. Isso é o que
permite o link de setlist funcionar entre dispositivos/pessoas diferentes de verdade.

---

## 3. Estrutura de pastas — arquivo por arquivo

```
musicianos/
├── App.tsx                       # Shell da aplicação: rotas + gate de autenticação
├── index.tsx                     # Ponto de entrada (ReactDOM.createRoot)
├── index.html                    # HTML base, Tailwind via CDN, import map
├── types.ts                      # Todas as interfaces/tipos TypeScript do domínio
├── vite.config.ts                # Config do Vite (porta, alias @/, injeção de env vars)
├── vercel.json                   # Build command + rewrite de SPA para o Vercel
├── package.json / package-lock.json
├── tsconfig.json
├── .env.local                    # SUPABASE_URL / SUPABASE_ANON_KEY (local, não versionar)
│
├── contexts/
│   └── AuthContext.tsx           # Provider de autenticação (sessão, perfil, sign in/up/out)
│
├── lib/
│   ├── supabaseClient.ts         # Decide entre cliente real e localSupabase
│   ├── localBackend.ts           # "Supabase falso" rodando em localStorage
│   ├── useSupabaseTable.ts       # Hook genérico de CRUD por tabela (usado por CRM/Gigs/etc.)
│   ├── useSetlistDetail.ts       # Hook específico: setlist + itens + links de compartilhamento
│   ├── chordpro.ts               # Parsing de cifra ChordPro-lite + transposição de tom
│   ├── pdfImport.ts              # Extração de texto de PDF e reconstrução em ChordPro
│   └── audioAnalysis.ts          # FFT + chroma + detecção de tom/acordes a partir de áudio
│
├── components/
│   ├── ui.tsx                    # Card, Modal, Input, Select, Textarea, PrimaryButton, formatCurrency
│   ├── Sidebar.tsx                # Menu lateral de navegação
│   ├── LocalModeBanner.tsx        # Aviso de "modo local" quando Supabase não configurado
│   └── ComparisonBar.tsx          # Barra de progresso usada no painel Previsto x Realizado
│
├── pages/
│   ├── Login.tsx                  # Tela de login/cadastro
│   ├── Dashboard.tsx              # Visão geral (cards, próximos shows, funil, previsto x realizado)
│   ├── CRM.tsx                    # Kanban de leads por status
│   ├── Gigs.tsx                   # Shows: cadastro, edição, check de recebido/pago
│   ├── Finance.tsx                # Lançamentos financeiros (receita/despesa)
│   ├── Projects.tsx               # Projetos paralelos (gravações, clipes etc.)
│   ├── SharePage.tsx              # Página PÚBLICA do setlist compartilhado (rota /s/:token)
│   ├── AudioAnalyzer.tsx          # Analisador de Áudio: upload → tom + progressão de acordes
│   └── repertoire/
│       ├── RepertoireHome.tsx     # Biblioteca de músicas: busca, lista, entrada p/ criar/ver
│       ├── SongForm.tsx           # Criar/editar música (editor ChordPro + importar PDF)
│       ├── SongViewer.tsx         # Visualizar cifra: transpor tom, autoscroll, fonte
│       ├── ChordProRenderer.tsx   # Componente puro que desenha acorde em cima da sílaba
│       ├── Setlists.tsx           # Lista de setlists
│       └── SetlistEditor.tsx      # Montar setlist, definir tom por show, gerar/revogar link
│
└── supabase/
    ├── schema.sql                 # Schema completo (rodar do zero num projeto novo)
    └── migration_002_gig_finance_link.sql   # Migração incremental (ver seção 9)
```

---

## 4. Modelo de dados

Tipos completos em `types.ts`; schema real (Postgres) em `supabase/schema.sql`. Toda
tabela "de usuário" tem `user_id` e é protegida por RLS (`auth.uid() = user_id`) no modo
Supabase; no modo local, o hook filtra manualmente pelo mesmo campo.

| Tabela | Campos principais | Observações |
|---|---|---|
| `profiles` | `id, name, role` | 1:1 com `auth.users`, criado por trigger no signup |
| `leads` | `name, venue, channel, value, status, last_contact` | CRM (Kanban por `status`) |
| `gigs` | `date, city, venue, event_type, fee, cost, notes, fee_received, cost_paid` | `fee_received`/`cost_paid` disparam a sincronia com `transactions` (seção 9) |
| `transactions` | `date, description, amount, type ('income'\|'expense'), category, gig_id, source` | `source`: `'manual' \| 'gig_fee' \| 'gig_cost'` — identifica lançamentos automáticos |
| `projects` | `title, due_date, cost, status, description` | status: planning/in-progress/completed/on-hold |
| `songs` | `title, artist, original_key, bpm, tags[], body_chordpro` | `body_chordpro` guarda letra+acorde no formato `[C]texto` |
| `setlists` | `title, notes, gig_id` | `gig_id` opcional — vincula o setlist a um show |
| `setlist_items` | `setlist_id, song_id, position, performance_key, notes` | `performance_key` pode ser diferente do `original_key` da música |
| `setlist_shares` | `setlist_id, share_token, created_by, expires_at` | token público usado na rota `/s/:token` |

### Índices e função pública

- `songs_title_search_idx`: índice `gin` com `to_tsvector('portuguese', ...)` em título+artista
  (preparado para busca full-text mais robusta no futuro — a busca atual no front-end é
  simples `includes()` no texto).
- `transactions_gig_id_idx`: acelera a busca de transações vinculadas a um show.
- `get_shared_setlist(token text)`: função `SECURITY DEFINER` que faz o join entre
  `setlist_shares → setlists → gigs → profiles → setlist_items → songs` e devolve uma
  única tabela "achatada" — é o que a rota pública `/s/:token` consome, sem precisar dar
  acesso de leitura direta às tabelas para usuários anônimos.

---

## 5. Autenticação

`contexts/AuthContext.tsx` expõe `session`, `profile`, `loading`, `signIn`, `signUp`,
`signOut` via Context API. Funciona igual independente do backend, porque só chama
`supabase.auth.*`:

1. No mount, busca a sessão atual (`getSession`) e o perfil associado (tabela `profiles`).
2. Assina mudanças de estado (`onAuthStateChange`) para reagir a login/logout em tempo real.
3. `signUp` passa `options.data.name` — no Supabase real isso vira `raw_user_meta_data`,
   lido pelo trigger `handle_new_user()` para criar a linha em `profiles` automaticamente;
   no modo local, `ensureProfile()` faz o equivalente manualmente.

No modo local, **não existe confirmação de e-mail** — o cadastro já loga a pessoa na hora.
No Supabase real, isso depende da configuração de "Confirm email" do projeto.

---

## 6. Motor de cifra: parsing e transposição

Tudo em `lib/chordpro.ts`, sem dependências externas.

### 6.1 Formato de armazenamento

As cifras são guardadas como texto simples, com o acorde entre colchetes logo antes da
sílaba onde ele "cai":

```
{c: Refrão}
[C]Ao lon[Am]ge daqui [F]nada [G]mais
```

`{c: texto}` marca uma seção (renderizada em destaque, tipo comentário). Isso é uma versão
simplificada do formato ChordPro.

### 6.2 `parseChordPro(body)`

Transforma o texto bruto em uma lista de linhas estruturadas (`ChordProLine[]`), cada uma
classificada como `'lyric' | 'comment' | 'blank'`. Para linhas de letra, quebra o texto em
segmentos `{ chord, lyric }` usando uma regex (`/\[([^\]]+)\]/g`) que captura tudo entre
colchetes e associa ao trecho de letra seguinte. `ChordProRenderer.tsx` usa essa estrutura
para desenhar o acorde alinhado acima da sílaba (duas linhas `<div>` empilhadas, uma por
segmento, com `minWidth` calculado a partir do tamanho da sílaba).

### 6.3 Transposição — a lógica musical

- `NOTES_SHARP` / `NOTES_FLAT`: as 12 notas cromáticas, em sustenido e em bemol.
- `noteToIndex(nota)`: converte qualquer notação (`C`, `C#`, `Db`, `Cb`, `B#`...) para um
  índice de 0 a 11, usando três tabelas de apoio (`NATURAL_TO_INDEX`, `SHARP_TO_INDEX`,
  `FLAT_TO_INDEX`).
- `transposeChord(chord, semitones, useFlats)`:
  1. Separa a raiz do resto do acorde via `splitChordRoot` (regex `^([A-G])(#|b)?`) — ex:
     `"F#m7/A"` → raiz `"F#"`, resto `"m7/A"`.
  2. Se houver baixo depois de `/` (acorde com inversão, ex: `G/B`), transpõe raiz e baixo
     **separadamente**, cada um preservando o que vem depois.
  3. Converte a raiz para índice, soma os semitons, aplica módulo 12 (sempre positivo:
     `((idx + semitons) % 12 + 12) % 12`), e converte de volta para nota — na escala de
     sustenidos por padrão (`useFlats` disponível para o caso de precisar em bemol).
  4. **A qualidade do acorde (`m`, `7`, `sus4`, `dim`, `maj7` etc.) nunca é tocada** — só a
     raiz e o baixo movem. Isso é o que faz `transposeChord("F#m7/A", 2)` devolver
     `"G#m7/B"` corretamente (testado — ver seção de testes abaixo).
- `transposeChordProBody(body, semitones)`: aplica `transposeChord` em **todos** os
  acordes de um texto inteiro, via `body.replace(CHORD_REGEX, ...)`.
- `semitoneDiff(fromKey, toKey)`: diferença em semitons entre dois tons (raiz apenas,
  ignora se é maior/menor) — usado para calcular quantos semitons transpor uma música do
  seu tom original para o tom escolhido num show específico.

### 6.4 Tons maiores e menores

- `MAJOR_KEYS` = as 12 notas (`C` a `B`).
- `MINOR_KEYS` = as mesmas 12, com `"m"` no final (`Cm` a `Bm`).
- Um tom menor é tratado, para fins de transposição, **exatamente como um acorde com
  qualidade "m"** — por isso `transposeKey("Am", 3)` reaproveita `transposeChord` e
  devolve `"Cm"` sem nenhum código extra: a raiz `A` sobe 3 semitons pra `C`, o sufixo `m`
  é preservado.
- `normalizeKey(key)`: normaliza qualquer forma de escrever um tom (`"Bb"`, `"g menor"`,
  `"Ebmin"`, `"F#m"`...) para o formato usado nos seletores do app — sempre sustenido,
  nunca bemol, com `m` no final se for menor. Usada tanto ao selecionar manualmente quanto
  ao aplicar o tom detectado automaticamente na importação de PDF.

### 6.5 Testes manuais já validados

Estes casos foram rodados e conferidos durante o desenvolvimento (via `tsx`, fora do
navegador):

| Chamada | Resultado |
|---|---|
| `normalizeKey("Bb")` | `A#` |
| `normalizeKey("g menor")` | `Gm` |
| `normalizeKey("Ebmin")` | `D#m` |
| `transposeKey("Am", 3)` | `Cm` |
| `transposeKey("G", 7)` | `D` |
| `semitoneDiff("C","G")` | `7` |
| `semitoneDiff("Am","Cm")` | `3` |
| `transposeChord("F#m7/A", 2)` | `G#m7/B` |

---

## 7. Importador de PDF

Arquivo: `lib/pdfImport.ts`, usando `pdfjs-dist` (carregado com `import()` dinâmico dentro
de `SongForm.tsx`, só quando a pessoa clica em "Importar de PDF" — evita que todo mundo
baixe essa biblioteca pesada sem precisar dela).

**Só funciona com PDF de texto selecionável** (não é OCR — PDF escaneado/foto não tem
texto extraível).

### 7.1 Passo a passo do algoritmo

1. **Extração posicionada** (`extractLines`): usa `pdf.getPage(n).getTextContent()`, que
   devolve cada "pedaço" de texto do PDF com sua posição `(x, y)`. Itens com o mesmo `y`
   (com tolerância de 2 unidades) são agrupados na mesma linha.
2. **Reconstrução em grade monoespaçada** (`buildLineFromItems`): calcula uma largura de
   caractere estimada (mediana de `largura_do_item / tamanho_da_string` de todos os itens
   da página — a maioria das cifras em PDF usa fonte monoespaçada) e usa isso pra decidir
   em qual "coluna" cada palavra cai, reconstruindo a linha como uma string normal com
   espaços no lugar certo.
3. **Detecção de metadado** (`METADATA_LINE_REGEX`): linhas que começam com `Tom:`,
   `Capotraste:`, `Afinação:`, `BPM:`, `Andamento:` são tratadas à parte — **não entram no
   corpo da cifra**. Se a linha começar com `Tom:`, o tom é extraído
   (`KEY_IN_TEXT_REGEX`, aceita maior/menor: `"Tom: G"`, `"Tom: Gm"`, `"Tom: G menor"`) e
   devolvido como `keyGuess`.
4. **Detecção de seção** (`SECTION_WORDS`): linhas como `"Refrão"`, `"Intro"`, `"Solo"`
   viram `{c: ...}` automaticamente.
5. **Detecção de linha de acorde** (`isChordLine`): quebra a linha em tokens por espaço e
   testa cada um contra `CHORD_TOKEN_REGEX` (raiz + acidente + qualidade + extensão
   numérica + baixo opcional). Se **70% ou mais** dos tokens parecem acorde E o tamanho
   médio do token é curto (≤ 7 caracteres), a linha é considerada "linha de acordes".
6. **Fusão acorde+letra** (`mergeChordAndLyric`): se uma linha de acorde é seguida por uma
   linha de letra (não vazia, não também de acorde), cada token de acorde é inserido como
   `[Acorde]` na posição de coluna correspondente dentro do texto da letra — de trás para
   frente, pra não bagunçar os índices dos que ainda faltam inserir.
7. Se uma linha de acordes **não** tiver letra embaixo (ex: introdução só instrumental),
   vira uma linha só com `[Acorde] [Acorde] [Acorde]`.
8. **Palpite de título**: a primeira linha de texto "normal" (que não é acorde, seção ou
   metadado) nas primeiras 5 linhas do PDF, com menos de 60 caracteres, vira sugestão de
   título — só é aplicada se o campo Título ainda estiver vazio.

### 7.2 O que a pessoa vê

`SongForm.tsx` chama `importPdfToChordPro(file)`, recebe `{ body, titleGuess, keyGuess }`,
preenche o editor com o resultado e mostra um aviso amarelo:
- Se achou o tom: *"Extraído do PDF (tom detectado: G) — confira o alinhamento dos
  acordes abaixo antes de salvar."*
- Se não achou: pede pra conferir/ajustar manualmente o tom.

Em ambos os casos, **o resultado sempre fica em modo de revisão antes de salvar** — o
reconhecimento é heurístico (baseado em posição e padrão de texto, não é infalível),
então erros de alinhamento podem acontecer em cifras com formatação incomum.

---

## 8. Repertório, Setlists e compartilhamento público

### 8.1 Biblioteca de músicas (`RepertoireHome.tsx`)

Lista todas as músicas do usuário (`useSupabaseTable<Song>`), com busca simples por
título/artista no front-end. Clicar numa música abre `SongViewer`; "Nova Música" abre
`SongForm`.

### 8.2 Visualização (`SongViewer.tsx`)

- Botões `-`/`+` mudam `semitones` (estado local); o corpo exibido é sempre
  `transposeChordProBody(song.body_chordpro, semitones)` — a música original em
  `songs.body_chordpro` **nunca é alterada** pela transposição na tela, só a exibição.
- Autoscroll: usa `requestAnimationFrame` e `containerRef.current.scrollTop += velocidade * dt`,
  com um slider controlando px/segundo.
- Tamanho de fonte ajustável (`A-`/`A+`).
- Se vier de um setlist (`initialKey` — tom definido pra aquele show), já abre transposta
  automaticamente: `baseSemitones = semitoneDiff(song.original_key, initialKey)`.

### 8.3 Setlists (`Setlists.tsx` + `SetlistEditor.tsx`)

- Um setlist pode (opcionalmente) ser vinculado a um show (`gig_id`).
- `useSetlistDetail(setlistId)` (em `lib/useSetlistDetail.ts`) carrega o setlist, seus
  itens (com join manual pra trazer a música de cada item — `select('*, song:songs(*)')`,
  suportado tanto no Supabase real quanto emulado em `LocalQueryBuilder.applyJoins`), e os
  links de compartilhamento ativos.
- Adicionar música ao setlist grava `performance_key = song.original_key` por padrão — a
  pessoa pode mudar esse tom especificamente pra aquele show sem afetar o tom original
  salvo na música.
- Reordenar (`reorder`) atualiza o campo `position` de cada item em lote.

### 8.4 Compartilhamento público

1. `createShareLink()` insere uma linha em `setlist_shares` com um `share_token` gerado
   (no Supabase real: `encode(gen_random_bytes(9), 'base64')`, sanitizado por um trigger
   pra só sobrar letras/números; no modo local: `uuid()`).
2. O link gerado é `${origin}/s/${token}` — essa rota (`/s/:token`, registrada em
   `App.tsx` **fora** do `<AuthProvider>`) não exige login.
3. `SharePage.tsx` chama `supabase.rpc('get_shared_setlist', { token })`, que devolve uma
   lista "achatada" com uma linha por música do setlist (título, artista, tom definido pra
   aquele show, tom original, corpo da cifra, notas do show/dono).
4. A página pública transpõe a cifra de cada música com `semitoneDiff(original, tom_do_show)`
   e mostra igual ao visualizador normal, com navegação lateral entre as músicas do
   repertório.
5. Botão pronto de "Enviar pelo WhatsApp" (`wa.me/?text=...`) e opção de copiar o link.
6. `revokeShare(shareId)` apaga a linha de `setlist_shares` — o link para de funcionar
   imediatamente (a função SQL não encontra mais o token).

No modo local, o link só funciona se aberto **no mesmo navegador** onde foi gerado (já que
os dados vivem no `localStorage` daquele navegador) — é uma limitação conhecida e esperada
até a migração para Supabase.

---

## 9. Integração Shows ↔ Finanças

Implementada inteiramente em `pages/Gigs.tsx` e `pages/Finance.tsx`, sem lógica no banco
(nem trigger SQL) — para funcionar igual nos dois backends (local e Supabase).

### 9.1 Campos envolvidos

- `gigs.fee_received` (boolean) e `gigs.cost_paid` (boolean).
- `transactions.gig_id` (aponta pro show de origem) e `transactions.source`
  (`'manual' | 'gig_fee' | 'gig_cost'`) — só lançamentos manuais têm `source = 'manual'`.

### 9.2 Fluxo (`syncGigTransaction` em `Gigs.tsx`)

Chamado sempre que um show é criado, editado, ou quando um checkbox de recebido/pago é
alternado:

1. Busca se já existe uma transação com aquele `gig_id` + `source` (`gig_fee` ou
   `gig_cost`).
2. Se o campo booleano correspondente (`fee_received`/`cost_paid`) é `true`:
   - Se já existe transação → **atualiza** valor/data/descrição (mantém em sincronia se o
     cachê for editado depois de já marcado como recebido).
   - Se não existe → **cria** uma nova transação (`income` para cachê, `expense` para
     custo), categoria `"Show"`, descrição `"Cachê — <local>"` ou `"Despesa do show — <local>"`.
3. Se o campo é `false` e existe transação vinculada → **apaga** a transação.

### 9.3 Consistência ao excluir

- Excluir um show (`handleDelete` em `Gigs.tsx`) apaga primeiro as transações vinculadas
  (`gig_fee` e `gig_cost`), depois o show — evita lançamento "órfão" em Finanças.
- Excluir diretamente uma transação vinculada na aba **Finanças** (`handleDelete` em
  `Finance.tsx`) desmarca automaticamente o campo correspondente no show
  (`fee_received`/`cost_paid` volta a `false`) — evita o show ficar com o check marcado
  sem o lançamento realmente existir.
- No Supabase real, `transactions.gig_id` tem `on delete cascade`, então apagar o show
  também limpa as transações no nível do banco — o código em `handleDelete` faz a mesma
  limpeza de forma explícita para funcionar igual no modo local (que não tem cascade).

### 9.4 Migração de banco

Quem já tinha rodado `supabase/schema.sql` **antes** dessa funcionalidade existir precisa
rodar `supabase/migration_002_gig_finance_link.sql` (usa `add column if not exists`, então
é seguro rodar mesmo sem saber exatamente o estado atual do banco). Instalações novas já
usam o `schema.sql` atualizado, que inclui essas colunas desde o início.

---

## 10. Dashboard

`pages/Dashboard.tsx` combina três hooks (`gigs`, `leads`, `transactions`) e é dividido em
blocos independentes — **cada bloco novo foi adicionado sem alterar os anteriores**,
propositalmente, pra não quebrar nada que já funcionava:

1. **Cards superiores**: shows cadastrados, leads em negociação, receita bruta total,
   saldo líquido (`Card` de `components/ui.tsx`).
2. **Próximos shows**: os 3 shows futuros mais próximos, ordenados por data.
3. **Funil de leads**: contagem por status (`Novo`, `Negociação`, `Fechado`, `Perdido`).
4. **Previsto x Realizado** *(bloco mais recente)*: usa exatamente os campos
   `fee_received`/`cost_paid` da seção 9 —
   - Receita **Previsto** = soma de `fee` dos shows com `fee_received = false`.
   - Receita **Realizado** = soma de `fee` dos shows com `fee_received = true`.
   - Despesa **Previsto**/**Realizado** = mesma lógica com `cost`/`cost_paid`.
   - Renderizado com `ComparisonBar` (barra de progresso simples, sem dependência de
     biblioteca de gráficos) — a barra mais longa entre as quatro define a escala (100%)
     das demais.

---

## 11. Roteamento

`App.tsx` define duas árvores de rota independentes via `react-router-dom`:

```
/s/:token   → SharePage (pública, sem AuthProvider, sem Sidebar)
/*          → AuthProvider → RootGate → Login OU AuthenticatedApp
```

Dentro de `AuthenticatedApp`, a navegação entre Dashboard/Repertório/Setlists/Shows/
CRM/Finanças/Projetos **não usa rotas de URL** — é um `useState<ViewState>` simples trocado
pela Sidebar. Ou seja, só a rota de compartilhamento público é uma URL de verdade; o resto
do app é uma SPA de estado único. Isso é intencional (simplicidade), mas significa que dar
F5 sempre volta pro Dashboard, e não dá pra linkar diretamente para "Finanças", por exemplo.

`vercel.json` tem um rewrite (`"/(.*)" → "/index.html"`) pra garantir que abrir
`/s/algum-token` direto (sem passar pela home primeiro) funcione no Vercel — sem isso, o
servidor tentaria achar um arquivo físico em `/s/algum-token` e devolveria 404.

---

## 12. Como rodar o projeto

### Modo local (sem configurar nada)

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`, crie uma conta (qualquer e-mail/senha) e use — dados ficam
no navegador.

### Modo Supabase (produção / dados compartilháveis de verdade)

1. Criar projeto em [supabase.com](https://supabase.com).
2. Rodar `supabase/schema.sql` inteiro no SQL Editor do projeto (e, se o projeto já
   existia antes dessa versão, rodar também `supabase/migration_002_gig_finance_link.sql`).
3. Copiar Project URL + anon public key (Project Settings → API).
4. Preencher `.env.local`:
   ```
   SUPABASE_URL=https://SEU_PROJETO.supabase.co
   SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLICA
   ```
5. `npm run dev` (ou build/deploy) — o app detecta a configuração e troca de backend
   automaticamente.

### Deploy no Vercel

- Build command: `npm run build` · Output directory: `dist` (já configurado em
  `vercel.json`).
- Configurar `SUPABASE_URL` e `SUPABASE_ANON_KEY` em **Project Settings → Environment
  Variables** e fazer um **Redeploy** depois de adicionar (variáveis de ambiente só
  entram em efeito em builds novos).
- Sem essas variáveis, o Vercel funciona normalmente **em modo local** (cada visitante
  tem seus próprios dados isolados no navegador dele — não é o comportamento desejado
  para uso real multi-usuário, só serve pra demonstração/teste).

---

## 13. Limitações conhecidas

- **Modo local não sincroniza** entre dispositivos/pessoas — é só para teste. Links de
  compartilhamento gerados em modo local só abrem no mesmo navegador.
- **Importador de PDF não é infalível**: depende de o PDF ter texto selecionável e usar
  fonte aproximadamente monoespaçada para o alinhamento acorde↔sílaba funcionar bem. PDFs
  escaneados (imagem) não são suportados — precisariam de OCR (não implementado).
  Detecção do "Tom:" depende do PDF ter essa informação escrita explicitamente no
  cabeçalho.
- **Sem importação/scraping automático de sites de cifra** (ex: Cifra Club) — decisão
  deliberada por risco de direitos autorais e violação de Termos de Uso desses sites; ver
  seção de decisões de produto na conversa original.
- **Busca de repertório é local ao usuário**: cada pessoa só vê as próprias músicas. Uma
  biblioteca compartilhada entre usuários do Musicianos (reaproveitar cifra já cadastrada
  por outro músico) foi discutida como próximo passo, mas ainda não implementada.
- **Navegação interna do app não usa URLs** (seção 11) — só a página de compartilhamento
  público é uma rota real.
- **Autenticação local não é seguro para produção** — senha em texto puro no
  `localStorage`. Adequado só para teste; produção deve sempre usar o Supabase real.
- **Placeholder de campo numérico**: o padrão dos formulários agora usa string vazia (não
  `0`) para não esconder o texto de exemplo — esse ajuste foi feito em Shows e Finanças;
  CRM e Projetos ainda não passaram pelo mesmo ajuste.
- Bundle do importador de PDF é pesado (~2 MB, o worker do `pdfjs-dist`), mas carregado só
  sob demanda (`import()` dinâmico), então não afeta o carregamento inicial do app.

---

## 14. Roadmap sugerido

Ideias que surgiram ao longo do desenvolvimento e ainda não foram implementadas:

- Reintroduzir o "AI Manager" (insights de carreira via IA) que existia na versão
  original do app, agora lendo dos dados reais do Supabase.
- Biblioteca de repertório **compartilhada entre usuários** do Musicianos — quando uma
  música é cadastrada por qualquer músico, fica disponível pra outros reaproveitarem
  (com crédito de quem transcreveu), crescendo organicamente sem depender de terceiros.
- OCR para PDFs escaneados (cifra em papel/foto).
- Aplicar a mesma correção de placeholder (valor `0` escondendo o texto de exemplo) em
  CRM e Projetos.
- Convite de colaboradores com conta própria num mesmo setlist (hoje o freelancer só
  visualiza via link público, sem poder editar).
- **Separação de faixas (vozes/instrumentos), tipo Moises/LALAL.AI**: avaliado e
  deliberadamente adiado — não é algo que dá pra "construir do zero" (é um modelo de IA
  treinado, tipo Demucs/HTDemucs), exigiria integrar uma API paga por uso (ex: modelo
  Demucs hospedado no Replicate, ~US$0,02–0,03 por música) chamada a partir de uma função
  de servidor nova (o app hoje não tem backend próprio além do Supabase), mais
  armazenamento pro áudio enviado e pras faixas geradas. Decisão consciente do dono do
  projeto: ficou de fora por enquanto, priorizando a detecção de tom/acordes (seção 15),
  que já roda sem custo e sem infraestrutura nova.

---

## 15. Analisador de Áudio (tom e acordes a partir do áudio)

Tela nova (`pages/AudioAnalyzer.tsx` + motor em `lib/audioAnalysis.ts`) que estima o tom e
uma progressão aproximada de acordes a partir de um arquivo de áudio — **inteiramente no
navegador**, sem enviar nada pra servidor nenhum e sem custo por uso.

### 15.1 Por que só isso e não separação de faixas também

Separar vozes/instrumentos (o que o Moises faz) depende de um modelo de IA treinado
especificamente pra isso — não é algo que se escreve como função matemática, é uma rede
neural (a família mais usada hoje é o **Demucs/HTDemucs**, da Meta, open-source, mas
"rodar" um modelo desses exige GPU ou uma API hospedada paga por uso). Já **detecção de
tom e acorde** é um problema mais antigo e mais simples de MIR (*Music Information
Retrieval*) que se resolve com processamento de sinal clássico — por isso deu pra
implementar aqui sem depender de nenhum serviço externo.

### 15.2 Pipeline (`lib/audioAnalysis.ts`)

1. **Decodificação + downmix/resample** (`loadMonoSamples`): usa `AudioContext.decodeAudioData`
   pra decodificar o arquivo, depois um `OfflineAudioContext` de 1 canal a 11025 Hz pra
   converter pra mono e reduzir a taxa de amostragem numa passada só (Web Audio API faz
   esse trabalho pesado nativamente). 11025 Hz é suficiente pro conteúdo tonal relevante
   e deixa o processamento bem mais rápido que os 44100 Hz originais. Áudios com mais de
   6 minutos (`MAX_ANALYZE_SECONDS`) são cortados no início, por performance — a interface
   avisa quando isso acontece.
2. **FFT própria** (`fft`): implementação Cooley-Tukey radix-2 iterativa, in-place, escrita
   do zero (sem dependência externa) — janelas de 4096 amostras, sobreposição de 50% (hop
   de 2048), com janelamento Hann pra reduzir vazamento espectral.
3. **Extração de chroma** (`computeChromaFrames`): cada bin de frequência da FFT (limitado
   à faixa ~55Hz–1760Hz, onde mora a informação harmônica relevante) é mapeado pra uma das
   12 classes de altura (`freqToPitchClass`, usando a fórmula padrão de conversão
   frequência→MIDI→classe de altura) e a energia é somada por classe — isso gera um vetor
   de 12 números por janela (e um vetor acumulado da música inteira), normalizado. O loop
   cede o thread a cada 25 janelas (`await new Promise(r => setTimeout(r, 0))`) pra não
   travar a interface, e reporta progresso (%) nesse meio tempo.
4. **Detecção de tom** (`estimateKey`): correlaciona (correlação de Pearson) o chroma
   acumulado da música inteira contra os **perfis de Krumhansl-Kessler** — perfis clássicos
   da literatura de cognição musical que descrevem o quanto cada grau da escala costuma
   ser enfatizado numa tonalidade maior ou menor. Testa as 24 rotações possíveis (12 tons
   maiores + 12 menores) e devolve todas ordenadas por pontuação — a UI mostra a melhor e
   mais 3 alternativas, com a pontuação como "confiança relativa" (não é uma probabilidade
   real, é só a força da correlação).
5. **Progressão de acordes** (`estimateChordTimeline`): para cada janela, compara o chroma
   contra 24 "moldes" de tríade (maior e menor, pra cada uma das 12 notas — só tríade
   simples por enquanto, sem sétimas/extensões) via similaridade de cosseno, pega o mais
   parecido, e agrupa janelas consecutivas com o mesmo acorde em segmentos com início/fim.
   Segmentos menores que 1 segundo são fundidos com o anterior (redução de ruído/oscilação
   entre janelas vizinhas).

### 15.3 Validação

O motor foi testado com sinais sintéticos (soma de senoides puras simulando acordes),
fora do navegador, via `tsx`:

| Teste | Entrada | Tom top-1 detectado | Acorde dominante |
|---|---|---|---|
| Acorde maior | G3+B3+D4 (tríade de Sol maior) | `G` (correlação 0.83) | `G` (100% da duração) |
| Acorde menor | A3+C4+E4 (tríade de Lá menor) | `Am` (correlação 0.89) | `Am` (único acorde detectado) |

Confirma que a extração de chroma, a detecção de tom e o template matching de acordes
estão matematicamente corretos para o caso ideal (sinal limpo, sem mistura de instrumentos
nem ruído) — que é exatamente o cenário onde a ferramenta funciona melhor na prática
também (gravação de voz+violão, por exemplo).

### 15.4 Interface (`pages/AudioAnalyzer.tsx`)

- Upload de arquivo (`accept="audio/*"`), com barra de progresso durante a análise.
- Card "Tom sugerido": tom mais provável + confiança, com os 3 próximos candidatos abaixo
  (é comum a segunda opção ser a relativa menor/maior do tom principal — ambiguidade
  esperada e normal em detecção de tom sem contexto melódico/harmônico completo).
- Card "Progressão detectada": lista cronológica de acordes com o tempo de início de cada
  um, com botão de copiar o resultado (tom + progressão) formatado como texto simples.
- Aviso permanente de que é uma estimativa heurística, não uma transcrição perfeita —
  pensada como ponto de partida pra digitar a cifra em Repertório & Cifras, não como
  substituto da revisão humana.

### 15.5 Limitações específicas desta feature

- Funciona bem em gravações "limpas" (poucos instrumentos, harmonia clara). Em faixas com
  mixagem densa, muita percussão ou muito processamento, a precisão cai bastante — é
  esperado, é a mesma limitação de qualquer ferramenta de detecção de acorde puramente por
  análise espectral (sem separação de fontes prévia).
- Só reconhece **tríades simples** (maior/menor) — não tenta identificar sétimas,
  suspensões, acordes com baixo invertido etc.
- Não há integração automática com o cadastro de música ainda — o resultado é só copiado
  como texto de referência; a pessoa ainda digita a cifra manualmente em
  Repertório & Cifras usando esse resultado como apoio.
