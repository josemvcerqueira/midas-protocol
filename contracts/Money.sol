// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "./MidasTreasury.sol";

contract Money is ERC20Permit, ERC20Burnable, Ownable {
    /*********************************** LIBRARIES ***********************************/

    using SafeCast for uint256;

    //solhint-disable-next-line no-empty-blocks
    constructor() ERC20("Money", "MNY") ERC20Permit("Money") {}

    /*********************************** STRUCTS ***********************************/

    struct Minting {
        uint128 time;
        uint128 amount;
    }

    /*********************************** CONSTANTS ***********************************/

    uint256 private constant MINTING_PERIOD = 24 hours;
    uint256 private constant MINTING_INCREASE = 15000;
    uint256 private constant MINTING_PRECISION = 1e5;

    /*********************************** STATE ***********************************/

    Minting public lastMint;

    /*********************************** ONLY OWNER FUNCTIONS ***********************************/

    /*
     *@dev Allows limited minting (once every 24 hours and only 0.15% increase) to an arbitrary address, which is not the zero address
     *@param to Address that will receieve the new tokens
     *@param amount Number of tokens the `to` address will get
     *@event Transfer
     */
    function mint(address to, uint256 amount) external onlyOwner {
        // CHECKS
        require(to != address(0), "MNY: no mint to zero address");

        uint256 totalMintedAmount = uint256(
            //solhint-disable-next-line not-rely-on-time
            lastMint.time < block.timestamp - MINTING_PERIOD
                ? 0
                : lastMint.amount
        ) + amount;

        uint256 _totalSupply = totalSupply();
        // CHECKS
        //@dev can only increase supply by 0.15% every 24 hours, unless it is the first time minting
        require(
            _totalSupply == 0 ||
                (_totalSupply * MINTING_INCREASE) / MINTING_PRECISION >=
                totalMintedAmount,
            "MNY: cannot mint this much"
        );

        //solhint-disable-next-line not-rely-on-time
        lastMint.time = block.timestamp.toUint128();
        lastMint.amount = totalMintedAmount.toUint128();

        // EFFECT
        _mint(to, amount);
    }

    /*
     *@dev It mints this token to this contract. Then it deposits to Midas and gives the shares of the minted tokens to the masterContract
     *@param midas MidasTreasury which the new minted tokens will be deposited to
     *@param masterContract The contract which will recieve the shares associated with the new minted tokens
     *@param amount How many tokens to mint
     */
    function midasMintTo(
        MidasTreasury midas,
        address masterContract,
        uint256 amount
    ) external onlyOwner {
        _mint(address(this), amount);
        IERC20(this).approve(address(midas), amount);
        midas.deposit(IERC20(this), address(this), masterContract, amount, 0);
    }
}
