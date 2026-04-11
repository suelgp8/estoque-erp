# Estoque ERP

Aplicacao de controle de estoque em monorepo, com frontend Vue, backend Node/Express e Postgres local via Docker.

## Stack

- Frontend: Vue 3 + Vite + TypeScript
- Backend: Node.js + Express + Prisma
- Banco de dados: Postgres 16
- Infra local: Docker Compose

## Estrutura do repositorio

- `frontend/`: aplicacao web
- `backend/`: API, autenticacao, relatorios e acesso ao banco
- `drizzle/`: migrations SQL auxiliares e historicas
- `scripts/`: scripts locais de apoio
- `docker-compose.yml`: Postgres para desenvolvimento

## Guias do repositorio

- [Fluxo de contribuicao](./CONTRIBUTING.md)
- [Guia de deploy na VPS](./docs/deploy-vps.md)

## Requisitos

- Node.js 20 ou superior
- npm
- Docker Desktop em execucao
- Git

## Configuracao inicial

1. instale as dependencias na raiz:

```bash
npm install
```

2. crie `backend/.env` a partir de `backend/.env.example`
3. ajuste as variaveis se precisar de outro banco, URL publica ou SMTP

## Subir tudo

Na raiz do projeto:

```bash
npm run dev
```

Esse comando faz automaticamente:

1. sobe o Postgres no Docker
2. aplica as migrations do backend
3. garante um usuario admin de teste
4. inicia backend e frontend em modo desenvolvimento

## Enderecos locais

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`

## Usuario de teste

Por padrao, `npm run dev` garante este login:

- Email: `admin@estoque.local`
- Senha: `admin123`

Se quiser trocar isso, adicione no `backend/.env`:

```env
DEV_ADMIN_NAME="Admin de Teste"
DEV_ADMIN_EMAIL="admin@estoque.local"
DEV_ADMIN_PASSWORD="admin123"
```

## Teste remoto pelo VS Code

Com o projeto rodando em `npm run dev`, voce pode testar a aplicacao remotamente usando o encaminhamento de portas do VS Code.

1. abra a view `Ports` no VS Code
2. encaminhe a porta `5173`
3. use a URL publica gerada para abrir o frontend remotamente

O frontend usa `/api` por padrao e o Vite encaminha essas requisicoes para o backend local em `http://127.0.0.1:3000`, entao normalmente nao e necessario publicar a porta `3000`.

Se voce quiser testar recuperacao de senha por link, ajuste `APP_BASE_URL` no `backend/.env` para a URL publica do frontend.

## Comandos uteis

- `npm run dev`: prepara ambiente e sobe tudo
- `npm run db:up`: sobe apenas o Postgres
- `npm run db:down`: para apenas o Postgres
- `npm run db:logs`: acompanha logs do banco
- `npm run migrate`: aplica migrations do backend
- `npm run dev:user`: cria ou reseta o usuario admin de teste
- `npm run dev:backend`: sobe apenas o backend
- `npm run dev:frontend`: sobe apenas o frontend
- `npm run build`: gera build do backend e do frontend

## Fluxo de versionamento

- `main`: historico principal e mais estavel
- `develop`: integracao do trabalho em andamento
- branches curtas: `feature/...`, `fix/...`, `chore/...`, sempre partindo de `develop`

## Observacoes

- arquivos `.env`, builds e logs ficam fora do Git
- o repositorio usa `.gitattributes` e `.editorconfig` para reduzir ruido de formatacao entre ambientes
