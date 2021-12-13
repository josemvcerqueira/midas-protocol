// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFlashLoanBorrower {
    /*
     *@dev The amount + fee is expected to be paid back to the msg.sender or the TX will revert
     *@param sender Address which initiated the flash loan
     *@param token ERC20 the borrower wishes to borrow
     *@param amount Amount of tokens the borrower wishes to borrow
     *@param fee The msg.sender is expected to receieve the Amount + fee in ERC20 token back
     *@param data Bytes to be passed to the borrower
     */
    function onFlashLoan(
        address sender,
        IERC20 token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external;
}
