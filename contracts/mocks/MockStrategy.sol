// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/IStrategy.sol";

contract MockStrategy is IStrategy {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public immutable midasTreasury;
    int256 public profit;

    constructor(IERC20 _token, address _midasTreasury) {
        token = _token;
        midasTreasury = _midasTreasury;
    }

    modifier onlyMidasTreasury() {
        require(msg.sender == midasTreasury, "MS: Only Midas Treasury");
        _;
    }

    function setProfit(int256 _profit) external {
        profit = _profit;
    }

    function invest(uint256) external view override onlyMidasTreasury {
        return;
    }

    function harvest(uint256, address)
        external
        view
        override
        onlyMidasTreasury
        returns (int256)
    {
        return profit;
    }

    function withdraw(uint256 amount)
        external
        override
        onlyMidasTreasury
        returns (uint256 actualAmount)
    {
        token.safeTransfer(midasTreasury, amount);
        actualAmount = amount;
    }

    function exit(uint256 balance)
        external
        override
        onlyMidasTreasury
        returns (int256 amountAdded)
    {
        uint256 actualBalance = token.balanceOf(address(this));
        token.safeTransfer(midasTreasury, actualBalance);
        return int256(actualBalance) - int256(balance);
    }
}
