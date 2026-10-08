// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/// @title DcaVaultV4 — EXPERIMENTAL, UNAUDITED, NOT DEPLOYED
/// @notice RWA_SPEC.md Phase 7's v4/USDG port of DcaVault.sol: recurring
///         buy (dollar-cost-average) positions executed against a
///         Uniswap v4 pool via PoolManager's unlock/callback pattern —
///         not UniversalRouter, and not Permit2: this contract already
///         custodies its own principal (deposited once at
///         createPosition/fund, exactly like the V3 version), so it can
///         call PoolManager directly the same way Uniswap's own
///         periphery routers do, with no signature of any kind involved
///         in executeBuy().
///
/// @dev SECURITY MODEL — read this before depositing anything, and read
///      DcaVault.sol's (the V3 version's) own doc comment too: custody,
///      pause semantics, and the reentrancy posture below are unchanged
///      from that contract. What's different, and why this file exists
///      separately rather than editing DcaVault.sol in place:
///
///      THE PRICE FLOOR IS WEAKER HERE THAN IN THE V3 VERSION, BY
///      CONSTRUCTION, NOT BY OVERSIGHT. DcaVault.sol's anti-sandwich
///      protection works because every Uniswap V3 pool maintains its own
///      on-chain historical price observations (TwapOracle.sol reads
///      them via IUniswapV3Pool.observe()) — any V3 pool can always be
///      asked "what was the time-weighted price over the last N
///      seconds", trustlessly, on-chain. Uniswap v4 core has NO
///      equivalent: PoolManager (confirmed directly against the
///      installed uniswap v4-core package's IPoolManager.sol and
///      StateLibrary.sol) exposes only the pool's CURRENT sqrt
///      price, never a history — v4 moved oracle functionality entirely
///      into optional hook contracts, and this project has not
///      confirmed any RWA/USDG pool on Robinhood Chain uses an
///      oracle-providing hook (registry.ts's own discovery code reads a
///      pool's `hooks` address but never inspects what a hook actually
///      implements). So there is no trustless, on-chain "true TWAP" this
///      contract can fall back to the way the V3 version does.
///
///      Instead, each position optionally names its own IPriceOracle
///      (priceOracle.sol — this project's own minimal interface, not a
///      Uniswap type): when set, executeBuy() enforces
///      max(callerMinOut, oracleFloor) exactly like the V3 version's
///      TWAP floor. When NOT set (address(0), the default), there is NO
///      independent on-chain floor at all — executeBuy() falls back to
///      trusting the CALLER's own minAmountOut outright, which for a
///      permissionless keeper function is a real, material weakening of
///      the anti-sandwich guarantee DcaVault.sol otherwise promises (a
///      lazy or malicious keeper's own minAmountOut is the only thing
///      standing between a position and a bad fill in that mode). The
///      one guard kept even then: a zero minAmountOut is rejected
///      outright (InvalidParams) — no execution is ever allowed to carry
///      literally zero price protection, but "not literally zero" is a
///      much weaker bar than "verified against a trustless price
///      source". THIS is exactly the kind of gap RWA_SPEC.md's own gate
///      exists for: this contract must not be deployed to mainnet before
///      an external audit, and until then only testnet/fork use behind a
///      feature flag is in scope — see contracts/README.md.
///
///      Everything else mirrors DcaVault.sol: nobody but a position's
///      own owner can ever withdraw its principal (no admin path, not
///      upgradeable); pausing (owner-only) can only block new
///      deposits/top-ups/executions, never withdraw()/
///      withdrawAllAndClose(); reentrancy is guarded the same way
///      (OpenZeppelin's ReentrancyGuard on every state-mutating entry
///      point). One mechanical difference worth flagging for a future
///      audit: the V3 version's executeBuy() *pulls* funds via the
///      router's own transferFrom, so its reentrancy-sensitive transfer
///      is a transferFrom(); this version's unlockCallback *pushes*
///      tokenIn to PoolManager via a plain transfer() (v4's settle
///      pattern: sync, then transfer, then settle — there is nothing for
///      PoolManager to pull), so the reentrancy-sensitive call here is a
///      transfer(), not a transferFrom() — both call sites are still
///      inside the same nonReentrant executeBuy() scope, and the test
///      suite (test/run-v4.mjs) exercises this exact call site with the
///      same malicious-token mock DcaVault.sol's own suite uses.
contract DcaVaultV4 is ReentrancyGuard, Pausable, Ownable, IUnlockCallback {
    using SafeERC20 for IERC20;
    // Currency's own transfer() helper (CurrencyLibrary) is already
    // attached globally by the uniswap v4-core package's Currency.sol itself.

    IPoolManager public immutable poolManager;

    uint16 public constant MAX_SLIPPAGE_BPS = 5000; // 50% hard ceiling — a sanity rail, not a recommendation
    uint256 public constant BPS_DENOMINATOR = 10_000;

    struct Position {
        address owner;
        PoolKey poolKey;
        bool zeroForOne; // true: tokenIn = currency0, tokenOut = currency1
        uint256 trancheAmount;
        uint256 interval; // seconds between buys
        uint256 remaining; // principal not yet spent
        uint256 lastExecuted; // timestamp of last buy (0 = never executed)
        uint16 maxSlippageBps; // only meaningful when priceOracle is set — see contract-level docs
        IPriceOracle priceOracle; // address(0) = no on-chain floor beyond the caller's own minAmountOut
        bool active;
    }

    uint256 public nextPositionId;
    mapping(uint256 => Position) public positions;

    event PositionCreated(
        uint256 indexed id,
        address indexed owner,
        address tokenIn,
        address tokenOut,
        uint256 trancheAmount,
        uint256 interval,
        uint256 principal,
        address priceOracle
    );
    event PositionFunded(uint256 indexed id, uint256 amount);
    event BuyExecuted(uint256 indexed id, uint256 amountIn, uint256 amountOut, uint256 floor, address executedBy);
    event PositionWithdrawn(uint256 indexed id, uint256 amount);
    event PositionClosed(uint256 indexed id);

    error NotPositionOwner();
    error PositionNotActive();
    error TooSoon();
    error InsufficientRemaining();
    error InvalidParams();
    error NotPoolManager();
    error SlippageExceeded();

    constructor(address poolManager_, address initialOwner) Ownable(initialOwner) {
        if (poolManager_ == address(0)) revert InvalidParams();
        poolManager = IPoolManager(poolManager_);
    }

    /// @notice Opens a new DCA position and funds it in one call.
    /// @param poolKey The v4 pool this position always trades against — trusted as given (see contract-level
    ///        docs on why there is no cheap on-chain "pool exists" check the way the V3 version had).
    /// @param zeroForOne Which side of poolKey is tokenIn: true means currency0 -> currency1.
    /// @param maxSlippageBps Only used when priceOracle is set; still validated even when it's not, so
    ///        switching an oracle on later can't silently inherit an unvalidated value.
    /// @param priceOracle address(0) to disable the on-chain floor entirely (see contract-level docs on
    ///        what that means) — never guessed or defaulted to anything else.
    function createPosition(
        PoolKey calldata poolKey,
        bool zeroForOne,
        uint256 trancheAmount,
        uint256 interval,
        uint16 maxSlippageBps,
        uint256 principal,
        address priceOracle
    ) external whenNotPaused nonReentrant returns (uint256 id) {
        if (Currency.unwrap(poolKey.currency0) == Currency.unwrap(poolKey.currency1)) revert InvalidParams();
        if (trancheAmount == 0 || interval == 0 || principal < trancheAmount) revert InvalidParams();
        if (maxSlippageBps == 0 || maxSlippageBps > MAX_SLIPPAGE_BPS) revert InvalidParams();

        id = nextPositionId++;
        positions[id] = Position({
            owner: msg.sender,
            poolKey: poolKey,
            zeroForOne: zeroForOne,
            trancheAmount: trancheAmount,
            interval: interval,
            remaining: principal,
            lastExecuted: 0,
            maxSlippageBps: maxSlippageBps,
            priceOracle: IPriceOracle(priceOracle),
            active: true
        });

        (address tokenIn, address tokenOut) = _currencies(positions[id]);
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), principal);

        emit PositionCreated(id, msg.sender, tokenIn, tokenOut, trancheAmount, interval, principal, priceOracle);
    }

    /// @notice Adds more principal to an existing position.
    function fund(uint256 id, uint256 amount) external whenNotPaused nonReentrant {
        Position storage p = positions[id];
        if (p.owner != msg.sender) revert NotPositionOwner();
        if (!p.active) revert PositionNotActive();
        if (amount == 0) revert InvalidParams();

        p.remaining += amount;
        (address tokenIn, ) = _currencies(p);
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amount);

        emit PositionFunded(id, amount);
    }

    /// @notice Executes a position's next scheduled buy. Callable by anyone — see the contract-level docs
    ///         for exactly what that does and does not let the caller control, and how much weaker that
    ///         guarantee is here than in DcaVault.sol when no priceOracle is configured.
    function executeBuy(uint256 id, uint256 minAmountOut) external whenNotPaused nonReentrant {
        Position storage p = positions[id];
        if (!p.active) revert PositionNotActive();
        if (block.timestamp < p.lastExecuted + p.interval) revert TooSoon();
        if (p.remaining < p.trancheAmount) revert InsufficientRemaining();

        uint256 amountIn = p.trancheAmount;
        uint256 floor = _floor(p, amountIn, minAmountOut);

        p.remaining -= amountIn;
        p.lastExecuted = block.timestamp;

        bytes memory result = poolManager.unlock(abi.encode(id, amountIn, floor));
        uint256 amountOut = abi.decode(result, (uint256));

        emit BuyExecuted(id, amountIn, amountOut, floor, msg.sender);
    }

    /// @dev Only PoolManager may call this, and only via the unlock() call executeBuy() itself just made —
    ///      msg.sender is checked, and `id` is a value this contract encoded itself, never attacker input.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (uint256 id, uint256 amountIn, uint256 floor) = abi.decode(data, (uint256, uint256, uint256));
        Position storage p = positions[id];

        BalanceDelta delta = poolManager.swap(
            p.poolKey,
            SwapParams({
                zeroForOne: p.zeroForOne,
                amountSpecified: -int256(amountIn),
                sqrtPriceLimitX96: p.zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );

        int128 outDelta = p.zeroForOne ? delta.amount1() : delta.amount0();
        // A real swap with a nonzero exact input always yields a positive
        // opposing delta; zero/negative here means something upstream is
        // broken, not a price the position should ever accept.
        if (outDelta <= 0) revert InvalidParams();
        uint256 amountOut = uint256(uint128(outDelta));
        if (amountOut < floor) revert SlippageExceeded();

        (Currency inCcy, Currency outCcy) =
            p.zeroForOne ? (p.poolKey.currency0, p.poolKey.currency1) : (p.poolKey.currency1, p.poolKey.currency0);

        poolManager.sync(inCcy);
        inCcy.transfer(address(poolManager), amountIn);
        // Return value (amountIn paid, per PoolManager's own accounting)
        // deliberately unused: this contract already knows amountIn
        // exactly (it's p.trancheAmount) and has no use for PoolManager's
        // own echo of it back. Flagged by Slither as unused-return; same
        // "known, intentional, nothing to fix" category as the V3
        // vault's own harmonic-mean-liquidity finding (see README).
        poolManager.settle();

        poolManager.take(outCcy, p.owner, amountOut);

        return abi.encode(amountOut);
    }

    /// @dev See contract-level docs on why this is a real, documented weakening versus DcaVault.sol's TWAP
    ///      floor when no priceOracle is configured — never silently treated as equivalent protection.
    function _floor(Position storage p, uint256 amountIn, uint256 minAmountOut) private view returns (uint256) {
        if (address(p.priceOracle) == address(0)) {
            if (minAmountOut == 0) revert InvalidParams();
            return minAmountOut;
        }

        (address tokenIn, address tokenOut) = _currencies(p);
        uint256 fairOut = p.priceOracle.quote(tokenIn, tokenOut, amountIn);
        uint256 oracleFloor = (fairOut * (BPS_DENOMINATOR - p.maxSlippageBps)) / BPS_DENOMINATOR;
        return minAmountOut > oracleFloor ? minAmountOut : oracleFloor;
    }

    function _currencies(Position storage p) private view returns (address tokenIn, address tokenOut) {
        if (p.zeroForOne) {
            tokenIn = Currency.unwrap(p.poolKey.currency0);
            tokenOut = Currency.unwrap(p.poolKey.currency1);
        } else {
            tokenIn = Currency.unwrap(p.poolKey.currency1);
            tokenOut = Currency.unwrap(p.poolKey.currency0);
        }
    }

    /// @notice Withdraws unspent principal. Always available to the owner, paused or not.
    function withdraw(uint256 id, uint256 amount) external nonReentrant {
        Position storage p = positions[id];
        if (p.owner != msg.sender) revert NotPositionOwner();
        if (amount == 0 || amount > p.remaining) revert InvalidParams();

        p.remaining -= amount;
        (address tokenIn, ) = _currencies(p);
        IERC20(tokenIn).safeTransfer(msg.sender, amount);

        emit PositionWithdrawn(id, amount);
    }

    /// @notice Withdraws everything left and closes the position.
    function withdrawAllAndClose(uint256 id) external nonReentrant {
        Position storage p = positions[id];
        if (p.owner != msg.sender) revert NotPositionOwner();

        uint256 amount = p.remaining;
        p.remaining = 0;
        p.active = false;

        if (amount > 0) {
            (address tokenIn, ) = _currencies(p);
            IERC20(tokenIn).safeTransfer(msg.sender, amount);
        }

        emit PositionWithdrawn(id, amount);
        emit PositionClosed(id);
    }

    /// @notice Pauses new position creation, funding and buy execution. Never affects withdraw() or
    ///         withdrawAllAndClose().
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
