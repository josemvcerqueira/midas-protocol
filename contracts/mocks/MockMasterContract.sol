// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "../interfaces/IMasterContract.sol";
import "../interfaces/IMasterContractManager.sol";

contract MockMasterContract is ERC20Upgradeable, IMasterContract {

  function initialize(bytes calldata data) external payable override {
    (string memory name, string memory symbol) = abi.decode(data, (string, string));
    __ERC20_init_unchained(name, symbol);
  } 

  function getInitializeData(string calldata name, string calldata symbol) external pure returns(bytes memory data) {
    return abi.encode(name, symbol);
  }

  /*
  *@notice this is to test the masterContractManager registerProtocol function
  *@param masterContractManager the address of the master contract manager to register this protocol on
  */
  function register(address masterContractManager) external {
    IMasterContractManager(masterContractManager).registerProtocol();
  }
}