# Deploy na VPS

Guia pratico para quando o projeto for publicado em uma VPS.

## Regra principal

Deploy sai sempre da branch `main`.

`develop` serve para integracao e homologacao. A VPS de producao nao deve receber codigo direto de `develop`.

## Responsabilidades

### O que voce deve decidir ou executar

- contratar e manter a VPS
- definir dominio e DNS
- manter credenciais de producao
- decidir janela de deploy
- aprovar mudancas que impactem usuarios
- cuidar de backup e recuperacao

### O que o Codex pode preparar

- `Dockerfile` e `docker-compose` de producao
- `.env.example` de producao
- configuracao de proxy reverso
- scripts de deploy e rollback
- pipeline de GitHub Actions para deploy
- checklist de smoke test

## Fluxo recomendado

1. terminar a tarefa em `feature/...`
2. abrir PR para `develop`
3. validar localmente ou em homologacao
4. abrir PR de `develop` para `main`
5. depois do merge em `main`, iniciar o deploy

## Checklist antes do deploy

- [ ] `main` esta com o codigo aprovado
- [ ] `npm run build` passou localmente ou na CI
- [ ] mudancas de banco foram revisadas
- [ ] variaveis de ambiente novas estao definidas
- [ ] plano de rollback esta claro
- [ ] backup recente do banco existe

## Checklist de deploy manual

1. acessar a VPS por SSH
2. criar backup do banco antes da atualizacao
3. atualizar o codigo da `main`
4. revisar `.env` de producao
5. executar build e migrations
6. reiniciar os servicos
7. validar frontend, API, login e relatorios

## Ordem recomendada na VPS

Quando formos montar esse ambiente, a sequencia ideal sera:

1. sistema base e firewall
2. Docker e Docker Compose
3. banco
4. backend
5. frontend
6. proxy reverso e HTTPS
7. monitoramento e backup

## O que precisa de sua intervencao no dia do deploy

Voce deve agir quando envolver:

- aprovacao final para publicar
- acesso a credenciais e segredos
- mudanca de DNS
- validacao visual e funcional de negocio
- decisao de rollback

## O que normalmente eu posso tocar

Eu posso tocar quase toda a parte tecnica:

- ajustar arquivos do servidor
- gerar scripts de deploy
- montar compose de producao
- revisar envs necessarias
- criar passos de backup e rollback
- preparar automacao por GitHub Actions

## Quando automatizar

Vale automatizar quando:

- o fluxo manual ja estiver claro
- a VPS ja estiver estavel
- o projeto estiver perto de deploy recorrente

O caminho natural sera:

1. CI no GitHub
2. deploy manual bem documentado
3. depois, deploy automatizado via GitHub Actions + SSH
