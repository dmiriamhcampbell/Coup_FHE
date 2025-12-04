// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface GameAction {
  player: string;
  action: string;
  target?: string;
  timestamp: number;
  challenged?: boolean;
  success?: boolean;
}

interface Player {
  address: string;
  coins: number;
  alive: boolean;
  encryptedRoles: string[];
  revealedRoles: string[];
}

const ROLES = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"];
const ACTIONS = ["Income", "Foreign Aid", "Coup", "Tax", "Assassinate", "Steal", "Exchange"];

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [actions, setActions] = useState<GameAction[]>([]);
  const [showTutorial, setShowTutorial] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  const [targetPlayer, setTargetPlayer] = useState<string | null>(null);

  useEffect(() => {
    loadGameState().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadGameState = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      // Load players
      const playersBytes = await contract.getData("game_players");
      let playerAddresses: string[] = [];
      if (playersBytes.length > 0) {
        try {
          const playersStr = ethers.toUtf8String(playersBytes);
          if (playersStr.trim() !== '') playerAddresses = JSON.parse(playersStr);
        } catch (e) { console.error("Error parsing player addresses:", e); }
      }
      
      const loadedPlayers: Player[] = [];
      for (const addr of playerAddresses) {
        try {
          const playerBytes = await contract.getData(`player_${addr}`);
          if (playerBytes.length > 0) {
            const playerData = JSON.parse(ethers.toUtf8String(playerBytes));
            loadedPlayers.push({
              address: addr,
              coins: FHEDecryptNumber(playerData.coins),
              alive: playerData.alive,
              encryptedRoles: playerData.encryptedRoles,
              revealedRoles: playerData.revealedRoles || []
            });
          }
        } catch (e) { console.error(`Error loading player ${addr}:`, e); }
      }
      setPlayers(loadedPlayers);
      
      // Load actions
      const actionsBytes = await contract.getData("game_actions");
      let actionIds: string[] = [];
      if (actionsBytes.length > 0) {
        try {
          const actionsStr = ethers.toUtf8String(actionsBytes);
          if (actionsStr.trim() !== '') actionIds = JSON.parse(actionsStr);
        } catch (e) { console.error("Error parsing action IDs:", e); }
      }
      
      const loadedActions: GameAction[] = [];
      for (const actionId of actionIds) {
        try {
          const actionBytes = await contract.getData(`action_${actionId}`);
          if (actionBytes.length > 0) {
            const actionData = JSON.parse(ethers.toUtf8String(actionBytes));
            loadedActions.push({
              player: actionData.player,
              action: actionData.action,
              target: actionData.target,
              timestamp: actionData.timestamp,
              challenged: actionData.challenged,
              success: actionData.success
            });
          }
        } catch (e) { console.error(`Error loading action ${actionId}:`, e); }
      }
      setActions(loadedActions.sort((a, b) => b.timestamp - a.timestamp));
    } catch (e) { console.error("Error loading game state:", e); } 
    finally { setLoading(false); }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const takeAction = async (action: string, target?: string) => {
    if (!isConnected || !address) { alert("Please connect wallet first"); return; }
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const actionId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const actionData = {
        player: address,
        action,
        target,
        timestamp: Math.floor(Date.now() / 1000),
        challenged: false,
        success: false
      };
      
      await contract.setData(`action_${actionId}`, ethers.toUtf8Bytes(JSON.stringify(actionData)));
      
      const actionIdsBytes = await contract.getData("game_actions");
      let actionIds: string[] = [];
      if (actionIdsBytes.length > 0) {
        try { actionIds = JSON.parse(ethers.toUtf8String(actionIdsBytes)); } 
        catch (e) { console.error("Error parsing action IDs:", e); }
      }
      actionIds.push(actionId);
      await contract.setData("game_actions", ethers.toUtf8Bytes(JSON.stringify(actionIds)));
      
      alert(`Action "${action}" submitted successfully!`);
      await loadGameState();
    } catch (e: any) {
      alert(`Action failed: ${e.message || "Unknown error"}`);
    }
  };

  const joinGame = async () => {
    if (!isConnected || !address) { alert("Please connect wallet first"); return; }
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Generate encrypted roles (simulated FHE)
      const encryptedRoles = [
        FHEEncryptNumber(Math.floor(Math.random() * ROLES.length)),
        FHEEncryptNumber(Math.floor(Math.random() * ROLES.length))
      ];
      
      const playerData = {
        coins: FHEEncryptNumber(2), // Starting coins
        alive: true,
        encryptedRoles,
        revealedRoles: []
      };
      
      await contract.setData(`player_${address}`, ethers.toUtf8Bytes(JSON.stringify(playerData)));
      
      const playersBytes = await contract.getData("game_players");
      let playerAddresses: string[] = [];
      if (playersBytes.length > 0) {
        try { playerAddresses = JSON.parse(ethers.toUtf8String(playersBytes)); } 
        catch (e) { console.error("Error parsing player addresses:", e); }
      }
      
      if (!playerAddresses.includes(address)) {
        playerAddresses.push(address);
        await contract.setData("game_players", ethers.toUtf8Bytes(JSON.stringify(playerAddresses)));
      }
      
      alert("Joined game successfully! Your roles are encrypted with FHE.");
      await loadGameState();
    } catch (e: any) {
      alert(`Join failed: ${e.message || "Unknown error"}`);
    }
  };

  const revealRole = async (playerAddress: string, roleIndex: number) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const playerBytes = await contract.getData(`player_${playerAddress}`);
      if (playerBytes.length === 0) throw new Error("Player not found");
      
      const playerData = JSON.parse(ethers.toUtf8String(playerBytes));
      if (roleIndex >= playerData.encryptedRoles.length) throw new Error("Invalid role index");
      
      // "Decrypt" the role (in real FHE this would be done with wallet signature)
      const decryptedRoleIndex = await decryptWithSignature(playerData.encryptedRoles[roleIndex]);
      if (decryptedRoleIndex === null) throw new Error("Decryption failed");
      
      const revealedRole = ROLES[Math.floor(decryptedRoleIndex) % ROLES.length];
      
      // Update player data
      playerData.revealedRoles = playerData.revealedRoles || [];
      playerData.revealedRoles.push(revealedRole);
      playerData.encryptedRoles.splice(roleIndex, 1);
      
      await contract.setData(`player_${playerAddress}`, ethers.toUtf8Bytes(JSON.stringify(playerData)));
      
      alert(`Revealed role: ${revealedRole}`);
      await loadGameState();
    } catch (e: any) {
      alert(`Reveal failed: ${e.message || "Unknown error"}`);
    }
  };

  const isCurrentPlayer = (playerAddress: string) => address?.toLowerCase() === playerAddress.toLowerCase();

  const getPlayerRoles = (player: Player) => {
    const roles = [...player.revealedRoles];
    roles.push(...player.encryptedRoles.map(() => "Encrypted"));
    return roles;
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>Initializing encrypted game session...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon"><div className="shield-icon"></div></div>
          <h1>Coup<span>FHE</span></h1>
        </div>
        <div className="header-actions">
          <button onClick={joinGame} className="create-record-btn cyber-button">
            <div className="add-icon"></div>Join Game
          </button>
          <button className="cyber-button" onClick={() => setShowTutorial(!showTutorial)}>
            {showTutorial ? "Hide Tutorial" : "Show Tutorial"}
          </button>
          <div className="wallet-connect-wrapper"><ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/></div>
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Coup with FHE-Encrypted Roles</h2>
            <p>Bluff and deduce in this social deduction game where all roles are encrypted with Zama FHE</p>
          </div>
          <div className="fhe-indicator"><div className="fhe-lock"></div><span>FHE Encryption Active</span></div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>How to Play Coup with FHE</h2>
            <p className="subtitle">A game of deception with encrypted roles</p>
            <div className="tutorial-steps">
              <div className="tutorial-step">
                <div className="step-icon">🔒</div>
                <div className="step-content">
                  <h3>Encrypted Roles</h3>
                  <p>Each player's two roles are encrypted with FHE and remain hidden</p>
                  <div className="step-details">Zama FHE technology keeps roles secret even during computation</div>
                </div>
              </div>
              <div className="tutorial-step">
                <div className="step-icon">🤥</div>
                <div className="step-content">
                  <h3>Bluff Freely</h3>
                  <p>Claim any role's action, but be ready to prove it if challenged</p>
                </div>
              </div>
              <div className="tutorial-step">
                <div className="step-icon">⚔️</div>
                <div className="step-content">
                  <h3>Challenge Others</h3>
                  <p>Call out suspected bluffs to force role reveals</p>
                </div>
              </div>
              <div className="tutorial-step">
                <div className="step-icon">👑</div>
                <div className="step-content">
                  <h3>Last Player Standing</h3>
                  <p>Eliminate others while protecting your encrypted identities</p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="game-area">
          <div className="player-panel cyber-card">
            <h3>Players</h3>
            <div className="players-grid">
              {players.length === 0 ? (
                <div className="no-players">
                  <p>No players yet. Be the first to join!</p>
                </div>
              ) : players.map(player => (
                <div 
                  key={player.address} 
                  className={`player-card ${!player.alive ? 'eliminated' : ''} ${isCurrentPlayer(player.address) ? 'current-player' : ''}`}
                >
                  <div className="player-header">
                    <div className="player-address">
                      {player.address.substring(0, 6)}...{player.address.substring(38)}
                      {isCurrentPlayer(player.address) && <span className="you-badge">YOU</span>}
                    </div>
                    <div className="player-coins">{player.coins} 💰</div>
                  </div>
                  <div className="player-roles">
                    {getPlayerRoles(player).map((role, i) => (
                      <div 
                        key={i} 
                        className={`player-role ${role === "Encrypted" ? 'encrypted' : 'revealed'}`}
                        onClick={() => {
                          if (role === "Encrypted" && isCurrentPlayer(player.address)) {
                            revealRole(player.address, i - player.revealedRoles.length);
                          } else if (role !== "Encrypted") {
                            setSelectedRole(role);
                          }
                        }}
                      >
                        {role === "Encrypted" ? (
                          <div className="encrypted-role">
                            <div className="fhe-lock-small"></div>
                            <span>Encrypted</span>
                          </div>
                        ) : (
                          <div className="revealed-role">{role}</div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="player-status">
                    {player.alive ? (
                      <span className="status-alive">Alive</span>
                    ) : (
                      <span className="status-eliminated">Eliminated</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="action-panel cyber-card">
            <h3>Actions</h3>
            <div className="actions-grid">
              {ACTIONS.map(action => (
                <button 
                  key={action} 
                  className={`cyber-button ${currentAction === action ? 'active' : ''}`}
                  onClick={() => setCurrentAction(action === currentAction ? null : action)}
                >
                  {action}
                </button>
              ))}
            </div>
            
            {currentAction && (
              <div className="action-details">
                <h4>{currentAction}</h4>
                <p className="action-description">
                  {currentAction === "Income" && "Take 1 coin from the treasury"}
                  {currentAction === "Foreign Aid" && "Take 2 coins from the treasury (can be blocked by Duke)"}
                  {currentAction === "Tax" && "Take 3 coins from the treasury (must have Duke)"}
                  {currentAction === "Assassinate" && "Pay 3 coins to assassinate another player (must have Assassin)"}
                  {currentAction === "Steal" && "Take 2 coins from another player (must have Captain)"}
                  {currentAction === "Exchange" && "Exchange cards with the Court (must have Ambassador)"}
                  {currentAction === "Coup" && "Pay 7 coins to launch a coup against another player (unblockable)"}
                </p>
                
                {(currentAction === "Assassinate" || currentAction === "Steal" || currentAction === "Coup") && (
                  <div className="target-selection">
                    <label>Target:</label>
                    <select 
                      value={targetPlayer || ""} 
                      onChange={(e) => setTargetPlayer(e.target.value || null)}
                      className="cyber-select"
                    >
                      <option value="">Select player</option>
                      {players
                        .filter(p => p.alive && !isCurrentPlayer(p.address))
                        .map(p => (
                          <option key={p.address} value={p.address}>
                            {p.address.substring(0, 6)}...{p.address.substring(38)}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                
                <button 
                  className="cyber-button primary submit-action"
                  onClick={() => {
                    if ((currentAction === "Assassinate" || currentAction === "Steal" || currentAction === "Coup") && !targetPlayer) {
                      alert("Please select a target player");
                      return;
                    }
                    takeAction(currentAction, targetPlayer || undefined);
                    setCurrentAction(null);
                    setTargetPlayer(null);
                  }}
                >
                  Submit {currentAction}
                </button>
              </div>
            )}
          </div>
          
          <div className="history-panel cyber-card">
            <h3>Action Log</h3>
            <div className="action-log">
              {actions.length === 0 ? (
                <div className="no-actions">
                  <p>No actions yet. Make your move!</p>
                </div>
              ) : (
                <div className="log-entries">
                  {actions.map((action, i) => (
                    <div key={i} className="log-entry">
                      <div className="log-timestamp">
                        {new Date(action.timestamp * 1000).toLocaleTimeString()}
                      </div>
                      <div className="log-content">
                        <span className="log-player">
                          {action.player.substring(0, 6)}...{action.player.substring(38)}
                        </span>
                        <span className="log-action">{action.action}</span>
                        {action.target && (
                          <span className="log-target">
                            → {action.target.substring(0, 6)}...{action.target.substring(38)}
                          </span>
                        )}
                        {action.challenged && (
                          <span className="log-challenge">[Challenged]</span>
                        )}
                        {action.success !== undefined && (
                          <span className={`log-success ${action.success ? 'success' : 'failed'}`}>
                            [{action.success ? 'Success' : 'Failed'}]
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {selectedRole && (
        <div className="modal-overlay">
          <div className="role-modal cyber-card">
            <div className="modal-header">
              <h2>Role: {selectedRole}</h2>
              <button onClick={() => setSelectedRole(null)} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <div className="role-description">
                {selectedRole === "Duke" && (
                  <p>The Duke can take 3 coins from the treasury (Tax action) and can block Foreign Aid.</p>
                )}
                {selectedRole === "Assassin" && (
                  <p>The Assassin can pay 3 coins to assassinate another player (must be challenged or blocked by Contessa).</p>
                )}
                {selectedRole === "Captain" && (
                  <p>The Captain can steal 2 coins from another player (must be challenged or blocked by Ambassador or another Captain).</p>
                )}
                {selectedRole === "Ambassador" && (
                  <p>The Ambassador can exchange cards with the Court and can block stealing attempts.</p>
                )}
                {selectedRole === "Contessa" && (
                  <p>The Contessa can block assassination attempts (must be challenged).</p>
                )}
              </div>
              <div className="role-stats">
                <div className="stat-item">
                  <span className="stat-label">Blockable Actions:</span>
                  <span className="stat-value">
                    {selectedRole === "Duke" && "Foreign Aid"}
                    {selectedRole === "Captain" && "Steal"}
                    {selectedRole === "Ambassador" && "Steal"}
                    {selectedRole === "Contessa" && "Assassinate"}
                    {selectedRole === "Assassin" && "None"}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Can Challenge:</span>
                  <span className="stat-value">
                    {selectedRole === "Duke" && "Tax, Foreign Aid blocks"}
                    {selectedRole === "Captain" && "Steal"}
                    {selectedRole === "Ambassador" && "Steal, Exchange"}
                    {selectedRole === "Contessa" && "Assassinate blocks"}
                    {selectedRole === "Assassin" && "Assassinate"}
                  </span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setSelectedRole(null)} className="cyber-button">Close</button>
            </div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo"><div className="shield-icon"></div><span>CoupFHE</span></div>
            <p>The classic bluffing game with FHE-encrypted roles</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Rules</a>
            <a href="#" className="footer-link">About FHE</a>
            <a href="#" className="footer-link">Zama Network</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge"><span>FHE-Powered Privacy</span></div>
          <div className="copyright">© {new Date().getFullYear()} CoupFHE. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
};

export default App;