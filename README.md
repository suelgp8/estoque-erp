# Estoque ERP

Monorepo com frontend, backend, Prisma e PostgreSQL.

O fluxo oficial local agora e Docker-first e foi ajustado para eliminar o problema de migrations duplicadas em maquina nova ou em banco legado de desenvolvimento.

## Stack

- Frontend: Vue 3, Vite, TypeScript
- Backend: Node.js, Express, Prisma
- Banco: PostgreSQL 16
- Infra local: Docker Compose

## O que mudou

- `docker-compose.yml` virou o ponto de entrada oficial do ambiente local
- o backend espera o Postgres ficar pronto antes de inicializar
- o bootstrap do Prisma agora usa migrations versionadas tanto no local quanto na producao
- o caminho canonico de migrations agora e `backend/prisma/migrations`
- a cadeia antiga foi arquivada em `backend/prisma/migrations_legacy`
- o workaround `prisma-prod` saiu do fluxo

## Subida rapida

Clone o projeto e suba:

```bash
git clone <repo>
cd estoque-erp
docker compose up -d --build
```

Se quiser gerar os arquivos `.env`, `.env.dev` e `.env.prod` automaticamente antes de subir:

```bash
npm run setup
```

URLs locais:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- Healthcheck: `http://localhost:3000/health`
- PostgreSQL: `localhost:5432`

## Arquivos de ambiente

Fonte principal:

- `.env.example`

Presets auxiliares:

- `.env.dev.example`
- `.env.prod.example`
- `backend/.env.example` para rodar backend fora do Docker

Copias comuns:

```bash
cp .env.example .env
cp .env.dev.example .env.dev
cp .env.prod.example .env.prod
```

PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item .env.dev.example .env.dev
Copy-Item .env.prod.example .env.prod
```

Variaveis criticas:

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SCHEMA`
- `DATABASE_URL` apenas se quiser sobrescrever os `DB_*`
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` sempre alinhados com os `DB_*`
- `PRISMA_BOOTSTRAP_MODE=migrate` no ambiente local
- `PRISMA_BOOTSTRAP_MODE=migrate` em producao

## Estrategia do Prisma

Regras do projeto:

- o `docker-compose.yml` local usa `prisma migrate deploy` para aplicar apenas migrations versionadas
- use `npm run prisma:migrate:dev` apenas quando alterar `schema.prisma` e precisar versionar uma nova migration
- use `npm run prisma:migrate:deploy` para bootstrap do ambiente compartilhado e para producao
- use `prisma migrate reset` apenas para reset intencional de banco de desenvolvimento

Comportamento do bootstrap:

1. backend espera o banco responder
2. roda `prisma generate`
3. aplica o fluxo definido em `PRISMA_BOOTSTRAP_MODE`
4. sobe a API

No modo `migrate`, se o banco ja tiver schema mas ainda nao tiver tabela `_prisma_migrations`, o backend marca a baseline atual como aplicada e continua o `deploy`. Isso evita o erro de `type already exists` em bancos herdados sem historico do Prisma.

## Comandos uteis

```bash
npm run dev
npm run dev:up
npm run dev:down
npm run dev:logs
npm run dev:reset
npm run prisma:push
npm run prisma:migrate:dev
npm run prod:up
npm run prod:down
```

Resumo:

- `npm run dev`: sobe o ambiente local em foreground
- `npm run dev:up`: sobe em background
- `npm run dev:reset`: derruba containers e remove volumes do ambiente local
- `npm run prisma:push`: use apenas em ajuste local pontual, nao como fluxo padrao do projeto
- `npm run prisma:migrate:dev`: cria/aplica migration nova de forma intencional

## Compose

Arquivos:

- `docker-compose.yml`: ambiente local oficial
- `docker-compose.dev.yml`: alias de compatibilidade para o mesmo ambiente local
- `docker-compose.prod.yml`: ambiente de producao

Ordem garantida:

1. Postgres sobe e passa no healthcheck
2. Backend espera o banco, sincroniza Prisma e fica healthy
3. Frontend sobe depois do backend

## Producao

Exemplo basico:

```bash
cp .env.prod.example .env.prod
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

O backend usa `PRISMA_BOOTSTRAP_MODE=migrate`, com `prisma migrate deploy`.

## Troubleshooting

Docker nao inicia:

```bash
docker info
```

Se falhar, inicie o Docker Desktop antes de subir o projeto.

Porta ocupada:

- local: `5432`, `3000`, `5173`
- producao: `8080`

Pare o processo que esta usando a porta antes de subir os containers.

Erro do Prisma com `type already exists`:

```bash
npm run dev:reset
docker compose up -d --build
```

Se o erro aparecer em ambiente herdado com schema antigo, confirme se o backend esta rodando com a migration baseline nova e sem referencias ao fluxo antigo `prisma-prod`.

Banco inconsistente ou volume antigo:

```bash
npm run dev:reset
```

Depois suba novamente:

```bash
docker compose up -d --build
```

Backend subiu antes do banco:

- o compose agora usa `depends_on` com `service_healthy`
- alem disso, o backend executa `wait-for-db` antes do Prisma

Frontend sem acesso a API:

- confira `http://localhost:3000/health`
- confira logs com `npm run dev:logs`
- valide `APP_BASE_URL`, `CORS_ALLOWED_ORIGINS` e `VITE_BACKEND_TARGET`

## Fluxo para evoluir schema

Quando mudar `backend/prisma/schema.prisma`:

1. rode `npm run prisma:migrate:dev`
2. revise a migration gerada em `backend/prisma/migrations`
3. suba o ambiente normalmente com `docker compose up -d --build`

Esse e o fluxo que preserva historico versionado sem reintroduzir `migrate deploy` no ambiente local.
