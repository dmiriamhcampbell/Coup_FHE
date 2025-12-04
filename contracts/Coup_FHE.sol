pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract CoupFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public providers;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    uint256 public currentBatchId;
    bool public batchOpen;

    struct PlayerState {
        euint32 role1;
        euint32 role2;
        euint32 coins;
        bool alive;
    }
    mapping(address => PlayerState) public playerStates;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event PauseToggled(bool paused);
    event CooldownSecondsSet(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 batchId);
    event BatchClosed(uint256 batchId);
    event PlayerJoined(address indexed player, uint256 batchId);
    event ActionSubmitted(address indexed player, string actionType, uint256 batchId);
    event DecryptionRequested(uint256 indexed requestId, uint256 batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 batchId);

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchNotOpen();
    error InvalidBatchId();
    error ReplayDetected();
    error StateMismatch();
    error InvalidProof();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!providers[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkSubmissionCooldown() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier checkDecryptionCooldown() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        providers[msg.sender] = true;
        cooldownSeconds = 30;
        currentBatchId = 0;
        batchOpen = false;
        emit ProviderAdded(msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        providers[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        providers[provider] = false;
        emit ProviderRemoved(provider);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PauseToggled(_paused);
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        uint256 oldCooldownSeconds = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSecondsSet(oldCooldownSeconds, newCooldownSeconds);
    }

    function openBatch() external onlyProvider whenNotPaused {
        currentBatchId++;
        batchOpen = true;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyProvider whenNotPaused {
        batchOpen = false;
        emit BatchClosed(currentBatchId);
    }

    function joinGame(euint32 encryptedRole1, euint32 encryptedRole2) external whenNotPaused checkSubmissionCooldown {
        if (!batchOpen) revert BatchNotOpen();
        if (!encryptedRole1.isInitialized() || !encryptedRole2.isInitialized()) revert InvalidBatchId();

        PlayerState storage state = playerStates[msg.sender];
        state.role1 = encryptedRole1;
        state.role2 = encryptedRole2;
        state.coins = FHE.asEuint32(2); // Start with 2 coins
        state.alive = true;

        lastSubmissionTime[msg.sender] = block.timestamp;
        emit PlayerJoined(msg.sender, currentBatchId);
    }

    function submitAction(string calldata actionType, euint32 actionTarget) external whenNotPaused checkSubmissionCooldown {
        if (!batchOpen) revert BatchNotOpen();
        if (!actionTarget.isInitialized()) revert InvalidBatchId();

        PlayerState storage state = playerStates[msg.sender];
        if (!state.alive) revert InvalidBatchId(); // Player must be alive

        // Example: Add coins for "Income" action (1 coin)
        if (keccak256(bytes(actionType)) == keccak256(bytes("Income"))) {
            state.coins = state.coins.add(FHE.asEuint32(1));
        }
        // Other actions (e.g., Foreign Aid, Coup, Assassinate, Steal, Exchange) would have different logic
        // involving interaction with other players' states and potentially FHE comparisons.

        lastSubmissionTime[msg.sender] = block.timestamp;
        emit ActionSubmitted(msg.sender, actionType, currentBatchId);
    }

    function requestRoleReveal() external whenNotPaused checkDecryptionCooldown {
        PlayerState storage state = playerStates[msg.sender];
        if (!state.alive) revert InvalidBatchId();

        euint32[] memory ctsToDecrypt = new euint32[](2);
        ctsToDecrypt[0] = state.role1;
        ctsToDecrypt[1] = state.role2;

        bytes32 stateHash = _hashCiphertexts(ctsToDecrypt);
        uint256 requestId = FHE.requestDecryption(ctsToDecrypt, this.myCallback.selector);
        decryptionContexts[requestId] = DecryptionContext({ batchId: currentBatchId, stateHash: stateHash, processed: false });

        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        emit DecryptionRequested(requestId, currentBatchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) revert ReplayDetected();
        if (decryptionContexts[requestId].batchId != currentBatchId) revert InvalidBatchId();

        // Rebuild ciphertexts from current state for state verification
        // This example assumes we know which player's roles are being decrypted.
        // In a real scenario, you'd need to map requestId to player or store player address in DecryptionContext.
        // For simplicity, this example assumes it's for msg.sender of the original request.
        // A more robust solution would store the player address in DecryptionContext.
        PlayerState storage state = playerStates[msg.sender]; // WARNING: This assumes msg.sender is the original requester.
                                                              // This is a simplification. A real implementation needs to
                                                              // map requestId to the correct player.

        euint32[] memory currentCts = new euint32[](2);
        currentCts[0] = state.role1;
        currentCts[1] = state.role2;

        bytes32 currentHash = _hashCiphertexts(currentCts);
        if (currentHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        FHE.checkSignatures(requestId, cleartexts, proof);

        // Decode cleartexts (assuming 2 uint32 values)
        uint32 role1Cleartext = abi.decode(cleartexts, (uint32));
        uint32 role2Cleartext = abi.decode(cleartexts[4:], (uint32)); // Assuming 4 bytes for uint32

        // For this example, we just emit the revealed roles.
        // In a real game, this might update game state or trigger other logic.
        emit DecryptionCompleted(requestId, currentBatchId);
        // Additional event for revealed roles:
        emit RolesRevealed(msg.sender, role1Cleartext, role2Cleartext);

        decryptionContexts[requestId].processed = true;
    }

    function _hashCiphertexts(euint32[] memory cts) internal pure returns (bytes32) {
        bytes32[] memory ctsBytes = new bytes32[](cts.length);
        for (uint i = 0; i < cts.length; i++) {
            ctsBytes[i] = FHE.toBytes32(cts[i]);
        }
        return keccak256(abi.encode(ctsBytes, address(this)));
    }

    function _initIfNeeded(euint32 val) internal view {
        if (!val.isInitialized()) {
            val = FHE.asEuint32(0);
        }
    }

    function _requireInitialized(euint32 val) internal pure {
        if (!val.isInitialized()) revert InvalidBatchId();
    }

    // Additional event for role reveal
    event RolesRevealed(address indexed player, uint32 role1, uint32 role2);
}