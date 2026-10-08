// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentIdentity} from "../../src/interfaces/IAgentIdentity.sol";

/// @notice Minimal stand-in for an ERC-8004 identity registry in tests:
///         just enough `ownerOf` + `mint`/`transferFrom` to exercise
///         AgentCreditPool without depending on any real deployed registry.
contract MockAgentIdentity is IAgentIdentity {
    mapping(uint256 => address) private _owners;
    mapping(uint256 => address) private _operatorWallets;
    uint256 private _nextId;

    function mint(address to) external returns (uint256 id) {
        id = _nextId++;
        _owners[id] = to;
    }

    function transferFrom(address from, address to, uint256 id) external {
        require(_owners[id] == from, "not owner");
        _owners[id] = to;
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        address o = _owners[agentId];
        require(o != address(0), "nonexistent");
        return o;
    }

    /// @notice Test-only setter — real AgentIdentity.sol gates this behind
    ///         onlyOwner, but AgentCreditPool only ever reads this value, so
    ///         the mock doesn't need to replicate that access control.
    function setOperatorWallet(uint256 agentId, address operatorWallet) external {
        _operatorWallets[agentId] = operatorWallet;
    }

    function operatorWalletOf(uint256 agentId) external view returns (address) {
        return _operatorWallets[agentId];
    }
}
