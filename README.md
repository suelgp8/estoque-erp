# Estoque ERP

Sistema web para controle de estoque, produtos, bases, movimentacoes, transferencias, usuarios e relatorios.

O projeto esta preparado para dois ambientes isolados:

- desenvolvimento: `docker-compose.dev.yml`, banco `dev_db`, hot reload
- producao: `docker-compose.prod.yml`, banco `prod_db`, sem volume de codigo

O fluxo antigo com `npm run dev` foi mantido para nao quebrar o ambiente local existente.

## Tecnologias

- Frontend: Vue 3, Vite, TypeScript, Tailwind CSS
- Backend: Node.js, Express, Prisma
- Banco: PostgreSQL 16
- Infra: Docker Compose, Nginx, Cloudflare Tunnel

## Estrutura

- `frontend/`: aplicacao web
- `backend/`: API, Prisma, autenticacao, regras de negocio e relatorios
- `backend/prisma/migrations/`: migrations do banco
- `backend/prisma-prod/migrations/`: baseline de producao para banco limpo
- `docker-compose.dev.yml`: ambiente Docker de desenvolvimento
- `docker-compose.prod.yml`: ambiente Docker de producao
- `.env.dev.example`: modelo de variaveis para desenvolvimento
- `.env.prod.example`: modelo de variaveis para producao
- `.env.example`: modelo geral

## Variaveis de ambiente

Arquivos reais de ambiente nao devem ser commitados:

- `.env`
- `.env.dev`
- `.env.prod`
- `backend/.env`

Crie os arquivos a partir dos modelos:

```bash
cp .env.dev.example .env.dev
cp .env.prod.example .env.prod
```

No Windows PowerShell:

```powershell
Copy-Item .env.dev.example .env.dev
Copy-Item .env.prod.example .env.prod
```

Variaveis principais:

- `DB_HOST`: host do Postgres dentro do Docker, normalmente `postgres`
- `DB_PORT`: porta interna do Postgres, normalmente `5432`
- `DB_NAME`: `dev_db` no dev e `prod_db` na producao
- `DB_USER`: usuario do banco
- `DB_PASSWORD`: senha do banco
- `PORT`: porta interna do backend, normalmente `3000`
- `PRISMA_MIGRATIONS_PATH`: caminho de migrations usado pelo Docker, normalmente `prisma-prod/migrations`
- `JWT_SECRET`: segredo forte para tokens
- `APP_BASE_URL`: URL publica do frontend
- `CORS_ALLOWED_ORIGINS`: origens permitidas para chamadas HTTP

As variaveis `POSTGRES_DB`, `POSTGRES_USER` e `POSTGRES_PASSWORD` devem acompanhar os valores de `DB_NAME`, `DB_USER` e `DB_PASSWORD`, porque sao lidas pela imagem oficial do Postgres.

## Desenvolvimento com Docker

1. Crie `.env.dev`:

```bash
cp .env.dev.example .env.dev
```

2. Suba o ambiente:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Atalhos equivalentes:

```bash
npm run dev:docker
```

Enderecos:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- Banco: `localhost:5432`, database `dev_db`

O backend roda com hot reload via `nodemon`; o frontend roda com Vite. O codigo local e montado nos containers apenas no ambiente de desenvolvimento.
O Docker de desenvolvimento tambem usa a baseline em `backend/prisma-prod/migrations` para permitir `dev_db` limpo.

Para parar:

```bash
docker compose -f docker-compose.dev.yml down
```

Para apagar o banco de desenvolvimento e subir limpo:

```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up --build
```

## Desenvolvimento local antigo

O comando abaixo continua disponivel:

```bash
npm run dev
```

Ele usa Node local e Docker para o Postgres, como antes. Para novos ambientes, prefira `docker-compose.dev.yml`.

## Producao com Docker

Na maquina da empresa:

1. Instale Docker e Git.
2. Clone o repositorio.
3. Crie `.env.prod`.
4. Troque todas as senhas e URLs de producao.
5. Suba os containers.

```bash
git clone <repo>
cd estoque-erp
cp .env.prod.example .env.prod
docker compose -f docker-compose.prod.yml up --build -d
```

No Windows PowerShell:

```powershell
git clone <repo>
cd estoque-erp
Copy-Item .env.prod.example .env.prod
docker compose -f docker-compose.prod.yml up --build -d
```

Enderecos em producao:

- Aplicacao/Nginx: `http://localhost:8080`
- Backend: interno na rede Docker, porta `3000`
- Postgres: interno na rede Docker, database `prod_db`

O `docker-compose.prod.yml` nao monta volume de codigo. Apenas o Postgres usa volume persistente:

- `estoque_prod_postgres_data`

## Banco limpo em producao

Na primeira execucao em uma maquina nova, o volume `estoque_prod_postgres_data` nao existe; o Postgres cria o banco `prod_db` vazio. O backend aplica as migrations automaticamente com:

```bash
npm run prisma:migrate:deploy
```

Esse comando ja esta no `command` do container backend de producao.
Em producao, o compose define `PRISMA_MIGRATIONS_PATH=prisma-prod/migrations`, usando uma baseline limpa do schema atual. As migrations legadas em `backend/prisma/migrations` foram mantidas para nao quebrar bancos de desenvolvimento existentes.

Para recriar o banco de producao do zero, com perda total dos dados:

```bash
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up --build -d
```

Use isso apenas antes de operar com dados reais ou quando houver backup validado.

Para rodar migrations manualmente:

```bash
docker compose -f docker-compose.prod.yml exec backend npm run prisma:migrate:deploy
```

## Usuario inicial

Se o banco estiver vazio e nao houver usuario `ADMIN`, o backend cria um admin inicial com:

- `DEFAULT_ADMIN_NAME`
- `DEFAULT_ADMIN_EMAIL`
- `DEFAULT_ADMIN_PASSWORD`

Em producao, altere a senha no `.env.prod` antes da primeira subida e troque a senha no primeiro login.

## Cloudflare Tunnel

O frontend de producao fica em `http://localhost:8080`. O Cloudflare Tunnel deve apontar para essa porta.

Opcao recomendada pela Cloudflare: crie um tunnel no dashboard Zero Trust, publique o hostname apontando para `http://localhost:8080` e instale o conector na maquina da empresa com o token gerado.

Exemplo com Docker:

```bash
docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <TUNNEL_TOKEN>
```

Exemplo rapido para teste, sem hostname fixo:

```bash
cloudflared tunnel --url http://localhost:8080
```

Exemplo de tunnel localmente gerenciado:

```bash
cloudflared tunnel login
cloudflared tunnel create estoque-erp
cloudflared tunnel route dns estoque-erp estoque.suaempresa.com.br
```

Crie o arquivo de configuracao do `cloudflared` com ingresso para a aplicacao:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /caminho/para/<TUNNEL_ID>.json

ingress:
  - hostname: estoque.suaempresa.com.br
    service: http://localhost:8080
  - service: http_status:404
```

Depois rode:

```bash
cloudflared tunnel run estoque-erp
```

Depois ajuste `.env.prod`:

```env
APP_BASE_URL=https://estoque.suaempresa.com.br
CORS_ALLOWED_ORIGINS=https://estoque.suaempresa.com.br
```

Recrie os containers apos mudar `.env.prod`:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

## Parar, reiniciar e logs

Desenvolvimento:

```bash
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml up --build
```

Producao:

```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.prod.yml logs -f
```

Atalhos npm:

```bash
npm run dev:docker
npm run dev:docker:down
npm run prod:up
npm run prod:down
npm run prod:logs
```

## Atualizar producao

Na maquina da empresa:

```bash
git pull
docker compose -f docker-compose.prod.yml up --build -d
```

As migrations pendentes serao aplicadas pelo backend ao subir.

## GitHub

Antes de commitar, confira:

```bash
git status
```

Arquivos `.env`, logs, `node_modules`, builds e volumes nao devem entrar no Git.

Comandos iniciais:

```bash
git init
git add .
git commit -m "Production-ready setup with env separation"
git remote add origin <repo>
git push -u origin main
```

## Troubleshooting

Docker nao esta rodando:

```bash
docker info
```

Se falhar, abra o Docker Desktop ou inicie o daemon na maquina.

Porta ocupada:

- dev usa `5173`, `3000`, `5432`
- prod usa `8080`

Pare o processo que usa a porta ou altere o compose.

Banco errado ou dados antigos:

```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.prod.yml down -v
```

Use o comando certo para o ambiente certo. Dev usa `dev_db`; producao usa `prod_db`.

Erro de login no primeiro acesso:

- confirme `DEFAULT_ADMIN_EMAIL` e `DEFAULT_ADMIN_PASSWORD` no `.env.prod`
- se o admin ja foi criado antes, mudar o `.env.prod` nao altera a senha existente
- para ambiente ainda sem dados reais, recrie o volume com `down -v`

Erro de API no frontend:

- em producao, acesse pelo Nginx em `http://localhost:8080`
- confira se `/api/health` responde
- confira logs com `docker compose -f docker-compose.prod.yml logs -f backend`

Erro de migrations:

```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml exec backend npm run prisma:migrate:deploy
```
