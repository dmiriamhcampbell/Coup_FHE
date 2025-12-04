# Coup FHE: The Encrypted Card Game Revolution

Dive into the world of Coup FHE, an innovative social party game where strategy meets secrecy, powered by **Zama's Fully Homomorphic Encryption technology**. In this online adaptation of the classic card game "Coup," each player's character cards are encrypted, ensuring a gameplay experience filled with suspense, deception, and excitement, all while maintaining an unwavering commitment to privacy.

## The Challenge We Address

In traditional social games, players rely heavily on trust and the ability to read their opponents. However, this can lead to cheating and unfair advantages, undermining the true essence of the gameplay. As players engage in actions such as taxation and assassination, the risk of revealing information about their character cards creates a gameplay imbalance. With Coup FHE, we address this issue head-on by integrating encryption, where all character and action data remains confidential and unexposed to opponents.

## Our FHE Solution

The core of Coup FHE is built on **Zama's Fully Homomorphic Encryption (FHE)** technology, allowing us to keep player actions and role cards hidden without sacrificing gameplay integrity. By employing Zama's open-source libraries, such as **Concrete** and the **zama-fhe SDK**, we can securely validate actions while maintaining the secrecy of players’ character cards. This means that players can strategize, deceive, and outsmart each other without the fear of information leakage or cheating.

## Core Functionalities

Coup FHE brings traditional gaming into the digital era while leveraging cutting-edge encryption technology. Here are some of the standout features:

- 🔒 **Encrypted Character Cards**: Each player's character cards are FHE-encrypted, providing an unbreachable layer of secrecy.
- ✅ **Cryptographic Action Validation**: Players' actions, such as taxes or assassinations, are verified through encrypted queries, ensuring fair gameplay.
- 🧠 **Psychological Strategy Reinvented**: The game masterfully captures the essence of social deduction and psychological warfare without compromising on security.
- 📜 **Player State Panel & Action Log**: A dedicated interface where players can track their status and the actions taken during the game, while maintaining the confidentiality of their roles.

## Technology Stack

Coup FHE is built using a robust technology stack to ensure smooth and secure gameplay:

- **Zama FHE SDK**: The primary component enabling confidential computing.
- **Node.js**: For backend processing and server management.
- **Hardhat**: Used for smart contract development and testing.
- **Solidity**: The smart contract language for implementing game mechanics on the blockchain.

## File Structure

Here's a snapshot of the project's directory layout:

```
Coup_FHE/
├── contracts/
│   └── Coup_FHE.sol
├── src/
│   ├── index.js
│   └── gameLogic.js
├── tests/
│   └── CoupFHE.test.js
├── package.json
└── README.md
```

## Installation Instructions

Before you begin, ensure you have the following dependencies installed on your machine:

- Node.js (v14.x or higher)
- npm (Node package manager)

1. Navigate to your local project directory where you have downloaded Coup FHE.
2. Run the following command to install the necessary dependencies, including the Zama FHE libraries:
   ```bash
   npm install
   ```
3. Make sure all necessary components are successfully installed.

## Building and Running the Project

After the installation, follow these commands to compile, test, and run Coup FHE:

1. **Compile the Contracts**:
   ```bash
   npx hardhat compile
   ```

2. **Run Tests**:
   ```bash
   npx hardhat test
   ```

3. **Start the Application**:
   ```bash
   node src/index.js
   ```

## Example Code Snippet

Here's a simplified illustration of how gameplay validation works using Zama's FHE:

```javascript
const { FHEGame } = require('./gameLogic');

async function playTurn(playerAction) {
    const game = new FHEGame();
    
    // Encrypt player's action using Zama FHE
    const encryptedAction = await game.encryptAction(playerAction);
    
    // Validate and execute the action
    const result = await game.validateAndExecute(encryptedAction);
    
    console.log(result);
}
```

With this elegant code, players can perform actions knowing their choices remain confidential and secure.

## Acknowledgements

**Powered by Zama**: We extend our heartfelt gratitude to the Zama team for their groundbreaking work in the field of encryption and for providing open-source tools that empower us to create engaging and confidential blockchain-based applications. Your innovations make our vision for Coup FHE a reality.

---

Coup FHE takes card games to exhilarating new heights by embracing the power of encryption. Join us on this journey of strategy, deception, and secure gameplay, and experience the thrill of Coup like never before!