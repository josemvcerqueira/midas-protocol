// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IWETH {
    //@dev It converts ETH to WETH
    function deposit() external payable;

    //@dev IT allows you to redeem your ETH back in exchange for WETH
    function withdraw(uint256) external;
}
