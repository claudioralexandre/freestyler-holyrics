# Contrato: a seção `coresPorTag`

**Feature**: 003-override-cor-por-tag

Estende o contrato de configuração da 001 e da 002. **Mesmo arquivo, nenhuma
variável de ambiente nova, nenhuma flag de linha de comando** (FR-001).

## Forma

```json
{
  "coresPorTag": [
    { "tag": "azul-escuro", "cor": { "r": 0,   "g": 20, "b": 120 } },
    { "tag": "azul",        "cor": { "r": 0,   "g": 40, "b": 200 } },
    { "tag": "natal",       "cor": { "r": 200, "g": 0,  "b": 0   } }
  ]
}
```

Seção de topo, irmã de `holyrics`, `leitura`, `cor`, `reconexao`, `freestyler` e
`log`.

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| `coresPorTag` | array | **não** | Ausente ou vazio desliga a feature (FR-002) |
| `[].tag` | string | sim | Não vazia após aparar as pontas |
| `[].cor` | objeto | sim | `r`, `g`, `b` inteiros 0–255. Preto é válido (FR-003) |

## É array, e isso não é estilo

Um objeto com a tag na chave — `{ "azul": { ... } }` — seria mais confortável de
ler e **está proibido aqui**, porque não preserva a ordem declarada:

```
declarado : azul, 2024, vermelho, 01, 10
Object.keys: 10, 2024, azul, vermelho, 01
```

Chaves que são índices canônicos saltam à frente **e se reordenam entre si**.
Como a ordem declarada É a regra de precedência (FR-007), um objeto quebraria
FR-007a sem que nada falhasse: a precedência simplesmente deixaria de ser a que o
operador escreveu. A medição está em
[research.md §1](../research.md#1-que-formato-preserva-a-ordem-declarada-inclusive-para-tags-só-de-dígitos).

## Precedência

**Vence a primeira entrada que casar, de cima para baixo.** A ordem das tags
dentro do tema não influencia (FR-007).

É por isso que o exemplo declara `azul-escuro` antes de `azul`: o operador
controla a especificidade movendo linhas, num lugar só.

## Regra de comparação (FR-006, FR-006a)

| Aspecto | Comportamento |
|---|---|
| Caixa | Ignorada. `Azul` casa com `azul` |
| Espaço nas pontas | Ignorado. `" azul "` casa com `azul` |
| Acento | **Conta**. `ceu` não casa com `céu` |
| Forma Unicode do acento | Ignorada (FR-006a). As duas grafias de `café` casam entre si |
| Espaço interno | Conta. `azul escuro` não casa com `azulescuro` |

Mesma regra que a 002 usa para nome de grupo, pelo mesmo motivo: a tag é digitada
à mão em dois lugares diferentes, e tolerar caixa e espaço mata os dois enganos
mais comuns sem começar a aproximar nomes que são distintos de propósito.

**A linha da forma Unicode é adição desta feature**, e não conflita com a de cima.
`café` com o e-agudo num único code point e `café` com `e` mais acento combinante
são o mesmo texto na tela, bytes diferentes na memória, e `toLowerCase` não os
aproxima — medido em
[research.md §5](../research.md#5-duas-grafias-do-mesmo-acento-são-a-mesma-tag).
Normalizar para NFC antes de comparar é o que torna "acento conta" uma promessa
cumprível em vez de uma armadilha, já que os dois lados são digitados em programas
diferentes.

## Validações que recusam a subida

| Situação | Mensagem deve |
|---|---|
| Duas tags que casam entre si sob a regra acima | Nomear **as duas** (FR-004) |
| Duas tags idênticas na tela, distintas em forma Unicode | Nomear as duas **e dizer que o conflito é de codificação** — senão o operador vê duas linhas iguais sem entender a acusação |
| `tag` vazia ou só espaços | Apontar o índice da entrada |
| Componente de cor fora de 0–255, ou não inteiro | Apontar o caminho do campo |

A recusa por tags conflitantes existe porque a alternativa é pior que um erro: uma
delas venceria sempre, a outra nunca, e o log mostraria cor estável e correta sem
nada indicando que metade da configuração é letra morta.

Nenhuma dessas mensagens ecoa valor recebido, pela mesma razão da 001 — uma
credencial colada por engano no arquivo não pode vazar para o log (SC-007 de lá).

## O que deliberadamente NÃO está aqui

| Ausente | Por quê |
|---|---|
| Cor por nome ou id de tema | Tag é o único dos três que agrupa. Nome ainda quebraria ao ser editado |
| Prioridade numérica por entrada | A ordem do array já é a precedência. Um segundo eixo criaria o estado inválido "duas com a mesma prioridade" |
| Faixa, gradiente, condição por horário | Cor sólida é o escopo do projeto. O segundo caso real não apareceu (Princípio V) |
| Recarga sem reiniciar | Fora de escopo declarado. A configuração é lida uma vez na subida, como as outras |
| Ligar/desligar por flag | Lista vazia ou ausente já diz isso. Duas formas de desligar foi o erro que a 002 corrigiu no FR-008a dela |

## Efeito da ausência

Sem a seção, **nenhum caminho novo é exercitado**: a resolução devolve a cor
extraída e a origem `extraida`, que é o que o código fazia antes de existir. É o
que SC-003 verifica, e é a razão de o caso `sem_mapeamento` existir separado no
[modelo](../data-model.md#casamento).
