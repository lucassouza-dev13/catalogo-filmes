const BACKEND = "https://backend-cat-logo.onrender.com";
const API_URL = "https://backend-cat-logo.onrender.com";
const API_KEY = "8bcf3516840c71be090ce067d3464a1d";
const IMG     = "https://image.tmdb.org/t/p/w342";
const IMG_LG  = "https://image.tmdb.org/t/p/w500";
const BASE    = "https://api.themoviedb.org/3";

const FILTRO_SAFE = "&without_genres=10749,27&vote_count.gte=100&include_adult=false";

// ─── Estado global ────────────────────────────────────────────────────────────
let abaAtual  = "filmes";
let favorites = [];
let usuario   = null;
let token     = null;

try { favorites = JSON.parse(localStorage.getItem("lustv_favs")) || []; } catch(e) {}
try {
  token   = localStorage.getItem("lustv_token");
  usuario = JSON.parse(localStorage.getItem("lustv_usuario") || "null");
} catch(e) {}

const content     = document.getElementById("main-content");
const pageTitle   = document.getElementById("page-title");
const searchInput = document.getElementById("search");

const TITULOS = {
  filmes: "🎬 Filmes", series: "📺 Séries",
  jogos: "🎮 Jogos", animes: "👾 Animações", favoritos: "❤️ Favoritos"
};

// ─── Estado do Infinite Scroll ────────────────────────────────────────────────
let paginaAtual     = 1;
let totalPaginas    = 1;
let carregandoPagina = false;
let scrollObserver  = null;
let scrollAbaAtual  = null;  // qual aba está com scroll ativo
let scrollGrid      = null;  // referência ao grid que recebe novos cards

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function iniciais(nome) {
  return nome.trim().split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function formatarData(ts) {
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function estrelasHtml(n) {
  let h = "";
  for (let i = 1; i <= 5; i++) h += `<span class="${i <= n ? "cheia" : ""}">★</span>`;
  return h;
}

async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (token) opts.headers["Authorization"] = `Bearer ${token}`;
  if (body)  opts.body = JSON.stringify(body);

  const res  = await fetch(BACKEND + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.erro || "Erro desconhecido");
  return data;
}

// ══════════════════════════════════════════════════════════════════════════════
// TMDB FETCH
// ══════════════════════════════════════════════════════════════════════════════
async function fetchData(url) {
  try { const r = await fetch(url); const d = await r.json(); return d.results || []; } catch(e) { return []; }
}

async function fetchPagina(url) {
  // Retorna { results, total_pages }
  try {
    const r = await fetch(url);
    const d = await r.json();
    return { results: d.results || [], total_pages: d.total_pages || 1 };
  } catch(e) {
    return { results: [], total_pages: 1 };
  }
}

async function fetchOne(url) {
  try { const r = await fetch(url); return await r.json(); } catch(e) { return null; }
}

// ══════════════════════════════════════════════════════════════════════════════
// INFINITE SCROLL
// ══════════════════════════════════════════════════════════════════════════════
function destruirObserver() {
  if (scrollObserver) {
    scrollObserver.disconnect();
    scrollObserver = null;
  }
  // Remove sentinela anterior se existir
  const old = document.getElementById("scroll-sentinela");
  if (old) old.remove();
  const oldSpinner = document.getElementById("scroll-spinner");
  if (oldSpinner) oldSpinner.remove();
}

function setSpinner(visivel) {
  let spinner = document.getElementById("scroll-spinner");
  if (!spinner) {
    spinner = document.createElement("div");
    spinner.id = "scroll-spinner";
    spinner.innerHTML = `<div class="loading" style="padding:20px 0"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;
    content.appendChild(spinner);
  }
  spinner.style.display = visivel ? "block" : "none";
}

function appendCards(items, tipo) {
  if (!scrollGrid || !items.length) return;
  items.forEach(item => scrollGrid.appendChild(criarCard(item, tipo)));
}

function criarSentinela(onVisible) {
  // Remove sentinela antiga
  const old = document.getElementById("scroll-sentinela");
  if (old) old.remove();

  const sentinela = document.createElement("div");
  sentinela.id = "scroll-sentinela";
  sentinela.style.cssText = "height:1px;width:100%;";
  content.appendChild(sentinela);

  scrollObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) onVisible();
  }, { rootMargin: "200px" });

  scrollObserver.observe(sentinela);
}

// Monta a URL de paginação para filmes/séries/animes
function buildUrl(aba, pagina) {
  if (aba === "filmes") {
    return `${BASE}/discover/movie?api_key=${API_KEY}&sort_by=popularity.desc&language=pt-BR&page=${pagina}${FILTRO_SAFE}`;
  } else if (aba === "series") {
    return `${BASE}/discover/tv?api_key=${API_KEY}&sort_by=popularity.desc&language=pt-BR&page=${pagina}${FILTRO_SAFE}`;
  }
  return null;
}

// Carrega próxima página e adiciona ao grid
async function carregarProximaPagina() {
  if (carregandoPagina || paginaAtual >= totalPaginas) return;

  carregandoPagina = true;
  setSpinner(true);

  const proxima = paginaAtual + 1;
  const tipo    = scrollAbaAtual === "filmes" ? "movie" : "tv";
  const url     = buildUrl(scrollAbaAtual, proxima);

  if (!url) { carregandoPagina = false; setSpinner(false); return; }

  const { results, total_pages } = await fetchPagina(url);
  paginaAtual  = proxima;
  totalPaginas = total_pages;

  appendCards(results, tipo);
  setSpinner(false);
  carregandoPagina = false;

  // Se ainda tem mais páginas, recria sentinela
  if (paginaAtual < totalPaginas) {
    criarSentinela(carregarProximaPagina);
  } else {
    destruirObserver();
  }
}

// Inicializa o scroll para uma aba paginável
async function iniciarScrollInfinito(aba) {
  destruirObserver();
  scrollAbaAtual   = aba;
  paginaAtual      = 1;
  totalPaginas     = 1;
  carregandoPagina = false;

  const tipo = aba === "filmes" ? "movie" : "tv";
  const url  = buildUrl(aba, 1);

  showLoading();

  const { results, total_pages } = await fetchPagina(url);
  totalPaginas = total_pages;

  content.innerHTML = "";

  if (!results.length) { showEmpty(); return; }

  // Cria o grid principal
  scrollGrid = document.createElement("div");
  scrollGrid.className = "grid";
  results.forEach(item => scrollGrid.appendChild(criarCard(item, tipo)));
  content.appendChild(scrollGrid);

  // Só ativa o observer se tiver mais páginas
  if (totalPaginas > 1) {
    criarSentinela(carregarProximaPagina);
  }
}

// Infinite scroll para animes (duas seções: filmes animados + séries animadas)
// Animes têm dois feeds independentes, então o scroll carrega ambos em sequência
let animeEstado = null;

async function iniciarScrollAnime() {
  destruirObserver();
  scrollAbaAtual   = "animes";
  carregandoPagina = false;

  showLoading();

  // Busca primeira página dos dois feeds em paralelo
  const [resM, resS] = await Promise.all([
    fetchPagina(`${BASE}/discover/movie?api_key=${API_KEY}&with_genres=16&language=pt-BR&page=1${FILTRO_SAFE}`),
    fetchPagina(`${BASE}/discover/tv?api_key=${API_KEY}&with_genres=16&language=pt-BR&page=1${FILTRO_SAFE}`)
  ]);

  animeEstado = {
    paginaFilmes:  1, totalFilmes:  resM.total_pages,
    paginaSeries:  1, totalSeries:  resS.total_pages,
    gridFilmes: null, gridSeries: null
  };

  content.innerHTML = "";

  if (resM.results.length) {
    const sec = document.createElement("div");
    const h   = document.createElement("div"); h.className = "section-label"; h.textContent = "Filmes Animados"; sec.appendChild(h);
    animeEstado.gridFilmes = document.createElement("div"); animeEstado.gridFilmes.className = "grid";
    resM.results.forEach(item => animeEstado.gridFilmes.appendChild(criarCard(item, "movie")));
    sec.appendChild(animeEstado.gridFilmes);
    content.appendChild(sec);
  }

  if (resS.results.length) {
    const sec = document.createElement("div");
    const h   = document.createElement("div"); h.className = "section-label"; h.textContent = "Séries Animadas"; sec.appendChild(h);
    animeEstado.gridSeries = document.createElement("div"); animeEstado.gridSeries.className = "grid";
    resS.results.forEach(item => animeEstado.gridSeries.appendChild(criarCard(item, "tv")));
    sec.appendChild(animeEstado.gridSeries);
    content.appendChild(sec);
  }

  if (!resM.results.length && !resS.results.length) { showEmpty("Nenhum anime encontrado."); return; }

  const temMais = animeEstado.paginaFilmes < animeEstado.totalFilmes || animeEstado.paginaSeries < animeEstado.totalSeries;
  if (temMais) criarSentinela(carregarProximaPaginaAnime);
}

async function carregarProximaPaginaAnime() {
  if (!animeEstado || carregandoPagina) return;

  const temMaisFilmes = animeEstado.paginaFilmes < animeEstado.totalFilmes;
  const temMaisSeries = animeEstado.paginaSeries < animeEstado.totalSeries;
  if (!temMaisFilmes && !temMaisSeries) { destruirObserver(); return; }

  carregandoPagina = true;
  setSpinner(true);

  const proximas = [];
  if (temMaisFilmes) proximas.push(
    fetchPagina(`${BASE}/discover/movie?api_key=${API_KEY}&with_genres=16&language=pt-BR&page=${animeEstado.paginaFilmes + 1}${FILTRO_SAFE}`)
      .then(r => { animeEstado.paginaFilmes++; animeEstado.totalFilmes = r.total_pages; r.results.forEach(item => animeEstado.gridFilmes?.appendChild(criarCard(item, "movie"))); })
  );
  if (temMaisSeries) proximas.push(
    fetchPagina(`${BASE}/discover/tv?api_key=${API_KEY}&with_genres=16&language=pt-BR&page=${animeEstado.paginaSeries + 1}${FILTRO_SAFE}`)
      .then(r => { animeEstado.paginaSeries++; animeEstado.totalSeries = r.total_pages; r.results.forEach(item => animeEstado.gridSeries?.appendChild(criarCard(item, "tv"))); })
  );

  await Promise.all(proximas);
  setSpinner(false);
  carregandoPagina = false;

  const aindaTemMais = animeEstado.paginaFilmes < animeEstado.totalFilmes || animeEstado.paginaSeries < animeEstado.totalSeries;
  if (aindaTemMais) criarSentinela(carregarProximaPaginaAnime);
  else destruirObserver();
}

// ══════════════════════════════════════════════════════════════════════════════
// FAVORITOS (local)
// ══════════════════════════════════════════════════════════════════════════════
function saveFavs()      { try { localStorage.setItem("lustv_favs", JSON.stringify(favorites)); } catch(e) {} }
function isFav(id)       { return favorites.some(f => f.id === id); }
function toggleFav(item, tipo) {
  isFav(item.id) ? favorites = favorites.filter(f => f.id !== item.id) : favorites.push({ ...item, _tipo: tipo });
  saveFavs();
}

// ══════════════════════════════════════════════════════════════════════════════
// CONQUISTAS
// ══════════════════════════════════════════════════════════════════════════════
async function verificarConquistas() {
  if (!usuario || !token) return;
  try {
    const data = await api("POST", "/conquistas/verificar");
    if (data.novas && data.novas.length > 0) {
      mostrarPopupConquistas(data.novas);
    }
  } catch (e) {
    console.warn("[CONQUISTAS]", e.message);
  }
}

function mostrarPopupConquistas(novas) {
  document.getElementById("conquista-popup")?.remove();

  const popup = document.createElement("div");
  popup.id = "conquista-popup";
  popup.innerHTML = `
    <div class="conquista-popup-inner">
      <div class="conquista-popup-header">
        <span class="conquista-popup-icon">🏆</span>
        <span class="conquista-popup-titulo">Conquista desbloqueada!</span>
        <button class="conquista-popup-close" onclick="this.closest('#conquista-popup').remove()">✕</button>
      </div>
      <div class="conquista-popup-lista">
        ${novas.map(c => `
          <div class="conquista-item">
            <span class="conquista-emoji">${c.emoji}</span>
            <div class="conquista-info">
              <div class="conquista-nome">${c.nome}</div>
              <div class="conquista-desc">${c.desc}</div>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  document.body.appendChild(popup);
  setTimeout(() => popup?.remove(), 6000);
}

// ══════════════════════════════════════════════════════════════════════════════
// LOGIN / CADASTRO
// ══════════════════════════════════════════════════════════════════════════════
const loginBox          = document.getElementById("login-box");
const loginModalOverlay = document.getElementById("login-modal-overlay");
const loginModalClose   = document.getElementById("login-modal-close");
const lmNome            = document.getElementById("lm-nome");
const lmSenha           = document.getElementById("lm-senha");
const lmEntrarBtn       = document.getElementById("lm-entrar-btn");
const loginError        = document.getElementById("login-error");

function renderLoginBox() {
  if (usuario) {
    loginBox.innerHTML = `
      <div class="user-chip">
        <div class="user-avatar-sm">${iniciais(usuario.nome)}</div>
        <span class="user-chip-nome">${usuario.nome}</span>
        <button class="btn-sair" onclick="fazerLogout()">Sair</button>
      </div>`;
  } else {
    loginBox.innerHTML = `<button class="btn-entrar" id="btn-abrir-login">Entrar</button>`;
    document.getElementById("btn-abrir-login").addEventListener("click", abrirLoginModal);
  }
  renderFormAvaliacao();
}

function abrirLoginModal() {
  loginModalOverlay.classList.add("open");
  lmNome.value = lmSenha.value = "";
  loginError.textContent = "";
  setTimeout(() => lmNome.focus(), 50);
}

function fecharLoginModal() {
  loginModalOverlay.classList.remove("open");
}

loginModalClose.addEventListener("click", fecharLoginModal);
loginModalOverlay.addEventListener("click", e => { if (e.target === loginModalOverlay) fecharLoginModal(); });
lmSenha.addEventListener("keydown", e => { if (e.key === "Enter") lmEntrarBtn.click(); });
lmNome.addEventListener("keydown",  e => { if (e.key === "Enter") lmSenha.focus(); });

lmEntrarBtn.addEventListener("click", async () => {
  const nome  = lmNome.value.trim();
  const senha = lmSenha.value.trim();

  if (!nome)            { loginError.textContent = "Insira um nome de usuário."; return; }
  if (senha.length < 3) { loginError.textContent = "A senha precisa ter pelo menos 3 caracteres."; return; }

  lmEntrarBtn.disabled    = true;
  lmEntrarBtn.textContent = "Aguarde...";
  loginError.textContent  = "";

  try {
    let data;
    try {
      data = await api("POST", "/auth/entrar", { nome, senha });
    } catch (err) {
      if (err.message === "Usuário não encontrado.") {
        data = await api("POST", "/auth/cadastrar", { nome, senha });
      } else {
        throw err;
      }
    }

    token   = data.token;
    usuario = data.usuario;
    localStorage.setItem("lustv_token",   token);
    localStorage.setItem("lustv_usuario", JSON.stringify(usuario));

    fecharLoginModal();
    renderLoginBox();

    if (modalItem) renderAvaliacoes(String(modalItem.id));

  } catch (err) {
    loginError.textContent = err.message;
  } finally {
    lmEntrarBtn.disabled    = false;
    lmEntrarBtn.textContent = "Entrar / Cadastrar";
  }
});

function fazerLogout() {
  token = usuario = null;
  localStorage.removeItem("lustv_token");
  localStorage.removeItem("lustv_usuario");
  renderLoginBox();
}

// ══════════════════════════════════════════════════════════════════════════════
// AVALIAÇÕES
// ══════════════════════════════════════════════════════════════════════════════
let avEstrelaAtual = 0;
const AV_LABELS    = ["Péssimo", "Ruim", "Regular", "Bom", "Excelente"];

function renderFormAvaliacao() {
  const aviso  = document.getElementById("av-login-aviso");
  const campos = document.getElementById("av-form-fields");
  if (!aviso || !campos) return;
  aviso.style.display  = usuario ? "none"  : "block";
  campos.style.display = usuario ? "block" : "none";
}

async function renderAvaliacoes(filmeId) {
  renderFormAvaliacao();

  const avLista  = document.getElementById("av-lista");
  const avResumo = document.getElementById("av-resumo");
  if (!avLista || !avResumo) return;

  avLista.innerHTML = '<div class="av-vazio">Carregando avaliações...</div>';

  let avaliacoes = [];
  try {
    const data = await api("GET", `/avaliacoes/${filmeId}`);
    avaliacoes  = data.avaliacoes;
  } catch(e) {
    avLista.innerHTML = '<div class="av-vazio">Erro ao carregar avaliações.</div>';
    return;
  }

  if (!avaliacoes.length) {
    avResumo.innerHTML = "";
    avLista.innerHTML  = '<div class="av-vazio">Seja o primeiro a avaliar! 🎬</div>';
    return;
  }

  const total    = avaliacoes.reduce((s, r) => s + r.estrelas, 0);
  const media    = total / avaliacoes.length;
  const contagem = [0,0,0,0,0];
  avaliacoes.forEach(r => contagem[r.estrelas - 1]++);

  let barras = "";
  for (let i = 5; i >= 1; i--) {
    const pct = Math.round(contagem[i-1] / avaliacoes.length * 100);
    barras += `<div class="av-barra-row">
      <span>${i}</span>
      <div class="av-barra-track"><div class="av-barra-fill" style="width:${pct}%"></div></div>
      <span>${contagem[i-1]}</span>
    </div>`;
  }

  avResumo.innerHTML = `<div class="av-resumo-wrap">
    <div>
      <div class="av-media">${media.toFixed(1)}</div>
      <div class="av-estrelas-mini">${estrelasHtml(Math.round(media))}</div>
      <div class="av-media-sub">${avaliacoes.length} avaliação${avaliacoes.length !== 1 ? "ões" : ""}</div>
    </div>
    <div class="av-barras">${barras}</div>
  </div>`;

  avLista.innerHTML = avaliacoes.map(r => {
    const podeRemover = usuario && usuario.id === r.autor_id;
    return `<div class="av-item">
      <div class="av-item-header">
        <div class="av-avatar">${iniciais(r.autor)}</div>
        <div>
          <div class="av-item-nome">${r.autor}</div>
          <div class="av-estrelas-mini">${estrelasHtml(r.estrelas)}</div>
        </div>
        ${podeRemover ? `<button class="av-remover" onclick="avRemover('${filmeId}',${r.id})">✕</button>` : ""}
      </div>
      ${r.comentario ? `<div class="av-texto">${r.comentario}</div>` : ""}
      <div class="av-data">${formatarData(r.criado_em)}</div>
    </div>`;
  }).join("");
}

// ── Confirm modal ─────────────────────────────────────────────
function confirmar(mensagem) {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirm-overlay');
    overlay.classList.add('open');
    document.getElementById('confirm-ok').onclick     = () => { overlay.classList.remove('open'); resolve(true);  };
    document.getElementById('confirm-cancel').onclick = () => { overlay.classList.remove('open'); resolve(false); };
  });
}

async function avRemover(filmeId, avId) {
  if (!usuario) return;
  const ok = await confirmar();
  if (!ok) return;
  try {
    await api("DELETE", `/avaliacoes/${avId}`);
    renderAvaliacoes(filmeId);
  } catch(e) {
    alert(e.message);
  }
}

async function inicializarFormAvaliacao(filmeId) {
  avEstrelaAtual = 0;

  const btns     = document.querySelectorAll("#av-estrelas button");
  const btnEnv   = document.getElementById("av-btn");
  const hint     = document.getElementById("av-hint");
  const avLink   = document.getElementById("av-link-login");
  const avComent = document.getElementById("av-comentario");

  btns.forEach(btn => {
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
  });
  const btnEnvClone = btnEnv.cloneNode(true);
  btnEnv.parentNode.replaceChild(btnEnvClone, btnEnv);

  const btnsNovos = document.querySelectorAll("#av-estrelas button");
  const btnNovo   = document.getElementById("av-btn");

  if (avLink) {
    const avLinkClone = avLink.cloneNode(true);
    avLink.parentNode.replaceChild(avLinkClone, avLink);
    document.getElementById("av-link-login").addEventListener("click", e => { e.preventDefault(); abrirLoginModal(); });
  }

  function atualizarEstrelas(v) {
    btnsNovos.forEach(b => b.classList.toggle("ativa", +b.dataset.v <= v));
  }

  btnsNovos.forEach(btn => {
    btn.addEventListener("click", () => {
      avEstrelaAtual = +btn.dataset.v;
      atualizarEstrelas(avEstrelaAtual);
      hint.textContent = AV_LABELS[avEstrelaAtual - 1];
      btnNovo.disabled = false;
    });
    btn.addEventListener("mouseenter", () => atualizarEstrelas(+btn.dataset.v));
    btn.addEventListener("mouseleave", () => atualizarEstrelas(avEstrelaAtual));
  });

  let modoEdicao = false;
  if (usuario) {
    try {
      const minhaData = await api("GET", `/avaliacoes/${filmeId}/minha`);
      if (minhaData.avaliacao) {
        modoEdicao = true;
        avEstrelaAtual = minhaData.avaliacao.estrelas;
        atualizarEstrelas(avEstrelaAtual);
        hint.textContent = AV_LABELS[avEstrelaAtual - 1];
        if (avComent) avComent.value = minhaData.avaliacao.comentario || "";
        btnNovo.disabled = false;
        btnNovo.textContent = "Atualizar avaliação";
      }
    } catch(e) {}
  }

  let enviando = false;

  btnNovo.addEventListener("click", async () => {
    if (!usuario || !avEstrelaAtual || enviando) return;
    enviando = true;
    btnNovo.disabled    = true;
    btnNovo.textContent = modoEdicao ? "Atualizando..." : "Enviando...";

    try {
      if (modoEdicao) {
        await api("PUT", `/avaliacoes/${filmeId}`, {
          estrelas:   avEstrelaAtual,
          comentario: avComent ? avComent.value.trim() : "",
          tipo:       modalTipo || "movie"
        });
      } else {
        await api("POST", `/avaliacoes/${filmeId}`, {
          estrelas:   avEstrelaAtual,
          comentario: avComent ? avComent.value.trim() : "",
          tipo:       modalTipo || "movie"
        });
        modoEdicao = true;
        await renderAvaliacoes(filmeId);
        await verificarConquistas();
        hint.textContent    = AV_LABELS[avEstrelaAtual - 1];
        btnNovo.textContent = "Atualizar avaliação";
        return;
      }

      await renderAvaliacoes(filmeId);
      hint.textContent    = AV_LABELS[avEstrelaAtual - 1];
      btnNovo.textContent = "Atualizar avaliação";
    } catch(e) {
      hint.textContent = e.message;
    } finally {
      btnNovo.disabled = false;
      enviando = false;
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// PLATAFORMAS (onde assistir)
// ══════════════════════════════════════════════════════════════════════════════
async function carregarPlataformas(id, tipo) {
  const wrap = document.getElementById("modal-plataformas");
  if (!wrap) return;
  wrap.innerHTML = "";

  try {
    const data       = await fetchOne(`${BASE}/${tipo}/${id}/watch/providers?api_key=${API_KEY}`);
    const br         = data?.results?.BR;
    const provedores = br?.flatrate || br?.ads || br?.rent || [];

    if (!provedores.length) {
      wrap.innerHTML = `<p class="plat-vazio">Não disponível em streaming no Brasil.</p>`;
      return;
    }

    wrap.innerHTML = `
      <div class="plat-titulo">Onde assistir</div>
      <div class="plat-logos">
        ${provedores.map(p => `
          <div class="plat-item" title="${p.provider_name}">
            <img src="https://image.tmdb.org/t/p/w45${p.logo_path}" alt="${p.provider_name}">
            <span>${p.provider_name}</span>
          </div>`).join("")}
      </div>`;
  } catch(e) {
    console.error("[PLATAFORMAS]", e.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════════════════════════════════════════
const modalOverlay  = document.getElementById("modal-overlay");
const modalClose    = document.getElementById("modal-close");
const modalTrailer  = document.getElementById("modal-trailer");
const modalPoster   = document.getElementById("modal-poster");
const modalTitle    = document.getElementById("modal-title");
const modalMeta     = document.getElementById("modal-meta");
const modalOverview = document.getElementById("modal-overview");
const modalFavBtn   = document.getElementById("modal-fav-btn");

let modalItem = null;
let modalTipo = null;

async function abrirModal(item, tipo) {
  modalItem = item;
  modalTipo = tipo;

  const titulo  = tipo === "movie" ? item.title : item.name;
  const filmeId = String(item.id);

  modalTitle.textContent    = titulo;
  modalOverview.textContent = "Carregando descrição...";
  modalTrailer.innerHTML    = `<div class="modal-no-trailer"><span>🎬</span>Carregando trailer...</div>`;
  modalPoster.innerHTML     = item.poster_path
    ? `<img src="${IMG_LG}${item.poster_path}" alt="${titulo}">`
    : `<div style="height:165px;display:flex;align-items:center;justify-content:center;color:#444;font-size:2rem;">🎬</div>`;

  modalMeta.innerHTML = "";

  const platWrap = document.getElementById("modal-plataformas");
  if (platWrap) platWrap.innerHTML = "";

  modalFavBtn.textContent = isFav(item.id) ? "❤️ Favoritado" : "♡ Favoritar";
  modalFavBtn.classList.toggle("active", isFav(item.id));
  modalOverlay.classList.add("open");
  document.body.style.overflow = "hidden";

  avEstrelaAtual = 0;
  const hint     = document.getElementById("av-hint");
  const avComent = document.getElementById("av-comentario");
  if (hint)     hint.textContent = "Selecione uma nota";
  if (avComent) avComent.value   = "";
  document.querySelectorAll("#av-estrelas button").forEach(b => b.classList.remove("ativa"));
  const btnEnv = document.getElementById("av-btn");
  if (btnEnv) btnEnv.disabled = true;

  renderAvaliacoes(filmeId);
  inicializarFormAvaliacao(filmeId);

  const [details, videosPT, videosEN] = await Promise.all([
    fetchOne(`${BASE}/${tipo}/${item.id}?api_key=${API_KEY}&language=pt-BR`),
    fetchOne(`${BASE}/${tipo}/${item.id}/videos?api_key=${API_KEY}&language=pt-BR`),
    fetchOne(`${BASE}/${tipo}/${item.id}/videos?api_key=${API_KEY}&language=en-US`)
  ]);

  modalOverview.textContent = details?.overview?.trim() || "Descrição não disponível em português.";

  const ano     = (details?.release_date || details?.first_air_date || "").slice(0, 4);
  const nota    = details?.vote_average ? details.vote_average.toFixed(1) : null;
  const duracao = details?.runtime ? `${details.runtime} min`
    : details?.episode_run_time?.[0] ? `${details.episode_run_time[0]} min/ep` : null;

  modalMeta.innerHTML = `
    ${nota    ? `<span class="modal-badge rating">★ ${nota}</span>` : ""}
    ${ano     ? `<span class="modal-badge">${ano}</span>` : ""}
    ${duracao ? `<span class="modal-badge">${duracao}</span>` : ""}
    <span class="modal-badge">${tipo === "movie" ? "Filme" : "Série"}</span>`;

  carregarPlataformas(item.id, tipo);

  const tipos = ["Trailer", "Teaser", "Clip", "Featurette"];
  let trailer  = null;
  for (const t of tipos) { trailer = (videosPT?.results || []).find(v => v.site === "YouTube" && v.type === t); if (trailer) break; }
  if (!trailer) for (const t of tipos) { trailer = (videosEN?.results || []).find(v => v.site === "YouTube" && v.type === t); if (trailer) break; }

  modalTrailer.innerHTML = trailer
    ? `<iframe src="https://www.youtube.com/embed/${trailer.key}?rel=0&modestbranding=1" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
    : `<div class="modal-no-trailer"><span>🎬</span>Trailer não disponível</div>`;
}

function fecharModal() {
  modalOverlay.classList.remove("open");
  document.body.style.overflow = "";
  modalTrailer.innerHTML = "";
  modalItem = modalTipo = null;
}

modalClose.addEventListener("click", fecharModal);
modalOverlay.addEventListener("click", e => { if (e.target === modalOverlay) fecharModal(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (loginModalOverlay.classList.contains("open")) fecharLoginModal();
    else fecharModal();
  }
});

modalFavBtn.addEventListener("click", () => {
  if (!modalItem) return;
  toggleFav(modalItem, modalTipo);
  const fav = isFav(modalItem.id);
  modalFavBtn.textContent = fav ? "❤️ Favoritado" : "♡ Favoritar";
  modalFavBtn.classList.toggle("active", fav);
  document.querySelectorAll(`.movie-card[data-id="${modalItem.id}"] .fav-btn`).forEach(btn => btn.classList.toggle("active", fav));
});

// ══════════════════════════════════════════════════════════════════════════════
// CARDS / RENDER
// ══════════════════════════════════════════════════════════════════════════════
function criarCard(item, tipo) {
  const titulo = tipo === "movie" ? item.title : item.name;
  const card   = document.createElement("div");
  card.className  = "movie-card";
  card.dataset.id = item.id;

  if (item.poster_path) {
    const img = document.createElement("img");
    img.src = IMG + item.poster_path; img.alt = titulo; img.loading = "lazy";
    card.appendChild(img);
  } else {
    const ph = document.createElement("div");
    ph.className = "placeholder-img"; ph.textContent = "🎬";
    card.appendChild(ph);
  }

  const overlay = document.createElement("div");
  overlay.className = "card-overlay";
  overlay.innerHTML = `<div class="card-title">${titulo}</div>`;
  card.appendChild(overlay);

  const btn = document.createElement("button");
  btn.className = "fav-btn" + (isFav(item.id) ? " active" : "");
  btn.title = "Favoritar"; btn.textContent = "♥";
  btn.addEventListener("click", e => {
    e.stopPropagation();
    toggleFav(item, tipo);
    btn.classList.toggle("active", isFav(item.id));
  });
  card.appendChild(btn);
  card.addEventListener("click", () => abrirModal(item, tipo));
  return card;
}

function renderSecao(label, items, tipo) {
  if (!items?.length) return null;
  const sec = document.createElement("div");
  if (label) { const h = document.createElement("div"); h.className = "section-label"; h.textContent = label; sec.appendChild(h); }
  const grid = document.createElement("div"); grid.className = "grid";
  items.forEach(item => grid.appendChild(criarCard(item, tipo)));
  sec.appendChild(grid);
  return sec;
}

function showLoading() { content.innerHTML = `<div class="loading"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`; }
function showEmpty(msg = "Nada encontrado 😢") { content.innerHTML = `<div class="empty-state"><span>🎬</span>${msg}</div>`; }

// ══════════════════════════════════════════════════════════════════════════════
// JOGOS — IGDB via Backend
// ══════════════════════════════════════════════════════════════════════════════
function jogoId(id) { return `game-${id}`; }

function igdbCover(url, size = "cover_big") {
  if (!url) return null;
  return "https:" + url.replace("t_thumb", `t_${size}`);
}

async function fetchJogos(query) {
  try {
    const url = query
      ? `${BACKEND}/jogos/buscar?q=${encodeURIComponent(query)}`
      : `${BACKEND}/jogos/populares`;
    const r    = await fetch(url);
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("[JOGOS]", e.message);
    return [];
  }
}

async function fetchJogoDetalhe(id) {
  try {
    const r    = await fetch(`${BACKEND}/jogos/${id}`);
    const data = await r.json();
    return data || null;
  } catch (e) {
    console.error("[JOGO DETALHE]", e.message);
    return null;
  }
}

function criarCardJogo(jogo) {
  const titulo = jogo.name || "Sem título";
  const img    = igdbCover(jogo.cover?.url);
  const id     = jogoId(jogo.id);

  const card      = document.createElement("div");
  card.className  = "movie-card";
  card.dataset.id = id;

  if (img) {
    const el   = document.createElement("img");
    el.src     = img;
    el.alt     = titulo;
    el.loading = "lazy";
    card.appendChild(el);
  } else {
    const ph       = document.createElement("div");
    ph.className   = "placeholder-img";
    ph.textContent = "🎮";
    card.appendChild(ph);
  }

  const overlay     = document.createElement("div");
  overlay.className = "card-overlay";
  overlay.innerHTML = `<div class="card-title">${titulo}</div>`;
  card.appendChild(overlay);

  const btn       = document.createElement("button");
  btn.className   = "fav-btn" + (isFav(id) ? " active" : "");
  btn.title       = "Favoritar";
  btn.textContent = "♥";
  btn.addEventListener("click", e => {
    e.stopPropagation();
    toggleFav({ id, name: titulo, cover: jogo.cover, _tipo: "game" }, "game");
    btn.classList.toggle("active", isFav(id));
  });
  card.appendChild(btn);

  card.addEventListener("click", () => abrirModalJogo(jogo));
  return card;
}

async function abrirModalJogo(jogo) {
  const titulo = jogo.name || "Sem título";
  const id     = jogoId(jogo.id);

  modalItem = { id, _tipo: "game" };
  modalTipo = "game";

  modalTitle.textContent    = titulo;
  modalOverview.textContent = jogo.summary || "Carregando descrição...";

  const imgBanner = igdbCover(jogo.cover?.url, "screenshot_big") || igdbCover(jogo.cover?.url, "cover_big");
  modalTrailer.innerHTML = imgBanner
    ? `<img src="${imgBanner}" alt="${titulo}" style="width:100%;height:100%;object-fit:cover;border-radius:8px 8px 0 0;">`
    : `<div style="height:100%;display:flex;align-items:center;justify-content:center;font-size:5rem;">🎮</div>`;

  const imgPoster = igdbCover(jogo.cover?.url, "cover_big");
  modalPoster.innerHTML = imgPoster
    ? `<img src="${imgPoster}" alt="${titulo}">`
    : `<div style="height:165px;display:flex;align-items:center;justify-content:center;color:#444;font-size:3rem;">🎮</div>`;

  modalMeta.innerHTML = "";
  const platWrap = document.getElementById("modal-plataformas");
  if (platWrap) platWrap.innerHTML = "";

  modalFavBtn.textContent = isFav(id) ? "❤️ Favoritado" : "♡ Favoritar";
  modalFavBtn.classList.toggle("active", isFav(id));
  modalOverlay.classList.add("open");
  document.body.style.overflow = "hidden";

  avEstrelaAtual = 0;
  const hint     = document.getElementById("av-hint");
  const avComent = document.getElementById("av-comentario");
  if (hint)     hint.textContent = "Selecione uma nota";
  if (avComent) avComent.value   = "";
  document.querySelectorAll("#av-estrelas button").forEach(b => b.classList.remove("ativa"));
  const btnEnv = document.getElementById("av-btn");
  if (btnEnv) btnEnv.disabled = true;

  renderAvaliacoes(id);
  inicializarFormAvaliacao(id);

  const detalhe = await fetchJogoDetalhe(jogo.id);
  if (detalhe) {
    if (detalhe.summary) modalOverview.textContent = detalhe.summary;

    const ano     = detalhe.first_release_date
      ? new Date(detalhe.first_release_date * 1000).getFullYear()
      : "";
    const nota    = detalhe.rating ? (detalhe.rating / 10).toFixed(1) : null;
    const plats   = (detalhe.platforms || []).map(p => p.name).slice(0, 3).join(", ");
    const generos = (detalhe.genres    || []).map(g => g.name).slice(0, 2).join(", ");

    modalMeta.innerHTML = `
      ${nota    ? `<span class="modal-badge rating">★ ${nota}</span>` : ""}
      ${ano     ? `<span class="modal-badge">${ano}</span>`           : ""}
      ${generos ? `<span class="modal-badge">${generos}</span>`       : ""}
      ${plats   ? `<span class="modal-badge">${plats}</span>`         : ""}
      <span class="modal-badge">🎮 Jogo</span>`;

    if (platWrap && detalhe.platforms?.length) {
      platWrap.innerHTML = `
        <div class="plat-titulo">Plataformas</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
          ${detalhe.platforms.map(p =>
            `<span style="font-size:11px;padding:3px 10px;border-radius:6px;background:#222;color:#aaa;border:1px solid #333">${p.name}</span>`
          ).join("")}
        </div>`;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ABAS
// ══════════════════════════════════════════════════════════════════════════════
async function mudarAba(aba) {
  abaAtual = aba;
  pageTitle.textContent = TITULOS[aba];
  searchInput.value = "";
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("active", b.dataset.aba === aba));

  // Abas com infinite scroll
  if (aba === "filmes" || aba === "series") {
    await iniciarScrollInfinito(aba);
    return;
  }

  if (aba === "animes") {
    await iniciarScrollAnime();
    return;
  }

  // Abas sem scroll — destrói observer se houver
  destruirObserver();
  showLoading();

  if (aba === "jogos") {
    const jogos = await fetchJogos(null);
    content.innerHTML = "";
    if (!jogos.length) { showEmpty("Nenhum jogo encontrado 🎮"); return; }
    const grid = document.createElement("div");
    grid.className = "grid";
    jogos.forEach(j => grid.appendChild(criarCardJogo(j)));
    content.appendChild(grid);

  } else if (aba === "favoritos") {
    content.innerHTML = "";
    if (!favorites.length) { showEmpty("Você ainda não tem favoritos ❤️<br><small style='color:#555;font-size:0.8rem;'>Passe o mouse sobre um título e clique no ♥</small>"); return; }
    const secM = renderSecao("Filmes Favoritos",  favorites.filter(f => f._tipo === "movie"), "movie");
    const secS = renderSecao("Séries Favoritas",  favorites.filter(f => f._tipo === "tv"),    "tv");
    const secG = (() => {
      const jogos = favorites.filter(f => f._tipo === "game");
      if (!jogos.length) return null;
      const sec = document.createElement("div");
      const h   = document.createElement("div"); h.className = "section-label"; h.textContent = "Jogos Favoritos"; sec.appendChild(h);
      const grid = document.createElement("div"); grid.className = "grid";
      jogos.forEach(j => grid.appendChild(criarCardJogo(j)));
      sec.appendChild(grid);
      return sec;
    })();
    if (secM) content.appendChild(secM);
    if (secS) content.appendChild(secS);
    if (secG) content.appendChild(secG);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// BUSCA
// ══════════════════════════════════════════════════════════════════════════════
let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const query = searchInput.value.trim();

  // Busca cancelada — volta à aba normal (com scroll)
  if (!query) { mudarAba(abaAtual); return; }

  // Busca ativa — cancela o observer
  destruirObserver();

  searchTimer = setTimeout(async () => {
    showLoading();
    const q = encodeURIComponent(query);

    if (abaAtual === "favoritos") {
      const filtrados = favorites.filter(f => (f.title || f.name || "").toLowerCase().includes(query.toLowerCase()));
      content.innerHTML = "";
      if (!filtrados.length) { showEmpty(); return; }
      const secM = renderSecao("Filmes", filtrados.filter(f => f._tipo === "movie"), "movie");
      const secS = renderSecao("Séries", filtrados.filter(f => f._tipo === "tv"), "tv");
      if (secM) content.appendChild(secM);
      if (secS) content.appendChild(secS);

    } else if (abaAtual === "jogos") {
      const jogos = await fetchJogos(query);
      content.innerHTML = "";
      if (!jogos.length) { showEmpty("Nenhum jogo encontrado 🎮"); return; }
      pageTitle.textContent = `${jogos.length} resultado${jogos.length !== 1 ? "s" : ""} para "${query}"`;
      const grid = document.createElement("div");
      grid.className = "grid";
      jogos.forEach(j => grid.appendChild(criarCardJogo(j)));
      content.appendChild(grid);

    } else {
      const [movies, series, jogos] = await Promise.all([
        fetchData(`${BASE}/search/movie?api_key=${API_KEY}&query=${q}&language=pt-BR&include_adult=false`),
        fetchData(`${BASE}/search/tv?api_key=${API_KEY}&query=${q}&language=pt-BR&include_adult=false`),
        fetchJogos(query)
      ]);
      content.innerHTML = "";

      const total = movies.length + series.length + jogos.length;
      pageTitle.textContent = `${total} resultado${total !== 1 ? "s" : ""} para "${query}"`;

      const secM = renderSecao("Filmes", movies, "movie");
      const secS = renderSecao("Séries", series, "tv");
      if (secM) content.appendChild(secM);
      if (secS) content.appendChild(secS);

      if (jogos.length) {
        const sec  = document.createElement("div");
        const h    = document.createElement("div"); h.className = "section-label"; h.textContent = "Jogos"; sec.appendChild(h);
        const grid = document.createElement("div"); grid.className = "grid";
        jogos.forEach(j => grid.appendChild(criarCardJogo(j)));
        sec.appendChild(grid);
        content.appendChild(sec);
      }

      if (!secM && !secS && !jogos.length) showEmpty();
    }
  }, 400);
});

document.querySelectorAll("nav button").forEach(btn => btn.addEventListener("click", () => mudarAba(btn.dataset.aba)));

// ── Init ──────────────────────────────────────────────────────────────────────
renderLoginBox();

const hashAba = location.hash.replace('#', '');
if (hashAba && TITULOS[hashAba]) mudarAba(hashAba);
else mudarAba("filmes");
ENDOFFILE
echo "OK"
Saída

OK
Concluído


