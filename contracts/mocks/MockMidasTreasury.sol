// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/IMasterContractManager.sol";

import "../lib/RebaseLibrary.sol";

import "../MidasTreasury.sol";

contract MockMidasTreasury is MidasTreasury {
    using SafeERC20 for IERC20;
    using RebaseLibrary for Rebase;

    constructor(IERC20 weth, IMasterContractManager masterContract)
        MidasTreasury(weth, masterContract)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function addProfit(IERC20 token, uint256 amount) external {
        token.safeTransferFrom(_msgSender(), address(this), amount);
        totals[token].addElastic(amount);
    }
}
