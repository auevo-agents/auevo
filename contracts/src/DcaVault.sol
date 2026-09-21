// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IUniswapV3Factory} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {TwapOracle} from "./libraries/TwapOracle.sol";

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

/// @title DcaVault — EXPERIMENTAL, UNAUDITED
/// @notice Recurring-buy (dollar-cost-average) vault for ERC-20 <-> ERC-20
///         pairs on Robinhood Chain, executed through Uniswap V3's
///         SwapRouter02 and priced against that pool's own TWAP oracle.
///
/// @dev SECURITY MODEL — read this before depositing anything.
///
///      Custody: nobody but a position's own owner can ever move its
///      principal out. There is no admin withdrawal path and no upgrade
///      path — this contract is not upgradeable, deliberately, so there
///      is no admin key that could ever be used to redirect logic at
///      user funds. `owner()` (OpenZeppelin Ownable) can only pause NEW
///      deposits, top-ups and buy executions via pause()/unpause(); it
///      is checked in exactly those three functions and nowhere else —
///      withdraw() and withdrawAllAndClose() do not carry the
///      whenNotPaused modifier, on purpose, so pausing can never trap
///      funds already deposited.
///
///      Execution: executeBuy() is intentionally callable by anyone (a
///      keeper pattern — the same "your escrow, a keeper only runs the
///      strategy" model competitors on this chain already use). What a
///      caller of executeBuy() can and cannot do:
///        - CAN trigger a position's next scheduled buy, once its
///          interval has elapsed.
///        - CAN supply a minAmountOut that makes that one execution
///          MORE strict.
///        - CANNOT choose the token pair, the fee tier, the tranche
///          size, or the recipient — all fixed at position creation by
///          the position's owner and stored on-chain.
///        - CANNOT make an execution looser than the owner's own
///          maxSlippageBps: every executeBuy() call derives its own
///          floor from the pool's TWAP (TwapOracle, ported from
///          Uniswap's own OracleLibrary — see that file for why it is a
///          port and not a direct import) and enforces
///          max(callerMinOut, twapFloor). A malicious or lazy keeper
///          passing minAmountOut = 0 still cannot push a fill worse than
///          the owner's stated tolerance against the TWAP price — this
///          is what actually stops a sandwich attack here; the
///          alternative (trusting whatever minAmountOut a keeper
///          supplies) does not.
///        - If the pool doesn't have enough recorded history for the
///          TWAP window yet, executeBuy() reverts rather than executing
///          without protection.
///
///      What this is NOT: an audited contract. It has been reviewed by
///      hand against reentrancy, checks-effects-interactions and the
///      MEV path above, and run through Slither, but neither is a
///      substitute for a real, paid, independent audit. Size positions
///      accordingly until one has happened.
contract DcaVault is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    ISwapRouter02 public immutable swapRouter;
    IUniswapV3Factory public immutable factory;

    uint32 public constant MIN_TWAP_WINDOW = 60; // seconds
    uint32 public constant MAX_TWAP_WINDOW = 3600; // seconds
    uint16 public constant MAX_SLIPPAGE_BPS = 5000; // 50% hard ceiling — a sanity rail, not a recommendation
    uint256 public constant BPS_DENOMINATOR = 10_000;

    struct Position {
        address owner;
        address tokenIn;
        address tokenOut;
        address pool;
        uint24 fee;
        uint256 trancheAmount;
        uint256 interval; // seconds between buys
        uint256 remaining; // principal not yet spent
        uint256 lastExecuted; // timestamp of last buy (0 = never executed)
        uint16 maxSlippageBps;
        bool active;
    }

    uint256 public nextPositionId;
    mapping(uint256 => Position) public positions;

    event PositionCreated(
        uint256 indexed id,
        address indexed owner,
        address tokenIn,
        address tokenOut,
        address pool,
        uint24 fee,
        uint256 trancheAmount,
        uint256 interval,
        uint256 principal
    );
    event PositionFunded(uint256 indexed id, uint256 amount);
    event BuyExecuted(
        uint256 indexed id,
        uint256 amountIn,
        uint256 amountOut,
        uint256 twapFloor,
        address executedBy
    );
    event PositionWithdrawn(uint256 indexed id, uint256 amount);
    event PositionClosed(uint256 indexed id);

    error NotPositionOwner();
    error PositionNotActive();
    error TooSoon();
    error InsufficientRemaining();
    error InvalidParams();
    error PoolNotFound();

    constructor(address swapRouter_, address factory_, address initialOwner)
        Ownable(initialOwner)
    {
        if (swapRouter_ == address(0) || factory_ == address(0)) revert InvalidParams();
        swapRouter = ISwapRouter02(swapRouter_);
        factory = IUniswapV3Factory(factory_);
    }

    /// @notice Opens a new DCA position and funds it in one call.
    /// @param maxSlippageBps The owner's own maximum tolerated slippage
    ///        against the pool's TWAP, in basis points, enforced on
    ///        every future executeBuy() regardless of who calls it.
    function createPosition(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 trancheAmount,
        uint256 interval,
        uint16 maxSlippageBps,
        uint256 principal
    ) external whenNotPaused nonReentrant returns (uint256 id) {
        if (tokenIn == address(0) || tokenOut == address(0) || tokenIn == tokenOut) {
            revert InvalidParams();
        }
        if (trancheAmount == 0 || interval == 0 || principal < trancheAmount) {
            revert InvalidParams();
        }
        if (maxSlippageBps == 0 || maxSlippageBps > MAX_SLIPPAGE_BPS) revert InvalidParams();

        address pool = factory.getPool(tokenIn, tokenOut, fee);
        if (pool == address(0)) revert PoolNotFound();

        id = nextPositionId++;
        positions[id] = Position({
            owner: msg.sender,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            pool: pool,
            fee: fee,
            trancheAmount: trancheAmount,
            interval: interval,
            remaining: principal,
            lastExecuted: 0,
            maxSlippageBps: maxSlippageBps,
            active: true
        });

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), principal);

        emit PositionCreated(
            id, msg.sender, tokenIn, tokenOut, pool, fee, trancheAmount, interval, principal
        );
    }

    /// @notice Adds more principal to an existing position.
    function fund(uint256 id, uint256 amount) external whenNotPaused nonReentrant {
        Position storage p = positions[id];
        if (p.owner != msg.sender) revert NotPositionOwner();
        if (!p.active) revert PositionNotActive();
        if (amount == 0) revert InvalidParams();

        p.remaining += amount;
        IERC20(p.tokenIn).safeTransferFrom(msg.sender, address(this), amount);

        emit PositionFunded(id, amount);
    }

    /// @notice Executes a position's next scheduled buy. Callable by
    ///         anyone — see the contract-level docs for exactly what
    ///         that does and does not let the caller control.
    /// @param minAmountOut A caller-supplied floor for this execution.
    ///        Can only make the fill stricter than the position's own
    ///        TWAP-derived floor, never looser.
    function executeBuy(uint256 id, uint256 minAmountOut) external whenNotPaused nonReentrant {
        Position storage p = positions[id];
        if (!p.active) revert PositionNotActive();
        if (block.timestamp < p.lastExecuted + p.interval) revert TooSoon();
        if (p.remaining < p.trancheAmount) revert InsufficientRemaining();

        uint256 amountIn = p.trancheAmount;
        p.remaining -= amountIn;
        p.lastExecuted = block.timestamp;

        uint256 twapFloor = _twapFloor(p, amountIn);
        uint256 boundedMin = minAmountOut > twapFloor ? minAmountOut : twapFloor;

        // Reset-then-set: a swap that reverts partway can leave a prior
        // approval dangling, so this never assumes the router left zero
        // allowance behind.
        IERC20(p.tokenIn).forceApprove(address(swapRouter), 0);
        IERC20(p.tokenIn).forceApprove(address(swapRouter), amountIn);

        uint256 amountOut = swapRouter.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: p.tokenIn,
                tokenOut: p.tokenOut,
                fee: p.fee,
                recipient: p.owner,
                amountIn: amountIn,
                amountOutMinimum: boundedMin,
                sqrtPriceLimitX96: 0
            })
        );

        emit BuyExecuted(id, amountIn, amountOut, twapFloor, msg.sender);
    }

    /// @dev Reverts if the pool cannot serve the requested TWAP window —
    ///      that is the safe direction to fail in: no protected price
    ///      means no trade, not an unprotected one.
    function _twapFloor(Position storage p, uint256 amountIn) private view returns (uint256) {
        uint32 window = uint32(p.interval);
        if (window < MIN_TWAP_WINDOW) window = MIN_TWAP_WINDOW;
        if (window > MAX_TWAP_WINDOW) window = MAX_TWAP_WINDOW;

        int24 meanTick = TwapOracle.consultTick(p.pool, window);
        uint256 fairOut = TwapOracle.getQuoteAtTick(
            meanTick, uint128(amountIn), p.tokenIn, p.tokenOut
        );

        return (fairOut * (BPS_DENOMINATOR - p.maxSlippageBps)) / BPS_DENOMINATOR;
    }

    /// @notice Withdraws unspent principal. Always available to the
    ///         owner, paused or not.
    function withdraw(uint256 id, uint256 amount) external nonReentrant {
        Position storage p = positions[id];
        if (p.owner != msg.sender) revert NotPositionOwner();
        if (amount == 0 || amount > p.remaining) revert InvalidParams();

        p.remaining -= amount;
        IERC20(p.tokenIn).safeTransfer(msg.sender, amount);

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
            IERC20(p.tokenIn).safeTransfer(msg.sender, amount);
        }

        emit PositionWithdrawn(id, amount);
        emit PositionClosed(id);
    }

    /// @notice Pauses new position creation, funding and buy execution.
    ///         Never affects withdraw() or withdrawAllAndClose().
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
