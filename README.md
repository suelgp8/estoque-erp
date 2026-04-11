# Estoque ERP

Fluxo simples para rodar a aplicacao local sempre que quiser testar.

## Requisitos

- Node.js 20 ou superior
- Docker Desktop em execucao
- Dependencias instaladas com `npm install`

## Subir tudo

Na raiz do projeto:

```bash
npm run dev
```

Esse comando agora faz o seguinte automaticamente:

1. sobe o Postgres no Docker
2. aplica as migrations do backend
3. garante um usuario admin de teste
4. inicia backend e frontend em modo desenvolvimento

## Enderecos locais

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`

## Teste remoto pelo VS Code

Com o projeto rodando em `npm run dev`, voce pode testar a aplicacao remotamente usando o encaminhamento de portas do VS Code.

1. abra a view `Ports` no VS Code
2. encaminhe a porta `5173`
3. use a URL publica gerada para abrir o frontend remotamente

O frontend agora usa `/api` por padrao e o Vite encaminha essas requisicoes para o backend local em `http://127.0.0.1:3000`, entao nao e necessario publicar a porta `3000` para o uso comum da aplicacao.

O acesso local continua funcionando normalmente em `http://localhost:5173`.

Se voce quiser testar o fluxo de recuperacao de senha por link, ajuste `APP_BASE_URL` no `backend/.env` para a URL publica do frontend.

## Usuario de teste

Por padrao, o comando `npm run dev` garante este login:

- Email: `admin@estoque.local`
- Senha: `admin123`

Se quiser trocar isso, adicione no `backend/.env`:

```env
DEV_ADMIN_NAME="Admin de Teste"
DEV_ADMIN_EMAIL="admin@estoque.local"
DEV_ADMIN_PASSWORD="admin123"
```

## Comandos uteis

- `npm run dev`: prepara ambiente e sobe tudo
- `npm run db:up`: sobe apenas o Postgres
- `npm run db:down`: para apenas o Postgres
- `npm run db:logs`: acompanha logs do banco
- `npm run migrate`: aplica migrations do backend
- `npm run dev:user`: cria ou reseta o usuario admin de teste
- `npm run dev:backend`: sobe apenas o backend
- `npm run dev:frontend`: sobe apenas o frontend

## Rotina recomendada

Para testar no dia a dia:

1. abra o Docker Desktop
2. rode `npm run dev`
3. acesse `http://localhost:5173`
4. entre com o usuario de teste

Para encerrar:

1. pressione `Ctrl + C` no terminal do `npm run dev`
2. se quiser parar o banco tambem, rode `npm run db:down`
