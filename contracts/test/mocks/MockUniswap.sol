// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Test-only mocks. Not part of the deployed system — these stand in
///      for the real Uniswap V3 Factory/Pool/SwapRouter02 so DcaVault's
///      own logic (custody, access control, TWAP-floor enforcement) can
///      be exercised locally without a forked mainnet.

contract MockUniswapV3Factory {
    address public pool;

    function setPool(address pool_) external {
        pool = pool_;
    }

    function getPool(address, address, uint24) external view returns (address) {
        return pool;
    }
}

contract MockUniswapV3Pool {
    // Controls what consultTick() resolves to: observe() is mocked so
    // that (tickCumulatives[1] - tickCumulatives[0]) / window == mockTick
    // exactly, for any requested window — see the derivation in the repo
    // notes. This lets a test set an exact TWAP price deterministically.
    int56 public mockTick;

    function setMockTick(int56 tick_) external {
        mockTick = tick_;
    }

    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)
    {
        tickCumulatives = new int56[](secondsAgos.length);
        secondsPerLiquidityCumulativeX128s = new uint160[](secondsAgos.length);
        for (uint256 i = 0; i < secondsAgos.length; i++) {
            tickCumulatives[i] = -mockTick * int56(uint56(secondsAgos[i]));
        }
    }
}

contract MockSwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    // The exact amountOut this mock will produce on the next call —
    // settable per test so both a fair fill and a bad-price fill (below
    // the vault's TWAP floor) can be simulated.
    uint256 public nextAmountOut;

    function setNextAmountOut(uint256 amountOut_) external {
        nextAmountOut = amountOut_;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut)
    {
        amountOut = nextAmountOut;
        require(amountOut >= params.amountOutMinimum, "MockSwapRouter02: below amountOutMinimum");

        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        // The mock just mints-equivalent by transferring from its own
        // pre-funded balance — tests fund it with tokenOut up front.
        require(
            IERC20(params.tokenOut).transfer(params.recipient, amountOut),
            "MockSwapRouter02: transfer out failed"
        );
    }
}

/// @dev Reentrancy probe: a malicious token that calls back into the
///      vault from inside transfer() or transferFrom() — whichever the
///      vault actually calls at the point being tested. Used to prove
///      ReentrancyGuard actually blocks it, not just that the vault's
///      code happens not to be attacked by this particular mock.
interface IReentrancyTarget {
    function withdraw(uint256 id, uint256 amount) external;
    function executeBuy(uint256 id, uint256 minAmountOut) external;
}

contract ReentrantERC20 is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;
    uint256 public override totalSupply;

    address public attackTarget;
    uint256 public attackPositionId;
    bool public reenterOnTransfer;
    bool public reenterOnTransferFrom;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function configureAttack(
        address target,
        uint256 positionId,
        bool onTransfer,
        bool onTransferFrom
    ) external {
        attackTarget = target;
        attackPositionId = positionId;
        reenterOnTransfer = onTransfer;
        reenterOnTransferFrom = onTransferFrom;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        if (reenterOnTransfer) {
            reenterOnTransfer = false; // one shot, avoids infinite recursion in the test
            IReentrancyTarget(attackTarget).withdraw(attackPositionId, 1);
        }
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        if (reenterOnTransferFrom) {
            reenterOnTransferFrom = false;
            IReentrancyTarget(attackTarget).executeBuy(attackPositionId, 0);
        }
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function name() external pure returns (string memory) {
        return "Reentrant";
    }
}
