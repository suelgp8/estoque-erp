# Contributing

Guia simples para o fluxo de trabalho do repositorio.

## Branches

- `main`: codigo mais estavel e base para deploy
- `develop`: integracao do trabalho em andamento
- `feature/...`: novas funcionalidades
- `fix/...`: correcoes
- `chore/...`: ajustes operacionais, docs ou manutencao
- `hotfix/...`: correcoes urgentes saindo de `main`

## Rotina do dia a dia

1. atualize a base local:

```bash
git checkout develop
git pull origin develop
```

2. crie uma branch para a tarefa:

```bash
git checkout -b feature/nome-curto-da-tarefa
```

3. implemente a mudanca
4. valide localmente:

```bash
npm run build
```

5. faca o commit padronizado:

```bash
npm run repo:commit -- -Type feat -Scope frontend -Message "ajusta fluxo de login"
```

6. envie a branch:

```bash
git push -u origin feature/nome-curto-da-tarefa
```

7. abra um Pull Request para `develop`
8. depois da homologacao, faca o merge de `develop` para `main`

## Padrao de commits

Use mensagens curtas e objetivas:

- `feat(frontend): adiciona filtro por base`
- `fix(backend): corrige validacao de usuario`
- `docs(repo): atualiza guia de deploy`
- `chore(ci): ajusta pipeline`

Tipos recomendados:

- `feat`
- `fix`
- `docs`
- `chore`
- `refactor`
- `test`
- `build`
- `ci`
- `perf`
- `style`

## Script de commit

O repositorio inclui o script `scripts/git-commit.ps1`.

Exemplo sem push:

```bash
npm run repo:commit -- -Type fix -Scope auth -Message "corrige expiracao do token"
```

Exemplo com push:

```bash
npm run repo:commit -- -Type feat -Scope reports -Message "adiciona exportacao csv" -Push
```

O script:

- adiciona todas as alteracoes rastreaveis
- monta a mensagem de commit no padrao definido
- bloqueia commit direto na `main`
- pode fazer push da branch atual se voce usar `-Push`

## Fluxo de release

Fluxo recomendado:

1. desenvolvimento em `feature/...`
2. merge em `develop`
3. homologacao manual
4. merge de `develop` em `main`
5. deploy da `main` para a VPS

Para correcoes urgentes:

1. crie `hotfix/...` a partir de `main`
2. corrija e valide
3. merge em `main`
4. replique o mesmo conteudo em `develop`

## O que voce faz

Estas decisoes devem ficar com voce:

- definir prioridade e escopo de negocio
- aprovar mudancas visuais e regras de negocio
- decidir o momento do merge para `main`
- manter acesso ao GitHub, VPS, dominio, SMTP e segredos
- validar deploy em ambiente produtivo

## O que o Codex pode fazer

Eu posso cuidar da parte operacional e tecnica:

- criar e editar codigo
- atualizar docs e templates
- rodar build e verificacoes locais
- preparar commits e branches quando voce pedir
- montar PRs, changelog e checklist de release
- preparar scripts e arquivos de deploy para VPS

## Regras simples

- nao trabalhar direto em `main`
- evitar branch longa demais
- manter PRs pequenas e objetivas
- documentar mudancas que afetem `.env`, banco ou deploy
