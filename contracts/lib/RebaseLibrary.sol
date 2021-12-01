// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

struct Rebase {
    uint128 elastic;
    uint128 base;
}

library RebaseLibrary {
    function toBase(
        Rebase memory total,
        uint256 elastic,
        bool roundUp
    ) internal pure returns (uint256 base) {
        if (total.elastic == 0) {
            base = elastic;
        } else {
            base = (elastic * total.base) / total.elastic;
            if (roundUp && (base * total.elastic) / total.base < elastic) {
                base += 1;
            }
        }
    }
}
