# Regras de trabalho deste projeto

A especificação completa do app está em `PROJETO_APP_EMA.md`. Este arquivo define **como** trabalhar.

## Ritmo
- Faça **apenas a fase que eu pedir**. Ao terminar, pare e espere minha ordem.
- **Nunca** comece a fase seguinte sem eu pedir explicitamente.
- Antes de escrever código em uma fase, mostre um **plano curto (até 10 itens)** e espere meu OK.
- Se algo estiver ambíguo, contraditório ou incorreto, **pergunte antes** (em poucas linhas).

## Modelo por fase
| Fase | Conteúdo | Modelo |
|---|---|---|
| 0 | Estrutura do projeto | Sonnet 5.5 |
| 1 | Cadastro, programação e Home | **Opus 5.5** |
| 2 | Tela do estudo | Sonnet 5.5 |
| 3 | Moedinhas, prêmios e calendário | Sonnet 5.5 |
| 4 | Worker e notificações | **Opus 5.5** |
| 5 | Gemini | **Opus 5.5** |
| 6 | Backup e acabamento | Sonnet 5.5 |

No início de cada fase, diga qual modelo a tabela pede. Se você não estiver rodando nesse modelo, avise e **pare** para eu trocar com `/model` antes de continuar.

## Economia de tokens
- Leia de `PROJETO_APP_EMA.md` **só as seções** que a fase atual precisa.
- Os arquivos em `design/` são grandes: abra **só o trecho da tela** em que estiver trabalhando.
- Não releia arquivos que você acabou de criar ou editar.
- Não instale, refatore ou altere nada fora do que a fase pede.
- Respostas curtas. No fim de cada fase, diga em **até 10 linhas** o que fez, como testar e o que ficou pendente.

## Qualidade
- Rode os testes da fase antes de dizer que terminou.
- Nunca coloque segredos (chaves, código de acesso) no código ou no Git.
- Faça commit ao fim de cada fase com uma mensagem clara (`Fase X: ...`).
