// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IMasterContractManager {
  /*
  *@notice This function registers a protocol to be later approved by users. masterContractOf -> masterContract -> masterContract
  *@events emits the LogRegisterProtocol with the masterContract address
  */
  function registerProtocol() external;
}