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

interface IMultiFlashLoanBorrower {
    /*
     *@dev This function lends several ERC20 tokens in one TX
     *@notice all arrays (tokens, amount, fees) should have the length and each index acts like a map key to the same data
     *@param sender Address which initiated the flash loan
     *@param tokens Array of ERC20 tokens to be sent to the borrower
     *@param amounts Array of the amounts for each ERC20 to be sent
     *@param fees Fees per token to be repaid to the msg.sender
     *@param data Bytes to be passed to the borrower
     */
    function onMultiFlashLoan(
        address sender,
        IERC20[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata fees,
        bytes calldata data
    ) external;
}
