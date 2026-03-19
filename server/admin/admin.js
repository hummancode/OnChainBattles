// ============================================================
// OCB Admin Panel — Vanilla JS SPA
// Hash-based routing: #login, #dashboard, #players, #puzzles, #puzzle-editor
// ============================================================

const API = '/api';
const $ = (sel) => document.querySelector(sel);
const $content = () => $('#content');

// ─── Auth ───────────────────────────────────────────────────

function getToken() { return localStorage.getItem('ocb_admin_token'); }
function setToken(t) { localStorage.setItem('ocb_admin_token', t); }
function clearToken() { localStorage.removeItem('ocb_admin_token'); }

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  const token = getToken();
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  if (res.status === 401) { clearToken(); route(); throw new Error('Session expired'); }
  if (res.status === 403) throw new Error('Access denied');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// ─── Router ─────────────────────────────────────────────────

function route() {
  const hash = location.hash.replace('#', '') || 'login';
  if (!getToken() && hash !== 'login') { location.hash = '#login'; return; }
  if (getToken() && hash === 'login') { location.hash = '#dashboard'; return; }

  $('#nav').style.display = getToken() ? 'flex' : 'none';

  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === '#' + hash.split('/')[0]);
  });

  const [page, ...args] = hash.split('/');
  const routes = { login: renderLogin, dashboard: renderDashboard, players: renderPlayers, puzzles: renderPuzzles, 'puzzle-editor': renderPuzzleEditor };
  const fn = routes[page];
  if (fn) fn(args); else renderDashboard();
}

window.addEventListener('hashchange', route);
document.addEventListener('DOMContentLoaded', () => {
  $('#logoutBtn')?.addEventListener('click', () => { clearToken(); location.hash = '#login'; });
  route();
});

// ─── Login ──────────────────────────────────────────────────

function renderLogin() {
  $content().innerHTML = `
    <div class="login-box">
      <h1>OCB Admin</h1>
      <div class="form-group"><label>Email</label><input id="loginEmail" type="email" placeholder="admin@ocb.com"></div>
      <div class="form-group"><label>Password</label><input id="loginPass" type="password" placeholder="Password"></div>
      <div id="loginError" class="error"></div>
      <button class="btn btn-green" id="loginBtn">Log In</button>
    </div>`;

  $('#loginBtn').onclick = async () => {
    const email = $('#loginEmail').value.trim();
    const password = $('#loginPass').value;
    if (!email || !password) { $('#loginError').textContent = 'Enter email and password'; return; }
    try {
      const data = await api('POST', '/auth/email-login', { email, password });
      setToken(data.token);
      // Verify admin access
      await api('GET', '/admin/stats');
      location.hash = '#dashboard';
    } catch (e) {
      $('#loginError').textContent = e.message;
    }
  };

  $('#loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') $('#loginBtn').click(); });
}

// ─── Dashboard ──────────────────────────────────────────────

async function renderDashboard() {
  $content().innerHTML = '<h1>Dashboard</h1><p class="muted">Loading...</p>';
  try {
    const s = await api('GET', '/admin/stats');
    $content().innerHTML = `
      <h1>Dashboard</h1>
      <div class="stat-grid">
        <div class="stat-card"><div class="value">${s.playerCount}</div><div class="label">Players</div></div>
        <div class="stat-card"><div class="value">${s.matchCount}</div><div class="label">Matches</div></div>
        <div class="stat-card"><div class="value">${s.puzzleCount}</div><div class="label">Puzzles</div></div>
        <div class="stat-card"><div class="value">${s.solvedCount}</div><div class="label">Solved</div></div>
        <div class="stat-card"><div class="value">${s.totalAttempts}</div><div class="label">Attempts</div></div>
      </div>`;
  } catch (e) { $content().innerHTML = `<h1>Dashboard</h1><p class="error">${e.message}</p>`; }
}

// ─── Players ────────────────────────────────────────────────

async function renderPlayers() {
  $content().innerHTML = `
    <h1>Players</h1>
    <div class="search-bar">
      <input id="playerSearch" placeholder="Search by name, email, or wallet..." value="">
      <button class="btn" id="searchBtn">Search</button>
    </div>
    <div id="playerList"><p class="muted">Loading...</p></div>`;

  const load = async (search = '', page = 0) => {
    try {
      const data = await api('GET', `/admin/players?search=${encodeURIComponent(search)}&page=${page}`);
      const list = $('#playerList');
      if (data.players.length === 0) { list.innerHTML = '<p class="muted">No players found.</p>'; return; }

      list.innerHTML = `
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Wallet</th><th>Tier</th><th>Admin</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${data.players.map(p => `
            <tr>
              <td>${p.id}</td>
              <td>${esc(p.display_name)}</td>
              <td>${esc(p.email || '-')}</td>
              <td>${p.wallet_address ? p.wallet_address.slice(0, 8) + '...' : '-'}</td>
              <td><span class="tag ${['tag-gray','tag-blue','tag-gold'][p.account_tier] || 'tag-gray'}">${['Guest','Free','Economy'][p.account_tier] || '?'}</span></td>
              <td>${p.is_admin ? '<span class="tag tag-gold">ADMIN</span>' : ''}</td>
              <td>${p.banned_at ? '<span class="tag tag-red">BANNED</span>' : '<span class="tag tag-green">OK</span>'}</td>
              <td>
                <button class="btn btn-sm" onclick="editPlayer(${p.id})">Edit</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div class="mt flex-between">
          <span class="muted">${data.total} total, page ${data.page + 1}</span>
          <div>
            ${data.page > 0 ? `<button class="btn btn-sm" onclick="loadPlayers('${search}', ${data.page - 1})">Prev</button>` : ''}
            <button class="btn btn-sm" onclick="loadPlayers('${search}', ${data.page + 1})">Next</button>
          </div>
        </div>`;
    } catch (e) { $('#playerList').innerHTML = `<p class="error">${e.message}</p>`; }
  };

  window.loadPlayers = (search, page) => load(search, page);
  window.editPlayer = (id) => showPlayerEditor(id);

  $('#searchBtn').onclick = () => load($('#playerSearch').value.trim());
  $('#playerSearch').addEventListener('keydown', e => { if (e.key === 'Enter') load($('#playerSearch').value.trim()); });
  load();
}

async function showPlayerEditor(id) {
  try {
    const data = await api('GET', `/admin/players/${id}`);
    const p = data.player;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:100';
    el.innerHTML = `
      <div style="background:#16213e;border:1px solid #253348;border-radius:10px;padding:24px;width:400px;max-height:80vh;overflow-y:auto">
        <h2>Edit Player #${p.id}</h2>
        <div class="form-group"><label>Display Name</label><input id="peditName" value="${esc(p.display_name)}"></div>
        <div class="form-group"><label>Account Tier</label>
          <select id="peditTier"><option value="0" ${p.account_tier===0?'selected':''}>Guest</option><option value="1" ${p.account_tier===1?'selected':''}>Free</option><option value="2" ${p.account_tier===2?'selected':''}>Economy</option></select>
        </div>
        <div class="form-group"><label><input type="checkbox" id="peditFounding" ${p.founding_player?'checked':''}> Founding Player</label></div>
        <div class="form-group"><label><input type="checkbox" id="peditBan" ${p.banned_at?'checked':''}> Banned</label></div>
        <div class="form-group"><label><input type="checkbox" id="peditAdmin" ${p.is_admin?'checked':''}> Admin</label></div>
        <p class="muted">Decks: ${data.deckCount} | Matches: ${data.matchCount} | Puzzle attempts: ${data.attemptCount}</p>
        <div id="peditError" class="error"></div>
        <div class="mt" style="display:flex;gap:8px">
          <button class="btn btn-green" id="peditSave">Save</button>
          <button class="btn btn-red" id="peditClose">Close</button>
        </div>
      </div>`;
    document.body.appendChild(el);

    $('#peditClose').onclick = () => el.remove();
    $('#peditSave').onclick = async () => {
      try {
        await api('PATCH', `/admin/players/${id}`, {
          displayName: $('#peditName').value,
          accountTier: parseInt($('#peditTier').value),
          foundingPlayer: $('#peditFounding').checked,
          ban: $('#peditBan').checked,
        });
        if ($('#peditAdmin').checked !== !!p.is_admin) {
          await api('POST', `/admin/players/${id}/admin`, { grant: $('#peditAdmin').checked });
        }
        el.remove();
        renderPlayers();
      } catch (e) { $('#peditError').textContent = e.message; }
    };
  } catch (e) { alert(e.message); }
}

// ─── Puzzles ────────────────────────────────────────────────

async function renderPuzzles() {
  $content().innerHTML = `
    <div class="flex-between"><h1>Puzzles</h1><button class="btn btn-green" onclick="location.hash='#puzzle-editor/new'">+ New Puzzle</button></div>
    <div id="puzzleList"><p class="muted">Loading...</p></div>`;

  try {
    const data = await api('GET', '/admin/puzzles');
    const list = $('#puzzleList');
    if (data.puzzles.length === 0) { list.innerHTML = '<p class="muted">No puzzles yet. Create one!</p>'; return; }

    list.innerHTML = `<table>
      <thead><tr><th>ID</th><th>Title</th><th>Difficulty</th><th>Published</th><th>Solved</th><th>Attempts</th><th>Actions</th></tr></thead>
      <tbody>${data.puzzles.map(p => `
        <tr>
          <td>${p.id}</td>
          <td>${esc(p.title)}</td>
          <td><span class="tag ${{easy:'tag-green',medium:'tag-blue',hard:'tag-gold',legendary:'tag-red'}[p.difficulty]||'tag-gray'}">${p.difficulty}</span></td>
          <td>${p.published ? '<span class="tag tag-green">YES</span>' : '<span class="tag tag-gray">NO</span>'}</td>
          <td>${p.solved ? '<span class="tag tag-gold">SOLVED</span>' : '-'}</td>
          <td>${p.attempt_count || 0}</td>
          <td>
            <button class="btn btn-sm" onclick="location.hash='#puzzle-editor/${p.id}'">Edit</button>
            <button class="btn btn-sm ${p.published ? 'btn-red' : 'btn-green'}" onclick="togglePublish(${p.id}, ${!p.published})">${p.published ? 'Unpublish' : 'Publish'}</button>
            <button class="btn btn-sm btn-red" onclick="deletePuzzle(${p.id})">Delete</button>
          </td>
        </tr>`).join('')}
      </tbody></table>`;
  } catch (e) { $('#puzzleList').innerHTML = `<p class="error">${e.message}</p>`; }

  window.togglePublish = async (id, pub) => {
    await api('POST', `/admin/puzzles/${id}/publish`, { published: pub });
    renderPuzzles();
  };
  window.deletePuzzle = async (id) => {
    if (!confirm('Delete this puzzle and all its attempts?')) return;
    await api('DELETE', `/admin/puzzles/${id}`);
    renderPuzzles();
  };
}

// ─── Puzzle Editor ──────────────────────────────────────────

let cardPool = [];
let editorState = {
  blocked: new Set(),       // "col,row"
  preplaced: new Map(),     // "col,row" → cardId
  solution: new Map(),      // "col,row" → cardId
  handCards: [],             // cardId[]
  requiredCards: [],         // cardId[]
  mode: 'block',            // 'block' | 'preplace' | 'solution'
};

async function renderPuzzleEditor(args) {
  const puzzleId = args[0]; // 'new' or numeric id
  const isNew = puzzleId === 'new' || !puzzleId;

  // Load card pool
  if (cardPool.length === 0) {
    try { const d = await api('GET', '/admin/card-pool'); cardPool = d.cards; }
    catch { cardPool = []; }
  }

  // Reset editor state
  editorState = { blocked: new Set(), preplaced: new Map(), solution: new Map(), handCards: [], requiredCards: [], mode: 'block' };

  let puzzle = null;
  if (!isNew) {
    try {
      const d = await api('GET', `/admin/puzzles/${puzzleId}`);
      puzzle = d.puzzle;
      // Populate editor state from puzzle
      const setup = JSON.parse(puzzle.board_setup || '{}');
      (setup.blockedSquares || []).forEach(s => editorState.blocked.add(`${s[0]},${s[1]}`));
      (setup.preplacedCards || []).forEach(p => editorState.preplaced.set(`${p.col},${p.row}`, p.cardId));
      editorState.handCards = JSON.parse(puzzle.hand_cards || '[]');
      editorState.requiredCards = JSON.parse(puzzle.required_cards || '[]');
      (JSON.parse(puzzle.solution || '[]')).forEach(p => editorState.solution.set(`${p.col},${p.row}`, p.cardId));
    } catch (e) { $content().innerHTML = `<p class="error">${e.message}</p>`; return; }
  }

  const cardOptions = cardPool.map(c => `<option value="${c.id}">${c.name} (${c.cost}C)</option>`).join('');

  $content().innerHTML = `
    <div class="flex-between"><h1>${isNew ? 'New Puzzle' : `Edit Puzzle #${puzzleId}`}</h1><a href="#puzzles" class="btn">Back to List</a></div>

    <div class="form-row">
      <div class="form-group"><label>Title</label><input id="pTitle" value="${esc(puzzle?.title || '')}"></div>
      <div class="form-group"><label>Difficulty</label>
        <select id="pDifficulty">
          ${['easy','medium','hard','legendary'].map(d => `<option value="${d}" ${puzzle?.difficulty===d?'selected':''}>${d}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group"><label>Description / Riddle</label><textarea id="pDesc" rows="3">${esc(puzzle?.description || '')}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Prize Card</label><select id="pPrize"><option value="">None</option>${cardOptions.replace(`value="${puzzle?.prize_card_id}"`, `value="${puzzle?.prize_card_id}" selected`)}</select></div>
      <div class="form-group"><label>Attempt Fee (AVAX)</label><input id="pFee" type="number" step="0.01" value="${puzzle?.attempt_fee || 0}"></div>
    </div>
    <h2>Required Cards</h2>
    <p class="muted">Cards the player must use in the solution. If "Show required cards" is unchecked, these stay secret and the player picks from their own collection.</p>
    <div class="form-group"><label><input type="checkbox" id="pShowRequired" ${puzzle?.show_required_cards !== 0 ? 'checked' : ''}> Show required cards to players</label>
      <span class="muted"> (uncheck to hide which cards are needed — adds mystery)</span>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <select id="reqCardSelect">${cardOptions}</select>
      <button class="btn btn-green btn-sm" id="addReqCard">+ Add</button>
    </div>
    <div id="reqCardList"></div>

    <h2>Board Editor</h2>
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <label><input type="radio" name="editMode" value="block" checked> Block Squares</label>
      <label><input type="radio" name="editMode" value="preplace"> Pre-place Cards</label>
      <label><input type="radio" name="editMode" value="solution"> Define Solution</label>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center" id="cardSelector" style="display:none">
      <select id="selectedCard">${cardOptions}</select>
    </div>
    <div id="boardGrid" class="board-grid"></div>

    <h2>Hand Cards (cards player must place)</h2>
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <select id="handCardSelect">${cardOptions}</select>
      <button class="btn btn-green btn-sm" id="addHandCard">+ Add</button>
    </div>
    <div id="handCardList"></div>

    <div id="editorError" class="error"></div>
    <div class="mt" style="display:flex;gap:8px">
      <button class="btn btn-green" id="savePuzzle">${isNew ? 'Create Puzzle' : 'Update Puzzle'}</button>
      <a href="#puzzles" class="btn">Cancel</a>
    </div>`;

  // Mode switcher
  document.querySelectorAll('input[name="editMode"]').forEach(r => {
    r.addEventListener('change', () => { editorState.mode = r.value; });
  });

  // Render board
  renderBoard();
  renderRequiredCards();
  renderHandCards();

  // Add required card
  $('#addReqCard').onclick = () => {
    const id = $('#reqCardSelect').value;
    if (id) { editorState.requiredCards.push(id); renderRequiredCards(); }
  };

  // Add hand card
  $('#addHandCard').onclick = () => {
    const id = $('#handCardSelect').value;
    if (id) { editorState.handCards.push(id); renderHandCards(); }
  };

  // Save
  $('#savePuzzle').onclick = async () => {
    const body = collectPuzzleData();
    try {
      if (isNew) {
        await api('POST', '/admin/puzzles', body);
      } else {
        await api('PUT', `/admin/puzzles/${puzzleId}`, body);
      }
      location.hash = '#puzzles';
    } catch (e) {
      $('#editorError').textContent = e.message;
    }
  };
}

function renderBoard() {
  const grid = $('#boardGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const key = `${col},${row}`;
      const cell = document.createElement('div');
      cell.className = 'board-cell';

      if (editorState.blocked.has(key)) {
        cell.classList.add('blocked');
        cell.textContent = 'X';
      } else if (editorState.preplaced.has(key)) {
        cell.classList.add('preplaced');
        cell.textContent = cardName(editorState.preplaced.get(key));
      } else if (editorState.solution.has(key)) {
        cell.classList.add('solution');
        cell.textContent = cardName(editorState.solution.get(key));
      }

      cell.onclick = () => handleCellClick(col, row);
      grid.appendChild(cell);
    }
  }
}

function handleCellClick(col, row) {
  const key = `${col},${row}`;
  const mode = editorState.mode;

  if (mode === 'block') {
    if (editorState.blocked.has(key)) {
      editorState.blocked.delete(key);
    } else {
      editorState.blocked.add(key);
      editorState.preplaced.delete(key);
      editorState.solution.delete(key);
    }
  } else if (mode === 'preplace') {
    if (editorState.blocked.has(key)) return;
    if (editorState.preplaced.has(key)) {
      editorState.preplaced.delete(key);
    } else {
      const cardId = $('#selectedCard')?.value;
      if (cardId) { editorState.preplaced.set(key, cardId); editorState.solution.delete(key); }
    }
  } else if (mode === 'solution') {
    if (editorState.blocked.has(key) || editorState.preplaced.has(key)) return;
    if (editorState.solution.has(key)) {
      editorState.solution.delete(key);
    } else {
      const cardId = $('#selectedCard')?.value;
      if (cardId) editorState.solution.set(key, cardId);
    }
  }

  renderBoard();
}

function renderRequiredCards() {
  const el = $('#reqCardList');
  if (!el) return;
  if (editorState.requiredCards.length === 0) {
    el.innerHTML = '<p class="muted">No required cards. Player can place any card from hand cards list.</p>';
    return;
  }
  el.innerHTML = editorState.requiredCards.map((id, i) =>
    `<span class="tag tag-gold" style="margin:2px;cursor:pointer" onclick="removeReqCard(${i})">${cardName(id)} x</span>`
  ).join('');

  window.removeReqCard = (i) => { editorState.requiredCards.splice(i, 1); renderRequiredCards(); };
}

function renderHandCards() {
  const el = $('#handCardList');
  if (!el) return;
  if (editorState.handCards.length === 0) {
    el.innerHTML = '<p class="muted">No hand cards added yet.</p>';
    return;
  }
  el.innerHTML = editorState.handCards.map((id, i) =>
    `<span class="tag tag-blue" style="margin:2px;cursor:pointer" onclick="removeHandCard(${i})">${cardName(id)} x</span>`
  ).join('');

  window.removeHandCard = (i) => { editorState.handCards.splice(i, 1); renderHandCards(); };
}

function collectPuzzleData() {
  const blockedSquares = [...editorState.blocked].map(k => k.split(',').map(Number));
  const preplacedCards = [...editorState.preplaced].map(([k, cardId]) => {
    const [col, row] = k.split(',').map(Number);
    return { cardId, col, row };
  });
  const solution = [...editorState.solution].map(([k, cardId]) => {
    const [col, row] = k.split(',').map(Number);
    return { cardId, col, row };
  });

  return {
    title: $('#pTitle').value,
    description: $('#pDesc').value,
    difficulty: $('#pDifficulty').value,
    boardSetup: { blockedSquares, preplacedCards },
    handCards: editorState.handCards,
    solution,
    prizeCardId: $('#pPrize').value || null,
    attemptFee: parseFloat($('#pFee').value) || 0,
    requiredCards: editorState.requiredCards,
    showRequiredCards: $('#pShowRequired')?.checked ? 1 : 0,
  };
}

// ─── Helpers ────────────────────────────────────────────────

function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }
function cardName(id) { const c = cardPool.find(c => c.id === id); return c ? c.name : id; }
