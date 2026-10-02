// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAgentIdentity — minimal agent-identity registry interface
/// @notice An agent's identity on AgentCreditPool is any uint256 id whose
///         current owner this registry reports via `ownerOf` — standard
///         ERC-721 semantics (reverts for a nonexistent id), deliberately
///         kept to this one function so the pool can point at an existing
///         ERC-8004 identity registry (an open standard, already deployed
///         on this chain by others) without needing any ERC-8004-specific
///         call. AgentCreditPool never mints, burns or transfers identities
///         itself — it only reads who currently owns one.
interface IAgentIdentity {
    function ownerOf(uint256 agentId) external view returns (address);
}
