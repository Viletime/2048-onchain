// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Game2048
 * @notice Registra movimentos e scores do jogo 2048 on-chain na rede Base.
 *         Usa session keys com duração de 2 horas para evitar popup
 *         de confirmação a cada movimento.
 */
contract Game2048 {

    uint256 public constant SESSION_DURATION = 2 hours;

    struct Session {
        bool     active;
        uint256  expiresAt;
        uint256  moveCount;
        uint256  highScore;
    }

    // player => sessão atual
    mapping(address => Session) public sessions;

    // player => histórico de scores finais
    mapping(address => uint256[]) public scoreHistory;

    // lista de jogadores únicos
    address[] public players;
    mapping(address => bool) public registered;

    // ── Eventos ───────────────────────────────────────────────
    event SessionStarted(address indexed player, uint256 expiresAt);
    event MovePlayed(address indexed player, uint8 direction, uint256 score, uint256 moveNumber);
    event GameOver(address indexed player, uint256 finalScore, uint256 totalMoves);
    event NewHighScore(address indexed player, uint256 score);

    // ── Funções ───────────────────────────────────────────────

    /**
     * @notice Inicia uma nova sessão de jogo (validade: 2 horas).
     *         Deve ser chamada antes de registrar movimentos.
     */
    function startSession() external {
        Session storage s = sessions[msg.sender];
        s.active    = true;
        s.expiresAt = block.timestamp + SESSION_DURATION;
        s.moveCount = 0;

        if (!registered[msg.sender]) {
            registered[msg.sender] = true;
            players.push(msg.sender);
        }

        emit SessionStarted(msg.sender, s.expiresAt);
    }

    /**
     * @notice Registra um movimento on-chain.
     * @param direction 0=cima 1=baixo 2=esquerda 3=direita
     * @param score     Score atual do jogador
     */
    function recordMove(uint8 direction, uint256 score) external {
        Session storage s = sessions[msg.sender];
        require(s.active,                       "Game2048: sem sessao ativa");
        require(block.timestamp < s.expiresAt,  "Game2048: sessao expirada");
        require(direction <= 3,                 "Game2048: direcao invalida");

        s.moveCount += 1;

        if (score > s.highScore) {
            s.highScore = score;
            emit NewHighScore(msg.sender, score);
        }

        emit MovePlayed(msg.sender, direction, score, s.moveCount);
    }

    /**
     * @notice Encerra o jogo e salva o score final no histórico.
     * @param finalScore Score final da partida
     */
    function endGame(uint256 finalScore) external {
        Session storage s = sessions[msg.sender];
        require(s.active, "Game2048: sem sessao ativa");

        s.active = false;
        scoreHistory[msg.sender].push(finalScore);

        emit GameOver(msg.sender, finalScore, s.moveCount);
    }

    // ── Views ─────────────────────────────────────────────────

    function getSession(address player) external view returns (
        bool    active,
        uint256 expiresAt,
        uint256 moveCount,
        uint256 highScore
    ) {
        Session storage s = sessions[player];
        return (s.active, s.expiresAt, s.moveCount, s.highScore);
    }

    function getScoreHistory(address player) external view returns (uint256[] memory) {
        return scoreHistory[player];
    }

    function getTotalPlayers() external view returns (uint256) {
        return players.length;
    }
}
