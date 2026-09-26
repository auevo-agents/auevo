// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta, toBalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";

/// @dev Test-only mock. Stands in for the real v4 PoolManager so
///      DcaVaultV4's own logic (custody, access control, the price-floor
///      enforcement, interval lock, reentrancy guard) can be exercised
///      locally without deploying the real PoolManager (a large contract
///      whose own correctness is Uniswap's to test, not this project's —
///      same philosophy as MockUniswap.sol's mocks for the V3 vault).
///      Deliberately does NOT reproduce PoolManager's real
///      currency-delta accounting (CurrencyNotSettled, transient-storage
///      deltas, etc.) — `swap()` just returns whatever delta the test
///      configured, and settle()/take() do plain, unconditional ERC20
///      transfers. That is enough to prove DcaVaultV4 calls the unlock/
///      swap/sync/settle/take sequence in the right order with the right
///      values; it is not a substitute for testing against the real
///      PoolManager (a fork/testnet gap this contract's README already
///      flags for DcaVault.sol and flags again here).
contract MockPoolManagerV4 {
    using SafeERC20 for IERC20;

    int128 public nextAmount0;
    int128 public nextAmount1;

    function setNextDelta(int128 amount0_, int128 amount1_) external {
        nextAmount0 = amount0_;
        nextAmount1 = amount1_;
    }

    function unlock(bytes calldata data) external returns (bytes memory) {
        return IUnlockCallback(msg.sender).unlockCallback(data);
    }

    function swap(PoolKey memory, SwapParams memory, bytes calldata) external view returns (BalanceDelta) {
        return toBalanceDelta(nextAmount0, nextAmount1);
    }

    function sync(Currency) external {}

    function settle() external payable returns (uint256) {
        return 0;
    }

    function take(Currency currency, address to, uint256 amount) external {
        IERC20(Currency.unwrap(currency)).safeTransfer(to, amount);
    }
}
