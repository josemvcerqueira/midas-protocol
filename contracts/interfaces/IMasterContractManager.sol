// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IMasterContractManager {
    /*
     *@notice This function registers a protocol to be later approved by users. masterContractOf -> masterContract -> masterContract
     *@events emits the LogRegisterProtocol with the masterContract address
     */
    function registerProtocol() external;

    /*
     *@notice Returns the masterContract associated with an account
     *@param account Address to look up its associated masterContract
     *@return masterContract address
     */
    function masterContractOf(address account) external returns (address);

    /*
     *@notice returns if the masterContract has access to manage the funds of this account
     *@param masterContract Address of the masterContract
     *@param account The address which to look up if the master contract has permission to access its funds
     *@return bool `true` if the masterContract has access and `false` if it does not
     */
    function masterContractApprovals(address masterContract, address account)
        external
        returns (bool);
}
