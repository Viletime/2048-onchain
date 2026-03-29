// ─── CONFIGURAÇÃO ─────────────────────────────────────────────
const CONTRACT_ADDRESS = "0x1Bb65fFc900E256Dc2F418Af83BA3e7472F251F8";

const CONTRACT_ABI = [
  "function startSession(address player) external",
  "function recordMove(address player, uint8 direction, uint256 score) external",
  "function endGame(address player, uint256 finalScore) external",
  "function getSession(address player) external view returns (bool active, uint256 expiresAt, uint256 moveCount, uint256 highScore)"
];

const BASE_CHAIN_ID = "0x2105";
const BASE_RPC      = "https://mainnet.base.org";

// ─── ESTADO ───────────────────────────────────────────────────
let mainProvider    = null;
let mainSigner      = null;
let sessionWallet   = null;
let sessionContract = null;
let walletAddress   = null;
let sessionActive   = false;
let sessionExpires  = 0;
let sessionTimer    = null;
let txQueue         = [];
let processingTx    = false;
let balanceChecker  = null;

// ─── CONECTAR WALLET ──────────────────────────────────────────
async function connectWallet() {
  if (!window.ethereum) {
    alert("Nenhuma wallet encontrada!\nInstale a Rabby ou MetaMask.");
    return;
  }
  try {
    await window.ethereum.request({ method: 'eth_requestAccounts' });

    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (chainId !== BASE_CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: BASE_CHAIN_ID }]
        });
      } catch {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: BASE_CHAIN_ID,
            chainName: 'Base',
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: [BASE_RPC],
            blockExplorerUrls: ['https://basescan.org']
          }]
        });
      }
    }

    mainProvider  = new ethers.BrowserProvider(window.ethereum);
    mainSigner    = await mainProvider.getSigner();
    walletAddress = await mainSigner.getAddress();

    loadOrCreateSessionWallet();
    updateWalletUI(true);

  } catch (e) {
    console.error("Erro ao conectar:", e);
  }
}

// ─── CRIAR / CARREGAR SESSION WALLET ─────────────────────────
function loadOrCreateSessionWallet() {
  const key          = 'sw_' + walletAddress;
  const saved        = localStorage.getItem(key);
  const baseProvider = new ethers.JsonRpcProvider(BASE_RPC);

  if (saved) {
    sessionWallet = new ethers.Wallet(saved, baseProvider);
  } else {
    sessionWallet = ethers.Wallet.createRandom().connect(baseProvider);
    localStorage.setItem(key, sessionWallet.privateKey);
  }

  sessionContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, sessionWallet);

  showDepositPanel();
  checkBalanceLoop();
}

// ─── PAINEL DE DEPÓSITO ───────────────────────────────────────
function showDepositPanel() {
  const addr     = sessionWallet.address;
  const panel    = document.getElementById('deposit-panel');
  const addrFull = document.getElementById('session-addr-full');
  if (panel)    panel.style.display = 'block';
  if (addrFull) addrFull.value = addr;
}

function copySessionAddress() {
  const addr = sessionWallet.address;
  navigator.clipboard.writeText(addr).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = 'COPIADO ✓';
    setTimeout(() => btn.textContent = 'COPIAR', 2000);
  });
}

// ─── VERIFICAÇÃO DE SALDO EM LOOP ────────────────────────────
async function checkBalanceLoop() {
  if (balanceChecker) clearInterval(balanceChecker);

  const check = async () => {
    if (!sessionWallet) return;
    try {
      const baseProvider = new ethers.JsonRpcProvider(BASE_RPC);
      const balance      = await baseProvider.getBalance(sessionWallet.address);
      const eth          = parseFloat(ethers.formatEther(balance));

      updateBalanceUI(eth);

      if (eth >= 0.00003) {
        clearInterval(balanceChecker);
        document.getElementById('deposit-panel').style.display = 'none';
        document.getElementById('session-btn').disabled = false;
        document.getElementById('dot').className = 'status-dot connected';

        const baseProvider2 = new ethers.JsonRpcProvider(BASE_RPC);
        sessionWallet   = new ethers.Wallet(sessionWallet.privateKey, baseProvider2);
        sessionContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, sessionWallet);
        console.log("sessionContract criado:", sessionContract.target);
        checkExistingSession();
      }
    } catch (e) { console.error(e); }
  };

  await check();
  balanceChecker = setInterval(check, 5000);
}

function updateBalanceUI(eth) {
  const el = document.getElementById('session-balance');
  if (!el) return;
  if (eth < 0.0001) {
    el.textContent = 'Aguardando depósito...';
    el.style.color = 'var(--muted)';
  } else {
    el.textContent = `✓ Saldo: ${eth.toFixed(5)} ETH`;
    el.style.color = '#34d399';
  }
}

// ─── SESSÃO ───────────────────────────────────────────────────
async function checkExistingSession() {
  if (!sessionContract || !walletAddress) return;
  try {
    const s   = await sessionContract.getSession(walletAddress);
    const now = Math.floor(Date.now() / 1000);
    if (s.active && Number(s.expiresAt) > now) {
      sessionActive  = true;
      sessionExpires = Number(s.expiresAt);
      updateSessionUI();
    }
  } catch (e) { console.error(e); }
}

async function startSession() {
  if (!sessionWallet || !sessionContract) return;
  const btn = document.getElementById('session-btn');
  btn.disabled = true; btn.textContent = 'INICIANDO...';
  try {
    const tx = await sessionContract.startSession(walletAddress);
    addTxLog('🔑', 'Sessão iniciada', null, true);
    await tx.wait();
    updateLastTxLog(tx.hash);
    sessionActive  = true;
    sessionExpires = Math.floor(Date.now() / 1000) + 7200;
    updateSessionUI();
    restartGame();
  } catch (e) {
    console.error(e);
    btn.disabled = false; btn.textContent = 'INICIAR SESSÃO';
  }
}

async function endGame() {
  if (!sessionContract || !sessionActive) return;
  try {
    const tx = await sessionContract.endGame(walletAddress, score);
    addTxLog('🏁', `Game over — score ${score}`, null, true);
    await tx.wait();
    updateLastTxLog(tx.hash);
    sessionActive = false;
    clearInterval(sessionTimer);
    document.getElementById('session-info').classList.remove('visible');
    document.getElementById('session-btn').disabled    = false;
    document.getElementById('session-btn').textContent = 'NOVA SESSÃO';
    document.getElementById('dot').className = 'status-dot connected';
  } catch (e) { console.error(e); }
}

// ─── SACAR ETH DA SESSION WALLET ─────────────────────────────
async function withdrawSessionFunds() {
  if (!sessionWallet || !walletAddress) return;
  try {
    const baseProvider = new ethers.JsonRpcProvider(BASE_RPC);
    const balance      = await baseProvider.getBalance(sessionWallet.address);
    if (balance === 0n) { alert("Session wallet sem saldo."); return; }
    const gasPrice   = (await baseProvider.getFeeData()).gasPrice;
    const gasCost    = gasPrice * 21000n;
    const sendAmount = balance - gasCost;
    if (sendAmount <= 0n) { alert("Saldo insuficiente para o gas do saque."); return; }
    const tx = await sessionWallet.sendTransaction({
      to: walletAddress, value: sendAmount, gasLimit: 21000n
    });
    addTxLog('💸', 'Saque da session wallet', null, true);
    await tx.wait();
    updateLastTxLog(tx.hash);
    alert("ETH sacado para sua wallet principal!");
  } catch (e) { console.error(e); }
}

// ─── FILA DE MOVIMENTOS (sem popup!) ─────────────────────────
async function queueMove(direction) {
  if (txQueue.length >= 3) return;
  txQueue.push(direction);
  if (!processingTx) processQueue();
}

async function processQueue() {
  if (txQueue.length === 0) { processingTx = false; return; }
  processingTx  = true;
  const dir     = txQueue.shift();
  const dirIcon = ['↑','↓','←','→'][dir];
  const idx     = addTxLog(dirIcon, `Move ${dirIcon} — score ${score}`, null, true);
  try {
    const tx = await sessionContract.recordMove(walletAddress, dir, score);
    updateTxLogEntry(idx, tx.hash);
  } catch (e) { console.error("Erro na txn:", e); }
  processQueue();
}

// ─── UI ───────────────────────────────────────────────────────
function updateWalletUI(connected) {
  if (!connected) return;
  const dot        = document.getElementById('dot');
  const statusText = document.getElementById('status-text');
  const connectBtn = document.getElementById('connect-btn');
  dot.className    = 'status-dot connected';
  const short      = walletAddress.slice(0,6) + '...' + walletAddress.slice(-4);
  statusText.innerHTML   = `Conectado: <strong>${short}</strong>`;
  connectBtn.textContent = 'CONECTADO';
  connectBtn.disabled    = true;
}

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
      document.getElementById('session-btn').disabled    = false;
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
  const item     = document.createElement('div');
  item.className = 'tx-item';
  item.innerHTML = `
    <div class="dir">${icon}</div>
    <span>${label}</span>
    ${pending ? '<span class="pending">enviando...</span>' : `<a href="https://basescan.org/tx/${hash}" target="_blank">ver →</a>`}
  `;
  list.prepend(item);
  const idx = txEntries.length;
  txEntries.push(item);
  return idx;
}

function updateLastTxLog(hash) {
  const pending = document.getElementById('tx-list').querySelector('.pending');
  if (!pending) return;
  const a = document.createElement('a');
  a.href = `https://basescan.org/tx/${hash}`; a.target = '_blank'; a.textContent = 'ver →';
  pending.replaceWith(a);
}

function updateTxLogEntry(idx, hash) {
  const item = txEntries[idx];
  if (!item) return;
  const pending = item.querySelector('.pending');
  if (!pending) return;
  const a = document.createElement('a');
  a.href = `https://basescan.org/tx/${hash}`; a.target = '_blank'; a.textContent = 'ver →';
  pending.replaceWith(a);
}
