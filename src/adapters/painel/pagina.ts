/**
 * A página do painel: HTML, CSS e JavaScript numa string só.
 *
 * **Por que string e não arquivo.** O projeto roda de duas formas —
 * `node --experimental-strip-types src/main.ts` no desenvolvimento e
 * `dist/main.js` depois do `tsc`. O `tsc` **não copia** arquivos que não sejam
 * TypeScript, então um `painel.html` ao lado do fonte funcionaria no `dev` e
 * sumiria no `start:built`. Corrigir isso pediria uma etapa de cópia no build,
 * para uma tela só (Princípio V). Como string, não há caminho a resolver em
 * tempo de execução — que é a classe de bug que só aparece na máquina do outro.
 *
 * Custo aceito: perde-se destaque de sintaxe do HTML aqui dentro. É incômodo de
 * edição, não de operação.
 *
 * ⚠️ **Nenhuma crase pode existir daqui para baixo**, nem dentro de comentário.
 * Ela encerra este template literal, e o erro que aparece é de sintaxe do
 * TypeScript numa linha que parece JavaScript comum — sintoma bem longe da
 * causa. Por isso o código abaixo também não usa template literals: escapá-los
 * seria uma segunda chance de errar a mesma coisa.
 */

export const PÁGINA = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Integrador — painel</title>
<style>
  :root {
    --fundo: #14161a; --painel: #1c1f26; --borda: #2c313b;
    --texto: #e6e8ec; --fraco: #9aa3b2; --acento: #5b9dff;
    --ok: #4ec27a; --alerta: #e0a33e; --erro: #e35b5b;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --fundo: #f4f5f7; --painel: #fff; --borda: #d9dde4;
      --texto: #1a1d23; --fraco: #5c6675; --acento: #2563eb;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 1rem; background: var(--fundo); color: var(--texto);
    font: 15px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }
  h1 { font-size: 1.15rem; margin: 0 0 .25rem; }
  h2 { font-size: .95rem; margin: 0 0 .75rem; color: var(--fraco);
       text-transform: uppercase; letter-spacing: .06em; }
  main { max-width: 900px; margin: 0 auto; display: grid; gap: 1rem; }
  section { background: var(--painel); border: 1px solid var(--borda);
            border-radius: 10px; padding: 1rem; }
  .linha { display: flex; flex-wrap: wrap; gap: .5rem 1rem; align-items: center; }
  .pilula { display: inline-flex; align-items: center; gap: .4rem;
            border: 1px solid var(--borda); border-radius: 99px;
            padding: .2rem .7rem; font-size: .85rem; }
  .ponto { width: .6rem; height: .6rem; border-radius: 50%; background: var(--fraco); }
  .ponto.on { background: var(--ok); } .ponto.off { background: var(--erro); }
  .ponto.na { background: var(--fraco); }
  .cores { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-top: .75rem; }
  .amostra { display: flex; align-items: center; gap: .6rem; }
  .quadro { width: 2.5rem; height: 2.5rem; border-radius: 8px;
            border: 1px solid var(--borda); }
  .rotulo { font-size: .8rem; color: var(--fraco); }
  .tag { cursor: pointer; background: none; color: inherit; font: inherit; }
  .tag:hover { border-color: var(--acento); color: var(--acento); }
  .vazio { color: var(--fraco); font-style: italic; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: .35rem .4rem; text-align: left; vertical-align: middle; }
  th { font-size: .75rem; color: var(--fraco); font-weight: 600; }
  input[type=text], input[type=number], select {
    background: var(--fundo); color: var(--texto); border: 1px solid var(--borda);
    border-radius: 6px; padding: .35rem .5rem; font: inherit; width: 100%;
  }
  input[type=color] { width: 2.5rem; height: 2rem; padding: 0; border: 1px solid var(--borda);
                      border-radius: 6px; background: none; }
  input.ruim { border-color: var(--erro); }
  button { background: var(--painel); color: var(--texto); border: 1px solid var(--borda);
           border-radius: 6px; padding: .35rem .7rem; font: inherit; cursor: pointer; }
  button:hover { border-color: var(--acento); }
  button.primario { background: var(--acento); border-color: var(--acento); color: #fff; }
  .campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
            gap: .75rem 1rem; }
  .campo { display: grid; gap: .2rem; }
  .campo label { font-size: .8rem; color: var(--fraco); }
  .nota { font-size: .75rem; color: var(--alerta); }
  .aviso { border-left: 3px solid var(--alerta); padding: .5rem .75rem;
           background: rgba(224,163,62,.1); border-radius: 0 6px 6px 0; margin-bottom: .75rem; }
  .aviso.erro { border-color: var(--erro); background: rgba(227,91,91,.1); }
  .aviso.ok { border-color: var(--ok); background: rgba(78,194,122,.1); }
  .barra { position: sticky; bottom: 0; display: flex; gap: .75rem; align-items: center;
           background: var(--painel); border: 1px solid var(--borda);
           border-radius: 10px; padding: .75rem 1rem; }
  dialog { background: var(--painel); color: var(--texto); border: 1px solid var(--borda);
           border-radius: 10px; padding: 1.25rem; max-width: 30rem; }
  dialog::backdrop { background: rgba(0,0,0,.55); }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em; }
  /* Os três botões de ação precisam caber numa linha só. Quebrando, o ✕ cai
     para a linha de baixo e o alvo do clique fica ambíguo — medido. */
  td.acoes { white-space: nowrap; }
  summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: .6rem; }
  summary::-webkit-details-marker { display: none; }
  summary::before { content: '▸'; color: var(--fraco); transition: transform .15s; }
  details[open] > summary::before { transform: rotate(90deg); }
  summary h2 { margin: 0; }
  /* O card fechado precisa avisar quando há edição pendente lá dentro, senão o
     operador salva sem lembrar do que mudou fora da vista. */
  #card-config:not([open]) #resumo-config.sujo { color: var(--alerta); }
</style>
</head>
<body>
<main>
  <div>
    <h1>Integrador — painel</h1>
    <div class="rotulo" id="conexao">conectando…</div>
  </div>

  <section>
    <h2>Agora</h2>
    <div class="linha">
      <span class="pilula"><span class="ponto" id="p-holyrics"></span><span id="t-holyrics">Holyrics</span></span>
      <span class="pilula"><span class="ponto" id="p-freestyler"></span><span id="t-freestyler">Freestyler</span></span>
      <span class="pilula" id="p-grupo" hidden></span>
    </div>
    <div id="dica-holyrics" class="nota" style="margin-top:.5rem" hidden></div>
    <div id="grupos-conhecidos" class="nota" style="margin-top:.5rem" hidden></div>

    <div style="margin-top:.9rem">
      <div class="rotulo">Em exibição</div>
      <div id="item">—</div>
    </div>
    <div style="margin-top:.6rem">
      <div class="rotulo">Tema</div>
      <div id="tema">—</div>
    </div>
    <div style="margin-top:.6rem">
      <div class="rotulo">Tags do tema <span class="rotulo">(clique para mapear)</span></div>
      <div class="linha" id="tags" style="margin-top:.3rem"></div>
    </div>

    <div class="cores">
      <div class="amostra">
        <div class="quadro" id="q-extraida"></div>
        <div><div class="rotulo">Cor extraída</div><div class="mono" id="v-extraida">—</div></div>
      </div>
      <div class="amostra">
        <div class="quadro" id="q-efetiva"></div>
        <div><div class="rotulo">Cor efetiva</div><div class="mono" id="v-efetiva">—</div>
             <div class="nota" id="origem"></div></div>
      </div>
    </div>
  </section>

  <section>
    <h2>Cores por tag</h2>
    <table><thead><tr><th style="width:2rem"></th><th>Tag</th><th style="width:5rem">Cor</th><th style="width:9rem"></th></tr></thead>
      <tbody id="mapeamentos"></tbody></table>
    <div style="margin-top:.6rem"><button id="add-mapeamento">+ mapeamento</button></div>
    <div class="nota" style="margin-top:.4rem">A ordem decide o desempate: vence a primeira de cima para baixo.</div>
  </section>

  <section>
    <details id="card-config">
      <summary><h2 style="display:inline">Configuração</h2><span class="rotulo" id="resumo-config"></span></summary>
      <div id="config-campos" style="margin-top:1rem"></div>
    </details>
  </section>

  <div class="barra">
    <button class="primario" id="salvar">Salvar</button>
    <button id="recarregar">Descartar e recarregar do disco</button>
    <span id="situacao" class="rotulo"></span>
  </div>
  <div id="mensagem"></div>
</main>

<dialog id="dlg-conflito">
  <h3 style="margin-top:0">O arquivo mudou por fora</h3>
  <p>Alguém editou <span class="mono" id="dlg-caminho"></span> depois que esta página o carregou.
     Não vou sobrescrever sem você decidir.</p>
  <div class="linha" style="justify-content:flex-end">
    <button id="dlg-descartar">Descartar minhas edições e recarregar</button>
    <button class="primario" id="dlg-sobrescrever">Sobrescrever assim mesmo</button>
  </div>
</dialog>

<dialog id="dlg-endereco">
  <h3 style="margin-top:0">Esta aba vai perder a conexão</h3>
  <p>Você mudou o endereço da própria página. Ao salvar, ela passa a responder em
     <span class="mono" id="dlg-novo-endereco"></span> e esta aba cai.</p>
  <p class="nota">Se o endereço novo não puder ser aberto, a alteração é recusada e a página
     continua onde está.</p>
  <div class="linha" style="justify-content:flex-end">
    <button id="dlg-end-cancelar">Cancelar</button>
    <button class="primario" id="dlg-end-ok">Salvar e ir para o endereço novo</button>
  </div>
</dialog>

<script>
'use strict';

var estado = null;       // último retrato recebido por SSE
var config = null;       // cópia editável da configuração em execução
var hashBase = null;     // hash que esta página carregou (FR-026)
var sobreposicoes = [];  // caminhos sobrepostos por variável de ambiente (FR-016a)
var caminhoArquivo = '';
var tagsJaExercitadas = Object.create(null);
var ultimaAssinaturaDeTags = null; // evita redesenhar a cada retrato — ver desenharTags
var gruposDaMesa = [];            // grupos que o Freestyler reportou (002/FR-009)
var freestylerConfigurado = null; // null = sem bloco "freestyler" na config

/**
 * Marca que há edição dentro do card fechado.
 *
 * Sem isto, o card colapsado esconderia alteração pendente e o operador salvaria
 * sem lembrar do que mudou fora da vista.
 */
function marcarSujo() {
  var r = $('resumo-config');
  r.className = 'rotulo sujo';
  r.textContent = '· alterações não salvas';
}
function limparSujo() {
  var r = $('resumo-config');
  r.className = 'rotulo';
  r.textContent = '';
}

var $ = function (id) { return document.getElementById(id); };

function hex(c) {
  if (!c) return null;
  var p = function (n) { return ('0' + n.toString(16)).slice(-2); };
  return '#' + p(c.r) + p(c.g) + p(c.b);
}
function deHex(h) {
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
}
function texto(c) { return c ? c.r + ', ' + c.g + ', ' + c.b : '—'; }

// --- Estado ao vivo (FR-005, FR-007) --------------------------------------

function conectar() {
  var fonte = new EventSource('/api/eventos');
  fonte.addEventListener('estado', function (ev) {
    $('conexao').textContent = 'ao vivo';
    aplicarEstado(JSON.parse(ev.data));
  });
  fonte.onerror = function () {
    // O EventSource reconecta sozinho. É o que faz a troca de endereço da
    // FR-018a se comportar de forma previsível em vez de congelar a tela.
    $('conexao').textContent = 'sem conexão com o serviço — tentando de novo';
  };
}

function aplicarEstado(payload) {
  estado = payload.estado;
  sobreposicoes = payload.sobreposiçõesDeAmbiente || [];
  caminhoArquivo = payload.caminho || '';
  $('dlg-caminho').textContent = caminhoArquivo;

  // Só adota a configuração do servidor enquanto o operador não editou nada:
  // sobrescrever o formulário no meio da digitação seria hostil.
  if (config === null) {
    config = JSON.parse(JSON.stringify(payload.config));
    hashBase = payload.hash;
    desenharConfig();
    desenharMapeamentos();
  }

  desenharAgora(payload);
}

function desenharAgora(payload) {
  var e = payload.estado;

  // ⚠️ "Não alcanço a máquina" e "o token foi recusado" pedem ações OPOSTAS do
  // operador. Um booleano só faria a página dizer "fora do ar" com o Holyrics no
  // ar — foi o que aconteceu em 31/07, e é o mesmo defeito que a verificação da
  // 001 achou no próprio Holyrics: dois erros sob o mesmo 401.
  ponto('p-holyrics', e.holyricsDisponível === true ? 'on' : 'off');
  $('t-holyrics').textContent = e.holyricsDisponível
    ? 'Holyrics'
    : e.causaDoHolyrics === 'credencial_recusada'
      ? 'Holyrics recusou o token'
      : 'Holyrics fora do ar';

  var dica = $('dica-holyrics');
  if (e.holyricsDisponível) {
    dica.hidden = true;
  } else if (e.causaDoHolyrics === 'credencial_recusada') {
    dica.hidden = false;
    dica.textContent =
      'O Holyrics está no ar e respondeu, mas rejeitou a credencial. ' +
      'Confira HOLYRICS_TOKEN no .env contra Arquivo > Configurações > API Server. ' +
      'O token não se edita por aqui, de propósito: esta página não tem senha.';
  } else if (e.causaDoHolyrics === 'indisponivel') {
    dica.hidden = false;
    dica.textContent = 'Ninguém atendeu no endereço configurado. O Holyrics está aberto?';
  } else {
    // Sem causa: o serviço ainda não completou a primeira leitura. Acusar aqui
    // seria acusar sem evidência.
    dica.hidden = false;
    dica.textContent = 'Ainda não houve leitura.';
  }

  // ⚠️ null NÃO é "indisponível": é "não há saída DMX configurada". As duas
  // pedem ações opostas do operador.
  if (e.freestylerDisponível === null) {
    ponto('p-freestyler', 'na');
    $('t-freestyler').textContent = 'sem saída DMX configurada';
  } else {
    ponto('p-freestyler', e.freestylerDisponível ? 'on' : 'off');
    $('t-freestyler').textContent = e.freestylerDisponível ? 'Freestyler' : 'Freestyler fora do ar';
  }

  var pg = $('p-grupo');
  var gc = $('grupos-conhecidos');
  if (e.freestylerDisponível === null) {
    pg.hidden = true; gc.hidden = true;
  } else if (e.grupoResolvido) {
    pg.hidden = false;
    pg.innerHTML = '<span class="ponto on"></span>grupo: ' + escapar(e.grupoResolvido.nomeReal);
    gc.hidden = true;
  } else {
    pg.hidden = false;
    pg.innerHTML = '<span class="ponto off"></span>grupo não resolvido';
    // Sem a lista, "não encontrei o grupo" não diz o que digitar no lugar.
    gc.hidden = false;
    gc.textContent = e.gruposConhecidos && e.gruposConhecidos.length
      ? 'Grupos que a mesa reporta: ' + e.gruposConhecidos.join(' · ')
      : 'A mesa ainda não reportou nenhum grupo.';
  }

  $('item').textContent = e.item
    ? e.item.nome + ' (' + e.item.tipo + ')' +
      (e.item.slide !== null ? ' — slide ' + e.item.slide + '/' + (e.item.totalDeSlides || '?') : '')
    : 'nada em exibição';

  $('tema').textContent = e.tema ? e.tema.nome : 'sem tema';

  desenharTags(e.tema);
  atualizarSeletorDeGrupo(e.gruposConhecidos || [], e.freestylerDisponível !== null);

  $('q-extraida').style.background = hex(e.corExtraída) || 'transparent';
  $('v-extraida').textContent = texto(e.corExtraída);
  $('q-efetiva').style.background = hex(e.corDeReferência) || 'transparent';
  $('v-efetiva').textContent = texto(e.corDeReferência);

  // FR-008: distinguir extraída de efetiva, nomeando a tag responsável.
  var o = $('origem');
  if (e.origemDaCor === 'mapeada') {
    o.textContent = 'override ativo pela tag "' + e.tagDaCor + '" — a extraída foi descartada';
    o.style.color = 'var(--alerta)';
  } else if (e.origemDaCor === 'extraida') {
    o.textContent = 'vinda da extração';
    o.style.color = 'var(--fraco)';
  } else {
    o.textContent = '';
  }
}

function ponto(id, classe) { $(id).className = 'ponto ' + classe; }

function desenharTags(tema) {
  // ⚠️ Redesenhar só quando MUDA, e não a cada retrato.
  //
  // O SSE entrega um retrato por ciclo de leitura — 1 por segundo. Redesenhar
  // sempre destruía e recriava os campos de mapeamento, e o operador perdia o
  // foco e o cursor no meio da digitação. Medido: o input sobrevivia menos de um
  // segundo, o que torna impossível digitar o nome de uma tag à mão (FR-014).
  var assinatura = tema && tema.tags ? tema.tags.join('\u0000') : '';
  if (assinatura === ultimaAssinaturaDeTags) return;
  ultimaAssinaturaDeTags = assinatura;

  var alvo = $('tags');
  alvo.innerHTML = '';
  if (!tema) { alvo.innerHTML = '<span class="vazio">sem tema em exibição</span>'; return; }
  if (!tema.tags || tema.tags.length === 0) {
    // Campo vazio sem explicação faria "o tema não tem tag" parecer defeito.
    alvo.innerHTML = '<span class="vazio">este tema não tem tag — não há o que mapear</span>';
    return;
  }
  var viuTagNova = false;
  tema.tags.forEach(function (t) {
    var chave = t.trim().toLowerCase();
    if (!tagsJaExercitadas[chave]) viuTagNova = true;
    tagsJaExercitadas[chave] = true;
    var b = document.createElement('button');
    b.className = 'pilula tag';
    b.textContent = t;
    b.title = 'criar mapeamento para esta tag';
    // FR-006: a tag entra SEM redigitar. Ela é digitada em dois programas e o
    // casamento é sensível a acento — redigitar é o erro mais provável do fluxo.
    b.onclick = function () { mapearTag(t); };
    alvo.appendChild(b);
  });

  // Só quando uma tag NOVA foi observada: é o que atualiza a marca de "não
  // exercitado". Sem a condição, isto reconstruiria a tabela toda a cada ciclo.
  if (viuTagNova) desenharMapeamentos();
}

function mapearTag(tag) {
  if (!config) return;
  if (!config.coresPorTag) config.coresPorTag = [];
  var jaTem = config.coresPorTag.some(function (m) {
    return m.tag.trim().toLowerCase() === tag.trim().toLowerCase();
  });
  if (!jaTem) {
    var base = estado && estado.corExtraída ? estado.corExtraída : { r: 0, g: 0, b: 0 };
    config.coresPorTag.push({ tag: tag, cor: { r: base.r, g: base.g, b: base.b } });
    desenharMapeamentos();
  }
  var linha = document.querySelector('[data-tag="' + cssEscape(tag) + '"]');
  if (linha) linha.scrollIntoView({ block: 'center' });
}

// --- Mapeamentos, sequência ORDENADA (FR-014) ------------------------------

function desenharMapeamentos() {
  var corpo = $('mapeamentos');
  if (!corpo || !config) return;
  corpo.innerHTML = '';
  var lista = config.coresPorTag || [];

  if (lista.length === 0) {
    corpo.innerHTML = '<tr><td colspan="4" class="vazio">nenhum mapeamento — a cor vem só da extração</td></tr>';
    return;
  }

  lista.forEach(function (m, i) {
    var tr = document.createElement('tr');
    tr.setAttribute('data-tag', m.tag);

    var tdOrdem = document.createElement('td');
    tdOrdem.className = 'rotulo';
    tdOrdem.textContent = String(i + 1);

    var tdTag = document.createElement('td');
    var inp = document.createElement('input');
    inp.type = 'text'; inp.value = m.tag;
    inp.oninput = function () { m.tag = inp.value; };
    tdTag.appendChild(inp);
    // Mapeamento preparado antes do culto é uso legítimo; sem a marca, "ainda
    // não bateu" e "está quebrado" têm a mesma aparência.
    if (!tagsJaExercitadas[m.tag.trim().toLowerCase()]) {
      var nota = document.createElement('div');
      nota.className = 'nota';
      nota.textContent = 'não exercitado — nenhum tema em exibição usou esta tag ainda';
      tdTag.appendChild(nota);
    }

    var tdCor = document.createElement('td');
    var cor = document.createElement('input');
    cor.type = 'color'; cor.value = hex(m.cor);
    cor.oninput = function () { m.cor = deHex(cor.value); };
    tdCor.appendChild(cor);

    var tdAcoes = document.createElement('td');
    tdAcoes.className = 'acoes';
    tdAcoes.appendChild(botao('↑', function () { mover(i, -1); }, i === 0));
    tdAcoes.appendChild(botao('↓', function () { mover(i, 1); }, i === lista.length - 1));
    tdAcoes.appendChild(botao('✕', function () {
      lista.splice(i, 1); desenharMapeamentos();
    }, false));

    tr.appendChild(tdOrdem); tr.appendChild(tdTag); tr.appendChild(tdCor); tr.appendChild(tdAcoes);
    corpo.appendChild(tr);
  });
}

function mover(i, d) {
  var l = config.coresPorTag;
  var j = i + d;
  if (j < 0 || j >= l.length) return;
  var t = l[i]; l[i] = l[j]; l[j] = t;
  desenharMapeamentos();
}

function botao(rotulo, aoClicar, desabilitado) {
  var b = document.createElement('button');
  b.textContent = rotulo; b.onclick = aoClicar; b.disabled = !!desabilitado;
  b.style.marginRight = '.25rem';
  return b;
}

// --- Formulário de TODOS os campos (FR-010) --------------------------------

var CAMPOS = [
  ['holyrics.host', 'Holyrics — host', 'text'],
  ['holyrics.port', 'Holyrics — porta', 'number'],
  ['holyrics.requestTimeoutMs', 'Holyrics — tempo limite (ms)', 'number'],
  ['leitura.intervaloMs', 'Leitura — intervalo (ms)', 'number'],
  ['leitura.regiao', 'Leitura — região (0–7)', 'number'],
  ['cor.limiarDeltaE', 'Cor — limiar ΔE', 'number'],
  ['cor.ciclosDeConfirmacao', 'Cor — ciclos de confirmação', 'number'],
  ['reconexao.intervaloInicialMs', 'Reconexão — inicial (ms)', 'number'],
  ['reconexao.intervaloMaximoMs', 'Reconexão — máximo (ms)', 'number'],
  ['freestyler.host', 'Freestyler — host', 'text'],
  ['freestyler.port', 'Freestyler — porta', 'number'],
  ['freestyler.grupo', 'Freestyler — grupo seguidor', 'grupo'],
  ['freestyler.corDeRepouso', 'Freestyler — cor de repouso', 'color'],
  ['freestyler.heartbeatTimeoutMs', 'Freestyler — batimento (ms)', 'number'],
  ['freestyler.consultaTimeoutMs', 'Freestyler — consulta (ms)', 'number'],
  ['log.nivel', 'Log — nível', 'select', ['trace', 'debug', 'info', 'warn', 'error', 'fatal']],
  ['log.arquivo', 'Log — arquivo', 'text'],
  ['log.tamanhoMaximoMb', 'Log — tamanho máximo (MB)', 'number'],
  ['log.arquivosMantidos', 'Log — arquivos mantidos', 'number'],
  ['painel.habilitado', 'Painel — habilitado', 'select', ['true', 'false']],
  ['painel.host', 'Painel — host', 'text'],
  ['painel.port', 'Painel — porta', 'number']
];

function pegar(obj, caminho) {
  return caminho.split('.').reduce(function (o, k) {
    return o === undefined || o === null ? undefined : o[k];
  }, obj);
}
function por(obj, caminho, valor) {
  var partes = caminho.split('.');
  var alvo = obj;
  for (var i = 0; i < partes.length - 1; i++) {
    if (alvo[partes[i]] === undefined || alvo[partes[i]] === null) alvo[partes[i]] = {};
    alvo = alvo[partes[i]];
  }
  alvo[partes[partes.length - 1]] = valor;
}

/**
 * Seletor do grupo de fixtures que seguem a cor.
 *
 * ⚠️ **A lista só existe quando o Freestyler responde.** Ela vem do inventário
 * da mesa (002/FR-009), e é justamente por isso que a 002 recusou duplicar o
 * patch em arquivo: a mesa é a fonte da verdade sobre quais grupos existem.
 *
 * Com a mesa fora do ar, cair para texto livre não é preguiça — é o Princípio
 * IV: travar o campo impediria de configurar o integrador antes de ligar a
 * mesa, que é exatamente quando alguém configura.
 *
 * Se o valor configurado não estiver entre os que a mesa reporta, ele entra na
 * lista marcado como não encontrado, em vez de sumir. Sumir trocaria em silêncio
 * o grupo que o operador escolheu (002/FR-010).
 */
function controleDeGrupo(caminho, valor, campo) {
  var atual = valor === undefined || valor === null ? '' : String(valor);

  if (gruposDaMesa.length === 0) {
    var txt = document.createElement('input');
    txt.type = 'text';
    txt.value = atual;
    txt.oninput = function () { por(config, caminho, txt.value); marcarSujo(); };
    var nota = document.createElement('div');
    nota.className = 'nota';
    nota.textContent = freestylerConfigurado === false
      ? 'sem saída DMX configurada — este campo não tem efeito'
      : 'a mesa não respondeu ainda; quando ela responder, isto vira uma lista';
    campo.appendChild(nota);
    return txt;
  }

  var sel = document.createElement('select');
  var lista = gruposDaMesa.slice();
  var conhecido = lista.indexOf(atual) >= 0;
  if (!conhecido && atual !== '') lista.unshift(atual);

  lista.forEach(function (g) {
    var op = document.createElement('option');
    op.value = g;
    op.textContent = g === atual && !conhecido ? g + '  (não encontrado na mesa)' : g;
    sel.appendChild(op);
  });
  sel.value = atual;
  sel.onchange = function () { por(config, caminho, sel.value); marcarSujo(); };

  if (!conhecido && atual !== '') {
    var aviso = document.createElement('div');
    aviso.className = 'nota';
    aviso.textContent = 'o grupo configurado não existe na mesa — nenhuma fixture recebe a cor';
    campo.appendChild(aviso);
  }
  return sel;
}

/**
 * Redesenha só o campo do grupo quando a mesa passa a reportar outra lista.
 *
 * Redesenhar o formulário inteiro apagaria o que o operador estivesse digitando
 * nos outros campos — e a lista chega assincronamente, no meio da edição.
 */
function atualizarSeletorDeGrupo(novos, temSaída) {
  var mudou = novos.join('|') !== gruposDaMesa.join('|') || temSaída !== freestylerConfigurado;
  if (!mudou) return;
  gruposDaMesa = novos;
  freestylerConfigurado = temSaída;

  var antigo = document.querySelector('[data-caminho="freestyler.grupo"]');
  if (!antigo || !config) return;
  var campo = antigo.parentNode;
  campo.innerHTML = '';
  var lab = document.createElement('label');
  lab.textContent = 'Freestyler — grupo seguidor';
  campo.appendChild(lab);
  var novo = controleDeGrupo('freestyler.grupo', pegar(config, 'freestyler.grupo'), campo);
  novo.setAttribute('data-caminho', 'freestyler.grupo');
  campo.insertBefore(novo, campo.children[1] || null);
}

function desenharConfig() {
  var alvo = $('config-campos');
  alvo.innerHTML = '';
  var grade = document.createElement('div');
  grade.className = 'campos';

  CAMPOS.forEach(function (def) {
    var caminho = def[0], rotulo = def[1], tipo = def[2], opcoes = def[3];
    var valor = pegar(config, caminho);
    if (valor === undefined && caminho.indexOf('freestyler.') === 0) return;

    var campo = document.createElement('div');
    campo.className = 'campo';
    var lab = document.createElement('label');
    lab.textContent = rotulo;
    campo.appendChild(lab);

    var inp;
    if (tipo === 'select') {
      inp = document.createElement('select');
      opcoes.forEach(function (o) {
        var op = document.createElement('option');
        op.value = o; op.textContent = o;
        inp.appendChild(op);
      });
      inp.value = String(valor);
      inp.onchange = function () {
        por(config, caminho, inp.value === 'true' ? true : inp.value === 'false' ? false : inp.value);
        marcarSujo();
      };
    } else if (tipo === 'grupo') {
      inp = controleDeGrupo(caminho, valor, campo);
    } else if (tipo === 'color') {
      inp = document.createElement('input');
      inp.type = 'color'; inp.value = hex(valor) || '#000000';
      inp.oninput = function () { por(config, caminho, deHex(inp.value)); marcarSujo(); };
    } else {
      inp = document.createElement('input');
      inp.type = tipo; inp.value = String(valor);
      inp.oninput = function () {
        por(config, caminho, tipo === 'number' ? Number(inp.value) : inp.value);
        marcarSujo();
      };
    }
    inp.setAttribute('data-caminho', caminho);
    campo.appendChild(inp);

    // FR-016a: o ambiente vence, mas às claras. Sem este aviso, o operador
    // salvaria, a página confirmaria e o log seguiria igual — sem pista nenhuma.
    if (sobreposicoes.indexOf(caminho) >= 0) {
      var n = document.createElement('div');
      n.className = 'nota';
      n.textContent = 'sobreposto por variável de ambiente — o valor salvo só vale quando ela sair';
      campo.appendChild(n);
    }

    grade.appendChild(campo);
  });

  alvo.appendChild(grade);
}

// --- Salvar (FR-012, FR-013, FR-018a, FR-026, FR-026a) ---------------------

function mensagem(classe, html) {
  $('mensagem').innerHTML = '<div class="aviso ' + classe + '">' + html + '</div>';
}

function enderecoDoPainelMudou() {
  if (!estado || !config.painel) return null;
  var atual = pegar(estadoConfigServidor, 'painel') || {};
  if (String(atual.host) === String(config.painel.host) &&
      Number(atual.port) === Number(config.painel.port)) return null;
  return config.painel.host + ':' + config.painel.port;
}

var estadoConfigServidor = {};

function salvar() {
  var novo = enderecoDoPainelMudou();
  if (novo) {
    $('dlg-novo-endereco').textContent = 'http://' + novo;
    $('dlg-endereco').showModal();
    return;
  }
  enviar(false);
}

function enviar(forcar) {
  $('situacao').textContent = 'salvando…';
  limparMarcas();

  fetch('/api/config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ config: config, hashBase: hashBase, forcar: !!forcar })
  }).then(function (r) {
    return r.json().then(function (corpo) { return { status: r.status, corpo: corpo }; });
  }).then(function (r) {
    $('situacao').textContent = '';
    if (r.status === 200) {
      hashBase = r.corpo.hash;
      estadoConfigServidor = JSON.parse(JSON.stringify(config));
      limparSujo();
      var campos = (r.corpo.camposAlterados || []);
      mensagem('ok', campos.length
        ? 'Salvo. Passou a valer agora: <span class="mono">' + escapar(campos.join(', ')) + '</span>'
        : 'Salvo. Nada mudou, então nenhum efeito foi aplicado.');
      return;
    }
    if (r.status === 409) {
      // Duas saídas, e nenhuma funde: fundir comporia uma configuração que
      // ninguém escreveu (FR-026a).
      $('dlg-conflito').showModal();
      return;
    }
    if (r.status === 422) {
      marcarCampo(r.corpo.detalhe);
      mensagem('erro', 'Recusado, e nada foi alterado: <span class="mono">' +
        escapar(r.corpo.detalhe || 'configuração inválida') + '</span>');
      return;
    }
    mensagem('erro', 'Não foi salvo: <span class="mono">' +
      escapar(r.corpo.detalhe || 'falha de gravação') +
      '</span>. A configuração em execução continua sendo a anterior.');
  }).catch(function (e) {
    $('situacao').textContent = '';
    mensagem('erro', 'Não foi possível falar com o serviço: ' + escapar(String(e)));
  });
}

function limparMarcas() {
  var todos = document.querySelectorAll('[data-caminho]');
  for (var i = 0; i < todos.length; i++) todos[i].classList.remove('ruim');
}

function marcarCampo(detalhe) {
  if (!detalhe) return;
  // A mensagem vem como "caminho.do.campo: problema" e nunca ecoa o valor
  // recebido (FR-016).
  var caminho = String(detalhe).split(':')[0].trim();
  var alvo = document.querySelector('[data-caminho="' + cssEscape(caminho) + '"]');
  if (alvo) { alvo.classList.add('ruim'); alvo.focus(); }
}

function recarregarDoDisco() {
  fetch('/api/config').then(function (r) { return r.json(); }).then(function (c) {
    config = JSON.parse(JSON.stringify(c.config));
    hashBase = c.hash;
    estadoConfigServidor = JSON.parse(JSON.stringify(c.config));
    sobreposicoes = c.sobreposiçõesDeAmbiente || [];
    desenharConfig(); desenharMapeamentos();
    limparSujo();
    mensagem('ok', 'Recarregado do disco.');
  });
}

function escapar(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
function cssEscape(s) { return String(s).replace(/["\\\\]/g, '\\\\$&'); }

// --- Ligação ---------------------------------------------------------------

$('salvar').onclick = salvar;
$('recarregar').onclick = recarregarDoDisco;
$('add-mapeamento').onclick = function () {
  if (!config.coresPorTag) config.coresPorTag = [];
  config.coresPorTag.push({ tag: '', cor: { r: 0, g: 0, b: 0 } });
  desenharMapeamentos();
};
$('dlg-sobrescrever').onclick = function () { $('dlg-conflito').close(); enviar(true); };
$('dlg-descartar').onclick = function () { $('dlg-conflito').close(); recarregarDoDisco(); };
$('dlg-end-cancelar').onclick = function () { $('dlg-endereco').close(); };
$('dlg-end-ok').onclick = function () { $('dlg-endereco').close(); enviar(false); };

fetch('/api/config').then(function (r) { return r.json(); }).then(function (c) {
  config = JSON.parse(JSON.stringify(c.config));
  estadoConfigServidor = JSON.parse(JSON.stringify(c.config));
  hashBase = c.hash;
  sobreposicoes = c.sobreposiçõesDeAmbiente || [];
  desenharConfig(); desenharMapeamentos();
  if (c.discoDivergente) {
    mensagem('', 'O arquivo no disco mudou depois que o serviço subiu. ' +
      'Estes valores <strong>ainda não estão valendo</strong> — salve para aplicá-los, ' +
      'ou reinicie o serviço.');
  }
  conectar();
});
</script>
</body>
</html>
`;
