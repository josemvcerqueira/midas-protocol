// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IMasterContract {
    /*
     *@notice This function gets called after being deployed and should be idempotent and only callable once
     *@param data Any arbitrary series of arguments abi encoded
     */
    function initialize(bytes calldata data) external payable;
}
