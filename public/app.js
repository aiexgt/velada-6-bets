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
const votingFightsContainer = document.getElementById('voting-fights-container');
const adminFightsList = document.getElementById('admin-fights-list');
const adminParticipantsList = document.getElementById('admin-participants-list');
const toastEl = document.getElementById('toast');

let myToken = new URLSearchParams(window.location.search).get('token');
let myParticipantId = null;

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
    let endpoint = API_DATA_URL;
    if (document.getElementById('admin')) {
      endpoint = API_ADMIN_URL; // We fetch full state
    }
    
    // Si estamos en votos, primero validamos el token
    if (document.getElementById('votos')) {
      if (!myToken) {
        throw new Error('NoToken');
      }
      const meRes = await fetch(`/api/me?token=${myToken}`);
      if (!meRes.ok) throw new Error('InvalidToken');
      const meData = await meRes.json();
      myParticipantId = meData.id;
      
      // We will render my title
      const pTitle = document.createElement('h2');
      pTitle.style.color = "var(--success)";
      pTitle.textContent = `Votando como: ${meData.name}`;
      const header = document.querySelector('#votos header');
      if(header && !header.querySelector('h2')) header.appendChild(pTitle);
    }

    const res = await fetch(endpoint);
    state = await res.json();
    renderAll();
  } catch (error) {
    if (error.message === 'NoToken' || error.message === 'InvalidToken') {
      if (votingFightsContainer) {
        votingFightsContainer.innerHTML = '<div class="glass-panel"><h3 style="color:var(--accent-red)">Acceso Denegado</h3><p>Necesitas usar tu Enlace Mágico personal para votar.</p></div>';
      }
      return;
    }
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
    // Ya no renderizamos el select de participantes
    const voteFormPanel = document.querySelector('.form-panel');
    if (voteFormPanel) voteFormPanel.style.display = 'none';
    renderVoteFights();
  }

  if (document.getElementById('admin')) {
    const adminBetInput = document.getElementById('admin-base-bet');
    const adminVotingEnabled = document.getElementById('admin-voting-enabled');
    if (adminBetInput && document.activeElement !== adminBetInput) {
      adminBetInput.value = state.settings.baseBet;
    }
    if (adminVotingEnabled && document.activeElement !== adminVotingEnabled) {
      adminVotingEnabled.checked = state.settings.votingEnabled !== false;
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
      winnerText = f.winner === 'A' ? `GANADOR: ${f.fighterA}` : `GANADOR: ${f.fighterB}`;
      if (f.reason) winnerText += ` (${f.reason})`;
    }

    const cardCover = f.imgFight ? `<div class="fight-card-cover" style="background-image: url('${f.imgFight}');"></div>` : '';

    const votesA = state.predictions.filter(p => p.fightId === f.id && p.winner === 'A').length;
    const votesB = state.predictions.filter(p => p.fightId === f.id && p.winner === 'B').length;
    const totalVotes = votesA + votesB;

    let oddsHtml = '';
    if (totalVotes > 0 && !isClosed) {
      oddsHtml = `
        <div class="odds-container" style="display:flex; justify-content:space-between; align-items:center; font-weight:bold; font-size:0.75rem;">
          <span style="color:#ff6b6b;">${votesA} VOTOS</span>
          <span style="color:#4ecdc4;">${votesB} VOTOS</span>
        </div>
      `;
    }

    card.innerHTML = `
      ${cardCover}
      <div class="status-badge ${isClosed ? 'status-closed' : 'status-pending'}">
        ${isClosed ? 'CERRADA' : 'PENDIENTE'}
      </div>
      <div class="fighter-names">
        <span class="fighter-a">${f.fighterA}</span>
        <span style="font-size: 1rem; color: #777; align-self: center;">VS</span>
        <span class="fighter-b">${f.fighterB}</span>
      </div>
      ${oddsHtml}
      ${isClosed ? `<p style="color:var(--success); font-weight:bold; margin-top:10px;">🏆 ${winnerText}</p>` : ''}
    `;
    dashboardFightsGrid.appendChild(card);
  });
}

function renderVoteFights() {
  if (!votingFightsContainer || !myParticipantId) return;
  votingFightsContainer.innerHTML = '';

  const isVotingOpen = state.settings.votingEnabled !== false;
  if (!isVotingOpen) {
    const msg = document.createElement('div');
    msg.style.padding = '15px';
    msg.style.background = 'rgba(255,107,107,0.1)';
    msg.style.color = 'var(--accent-red)';
    msg.style.border = '1px solid var(--accent-red)';
    msg.style.borderRadius = '8px';
    msg.style.textAlign = 'center';
    msg.style.marginBottom = '20px';
    msg.innerHTML = '<strong>🔒 Votaciones Cerradas</strong><br>El administrador ha bloqueado la edición o creación de predicciones.';
    votingFightsContainer.appendChild(msg);
  }

  const pendingFights = state.fights.filter(f => f.status === 'pending');
  if (pendingFights.length === 0) {
    votingFightsContainer.innerHTML = '<p style="color:var(--success);">No hay peleas pendientes de predicción.</p>';
    return;
  }

  pendingFights.forEach(f => {
    // Buscar si ya tiene predicción
    const existingPred = state.predictions.find(p => p.fightId === f.id && p.participantId === myParticipantId);
    
    const card = document.createElement('div');
    card.className = 'vote-card';
    const cardCover = f.imgFight ? `<div class="fight-card-cover" style="background-image: url('${f.imgFight}');"></div>` : '';

    card.innerHTML = `
      ${cardCover}
      <div class="fighter-names">
        <span class="fighter-a">${f.fighterA}</span>
        <span style="font-size: 1rem; color: #777; align-self: center;">VS</span>
        <span class="fighter-b">${f.fighterB}</span>
      </div>
      <div class="vote-controls">
        <select id="vote-winner-${f.id}" ${!isVotingOpen ? 'disabled' : ''}>
          <option value="">Ganador...</option>
          <option value="A">${f.fighterA}</option>
          <option value="B">${f.fighterB}</option>
        </select>
        <select id="vote-reason-${f.id}" ${!isVotingOpen ? 'disabled' : ''}>
          <option value="">Razón...</option>
          <option value="KO">KO</option>
          <option value="TKO">TKO</option>
          <option value="Puntos">Por Puntos</option>
        </select>
        <button class="btn btn-secondary btn-save-vote" data-fight-id="${f.id}" ${!isVotingOpen ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
          ${isVotingOpen ? 'Guardar' : 'Cerrado'}
        </button>
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

      const backupState = JSON.parse(JSON.stringify(state)); // Backup in case of error
      
      // Remove previous if exists, just for local optimistic update
      state.predictions = state.predictions.filter(p => !(p.fightId === fightId && p.participantId === myParticipantId));
      state.predictions.push({
        participantId: myParticipantId,
        fightId: fightId,
        winner: winner,
        reason: reason
      });

      try {
        const payload = {
          token: myToken,
          participantId: myParticipantId,
          predictions: state.predictions.filter(p => p.participantId === myParticipantId)
        };
        const res = await fetch(API_VOTE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Error saving');
        const rData = await res.json();
        state = rData.data; // Re-sync local state
        
        // Feedback visual en el botón
        const originalText = btn.textContent;
        btn.textContent = '¡Guardado!';
        btn.classList.add('btn-success');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('btn-success');
        }, 2500);
        
        showToast('Predicción guardada!');
      } catch (err) {
        state = backupState; // Rollback
        showToast('Error al guardar tu voto', true);
      }
    });
  });
}

function renderAdminFights() {
  if (adminParticipantsList) {
    adminParticipantsList.innerHTML = '';
    if (state.participants.length === 0) {
      adminParticipantsList.innerHTML = '<p style="color:var(--text-muted);">No hay participantes aún.</p>';
    } else {
      const baseUrl = window.location.origin + '/votos.html?token=';
      state.participants.forEach(p => {
        const item = document.createElement('div');
        item.style.padding = '10px';
        item.style.borderBottom = '1px solid var(--border-glass)';
        item.innerHTML = `
          <strong>${p.name}:</strong> 
          <input type="text" readonly value="${baseUrl}${p.token}" style="width:70%; margin-left:10px; font-size:0.85rem;" onclick="this.select(); document.execCommand('copy'); showToast('Enlace copiado!')">
        `;
        adminParticipantsList.appendChild(item);
      });
    }
  }

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
    const votingEnabled = document.getElementById('admin-voting-enabled').checked;
    if (val > 0) {
      await loadState();
      state.settings.baseBet = val;
      state.settings.votingEnabled = votingEnabled;
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
        token: "t_" + generateId() + generateId(),
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
    const imgFight = document.getElementById('admin-img-fight') ? document.getElementById('admin-img-fight').value.trim() : null;

    if (fa && fb) {
      await loadState();
      state.fights.push({
        id: "f_" + generateId(),
        fighterA: fa,
        fighterB: fb,
        imgFight: imgFight,
        status: 'pending',
        winner: null,
        reason: null
      });
      try {
        await saveState(API_ADMIN_URL);
        document.getElementById('admin-fighter-a').value = '';
        document.getElementById('admin-fighter-b').value = '';
        if(document.getElementById('admin-img-fight')) document.getElementById('admin-img-fight').value = '';
        showToast('Pelea agregada');
      } catch(err){}
    }
  });
}

// Init
document.addEventListener('DOMContentLoaded', loadState);
