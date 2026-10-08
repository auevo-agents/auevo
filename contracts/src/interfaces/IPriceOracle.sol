// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice A trusted, on-chain price source a DcaVaultV4 position can
///         optionally point at (see DcaVaultV4.sol's own doc comment for
///         why this is optional and what it means when it's unset). Not a
///         Uniswap interface — this project's own minimal shape, so any
///         real oracle (a Chainlink feed wrapper, a hook-based v4 TWAP
///         oracle, etc.) can be adapted to it without DcaVaultV4 caring
///         which.
interface IPriceOracle {
    /// @notice A fair amountOut for swapping `amountIn` of `tokenIn` into `tokenOut`, in tokenOut's own smallest unit.
    /// @dev Must revert rather than return a stale/zero/manipulable value when it cannot answer confidently —
    ///      DcaVaultV4 treats a revert here as "no protected price for this execution" and reverts the whole buy,
    ///      never falling back to an unprotected fill silently.
    function quote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256 amountOut);
}
