import { describe, expect, it } from 'vitest';
import {
  DISPONIBILIDADE_INICIAL,
  avaliarDisponibilidade,
} from '../../src/service/availability.ts';
import type { LeituraDoCiclo, MotivoDeFalha } from '../../src/core/state.ts';

function leitura(
  motivos: {
    cor?: MotivoDeFalha;
    item?: MotivoDeFalha;
    tema?: MotivoDeFalha;
  } = {},
  momento = 1000,
): LeituraDoCiclo {
  const parte = <T>(motivo: MotivoDeFalha | undefined, valor: T) =>
    motivo === undefined
      ? ({ ok: true, valor } as const)
      : ({ ok: false, motivo } as const);

  return {
    momento,
    cor: parte(motivos.cor, { regioes: [{ r: 0, g: 0, b: 255 }] }),
    item: parte(motivos.item, null),
    tema: parte(motivos.tema, null),
  };
}

const TODAS_INDISPONÍVEIS = {
  cor: 'indisponivel' as const,
  item: 'indisponivel' as const,
  tema: 'indisponivel' as const,
};

describe('disponibilidade só é perdida quando tudo falha (FR-004c)', () => {
  it('reconhece o Holyrics como disponível na primeira leitura bem-sucedida', () => {
    const d = avaliarDisponibilidade(DISPONIBILIDADE_INICIAL, leitura());

    expect(d.disponível).toBe(true);
    expect(d.eventos.map((e) => e.tipo)).toEqual(['holyrics_recuperado']);
  });

  it('dá o Holyrics como perdido quando as três consultas falham por conexão', () => {
    const conectado = avaliarDisponibilidade(DISPONIBILIDADE_INICIAL, leitura());

    const d = avaliarDisponibilidade(conectado, leitura(TODAS_INDISPONÍVEIS, 2000));

    expect(d.disponível).toBe(false);
    expect(d.eventos.map((e) => e.tipo)).toEqual(['holyrics_perdido']);
  });

  it('NÃO dá como perdido quando só uma consulta falha', () => {
    const conectado = avaliarDisponibilidade(DISPONIBILIDADE_INICIAL, leitura());

    const d = avaliarDisponibilidade(
      conectado,
      leitura({ tema: 'indisponivel' }, 2000),
    );

    expect(d.disponível).toBe(true);
    expect(d.eventos).toHaveLength(0);
  });

  it('NÃO dá como perdido quando duas das três falham', () => {
    const conectado = avaliarDisponibilidade(DISPONIBILIDADE_INICIAL, leitura());

    const d = avaliarDisponibilidade(
      conectado,
      leitura({ item: 'indisponivel', tema: 'indisponivel' }, 2000),
    );

    expect(d.disponível).toBe(true);
  });

  it('NÃO dá como perdido quando todas falham por resposta inválida', () => {
    // O Holyrics respondeu — só respondeu algo que não entendemos. Isso é falha
    // parcial de conteúdo, não queda de conexão.
    const conectado = avaliarDisponibilidade(DISPONIBILIDADE_INICIAL, leitura());

    const d = avaliarDisponibilidade(
      conectado,
      leitura(
        {
          cor: 'resposta_invalida',
          item: 'resposta_invalida',
          tema: 'resposta_invalida',
        },
        2000,
      ),
    );

    expect(d.disponível).toBe(true);
  });
});

describe('transições são registradas uma vez só (FR-016)', () => {
  it('não repete holyrics_perdido enquanto o estado não muda', () => {
    let estado = avaliarDisponibilidade(DISPONIBILIDADE_INICIAL, leitura());
    estado = avaliarDisponibilidade(estado, leitura(TODAS_INDISPONÍVEIS, 2000));
    expect(estado.eventos.map((e) => e.tipo)).toEqual(['holyrics_perdido']);

    for (const momento of [3000, 4000, 5000]) {
      estado = avaliarDisponibilidade(estado, leitura(TODAS_INDISPONÍVEIS, momento));
      expect(estado.eventos).toHaveLength(0);
    }
  });

  it('emite holyrics_recuperado ao voltar, uma vez só', () => {
    let estado = avaliarDisponibilidade(DISPONIBILIDADE_INICIAL, leitura());
    estado = avaliarDisponibilidade(estado, leitura(TODAS_INDISPONÍVEIS, 2000));

    estado = avaliarDisponibilidade(estado, leitura({}, 3000));
    expect(estado.eventos.map((e) => e.tipo)).toEqual(['holyrics_recuperado']);

    estado = avaliarDisponibilidade(estado, leitura({}, 4000));
    expect(estado.eventos).toHaveLength(0);
  });

  it('registra o estado encontrado no arranque, mesmo sem nunca ter respondido', () => {
    // Subir com o Holyrics fechado é o caso mais comum. Se o primeiro ciclo não
    // registrasse nada, o operador ficaria só com um aviso genérico de consulta
    // falha — sem nada que diga o que fazer.
    const d = avaliarDisponibilidade(
      DISPONIBILIDADE_INICIAL,
      leitura(TODAS_INDISPONÍVEIS),
    );

    expect(d.disponível).toBe(false);
    expect(d.eventos.map((e) => e.tipo)).toEqual(['holyrics_perdido']);
  });

  it('não repete o registro do arranque nos ciclos seguintes', () => {
    let estado = avaliarDisponibilidade(
      DISPONIBILIDADE_INICIAL,
      leitura(TODAS_INDISPONÍVEIS),
    );
    expect(estado.eventos).toHaveLength(1);

    estado = avaliarDisponibilidade(estado, leitura(TODAS_INDISPONÍVEIS, 2000));
    expect(estado.eventos).toHaveLength(0);
  });

  it('token errado no arranque produz a causa acionável, não um erro genérico', () => {
    const d = avaliarDisponibilidade(
      DISPONIBILIDADE_INICIAL,
      leitura({
        cor: 'credencial_recusada',
        item: 'credencial_recusada',
        tema: 'credencial_recusada',
      }),
    );

    const evento = d.eventos[0];
    if (evento?.tipo !== 'holyrics_perdido') throw new Error('faltou o evento');
    expect(evento.causa).toBe('credencial_recusada');
  });
});

describe('causa da perda (FR-017)', () => {
  it('distingue credencial recusada de indisponibilidade', () => {
    const conectado = avaliarDisponibilidade(DISPONIBILIDADE_INICIAL, leitura());

    const d = avaliarDisponibilidade(
      conectado,
      leitura(
        {
          cor: 'credencial_recusada',
          item: 'credencial_recusada',
          tema: 'credencial_recusada',
        },
        2000,
      ),
    );

    const evento = d.eventos[0];
    if (evento?.tipo !== 'holyrics_perdido') throw new Error('faltou o evento');
    expect(evento.causa).toBe('credencial_recusada');
  });

  it('credencial recusada prevalece quando há mistura de motivos', () => {
    // Se o token foi recusado em qualquer consulta, é isso que o operador
    // precisa ler no log — não "indisponível", que mandaria olhar o lugar errado.
    const conectado = avaliarDisponibilidade(DISPONIBILIDADE_INICIAL, leitura());

    const d = avaliarDisponibilidade(
      conectado,
      leitura(
        {
          cor: 'indisponivel',
          item: 'credencial_recusada',
          tema: 'indisponivel',
        },
        2000,
      ),
    );

    const evento = d.eventos[0];
    if (evento?.tipo !== 'holyrics_perdido') throw new Error('faltou o evento');
    expect(evento.causa).toBe('credencial_recusada');
  });
});

describe('contagem de falhas consecutivas', () => {
  it('cresce a cada ciclo totalmente falho e zera no sucesso (FR-015b)', () => {
    let estado = avaliarDisponibilidade(DISPONIBILIDADE_INICIAL, leitura());
    expect(estado.falhasConsecutivas).toBe(0);

    estado = avaliarDisponibilidade(estado, leitura(TODAS_INDISPONÍVEIS, 2000));
    expect(estado.falhasConsecutivas).toBe(1);

    estado = avaliarDisponibilidade(estado, leitura(TODAS_INDISPONÍVEIS, 3000));
    expect(estado.falhasConsecutivas).toBe(2);

    estado = avaliarDisponibilidade(estado, leitura({}, 4000));
    expect(estado.falhasConsecutivas).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Feature 004 (emenda) — a causa sai do evento e entra no estado
//
// O evento `holyrics_perdido` já carregava a causa, mas evento é instantâneo: a
// página precisa dela a todo momento. Sem isso, "não alcanço a máquina" e "o
// token foi recusado" viram a mesma frase na tela — e elas pedem ações opostas.
// ---------------------------------------------------------------------------

const TODAS_RECUSADAS = {
  cor: 'credencial_recusada' as const,
  item: 'credencial_recusada' as const,
  tema: 'credencial_recusada' as const,
};

describe('a causa da indisponibilidade fica no estado (004/FR-005)', () => {
  it('é null enquanto o Holyrics responde', () => {
    const d = avaliarDisponibilidade(DISPONIBILIDADE_INICIAL, leitura());

    expect(d.disponível).toBe(true);
    expect(d.causa).toBeNull();
  });

  it('é indisponivel quando ninguém atende', () => {
    const d = avaliarDisponibilidade(DISPONIBILIDADE_INICIAL, leitura(TODAS_INDISPONÍVEIS));

    expect(d.disponível).toBe(false);
    expect(d.causa).toBe('indisponivel');
  });

  it('é credencial_recusada quando o token é rejeitado', () => {
    const d = avaliarDisponibilidade(DISPONIBILIDADE_INICIAL, leitura(TODAS_RECUSADAS));

    expect(d.disponível).toBe(false);
    expect(d.causa).toBe('credencial_recusada');
  });

  it('credencial recusada prevalece sobre indisponibilidade', () => {
    // Mesma regra que já valia para o log (001/FR-017): "indisponível" mandaria
    // conferir se o Holyrics está aberto, quando o problema é o token.
    const d = avaliarDisponibilidade(
      DISPONIBILIDADE_INICIAL,
      leitura({ cor: 'indisponivel', item: 'credencial_recusada', tema: 'indisponivel' }),
    );

    expect(d.causa).toBe('credencial_recusada');
  });

  it('a causa volta a null quando o Holyrics se recupera', () => {
    let estado = avaliarDisponibilidade(DISPONIBILIDADE_INICIAL, leitura(TODAS_RECUSADAS));
    expect(estado.causa).toBe('credencial_recusada');

    estado = avaliarDisponibilidade(estado, leitura({}, 2000));

    expect(estado.causa).toBeNull();
  });

  it('a causa acompanha a mudança de motivo sem exigir recuperação no meio', () => {
    // Foi exatamente o que aconteceu em 31/07: o Holyrics subiu enquanto o
    // integrador rodava, e as falhas passaram de `indisponivel` para
    // `credencial_recusada` sem nenhum ciclo bem-sucedido entre as duas.
    let estado = avaliarDisponibilidade(DISPONIBILIDADE_INICIAL, leitura(TODAS_INDISPONÍVEIS));
    expect(estado.causa).toBe('indisponivel');

    estado = avaliarDisponibilidade(estado, leitura(TODAS_RECUSADAS, 2000));

    expect(estado.causa).toBe('credencial_recusada');
  });
});
