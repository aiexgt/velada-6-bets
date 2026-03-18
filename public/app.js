// app.js

const API_DATA_URL = '/api/data';
const API_VOTE_URL = '/api/vote';
const API_ADMIN_URL = '/api/admin/data';

let state = {
  settings: { baseBet: 10 },
  participants: [],
  fights: [],
  predictions: []
};

// Elements (some might be null depending on the page)
const displayBaseBet = document.getElementById('display-base-bet');
const dashboardTbody = document.getElementById('dashboard-tbody');
const dashboardFightsGrid = document.getElementById('dashboard-fights-grid');
const voteParticipantSelect = document.getElementById('vote-participant');
const votingFightsContainer = document.getElementById('voting-fights-container');
const adminFightsList = document.getElementById('admin-fights-list');
const toastEl = document.getElementById('toast');

// Navigation logic removed since we use actual links now

// Toast notification
function showToast(msg, isError = false) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  if(isError) toastEl.classList.add('error');
  else toastEl.classList.remove('error');
  
  toastEl.classList.add('show');
  setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3000);
}

// Global API sync
async function loadState() {
  try {
    const res = await fetch(API_DATA_URL);
    state = await res.json();
    renderAll();
  } catch (error) {
    console.error('Error fetching state:', error);
    showToast('Error cargando datos', true);
  }
}

async function saveState(endpoint = API_ADMIN_URL) {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
    });
    
    if (res.status === 401) {
      showToast('No autorizado. Solo admins pueden hacer esto.', true);
      throw new Error('No autorizado');
    }
    
    if(!res.ok) throw new Error('Error saving state');
    
    const responseData = await res.json();
    state = responseData.data;
    renderAll();
  } catch (error) {
    console.error('Error saving state:', error);
    showToast('Error guardando datos', true);
    throw error;
  }
}

// Renderers
function renderAll() {
  // Update Header Base Bet
  if (displayBaseBet) {
    displayBaseBet.textContent = `Q${state.settings.baseBet}`;
  }
  
  // Conditionally render based on page
  if (document.getElementById('dashboard')) {
    renderDashboardTable();
    renderDashboardFights();
  }

  if (document.getElementById('votos')) {
    renderVoteParticipants();
    renderVoteFights();
  }

  if (document.getElementById('admin')) {
    const adminBetInput = document.getElementById('admin-base-bet');
    if (adminBetInput && document.activeElement !== adminBetInput) {
      adminBetInput.value = state.settings.baseBet;
    }
    renderAdminFights();
  }
}

function renderDashboardTable() {
  if (!dashboardTbody) return;
  dashboardTbody.innerHTML = '';
  // Sort by points DESC, then Net Balance DESC
  const sortedParticipants = [...state.participants].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.netBalance - a.netBalance;
  });

  sortedParticipants.forEach((p, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="pos-${idx + 1}">${idx + 1}</td>
      <td><strong>${p.name}</strong></td>
      <td>${p.points || 0}</td>
      <td>Q${p.totalPaid || 0}</td>
      <td>Q${p.totalWon || 0}</td>
      <td class="${(p.netBalance || 0) >= 0 ? 'positive-bal' : 'negative-bal'}">
        <strong>Q${p.netBalance || 0}</strong>
      </td>
    `;
    dashboardTbody.appendChild(tr);
  });
}

function renderDashboardFights() {
  if (!dashboardFightsGrid) return;
  dashboardFightsGrid.innerHTML = '';
  state.fights.forEach(f => {
    const isClosed = f.status === 'closed';
    const card = document.createElement('div');
    card.className = `fight-card ${isClosed ? 'closed' : ''}`;
    
    let winnerText = '';
    if (isClosed) {
      if (f.winner === 'empate') winnerText = 'EMPATE';
      else winnerText = f.winner === 'A' ? `GANADOR: ${f.fighterA}` : `GANADOR: ${f.fighterB}`;
      if (f.reason) winnerText += ` (${f.reason})`;
    }

    card.innerHTML = `
      <div class="status-badge ${isClosed ? 'status-closed' : 'status-pending'}">
        ${isClosed ? 'CERRADA' : 'PENDIENTE'}
      </div>
      <div class="fighter-names">
        <span class="fighter-a">${f.fighterA}</span>
        <span style="font-size: 1rem; color: #777;">VS</span>
        <span class="fighter-b">${f.fighterB}</span>
      </div>
      ${isClosed ? `<p style="color:var(--success); font-weight:bold; margin-top:10px;">🏆 ${winnerText}</p>` : ''}
    `;
    dashboardFightsGrid.appendChild(card);
  });
}

function renderVoteParticipants() {
  if (!voteParticipantSelect) return;
  const currentVal = voteParticipantSelect.value;
  voteParticipantSelect.innerHTML = '<option value="">Selecciona tu usuario...</option>';
  state.participants.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    voteParticipantSelect.appendChild(opt);
  });
  if (state.participants.some(p => p.id === currentVal)) {
    voteParticipantSelect.value = currentVal;
  }
}

function renderVoteFights() {
  if (!votingFightsContainer || !voteParticipantSelect) return;
  votingFightsContainer.innerHTML = '';
  const participantId = voteParticipantSelect.value;
  if (!participantId) {
    votingFightsContainer.innerHTML = '<p style="color:var(--text-muted);">Selecciona tu usuario arriba para ver y hacer tus predicciones.</p>';
    return;
  }

  const pendingFights = state.fights.filter(f => f.status === 'pending');
  if (pendingFights.length === 0) {
    votingFightsContainer.innerHTML = '<p style="color:var(--success);">No hay peleas pendientes de predicción.</p>';
    return;
  }

  pendingFights.forEach(f => {
    // Buscar si ya tiene predicción
    const existingPred = state.predictions.find(p => p.fightId === f.id && p.participantId === participantId);
    
    const card = document.createElement('div');
    card.className = 'vote-card';
    card.innerHTML = `
      <div class="fight-title">
        <span style="color:#ff6b6b">${f.fighterA}</span> VS <span style="color:#4ecdc4">${f.fighterB}</span>
      </div>
      <div class="vote-controls">
        <select id="vote-winner-${f.id}">
          <option value="">Ganador...</option>
          <option value="A">${f.fighterA}</option>
          <option value="B">${f.fighterB}</option>
          <option value="empate">Empate</option>
        </select>
        <select id="vote-reason-${f.id}">
          <option value="">Razón...</option>
          <option value="KO">KO</option>
          <option value="TKO">TKO</option>
          <option value="Puntos">Por Puntos</option>
        </select>
        <button class="btn btn-secondary btn-save-vote" data-fight-id="${f.id}">Guardar</button>
      </div>
    `;
    votingFightsContainer.appendChild(card);

    if (existingPred) {
      const winnerSel = document.getElementById(`vote-winner-${f.id}`);
      const reasonSel = document.getElementById(`vote-reason-${f.id}`);
      if(winnerSel) winnerSel.value = existingPred.winner || '';
      if(reasonSel) reasonSel.value = existingPred.reason || '';
    }
  });

  // Attach events
  document.querySelectorAll('.btn-save-vote').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const fightId = e.currentTarget.getAttribute('data-fight-id');
      const winner = document.getElementById(`vote-winner-${fightId}`).value;
      const reason = document.getElementById(`vote-reason-${fightId}`).value;
      
      if (!winner || !reason) {
        showToast('Selecciona ganador y razón', true);
        return;
      }

      await loadState(); // Ensure we have latest before mutating
      const pId = voteParticipantSelect.value;
      
      // Remove previous if exists
      state.predictions = state.predictions.filter(p => !(p.fightId === fightId && p.participantId === pId));
      
      state.predictions.push({
        participantId: pId,
        fightId: fightId,
        winner: winner,
        reason: reason
      });

      try {
        await saveState(API_VOTE_URL);
        showToast('Predicción guardada!');
      } catch (err) {}
    });
  });
}

if (voteParticipantSelect) {
  voteParticipantSelect.addEventListener('change', renderVoteFights);
}

function renderAdminFights() {
  if (!adminFightsList) return;
  adminFightsList.innerHTML = '';
  const pendingFights = state.fights.filter(f => f.status === 'pending');
  
  if (pendingFights.length === 0) {
    adminFightsList.innerHTML = '<p style="color:var(--text-muted);">No hay peleas pendientes para cerrar.</p>';
    return;
  }

  pendingFights.forEach(f => {
    const item = document.createElement('div');
    item.className = 'admin-fight-item';
    item.innerHTML = `
      <div style="font-weight:bold; font-size:1.1rem; flex:1;">
        <span style="color:#ff6b6b">${f.fighterA}</span> vs <span style="color:#4ecdc4">${f.fighterB}</span>
      </div>
      <div style="display:flex; gap:10px; flex:2;">
        <select id="close-winner-${f.id}" class="w-50">
          <option value="">¿Quién ganó?</option>
          <option value="A">${f.fighterA}</option>
          <option value="B">${f.fighterB}</option>
          <option value="empate">Empate</option>
        </select>
        <select id="close-reason-${f.id}" class="w-50">
          <option value="">¿Cómo?</option>
          <option value="KO">KO</option>
          <option value="TKO">TKO</option>
          <option value="Puntos">Por Puntos</option>
        </select>
        <button class="btn btn-danger btn-close-fight" data-fight-id="${f.id}">Cerrar</button>
      </div>
    `;
    adminFightsList.appendChild(item);
  });

  document.querySelectorAll('.btn-close-fight').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const fightId = e.currentTarget.getAttribute('data-fight-id');
      const winner = document.getElementById(`close-winner-${fightId}`).value;
      const reason = document.getElementById(`close-reason-${fightId}`).value;
      
      if (!winner || !reason) {
        showToast('Debes seleccionar el ganador y cómo ganó', true);
        return;
      }
      
      if(confirm('¿Seguro que quieres cerrar esta pelea? Esto calculará los saldos de forma permanente.')) {
        await loadState();
        const fightIndex = state.fights.findIndex(f => f.id === fightId);
        if (fightIndex !== -1) {
          state.fights[fightIndex].status = 'closed';
          state.fights[fightIndex].winner = winner;
          state.fights[fightIndex].reason = reason;
          
          try {
            await saveState(API_ADMIN_URL);
            showToast('Pelea cerrada y saldos calculados!');
          } catch(err) {}
        }
      }
    });
  });
}

// Admin form submits
const formSettings = document.getElementById('form-settings');
if (formSettings) {
  formSettings.addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = parseInt(document.getElementById('admin-base-bet').value);
    if (val > 0) {
      await loadState();
      state.settings.baseBet = val;
      try {
        await saveState(API_ADMIN_URL);
        showToast('Configuración actualizada');
      } catch(err){}
    }
  });
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

const formParticipant = document.getElementById('form-participant');
if (formParticipant) {
  formParticipant.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('admin-participant-name');
    const name = input.value.trim();
    if (name) {
      await loadState();
      state.participants.push({
        id: "p_" + generateId(),
        name: name,
        points: 0,
        totalPaid: 0,
        totalWon: 0,
        netBalance: 0
      });
      try {
        await saveState(API_ADMIN_URL);
        input.value = '';
        showToast('Participante agregado');
      } catch(err){}
    }
  });
}

const formFight = document.getElementById('form-fight');
if (formFight) {
  formFight.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fa = document.getElementById('admin-fighter-a').value.trim();
    const fb = document.getElementById('admin-fighter-b').value.trim();
    if (fa && fb) {
      await loadState();
      state.fights.push({
        id: "f_" + generateId(),
        fighterA: fa,
        fighterB: fb,
        status: 'pending',
        winner: null,
        reason: null
      });
      try {
        await saveState(API_ADMIN_URL);
        document.getElementById('admin-fighter-a').value = '';
        document.getElementById('admin-fighter-b').value = '';
        showToast('Pelea agregada');
      } catch(err){}
    }
  });
}

// Init
document.addEventListener('DOMContentLoaded', loadState);
