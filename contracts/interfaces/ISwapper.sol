// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISwapper {
    /// @notice Withdraws 'amountFrom' of token 'from' from the Midas Treasury account for this swapper.
    /// Swaps it for at least 'amountToMin' of token 'to'.
    /// Transfers the swapped tokens of 'to' into the Midas Treasury using a plain ERC20 transfer.
    /// Returns the amount of tokens 'to' transferred to Midas Treasury.
    /// (The Midas Treasury invest function will be used by the caller to get the swapped funds).
    function swap(
        IERC20 fromToken,
        IERC20 toToken,
        address recipient,
        uint256 shareFrom,
        uint256 amountToMin
    ) external returns (uint256 extraShare, uint256 shareReturned);

    /// @notice Calculates the amount of token 'from' needed to complete the swap (amountFrom),
    /// this should be less than or equal to amountFromMax.
    /// Withdraws 'amountFrom' of token 'from' from the Midas Treasury Midas Treasury account for this swapper.
    /// Swaps it for exactly 'exactAmountTo' of token 'to'.
    /// Transfers the swapped tokens of 'to' into the Midas Treasury using a plain ERC20 transfer.
    /// Transfers allocated, but unused 'from' tokens within the Midas Treasury to 'refundTo' (amountFromMax - amountFrom).
    /// Returns the amount of 'from' tokens withdrawn from Midas Treasury (amountFrom).
    /// (The Midas Treasury skim function will be used by the caller to get the swapped funds).
    function swapExact(
        IERC20 fromToken,
        IERC20 toToken,
        uint256 shareFromSupplied,
        address recipient,
        uint256 shareToExact,
        address refundTo
    ) external returns (uint256 shareUsed, uint256 shareReturned);
}
