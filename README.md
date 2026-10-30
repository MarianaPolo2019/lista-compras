# Minhas Compras

Lista de compras do mercado da Mari e do Carlos, para usar no celular dentro do
mercado. É um app separado do Nosso Plano (repositório, deploy e ícone
próprios), mas usa o **mesmo projeto Supabase** (`financas`), então o login é o
mesmo e-mail e a mesma senha de lá.

## Como o projeto se organiza

```
lista-compras/
├── frontend/              ← o site (é isto que vai para a Vercel)
│   ├── index.html
│   ├── js/config.js       ← URL e anon key do Supabase (as mesmas do Nosso Plano)
│   ├── js/api.js          ← toda conversa com o banco; cliente no esquema "mercado"
│   ├── js/app.js          ← sessão, conferência de membro e rotas (#/lista…)
│   ├── js/telas/          ← login, acesso, lista, orçamento, histórico, ajustes
│   ├── css/estilo.css     ← tokens visuais do design (cores, raios, medidas)
│   ├── assets/            ← fonte Figtree, ícone (SVG) e PNGs do manifest
│   ├── ferramentas/       ← verificador de crase e gerador dos ícones
│   ├── manifest.json      ← faz virar app no celular
│   └── sw.js              ← guarda o casco do app em cache
├── tarefas/               ← os prompts de cada etapa
└── README.md
```

Mesma stack do Nosso Plano: HTML, CSS e JavaScript puros (módulos ES), sem
compilação; `@supabase/supabase-js@2` carregado do esm.sh; service worker
escrito à mão.

## Publicar na Vercel

Igual ao Nosso Plano: **Framework Preset** `Other`, **Root Directory**
`frontend`, **Build Command** e **Output Directory** vazios. Não há variáveis
de ambiente: a URL e a anon key estão no `config.js`.

> A anon key pode ficar no Git: sozinha ela não lê nada. As políticas do
> esquema `mercado` só liberam quem está logado e cadastrado em
> `public.membros_casal`. A chave **service_role nunca** entra neste projeto.

## Antes de usar: liberar o esquema `mercado` na API

O app lê e grava no esquema `mercado`, que só responde depois de entrar na lista
de esquemas expostos: **Supabase → Project Settings → Data API → Exposed
schemas** → acrescentar `mercado` → **Save**. Sem isso, as abas mostram o aviso
"O esquema mercado ainda não está liberado na API do Supabase".

## Conferências antes de publicar

Da pasta `frontend/`:

```bash
node ferramentas/crase-em-comentario.mjs
```

Para refazer os ícones depois de mudar o desenho (mude também os SVGs em `assets/`):

```bash
node ferramentas/gerar-icones.mjs
```

Toda mudança em arquivo do site pede um número novo em `VERSAO`, no `sw.js`:
é isso que faz o celular trocar a cópia guardada.
