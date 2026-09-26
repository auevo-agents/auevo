// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Test-only mock IPriceOracle — a settable fair-quote for exercising
///      DcaVaultV4's oracle-configured floor path deterministically.
contract MockPriceOracle {
    uint256 public nextQuote;

    function setNextQuote(uint256 amountOut_) external {
        nextQuote = amountOut_;
    }

    function quote(address, address, uint256) external view returns (uint256) {
        return nextQuote;
    }
}
