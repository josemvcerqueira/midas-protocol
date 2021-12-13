// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../interfaces/IFlashLoan.sol";

contract MockMaliciousBorrower is IFlashLoanBorrower {
    function onFlashLoan(
        address,
        IERC20,
        uint256,
        uint256,
        bytes calldata // solhint-disable-next-line no-empty-blocks
    ) external {
        //@notice does not pay the loan back
    }
}
