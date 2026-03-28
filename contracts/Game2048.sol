// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Game2048
 * @notice Jogo 2048 on-chain na rede Base.
 *         Usa session wallet para assinar movimentos sem popup.
 *         O score e histórico ficam salvos na wallet principal do jogador.
 */
contract Game2048 {

    uint256 public constant SESSION_DURATION = 2 hours;

    struct Session {
        bool     active;
        uint256  expiresAt;
        uint256  moveCount;
        uint256  highScore;
        address  sessionWallet; // wallet autorizada a assinar movimentos
    }

    mapping(address => Session)   public sessions;
    mapping(address => uint256[]) public scoreHistory;
    address[] public players;
    mapping(address => bool) public registered;

    event SessionStarted(address indexed player, address sessionWallet, uint256 expiresAt);
    event MovePlayed(address indexed player, uint8 direction, uint256 score, uint256 moveNumber);
    event GameOver(address indexed player, uint256 finalScore, uint256 totalMoves);
    event NewHighScore(address indexed player, uint256 score);

    /**
     * @notice Inicia sessão. Chamado pela session wallet passando o endereço principal.
     * @param player Endereço da wallet principal do jogador
     */
    function startSession(address player) external {
        Session storage s = sessions[player];
        s.active        = true;
        s.expiresAt     = block.timestamp + SESSION_DURATION;
        s.moveCount     = 0;
        s.sessionWallet = msg.sender; // salva a session wallet autorizada

        if (!registered[player]) {
            registered[player] = true;
            players.push(player);
        }

        emit SessionStarted(player, msg.sender, s.expiresAt);
    }

    /**
     * @notice Registra um movimento. Chamado pela session wallet.
     * @param player    Endereço da wallet principal
     * @param direction 0=cima 1=baixo 2=esquerda 3=direita
     * @param score     Score atual
     */
    function recordMove(address player, uint8 direction, uint256 score) external {
        Session storage s = sessions[player];
        require(s.active,                       "Game2048: sem sessao ativa");
        require(block.timestamp < s.expiresAt,  "Game2048: sessao expirada");
        require(s.sessionWallet == msg.sender,  "Game2048: wallet nao autorizada");
        require(direction <= 3,                 "Game2048: direcao invalida");

        s.moveCount += 1;

        if (score > s.highScore) {
            s.highScore = score;
            emit NewHighScore(player, score);
        }

        emit MovePlayed(player, direction, score, s.moveCount);
    }

    /**
     * @notice Encerra o jogo e salva o score final.
     * @param player     Endereço da wallet principal
     * @param finalScore Score final
     */
    function endGame(address player, uint256 finalScore) external {
        Session storage s = sessions[player];
        require(s.active,                      "Game2048: sem sessao ativa");
        require(s.sessionWallet == msg.sender, "Game2048: wallet nao autorizada");

        s.active = false;
        scoreHistory[player].push(finalScore);

        emit GameOver(player, finalScore, s.moveCount);
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
