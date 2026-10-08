// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import {TickMath} from "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

/// @title TwapOracle
/// @notice A deliberately small port of Uniswap's own OracleLibrary
///         (the v3-periphery package, contracts/libraries/OracleLibrary.sol),
///         trimmed to exactly the two functions DcaVault needs.
/// @dev Why a port instead of importing the original: the original is
///      pragma-locked to `>=0.5.0 <0.8.0` and this project is on 0.8.24
///      for OpenZeppelin 5's security primitives; the two cannot compile
///      together. TickMath and FullMath — the parts with the actual
///      non-obvious bit/fixed-point math — are NOT reimplemented here;
///      they are imported unmodified from the v3-core package, version
///      `1.0.2-solc-0.8-simulate`, an official 0.8.x
///      build published under Uniswap's own npm scope. This file only
///      contains the same straightforward glue code the original
///      `consult`/`getQuoteAtTick` have — copied with the same variable
///      names and comments so it stays checkable line-by-line against
///      the source it was ported from.
///
///      One deliberate omission: the original `consult()` also computes
///      `harmonicMeanLiquidity`, which involves a subtraction over a
///      cumulative counter that is allowed to wrap by design and needs
///      an `unchecked` block under 0.8's default checked arithmetic.
///      DcaVault never uses that value, so it is left out entirely
///      instead of porting arithmetic this file has no way to exercise
///      or verify. Smaller ported surface, smaller place for a porting
///      mistake to hide.
library TwapOracle {
    /// @notice The arithmetic mean tick over the last `secondsAgo` seconds.
    /// @dev Identical in spirit to OracleLibrary.consult(), minus the
    ///      liquidity computation this contract has no use for.
    function consultTick(address pool, uint32 secondsAgo)
        internal
        view
        returns (int24 arithmeticMeanTick)
    {
        require(secondsAgo != 0, "TwapOracle: zero window");

        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = secondsAgo;
        secondsAgos[1] = 0;

        (int56[] memory tickCumulatives, ) = IUniswapV3Pool(pool).observe(secondsAgos);

        int56 tickCumulativesDelta = tickCumulatives[1] - tickCumulatives[0];

        arithmeticMeanTick = int24(tickCumulativesDelta / int56(uint56(secondsAgo)));
        // Always round to negative infinity, matching the original.
        if (tickCumulativesDelta < 0 && (tickCumulativesDelta % int56(uint56(secondsAgo)) != 0)) {
            arithmeticMeanTick--;
        }
    }

    /// @notice Given a tick and a token amount, the amount of the other
    ///         token it is worth at that tick. Copied unchanged from
    ///         OracleLibrary.getQuoteAtTick() — pure fixed-point math,
    ///         nothing version-specific to adapt.
    function getQuoteAtTick(
        int24 tick,
        uint128 baseAmount,
        address baseToken,
        address quoteToken
    ) internal pure returns (uint256 quoteAmount) {
        uint160 sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);

        if (sqrtRatioX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtRatioX96) * sqrtRatioX96;
            quoteAmount = baseToken < quoteToken
                ? FullMath.mulDiv(ratioX192, baseAmount, 1 << 192)
                : FullMath.mulDiv(1 << 192, baseAmount, ratioX192);
        } else {
            uint256 ratioX128 = FullMath.mulDiv(sqrtRatioX96, sqrtRatioX96, 1 << 64);
            quoteAmount = baseToken < quoteToken
                ? FullMath.mulDiv(ratioX128, baseAmount, 1 << 128)
                : FullMath.mulDiv(1 << 128, baseAmount, ratioX128);
        }
    }
}
