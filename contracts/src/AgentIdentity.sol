// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentIdentity} from "./interfaces/IAgentIdentity.sol";

/// @title AgentIdentity — EXPERIMENTAL, UNAUDITED
/// @notice Minimal, non-upgradeable agent identity registry for AUEVO.
///         ERC-8004-shaped (an agent is a uint256 id with an owner and an
///         off-chain `agentURI`) but deliberately NOT the canonical
///         ERC-8004 deployment, and not a full ERC-721: this contract was
///         written after finding, by direct on-chain inspection, that the
///         canonical ERC-8004 Identity Registry is owned by a single
///         plain private key (no multisig) on every chain it shares its
///         deterministic address on — see the "AUEVO as an Independent
///         Reputation & Verification Protocol" section of this project's
///         own design doc, §8. Depending on that deployment would mean
///         trusting that one key. This contract has no owner, no admin
///         function and no upgrade path at all, by construction.
///
/// @dev SECURITY MODEL
///
///      Three addresses per agent, not two or one — see the design doc's
///      §9 for the full rationale:
///        - `owner`   — holds the agent id. Configures `controller` and
///          `operatorWallet`, the agentURI, and metadata. Cannot submit a
///          Proof directly (nothing here enforces that — ProofRegistry.sol
///          is where that rule actually lives — but every function in
///          *this* contract reachable only by `owner` is a configuration
///          action, never a speech act, by design).
///        - `controller` — the key a consuming system (ProofRegistry.sol,
///          an SDK, an MCP server) treats as "the agent speaking." Set
///          only by `owner`.
///        - `operatorWallet` — a separately-funded address for capital-
///          at-risk challenges (the Financial Agent League, §18-19).
///          Kept distinct from `controller` so a compromised "speaking"
///          key can never move challenge funds, and a spend-limited
///          operator key can never forge a Proof submission.
///
///      Transfer deliberately clears `controller` and `operatorWallet`
///      (reset to address(0)): a sold or re-registered identity carries
///      its on-chain history forward (it is the same agentId), but the
///      OLD controller/operator can never act for the NEW owner just
///      because they were never explicitly revoked. The new owner must
///      explicitly re-set both before the agent can speak or hold a
///      challenge wallet again.
///
///      What this is NOT: a full ERC-721 (no approvals, no safeTransfer
///      hooks — ownership transfer is a single explicit call, nothing
///      here custodies any value that would make reentrancy or hook
///      callbacks a concern) and NOT an audited contract. Not deployed
///      anywhere by this change — see contracts/README.md.
contract AgentIdentity is IAgentIdentity {
    struct Agent {
        address owner;
        address controller;
        address operatorWallet;
        string agentURI;
        uint64 registeredAt;
    }

    mapping(uint256 => Agent) private _agents;
    mapping(uint256 => mapping(string => bytes)) private _metadata;
    uint256 public nextAgentId;

    event Registered(uint256 indexed agentId, address indexed owner, string agentURI);
    event ControllerSet(uint256 indexed agentId, address indexed controller);
    event OperatorWalletSet(uint256 indexed agentId, address indexed operatorWallet);
    event URIUpdated(uint256 indexed agentId, string newURI);
    event MetadataSet(uint256 indexed agentId, string key, bytes value);
    event Transferred(uint256 indexed agentId, address indexed from, address indexed to);

    modifier onlyOwner(uint256 agentId) {
        require(_agents[agentId].owner == msg.sender, "not agent owner");
        _;
    }

    function _exists(uint256 agentId) internal view returns (bool) {
        return _agents[agentId].owner != address(0);
    }

    /// @notice Mints a new agent id to the caller. Controller and operator
    ///         wallet both default to the caller too; set them separately
    ///         (setController/setOperatorWallet) to point them elsewhere.
    function register(string calldata agentURI_) external returns (uint256 agentId) {
        agentId = nextAgentId++;
        _agents[agentId] = Agent({
            owner: msg.sender,
            controller: msg.sender,
            operatorWallet: msg.sender,
            agentURI: agentURI_,
            registeredAt: uint64(block.timestamp)
        });
        emit Registered(agentId, msg.sender, agentURI_);
        // controller/operatorWallet default to the caller too — emit the same events a later
        // setController/setOperatorWallet call would, so an indexer built only from events (not
        // re-reading controllerOf/operatorWalletOf live) never has to special-case Registered to
        // learn the initial values.
        emit ControllerSet(agentId, msg.sender);
        emit OperatorWalletSet(agentId, msg.sender);
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        address owner_ = _agents[agentId].owner;
        require(owner_ != address(0), "nonexistent agent");
        return owner_;
    }

    function controllerOf(uint256 agentId) external view returns (address) {
        require(_exists(agentId), "nonexistent agent");
        return _agents[agentId].controller;
    }

    function operatorWalletOf(uint256 agentId) external view returns (address) {
        require(_exists(agentId), "nonexistent agent");
        return _agents[agentId].operatorWallet;
    }

    function agentURI(uint256 agentId) external view returns (string memory) {
        require(_exists(agentId), "nonexistent agent");
        return _agents[agentId].agentURI;
    }

    function registeredAt(uint256 agentId) external view returns (uint64) {
        require(_exists(agentId), "nonexistent agent");
        return _agents[agentId].registeredAt;
    }

    function setController(uint256 agentId, address newController) external onlyOwner(agentId) {
        require(newController != address(0), "controller=0");
        _agents[agentId].controller = newController;
        emit ControllerSet(agentId, newController);
    }

    function setOperatorWallet(uint256 agentId, address newOperatorWallet) external onlyOwner(agentId) {
        require(newOperatorWallet != address(0), "operatorWallet=0");
        _agents[agentId].operatorWallet = newOperatorWallet;
        emit OperatorWalletSet(agentId, newOperatorWallet);
    }

    function setAgentURI(uint256 agentId, string calldata newURI) external onlyOwner(agentId) {
        _agents[agentId].agentURI = newURI;
        emit URIUpdated(agentId, newURI);
    }

    function setMetadata(uint256 agentId, string calldata key, bytes calldata value) external onlyOwner(agentId) {
        _metadata[agentId][key] = value;
        emit MetadataSet(agentId, key, value);
    }

    function getMetadata(uint256 agentId, string calldata key) external view returns (bytes memory) {
        require(_exists(agentId), "nonexistent agent");
        return _metadata[agentId][key];
    }

    /// @notice Transfers the agent id. Clears controller and operatorWallet
    ///         (see this contract's own doc comment) — the new owner must
    ///         explicitly re-set both. Reverts on a no-op transfer to the
    ///         current owner, since that would otherwise silently wipe the
    ///         owner's own controller/operatorWallet with no ownership
    ///         change to show for it.
    function transferAgent(uint256 agentId, address newOwner) external onlyOwner(agentId) {
        require(newOwner != address(0), "newOwner=0");
        Agent storage a = _agents[agentId];
        require(newOwner != a.owner, "already owner");
        address previousOwner = a.owner;
        a.owner = newOwner;
        a.controller = address(0);
        a.operatorWallet = address(0);
        emit Transferred(agentId, previousOwner, newOwner);
        // Mirror the clear as explicit ControllerSet/OperatorWalletSet(..., address(0)) events —
        // the same reasoning as register() above: a consumer that caches "current controller"
        // from ControllerSet alone, without re-reading controllerOf live, must not go on treating
        // the OLD controller as authorized to speak for this agent after a transfer.
        emit ControllerSet(agentId, address(0));
        emit OperatorWalletSet(agentId, address(0));
    }
}
