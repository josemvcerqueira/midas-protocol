// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./MasterContractFactory.sol";

contract MasterContractManager is MasterContractFactory, Ownable, EIP712 {
    // EVENTS
    event LogRegisterProtocol(address indexed protocol);
    event LogWhitelistMasterContract(address indexed masterContract, bool approvalState);
    event LogSetMasterContractApproval(address indexed masterContract, address indexed user, bool approvalState);

    // STATE 
    //@dev to store whitelisted master contracts
    mapping(address => bool) public whitelistedMasterContracts;
    //@dev store the approval state between masterContract and user :: masterContract -> user -> approvalState
    mapping(address => mapping(address => bool)) public masterContractApprovals;
    //@dev protect agaisnt signature replay
    mapping(address => uint) public nonces;
    bytes32 private constant APPROVAL_SIGNATURE_HASH = keccak256("setMasterContractApproval(string warning,address user,address masterContract,bool approvalState,uint256 nonce)") ;

    /*
    *@dev build the domain separator for EIP712 and cache it
    */
    // solhint-disable-next-line no-empty-blocks
    constructor() EIP712("Midas Kingdom", "V1") {}
    
    // PURE FUNCTIONS

    /*
    *@returns bytes32 the current cached domain separator
    */
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
      return  _domainSeparatorV4();
    }

    // IMPURE FUNCTIONS

    /*
    *@dev Contracts need to be registered before being approved by users
    *@event LogRegisterProtocol
    */
    function registerProtocol() public {
      masterContractOf[msg.sender] = msg.sender;
      emit LogRegisterProtocol(msg.sender);
    }

    /*
    *@dev EIP-712 compliant function that approves or disproves the masterContract from controlling a user's funds
    *@param user -> That is giving approval or disproval to the masterContract
    *@param masterContract -> The contract that is gaining or losing approval
    *@param approvalState -> Boolean value that will determine the permission between user and masterContract
    *@param v -> Part of the signature. (See EIP-191)
    *@param r -> Part of the signature. (See EIP-191)
    *@param s -> Part of the signature. (See EIP-191)
    *@event LogSetMasterContractApproval
    */
    function setMasterContractApproval(address user, address masterContract, bool approvalState, uint8 v, bytes32 r, bytes32 s) external {
      require(masterContract != address(0), "MCM: cannot be ZERO ADDRESS");

    
      if (v ==0 && r == 0 && s == 0) {
      /*
      *@dev if no signature is provided the following conditions must be met
      *@condition1 the user must be the one registering himself
      *@condition2 the user cannot be a registered protocol or clone
      *@condition3 the masterContract must be whitelisted
      */
        require(user ==msg.sender, "MCM: user must be the sender");
        require(masterContractOf[user] == address(0), "MCM: user must not be registered");
        require(whitelistedMasterContracts[masterContract], "MCM: masterC not registered");
      } else {
             // Important for security - any address without masterContract has address(0) as masterContract
            // So approving address(0) would approve every address, leading to full loss of funds
            // Also, ecrecover returns address(0) on failure. So we check this:
            require(user != address(0), "MCM: user cannot be ZERO ADDRESS");

            /*@dev verifies that the message was signed by the user
            * ECDSA Lib will throw an error if the signature returns the ZERO ADDRESS but just in case we check beforehand
            */
            require(ECDSA.recover(_hashTypedDataV4(keccak256(
              abi.encode(
                APPROVAL_SIGNATURE_HASH,
                approvalState
                  ? keccak256("Give FULL access to funds in (and approved to) Midas Kingdom V1?")
                  : keccak256("Revoke access to Midas kingdom V1"),
                user,
                masterContract,
                approvalState,
                nonces[user]++
              )
            )), v, r, s) == user, "MCM: invalid user signature");
      }

      masterContractApprovals[masterContract][user] = approvalState;
      emit LogSetMasterContractApproval(masterContract, user, approvalState);
    }



    // OWNER ONLY

    /*
    *@desc This function can be used to approve and disapprove a master contract
    *@param masterContract -> the address of the master to be registered
    *@param approvedState -> the new state of the 
    *@event LogWhitelistMasterContract
    */
    function whitelistMasterContract(address masterContract, bool approvedState) external onlyOwner {
      require(masterContract != address(0), "MCM: cannot be ZERO Address");
      whitelistedMasterContracts[masterContract] = approvedState;
      emit LogWhitelistMasterContract(masterContract, approvedState);
    }
}
