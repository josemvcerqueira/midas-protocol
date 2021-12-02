// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../lib/RebaseLibrary.sol";

contract MockRebaseLibrary {
    using RebaseLibrary for Rebase;
    Rebase public total;
    uint256 public base;
    uint256 public elastic;

    function set(uint128 _base, uint128 _elastic) external {
        total.elastic = _elastic;
        total.base = _base;
    }

    function toBase(
        Rebase memory _total,
        uint256 _elastic,
        bool roundUp
    ) external pure returns (uint256) {
        return _total.toBase(_elastic, roundUp);
    }

    function toElastic(
        Rebase memory _total,
        uint256 _base,
        bool roundUp
    ) external pure returns (uint256) {
        return _total.toElastic(_base, roundUp);
    }

    function add(uint256 _elastic, bool roundUp) external {
        (Rebase memory _total, uint256 _base) = total.add(_elastic, roundUp);
        total = _total;
        base = _base;
    }

    function sub(uint256 _base, bool roundUp) external {
        (Rebase memory _total, uint256 _elastic) = total.sub(_base, roundUp);
        total = _total;
        elastic = _elastic;
    }

    function add2(uint256 _base, uint256 _elastic) external {
        total = total.add(_base, _elastic);
    }

    function sub2(uint256 _base, uint256 _elastic) external {
        total = total.sub(_base, _elastic);
    }

    function addElastic(uint256 _elastic) external {
        total.addElastic(_elastic);
    }

    function subElastic(uint256 _elastic) external {
        total.subElastic(_elastic);
    }
}
