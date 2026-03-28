// ─── CONFIGURAÇÃO DO CONTRATO ────────────────────────────────
// Após deployar o Game2048.sol na Base, cole o endereço aqui:
const CONTRACT_ADDRESS = "SEU_ENDEREÇO_AQUI";

const CONTRACT_ABI = [
  "function startSession() external",
  "function recordMove(uint8 direction, uint256 score) external",
  "function endGame(uint256 finalScore) external",
  "function getSession(address player) external view returns (bool active, uint256 expiresAt, uint256 moveCount, uint256 highScore)"
];

const BASE_CHAIN_ID = "0x2105"; // 8453 em hex

// ─── ESTADO DA WALLET ─────────────────────────────────────────
let provider    = null;
let signer      = null;
let contract    = null;
let walletAddress = null;
let sessionActive = false;
let sessionExpires = 0;
let sessionTimer  = null;

// ─── FILA DE TRANSAÇÕES ───────────────────────────────────────
// Evita problemas de nonce enviando uma txn por vez
let txQueue = [];
let processingTx = false;

// ─── CONECTAR WALLET ─────────────────────────────────────────
async function connectWallet() {
  if (!window.ethereum) {
    alert("MetaMask não encontrada!\nInstale em: https://metamask.io");
    return;
  }

  try {
    await window.ethereum.request({ method: 'eth_requestAccounts' });

    // Verificar e trocar para Base
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (chainId !== BASE_CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: BASE_CHAIN_ID }]
        });
      } catch {
        // Rede não adicionada ainda, adiciona automaticamente
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: BASE_CHAIN_ID,
            chainName: 'Base',
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://mainnet.base.org'],
            blockExplorerUrls: ['https://basescan.org']
          }]
        });
      }
    }

    provider      = new ethers.BrowserProvider(window.ethereum);
    signer        = await provider.getSigner();
    walletAddress = await signer.getAddress();

    if (CONTRACT_ADDRESS !== "SEU_ENDEREÇO_AQUI") {
      contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    }

    updateWalletUI(true);
    checkExistingSession();

  } catch (e) {
    console.error("Erro ao conectar wallet:", e);
  }
}

// ─── VERIFICAR SESSÃO EXISTENTE ───────────────────────────────
async function checkExistingSession() {
  if (!contract || !walletAddress) return;
  try {
    const s = await contract.getSession(walletAddress);
    const now = Math.floor(Date.now() / 1000);
    if (s.active && Number(s.expiresAt) > now) {
      sessionActive  = true;
      sessionExpires = Number(s.expiresAt);
      updateSessionUI();
    }
  } catch (e) {
    console.error("Erro ao verificar sessão:", e);
  }
}

// ─── INICIAR SESSÃO ───────────────────────────────────────────
async function startSession() {
  if (!contract) {
    alert("Configure o endereço do contrato em js/contract.js");
    return;
  }

  const btn = document.getElementById('session-btn');
  btn.disabled = true;
  btn.textContent = 'CONFIRMANDO...';

  try {
    const tx = await contract.startSession();
    addTxLog('🔑', 'Sessão iniciada', null, true);
    await tx.wait();
    updateLastTxLog(tx.hash);

    sessionActive  = true;
    sessionExpires = Math.floor(Date.now() / 1000) + 7200; // 2h
    updateSessionUI();
    restartGame();

  } catch (e) {
    console.error("Erro ao iniciar sessão:", e);
    btn.disabled  = false;
    btn.textContent = 'INICIAR SESSÃO';
  }
}

// ─── ENCERRAR JOGO ────────────────────────────────────────────
async function endGame() {
  if (!contract || !sessionActive) return;
  try {
    const tx = await contract.endGame(score);
    addTxLog('🏁', `Game over — score ${score}`, null, true);
    await tx.wait();
    updateLastTxLog(tx.hash);

    sessionActive = false;
    clearInterval(sessionTimer);
    document.getElementById('session-info').classList.remove('visible');
    document.getElementById('session-btn').disabled  = false;
    document.getElementById('session-btn').textContent = 'NOVA SESSÃO';
    document.getElementById('dot').className = 'status-dot connected';

  } catch (e) {
    console.error("Erro ao encerrar jogo:", e);
  }
}

// ─── FILA DE MOVIMENTOS ───────────────────────────────────────
async function queueMove(direction) {
  txQueue.push(direction);
  if (!processingTx) processQueue();
}

async function processQueue() {
  if (txQueue.length === 0) {
    processingTx = false;
    return;
  }
  processingTx = true;
  const dir = txQueue.shift();
  const dirIcon = ['↑','↓','←','→'][dir];

  const entryIdx = addTxLog(dirIcon, `Move ${dirIcon} — score ${score}`, null, true);

  try {
    const tx = await contract.recordMove(dir, score);
    updateTxLogEntry(entryIdx, tx.hash);
    await tx.wait();
  } catch (e) {
    console.error("Erro na txn de movimento:", e);
  }

  processQueue();
}

// ─── UI DA WALLET ─────────────────────────────────────────────
function updateWalletUI(connected) {
  const dot        = document.getElementById('dot');
  const statusText = document.getElementById('status-text');
  const connectBtn = document.getElementById('connect-btn');
  const sessionBtn = document.getElementById('session-btn');

  if (connected) {
    dot.className = 'status-dot connected';
    const short = walletAddress.slice(0,6) + '...' + walletAddress.slice(-4);
    statusText.innerHTML = `Conectado: <strong>${short}</strong>`;
    connectBtn.textContent = 'CONECTADO';
    connectBtn.disabled = true;

    if (CONTRACT_ADDRESS !== "SEU_ENDEREÇO_AQUI") {
      sessionBtn.disabled = false;
    } else {
      sessionBtn.textContent = 'CONFIGURE O CONTRATO';
    }
  }
}

// ─── UI DA SESSÃO ─────────────────────────────────────────────
function updateSessionUI() {
  document.getElementById('dot').className = 'status-dot session';
  document.getElementById('session-info').classList.add('visible');
  document.getElementById('session-btn').textContent = 'SESSÃO ATIVA';
  document.getElementById('session-btn').disabled    = true;

  if (sessionTimer) clearInterval(sessionTimer);

  sessionTimer = setInterval(() => {
    const now       = Math.floor(Date.now() / 1000);
    const remaining = sessionExpires - now;

    if (remaining <= 0) {
      clearInterval(sessionTimer);
      sessionActive = false;
      document.getElementById('session-info').classList.remove('visible');
      document.getElementById('session-timer').textContent = '00:00';
      document.getElementById('session-btn').disabled  = false;
      document.getElementById('session-btn').textContent = 'NOVA SESSÃO';
      return;
    }

    const m = String(Math.floor(remaining / 60)).padStart(2, '0');
    const s = String(remaining % 60).padStart(2, '0');
    document.getElementById('session-timer').textContent = `${m}:${s}`;
  }, 1000);
}

// ─── LOG DE TRANSAÇÕES ────────────────────────────────────────
let txEntries = [];

function addTxLog(icon, label, hash, pending) {
  const list  = document.getElementById('tx-list');
  const empty = list.querySelector('.tx-item.empty');
  if (empty) empty.remove();

  const item = document.createElement('div');
  item.className = 'tx-item';
  item.innerHTML = `
    <div class="dir">${icon}</div>
    <span>${label}</span>
    ${pending
      ? '<span class="pending">pendente...</span>'
      : `<a href="https://basescan.org/tx/${hash}" target="_blank">ver →</a>`
    }
  `;
  list.prepend(item);

  const idx = txEntries.length;
  txEntries.push(item);
  return idx;
}

function updateLastTxLog(hash) {
  const list    = document.getElementById('tx-list');
  const pending = list.querySelector('.pending');
  if (!pending) return;
  const a = document.createElement('a');
  a.href   = `https://basescan.org/tx/${hash}`;
  a.target = '_blank';
  a.textContent = 'ver →';
  pending.replaceWith(a);
}

function updateTxLogEntry(idx, hash) {
  const item = txEntries[idx];
  if (!item) return;
  const pending = item.querySelector('.pending');
  if (!pending) return;
  const a = document.createElement('a');
  a.href   = `https://basescan.org/tx/${hash}`;
  a.target = '_blank';
  a.textContent = 'ver →';
  pending.replaceWith(a);
}
