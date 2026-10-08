# Contribuir

Sugestões de issues e pull requests são bem-vindas. Antes de propor uma mudança, descreva o problema da pessoa usuária e o comportamento esperado. Mantenha o escopo focado e inclua testes ou passos de reprodução adequados.

Para questões de segurança, siga as instruções privadas da [política de segurança](https://github.com/rexia-intel-automation/scribe/blob/main/SECURITY.md), em vez de publicar detalhes de exploração.

Não inclua credenciais, transcrições privadas, arquivos do perfil do app ou capturas sem revisão em issues, pull requests ou fixtures de teste. Mudanças no site devem compilar localmente com `npm ci` e `npm run build` dentro de `docs-site/`.

O Scribe é um projeto independente de código aberto da RexIA, sem afiliação com a Anthropic. Claude e Claude Code são marcas da Anthropic.

O site fixa VitePress estável 1.6.4 e sobrescreve sua dependência Vite para 6.4.4 para corrigir as vulnerabilidades encontradas na árvore do Vite 5. Preserve o lockfile, execute `npm audit --audit-level=low` e compile todas as páginas ao mudar essas versões. O override foi conferido no build estático bilíngue completo; reavalie-o ao atualizar o VitePress.
