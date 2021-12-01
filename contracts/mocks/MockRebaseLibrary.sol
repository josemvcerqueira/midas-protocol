// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../lib/RebaseLibrary.sol";

contract MockRebaseLibrary {
  function toBase(   Rebase memory total,
            uint256 elastic,
        bool roundUp) external pure returns(uint256) {
          return RebaseLibrary.toBase(total, elastic, roundUp);
        }
}