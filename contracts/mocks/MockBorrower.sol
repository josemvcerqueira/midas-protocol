// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../interfaces/IFlashLoan.sol";

contract MockBorrower is IFlashLoanBorrower {
    //@dev to test that onFlashLoan receives the correct arguments
    event LogFlashLoan(
        address indexed sender,
        IERC20 token,
        uint256 amount,
        uint256 fee,
        bytes data
    );

    function onFlashLoan(
        address sender,
        IERC20 token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external {
        token.transfer(msg.sender, amount + fee);
        emit LogFlashLoan(sender, token, amount, fee, data);
    }
}
