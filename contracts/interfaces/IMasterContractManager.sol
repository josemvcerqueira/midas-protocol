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

    /*
     *@notice Function to give or remove a master contract control of a user funds
     *@param user Address which is giving permission
     *@param masterContract Master contract which will gain or lose permission
     *@param binary option to give or take permission
     *@param v -> Part of the signature. (See EIP-191)
     *@param r -> Part of the signature. (See EIP-191)
     *@param s -> Part of the signature. (See EIP-191)
     */
    function setMasterContractApproval(
        address user,
        address masterContract,
        bool approvalState,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
