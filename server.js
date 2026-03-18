require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());

// Basic Auth Middleware para Admin
const basicAuth = (req, res, next) => {
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
  
  const expectedUser = process.env.ADMIN_USER || 'admin';
  const expectedPass = process.env.ADMIN_PASS || 'admin123';

  if (login === expectedUser && password === expectedPass) {
    return next();
  }
  
  res.set('WWW-Authenticate', 'Basic realm="401"');
  res.status(401).send('Se requiere autenticación para acceder al área de administración.');
};

// Proteger archivos y rutas de admin
app.use('/admin.html', basicAuth);
app.use('/api/admin', basicAuth);

app.use(express.static('public'));

// Función central para calcular el estado
function calculateState(baseState, incomingPredictions) {
  const baseBet = baseState.settings ? (baseState.settings.baseBet || 10) : 10;
  
  const participantsMap = {};
  baseState.participants.forEach(p => {
    participantsMap[p.id] = {
      ...p,
      points: 0,
      totalPaid: 0,
      totalWon: 0,
      netBalance: 0
    };
  });

  const fightsMap = {};
  baseState.fights.forEach(f => {
    fightsMap[f.id] = f;
  });

  incomingPredictions.forEach(pred => {
    const participant = participantsMap[pred.participantId];
    const fight = fightsMap[pred.fightId];

    if (!participant || !fight) return;

    participant.totalPaid += baseBet;

    if (fight.status === 'closed' && fight.winner) {
      if (pred.winner === fight.winner) {
        if (fight.reason && pred.reason === fight.reason) {
          participant.points += 2;
          participant.totalWon += (baseBet * 2);
        } else {
          participant.points += 1;
          participant.totalWon += baseBet;
        }
      }
    }
    
    participant.netBalance = participant.totalWon - participant.totalPaid;
  });

  return {
    settings: baseState.settings,
    participants: Object.values(participantsMap),
    fights: baseState.fights,
    predictions: incomingPredictions
  };
}

// Modificar para asegurar que los participantes iniciales tengan token si no lo tienen
if (fs.existsSync(DATA_FILE)) {
  let initialData = JSON.parse(fs.readFileSync(DATA_FILE));
  let modified = false;
  initialData.participants.forEach(p => {
    if (!p.token) {
      p.token = "t_" + Math.random().toString(36).substr(2, 9);
      modified = true;
    }
  });
  if (modified) fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
}

// Leer estado general (Público) - SE OCULTAN LOS TOKENS
app.get('/api/data', (req, res) => {
  fs.readFile(DATA_FILE, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Error del servidor' });
    const state = JSON.parse(data);
    state.participants.forEach(p => delete p.token); // Strip tokens
    res.json(state);
  });
});

// Leer datos completos (Admin protegido)
app.get('/api/admin/data', basicAuth, (req, res) => {
  fs.readFile(DATA_FILE, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Error del servidor' });
    res.json(JSON.parse(data));
  });
});

// Obtener info del usuario actual basado en el token
app.get('/api/me', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({error: 'Falta token'});
  fs.readFile(DATA_FILE, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Error del servidor' });
    const state = JSON.parse(data);
    const participant = state.participants.find(p => p.token === token);
    if (!participant) return res.status(404).json({error: 'Token inválido o expirado'});
    
    // Le enviamos su info sin exponer los demás
    res.json(participant);
  });
});

// Endpoint público/privado para enviar Votos
app.post('/api/vote', (req, res) => {
  const token = req.body.token;
  const participantId = req.body.participantId;
  const incomingPredictions = req.body.predictions || [];
  
  if (!token || !participantId) return res.status(400).json({error: 'Datos incompletos'});

  fs.readFile(DATA_FILE, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Error leyendo datos base' });
    const serverState = JSON.parse(data);
    
    // Validación de seguridad estricta
    const participant = serverState.participants.find(p => p.id === participantId && p.token === token);
    if (!participant) return res.status(403).json({error: 'Acceso denegado. Token incorrecto.'});

    // Validar que no se estén enviando votos de otras personas de forma tramposa
    const validPredictions = incomingPredictions.filter(p => p.participantId === participantId);

    // Mantenemos las predicciones del resto intactas
    const otherPredictions = serverState.predictions.filter(p => p.participantId !== participantId);
    const updatedPredictions = [...otherPredictions, ...validPredictions];
    
    const validatedData = calculateState(serverState, updatedPredictions);
    fs.writeFile(DATA_FILE, JSON.stringify(validatedData, null, 2), (err) => {
      if (err) return res.status(500).json({ error: 'Error guardando votos' });
      // Remover tokens al responder
      validatedData.participants.forEach(p => delete p.token);
      res.json({ success: true, data: validatedData });
    });
  });
});

// Endpoint protegido para administrar el evento
app.post('/api/admin/data', (req, res) => {
  const incomingState = req.body;
  if (!incomingState.participants || !incomingState.fights || !incomingState.predictions) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  const incomingPredictions = incomingState.predictions || [];
  
  // El admin reescribe configuraciones, usuarios y peleas completas
  const serverStateToOverride = {
    settings: incomingState.settings || { baseBet: 10 },
    participants: incomingState.participants || [],
    fights: incomingState.fights || []
  };

  const validatedData = calculateState(serverStateToOverride, incomingPredictions);

  fs.writeFile(DATA_FILE, JSON.stringify(validatedData, null, 2), (err) => {
    if (err) {
      console.error('Error guardando data.json:', err);
      return res.status(500).json({ error: 'Error al guardar datos de admin' });
    }
    res.json({ success: true, data: validatedData });
  });
});

app.listen(PORT, () => {
  console.log(`Servidor de Porra de Boxeo iniciado en http://localhost:${PORT}`);
});
