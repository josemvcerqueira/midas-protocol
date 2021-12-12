// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/IMasterContract.sol";
import "../interfaces/IMasterContractManager.sol";

import "../MidasTreasury.sol";

contract MockMasterContract is ERC20Upgradeable, IMasterContract {
    // solhint-disable-next-line var-name-mixedcase
    MidasTreasury public Midas;

    function initialize(bytes calldata data) external payable override {
        (string memory name, string memory symbol) = abi.decode(
            data,
            (string, string)
        );
        __ERC20_init_unchained(name, symbol);
    }

    function getInitializeData(string calldata name, string calldata symbol)
        external
        pure
        returns (bytes memory data)
    {
        return abi.encode(name, symbol);
    }

    /*
     *@notice this is to test the masterContractManager registerProtocol function
     *@param masterContractManager the address of the master contract manager to register this protocol on
     */
    function register(address masterContractManager) external {
        IMasterContractManager(masterContractManager).registerProtocol();
    }

    function setMidasTreasury(MidasTreasury midasTreasury) external {
        Midas = midasTreasury;
    }

    function deposit(IERC20 token, uint256 amount) external {
        Midas.deposit(token, msg.sender, msg.sender, amount, 0);
    }

    function withdraw(IERC20 token, uint256 amount) external {
        Midas.withdraw(token, msg.sender, msg.sender, amount, 0);
    }

    function midasTransfer(
        IERC20 token,
        address to,
        uint256 shares
    ) external {
        Midas.transfer(token, msg.sender, to, shares);
    }
}
