// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/proxy/Clones.sol";

import "./interfaces/IMasterContract.sol";

contract MasterContractFactory {
  // EVENTS 
  event CloneDeployed(address indexed mastercontract, bytes data, address indexed clonedAddress);

  // STATE
  mapping(address => address) public masterContractOf;


  // PURE FUNCTIONS

  /*
  *@dev this allows you to know the address before/after deployment for offchain purposes
  *@param masterContract the implementation contract 
  *@param salt the keccak256 hash of the data to be passed to the initialize function
  *@returns the address of the clone
  */
  function predictCloneAddress(address masterContract, bytes32 salt) external view returns (address) {
    return Clones.predictDeterministicAddress(masterContract, salt);
  }

  // IMPURE FUNCTIONS

  /*
  *@dev clones a master contract using the nondeterministic minimal proxy implementation
  * Master contract should follow the IMasterContract implementation
  * It calls the _initialize function to update state and emit the event CloneDeployed
  * It accepts ETH which is passed to the clone
  *@param masterContract The contract to be cloned
  *@param data The data to be passed after deployment to the initialize function 
  *@returns cloneAddress the address of the cloned contract
  */
  function clone(address masterContract, bytes calldata data) external payable returns(address cloneAddress) {
    require(masterContract != address(0), "MCF: Dead address");

    cloneAddress = Clones.clone(masterContract);

   _initialize(masterContract, cloneAddress, data, msg.value); 
  }

  /*
  *@dev clones a master contract using the deterministic minimal proxy implementation using the data as the salt
  * Master contract should follow the IMasterContract implementation
  * It calls the _initialize function to update state and emit the event CloneDeployed
  * It accepts ETH which is passed to the clone
  *@param masterContract The contract to be cloned
  *@param data The data to be passed after deployment to the initialize function 
  *@returns cloneAddress the address of the cloned contract
  */
  function deterministicClone(address masterContract, bytes calldata data) external payable returns(address cloneAddress) {
    require(masterContract != address(0), "MCF: Dead address");

    // Each clone should be initialized with different data, otherwise they r not needed.
    bytes32 salt = keccak256(data);

    cloneAddress = Clones.cloneDeterministic(masterContract, salt);

    _initialize(masterContract, cloneAddress, data, msg.value);
  }


  /*
  *@dev updated the state to map the clone address to the master address, initializes the clone and emits the event CloneDeployed
  *@param masterContract the contract to be cloned
  *@param cloneAddress the address of the cloned contract
  *@param data data to be passed to the initialize function
  *@param value the amount of ETH to be passed to the initialize function
  */
  function _initialize(address masterContract, address cloneAddress, bytes calldata data, uint value)     private {
    
    masterContractOf[cloneAddress] = masterContract;

    IMasterContract(cloneAddress).initialize{value: value}(data);

    emit CloneDeployed(masterContract, data, cloneAddress); 
  }
}