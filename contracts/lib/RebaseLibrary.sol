// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";

struct Rebase {
    uint128 elastic;
    uint128 base;
}

library RebaseLibrary {
    using SafeCast for uint256;

    /*@dev calculates a new base based on a new elastic keeping the ratio from a base/elastic pair
     *@param total -> Rebase struct which represents a base/elastic pair
     *@param elastic -> the new elastic in which the new base will be based on
     *@param roundUp -> rounding logic due to solidity always rounding down
     *@returns base -> the new calculated base
     */
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

    /*@dev calculates a new elastic based on a new base keeping the ratio from a base/elastic pair
     *@param total -> Rebase struct which represents a base/elastic pair
     *@param base -> the new base in which the new elastic will be based on
     *@param roundUp -> rounding logic due to solidity always rounding down
     *@returns elastic -> the new calculated elastic
     */
    function toElastic(
        Rebase memory total,
        uint256 base,
        bool roundUp
    ) internal pure returns (uint256 elastic) {
        if (total.base == 0) {
            elastic = base;
        } else {
            elastic = (base * total.elastic) / total.base;
            if (roundUp && (elastic * total.base) / total.elastic < base) {
                elastic += 1;
            }
        }
    }

    /*@dev calculates new values to a Rebase pair by adding a new elastic, this function maintains the ratio of the current pair
     *@param total -> Rebase struct which represents a base/elastic pair
     *@param elastic -> the new elastic to be added to the  pair and be used to find the how much base to substract
     *@param roundUp -> rounding logic due to solidity always rounding down
     *@returns (total, base) -> pair of the new Rebase pair values and the added base value
     */
    function add(
        Rebase memory total,
        uint256 elastic,
        bool roundUp
    ) internal pure returns (Rebase memory, uint256 base) {
        base = toBase(total, elastic, roundUp);
        total.elastic += elastic.toUint128();
        total.base += base.toUint128();
        return (total, base);
    }

    /*@dev calculates new values to a Rebase pair by subtracting a new base, this function maintains the ratio of the current pair
     *@param total -> Rebase struct which represents a base/elastic pair
     *@param base -> the base to be subtracted to the pair and be used to find how much elastic to subtract
     *@param roundUp -> rounding logic due to solidity always rounding down
     *@returns (total, elastic) -> pair of the new Rebase pair values and the how much elastic was removed from the total
     */
    function sub(
        Rebase memory total,
        uint256 base,
        bool roundUp
    ) internal pure returns (Rebase memory, uint256 elastic) {
        elastic = toElastic(total, base, roundUp);
        total.elastic -= elastic.toUint128();
        total.base -= base.toUint128();
        return (total, elastic);
    }
}
