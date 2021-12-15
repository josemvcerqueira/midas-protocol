// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "./interfaces/IMasterContract.sol";
import "./interfaces/IOracle.sol";
import "./interfaces/ISwapper.sol";

import "./lib/RebaseLibrary.sol";

import "./Money.sol";
import "./MidasTreasury.sol";

contract Actions {
    // Functions that need accrue to be called
    uint8 internal constant ACTION_REPAY = 2;
    uint8 internal constant ACTION_REMOVE_COLLATERAL = 4;
    uint8 internal constant ACTION_BORROW = 5;
    uint8 internal constant ACTION_GET_REPAY_SHARE = 6;
    uint8 internal constant ACTION_GET_REPAY_PART = 7;
    uint8 internal constant ACTION_ACCRUE = 8;

    // Functions that don't need accrue to be called
    uint8 internal constant ACTION_ADD_COLLATERAL = 10;
    uint8 internal constant ACTION_UPDATE_EXCHANGE_RATE = 11;

    // Function on MIDAS
    uint8 internal constant ACTION_MIDAS_DEPOSIT = 20;
    uint8 internal constant ACTION_MIDAS_WITHDRAW = 21;
    uint8 internal constant ACTION_MIDAS_TRANSFER = 22;
    uint8 internal constant ACTION_MIDAS_TRANSFER_MULTIPLE = 23;
    uint8 internal constant ACTION_MIDAS_SETAPPROVAL = 24;

    // Any external call (except to MIDAS)
    uint8 internal constant ACTION_CALL = 30;

    int256 internal constant USE_VALUE1 = -1;
    int256 internal constant USE_VALUE2 = -2;

    /*
     *@dev A helper functions to properly parse the actions value and choose between `value1` or `value2`
     *@param inNum if inNum is positive or 0, return it if not choose between value 1 or value 2
     @param value1 The value returned if inNum is -1
     @param value2 The value returned if inNum is -2
     */
    function _num(
        int256 inNum,
        uint256 value1,
        uint256 value2
    ) internal pure returns (uint256 outNum) {
        outNum = inNum >= 0
            ? uint256(inNum)
            : (inNum == USE_VALUE1 ? value1 : value2);
    }
}

contract MidasTouch is Ownable, IMasterContract, Actions {
    /*********************************** LIBRARY ***********************************/

    using RebaseLibrary for Rebase;
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    /*********************************** EVENTS ***********************************/

    event LogExchangeRate(uint256 rate);

    event LogAccrue(uint256 accruedAmount);

    event LogAddCollateral(
        address indexed from,
        address indexed to,
        uint256 share
    );

    event LogRemoveCollateral(
        address indexed from,
        address indexed to,
        uint256 share
    );

    event LogBorrow(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 part
    );

    event LogRepay(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 part
    );

    event LogFeeTo(address indexed newFeeTo);

    event LogWithdrawFees(address indexed feeTo, uint256 feesEarnedFraction);

    /*********************************** STRUCTS ***********************************/

    struct AccrueInfo {
        uint64 lastAccrued;
        uint128 feesEarned;
        // solhint-disable-next-line var-name-mixedcase
        uint64 INTEREST_PER_SECOND;
    }

    struct CookStatus {
        bool needsSolvencyCheck;
        bool hasAccrued;
    }

    /*********************************** IMMUTABLES ***********************************/

    // Master Contract and clone variable
    // solhint-disable-next-line var-name-mixedcase
    MidasTreasury public immutable MIDAS_TREASURY;

    // Master Contract and clone variable
    // solhint-disable-next-line var-name-mixedcase
    IERC20 public immutable MONEY;

    // Master Contract and clone variable
    // solhint-disable-next-line var-name-mixedcase
    MidasTouch public MASTER_CONTRACT;

    /*********************************** STATE ***********************************/

    // Master Contract only variable
    address public feeTo;

    // Clone only variable
    IERC20 public collateral;

    // Clone only variable
    IOracle public oracle;

    // Clone only variable
    bytes public oracleData;

    // Clone only variable
    uint256 public totalCollateralShare;

    // Clone only variable
    Rebase public totalBorrow;

    // Clone only variable
    mapping(address => uint256) public userCollateralShare;

    // Clone only variable
    mapping(address => uint256) public userBorrowPart;

    // Clone only variable
    uint256 public exchangeRate;

    // Clone only variable
    AccrueInfo public accrueInfo;

    /*********************************** SETTINGS ***********************************/

    // solhint-disable-next-line var-name-mixedcase
    uint256 public COLLATERIZATION_RATE;

    uint256 private constant COLLATERIZATION_RATE_PRECISION = 1e5; // Must be less than EXCHANGE_RATE_PRECISION (due to optimization in math)

    uint256 private constant EXCHANGE_RATE_PRECISION = 1e18;

    // solhint-disable-next-line var-name-mixedcase
    uint256 public LIQUIDATION_MULTIPLIER;

    uint256 private constant LIQUIDATION_MULTIPLIER_PRECISION = 1e5;

    // solhint-disable-next-line var-name-mixedcase
    uint256 public BORROW_OPENING_FEE;

    uint256 private constant BORROW_OPENING_FEE_PRECISION = 1e5;

    uint256 private constant DISTRIBUTION_PART = 10;
    uint256 private constant DISTRIBUTION_PRECISION = 100;

    /*********************************** CONSTRUCTOR ***********************************/

    /*
     *@dev This is only used for the first master contract deployment. The clones will be initialized via the initialize function
     *@param midasTreasury Midas Treasury address
     *@param money Money ERC20 address
     */
    constructor(MidasTreasury midasTreasury, IERC20 money) {
        MIDAS_TREASURY = midasTreasury;
        MONEY = money;
        MASTER_CONTRACT = this;
    }

    /*********************************** INITIALIZER ***********************************/

    function initialize(bytes calldata data) external payable {
        require(address(collateral) == address(0), "MT: already initialized");
        (
            collateral,
            oracle,
            oracleData,
            accrueInfo.INTEREST_PER_SECOND,
            LIQUIDATION_MULTIPLIER,
            COLLATERIZATION_RATE,
            BORROW_OPENING_FEE
        ) = abi.decode(
            data,
            (IERC20, IOracle, bytes, uint64, uint256, uint256, uint256)
        );
        require(
            address(collateral) != address(0),
            "MT: collateral not an ERC20"
        );
    }

    /*********************************** MODIFIERS ***********************************/

    //@dev Checks if the user is solvent at the end of the function body
    modifier isSolvent() {
        _;
        require(
            _isSolvent(_msgSender(), exchangeRate),
            "MT: user is insolvent"
        );
    }

    /*********************************** PUBLIC FUNCTIONS ***********************************/

    //@dev Updates the total fees owed to the protocol and the new total borrowed with the new fees included
    function accrue() public {
        // @dev to save gas
        AccrueInfo memory _accrueInfo = accrueInfo;

        // solhint-disable-next-line not-rely-on-time
        uint256 elapsedTime = block.timestamp - _accrueInfo.lastAccrued;

        //@notice if no time has passed. Do nothing;
        if (elapsedTime == 0) return;

        // solhint-disable-next-line not-rely-on-time
        _accrueInfo.lastAccrued = block.timestamp.toUint64();

        Rebase memory _totalBorrow = totalBorrow;

        //@notice no one is borrowing. Update the lastAccrued and return
        if (_totalBorrow.base == 0) {
            accrueInfo = _accrueInfo;
            return;
        }

        uint256 extraAmount = ((uint256(_totalBorrow.elastic) *
            _accrueInfo.INTEREST_PER_SECOND *
            elapsedTime) / 1e18);

        _accrueInfo.feesEarned += extraAmount.toUint128();

        // Update State
        totalBorrow.addElastic(extraAmount);
        accrueInfo = _accrueInfo;

        emit LogAccrue(extraAmount);
    }

    /*
     *@dev fetches the exchange rate from the oracle. If it fails it returns the old exchange rate with false value
     *@returns (updated, rate) Updated is a bool that refers if the exchange rate was updated or not. Rate is the exchange rate
     *@event LogExchangeRate Only if it successfully updates
     */
    function updateExchangeRate() public returns (bool updated, uint256 rate) {
        (updated, rate) = oracle.get(oracleData);

        if (updated) {
            exchangeRate = rate;
            emit LogExchangeRate(rate);
        } else {
            // Return the old exchangeRate and updated will be false
            rate = exchangeRate;
        }
    }

    /*
     *@dev Function adds collateral by transferring shares from the `msg.sender` to this address if `skim` is false
     * in the case of `skim` being true, it checks if the contract has more shares than it should have and claims it to the `to` address
     *@param to Address to receieve the collateral shares
     *@param skim Binary logic to decide if the user is sending his own shares or checking if the contract can be skimmed
     *@param shares The number of shares to be transferred (collateral)
     *@event LogAddCollateral
     */
    function addCollateral(
        address to,
        bool skim,
        uint256 shares
    ) public {
        uint256 oldTotalCollateralShares = totalCollateralShare;

        // State Update
        userCollateralShare[to] += shares;
        totalCollateralShare += shares;

        // Transfers shares or skims
        _addTokens(collateral, shares, oldTotalCollateralShares, skim);

        emit LogAddCollateral(
            skim ? address(MIDAS_TREASURY) : _msgSender(),
            to,
            shares
        );
    }

    /*
     *@dev Returns the collateral to the user safely by first updating its total debt and seeing if he can cover what he is borrowing *without the collateral he intends to remove with the modifier `isSolvent`
     *@param to The address to which the removed collateral will be given to
     *@param shares How much collateral will be withdrawn
     */
    function removeCollateral(address to, uint256 shares) public isSolvent {
        // Update the user debt based on the interest rate
        accrue();
        // Remove collateral
        _removeCollateral(to, shares);
        // Check if the user is solvent after removing the collateral. This is done by the modifier `isSolvent`
    }

    /*
     *@dev This function wraps the `_borrow` function with proper security checks with `isSolvent` modifier and also updates the user debt before lending him tokens.
     *@param to The address that will receieve the borrowed tokens.
     *@param amount How many `MONEY` tokens are being will be borrowed
     *@returns (part,shares) Part is the amount of the total debt this user has added to his name and shares is the shares of Money being borrowed.
     */
    function borrow(address to, uint256 amount)
        public
        isSolvent
        returns (uint256 part, uint256 shares)
    {
        // Update the user debt
        accrue();
        // Transfer the borrow amount to the `msg.sender`
        (part, shares) = _borrow(to, amount);
        // Checks if the user is solvent with the `isSolvent` modifier
    }

    /*
     *@dev This function wraps the `_repay` function and makes sure the user debt is updated before the repay amount gets calculated
     *@param to Person whose balance sheet will be updated
     *@param skim Binary choice to skim from Midas Treasury if there are avaliable tokens
     *@param part The amount of debt  `to` has paid off
     *@returns amount Amount of tokens used to repay the debt
     */
    function repay(
        address to,
        bool skim,
        uint256 part
    ) public returns (uint256 amount) {
        // updates user debt first
        accrue();
        // Updates the state to reflect the repay amount
        amount = _repay(to, skim, part);
    }

    /*
     *@dev Owner only function that burns `Money` tokens from this contract
     *@param The amount of tokens to be burned
     */
    function reduceSupply(uint256 amount) external {
        require(_msgSender() == MASTER_CONTRACT.owner(), "MT: Not the owner");
        MIDAS_TREASURY.withdraw(MONEY, address(this), address(this), amount, 0);
        Money(address(MONEY)).burn(amount);
    }

    /*********************************** EXTERNAL FUNCTIONS ***********************************/

    /*
     *@dev Executes a set of actions. Important to note that all arguments act like a map. The index arrays are keys. So all arrays should have the same length.
     *@param actions An array of the avaliable actions to be executed. Check the actions contract
     *@param values An array of the ETH values to be sent
     *@param datas The data to be passed to the call
     *@returns (value1,value2) They are the shares/amount returned by interacting with Midas Treasury
     */
    function cook(
        uint8[] calldata actions,
        uint256[] calldata values,
        bytes[] calldata datas
    ) external payable returns (uint256 value1, uint256 value2) {
        // State to check if solvency check needs to happen at the end or an accrue call
        CookStatus memory status;

        // Iterate to all the actions
        for (uint256 i = 0; i < actions.length; i++) {
            uint8 action = actions[i];

            // Only actions with an ID below 10 need to be accrued first.
            // One should only call accrued if it was not called before for gas purposes.
            if (!status.hasAccrued && action < 10) {
                status.hasAccrued = true;
                accrue();
            }

            if (action == ACTION_ADD_COLLATERAL) {
                (int256 shares, address to, bool skim) = abi.decode(
                    datas[i],
                    (int256, address, bool)
                );
                addCollateral(to, skim, _num(shares, value1, value2));
            }

            if (action == ACTION_REPAY) {
                (int256 part, address to, bool skim) = abi.decode(
                    datas[i],
                    (int256, address, bool)
                );
                _repay(to, skim, _num(part, value1, value2));
            }

            if (action == ACTION_REMOVE_COLLATERAL) {
                // Removing collateral requires checking for solvency at the end
                status.needsSolvencyCheck = true;
                (int256 share, address to) = abi.decode(
                    datas[i],
                    (int256, address)
                );
                _removeCollateral(to, _num(share, value1, value2));
            }

            if (action == ACTION_BORROW) {
                // Borrowing requires checking for solvency at the end
                status.needsSolvencyCheck = true;
                (int256 amount, address to) = abi.decode(
                    datas[i],
                    (int256, address)
                );
                (value1, value2) = _borrow(to, _num(amount, value1, value2));
            }

            if (action == ACTION_UPDATE_EXCHANGE_RATE) {
                (bool mustUpdate, uint256 minRate, uint256 maxRate) = abi
                    .decode(datas[i], (bool, uint256, uint256));
                (bool updated, uint256 rate) = updateExchangeRate();
                require(
                    (!mustUpdate || updated) &&
                        rate > minRate &&
                        (maxRate == 0 || maxRate >= rate),
                    "MT: exchange rate not ok"
                );
            }

            if (action == ACTION_MIDAS_SETAPPROVAL) {
                (
                    address user,
                    address masterContract,
                    bool approvalState,
                    uint8 v,
                    bytes32 r,
                    bytes32 s
                ) = abi.decode(
                        datas[i],
                        (address, address, bool, uint8, bytes32, bytes32)
                    );
                MIDAS_TREASURY
                    .MASTER_CONTRACT_MANAGER()
                    .setMasterContractApproval(
                        user,
                        masterContract,
                        approvalState,
                        v,
                        r,
                        s
                    );
            }

            if (action == ACTION_MIDAS_DEPOSIT) {
                (value1, value2) = _midasDeposit(
                    datas[i],
                    values[i],
                    value1,
                    value2
                );
            }

            if (action == ACTION_MIDAS_WITHDRAW) {
                (value1, value2) = _midasWithdraw(datas[i], value1, value2);
            }

            if (action == ACTION_MIDAS_TRANSFER) {
                (IERC20 token, address to, int256 share) = abi.decode(
                    datas[i],
                    (IERC20, address, int256)
                );
                MIDAS_TREASURY.transfer(
                    token,
                    _msgSender(),
                    to,
                    _num(share, value1, value2)
                );
            }

            if (action == ACTION_MIDAS_TRANSFER_MULTIPLE) {
                (
                    IERC20 token,
                    address[] memory tos,
                    uint256[] memory shares
                ) = abi.decode(datas[i], (IERC20, address[], uint256[]));
                MIDAS_TREASURY.transferMultiple(
                    token,
                    _msgSender(),
                    tos,
                    shares
                );
            }

            if (action == ACTION_CALL) {
                (bytes memory returnData, uint8 returnValues) = _call(
                    values[i],
                    datas[i],
                    value1,
                    value2
                );

                if (returnValues == 1) {
                    (value1) = abi.decode(returnData, (uint256));
                } else if (returnValues == 2) {
                    (value1, value2) = abi.decode(
                        returnData,
                        (uint256, uint256)
                    );
                }
            }

            if (action == ACTION_GET_REPAY_SHARE) {
                int256 part = abi.decode(datas[i], (int256));
                value1 = MIDAS_TREASURY.toShare(
                    MONEY,
                    totalBorrow.toElastic(_num(part, value1, value2), true),
                    true
                );
            }

            if (action == ACTION_GET_REPAY_PART) {
                int256 amount = abi.decode(datas[i], (int256));
                value1 = totalBorrow.toBase(
                    _num(amount, value1, value2),
                    false
                );
            }
        }

        // If one of the actions requires to check if the `msg.sender` is insolvent we run at the end
        if (status.needsSolvencyCheck) {
            require(
                _isSolvent(_msgSender(), exchangeRate),
                "MT: user is insolvent"
            );
        }
    }

    /*
     *@dev A function to pay the fees earned by this contract to the `feeTo` address
     *@event LogWithdrawFees
     */
    function withdrawFees() external {
        accrue();
        address _feeTo = MASTER_CONTRACT.feeTo();
        uint256 feesEarned = accrueInfo.feesEarned;
        // Reset the fees earned
        accrueInfo.feesEarned = 0;
        uint256 shares = MIDAS_TREASURY.toShare(MONEY, feesEarned, false);
        MIDAS_TREASURY.transfer(MONEY, address(this), _feeTo, shares);

        emit LogWithdrawFees(_feeTo, feesEarned);
    }

    /*********************************** PRIVATE FUNCTIONS ***********************************/

    /*
     *@dev Checks if a user has enough collateral to cover his borrow amount at a given `_exchangeRate`
     *@param user The address to check if he has enough collateral
     *@param _exchangeRate The exchange rate to be used to decide if the collateral is covered
     *@returns bool
     */
    function _isSolvent(address user, uint256 _exchangeRate)
        private
        view
        returns (bool)
    {
        uint256 borrowPart = userBorrowPart[user];

        // User has not debt
        if (borrowPart == 0) return true;

        uint256 collateralShare = userCollateralShare[user];

        // User has debt and no collateral. He is insolvent
        if (collateralShare == 0) return false;

        Rebase memory _totalBorrow = totalBorrow;

        // Checks that user has enough collateral to cover his borrow amount
        return
            MIDAS_TREASURY.toAmount(
                collateral,
                collateralShare *
                    (EXCHANGE_RATE_PRECISION / COLLATERIZATION_RATE_PRECISION) *
                    COLLATERIZATION_RATE,
                false
            ) >=
            (borrowPart * _totalBorrow.elastic * _exchangeRate) /
                _totalBorrow.base;
    }

    /*
     *@dev Helper function to transfer shares from `msg.sender` to this contract
     *@param token The shares of the token to be transferred
     *@param shares Number of shares to be transferred
     *@param total Total collateral share of this contract
     *@param skim Binary logic if `false` checks if the contract has extra shares to be skimmed and if `true` transfers the shares from `msg.sender` to this address
     */
    function _addTokens(
        IERC20 token,
        uint256 shares,
        uint256 total,
        bool skim
    ) private {
        if (skim) {
            require(
                shares <=
                    MIDAS_TREASURY.balanceOf(token, address(this)) - total,
                "MT: skim too much"
            );
        } else {
            MIDAS_TREASURY.transfer(token, _msgSender(), address(this), shares);
        }
    }

    /*
     *@dev helpder functiont that updates the collateral state and moves shares to the `to` address
     *@param to The address that will get the shares of the collateral being removed
     *@param shares Number of shares (collateral) being removed and returned to the `to` address
     *@event LogRemoveCollateral
     */
    function _removeCollateral(address to, uint256 shares) private {
        userCollateralShare[_msgSender()] -= shares;
        totalCollateralShare -= shares;

        emit LogRemoveCollateral(_msgSender(), to, shares);
        MIDAS_TREASURY.transfer(collateral, address(this), to, shares);
    }

    /*
     *@dev Sends `MONEY` to the `msg.sender` by first charging a fee and updating the state. This function does no collateral checks;
     *@param to Address that will receive the `MONEY` borrowed tokens
     *@param amount How many `MONEY` tokens are being borrowed
     *@returns (part, shares) Part refers to the number of debt shares the user owns and shares is how many `MONEY` shares were borrowed
     *@event LogBorrow
     */
    function _borrow(address to, uint256 amount)
        private
        returns (uint256 part, uint256 shares)
    {
        uint256 feeAmount = (amount * BORROW_OPENING_FEE) /
            BORROW_OPENING_FEE_PRECISION;

        (totalBorrow, part) = totalBorrow.add(amount + feeAmount, true);

        accrueInfo.feesEarned += feeAmount.toUint128();

        userBorrowPart[_msgSender()] += part;

        shares = MIDAS_TREASURY.toShare(MONEY, amount, false);
        MIDAS_TREASURY.transfer(MONEY, address(this), to, shares);

        emit LogBorrow(_msgSender(), to, amount + feeAmount, part);
    }

    /*
     *@dev This function does not do any security checks. Just updates the state
     *@param to The address that is will repay the debt using his shares
     *@param skim Binary choice, if Midas has unaccounted tokens one can skim to repay the `to` debt
     *@param part The amount of debt the user paid
     *@returns amount The number of tokens repaid
     *@event LogRepay
     */
    function _repay(
        address to,
        bool skim,
        uint256 part
    ) private returns (uint256 amount) {
        (totalBorrow, amount) = totalBorrow.sub(part, true);
        userBorrowPart[to] -= part;

        uint256 shares = MIDAS_TREASURY.toShare(MONEY, amount, true);
        MIDAS_TREASURY.transfer(
            MONEY,
            skim ? address(MIDAS_TREASURY) : _msgSender(),
            address(this),
            shares
        );

        emit LogRepay(
            skim ? address(MIDAS_TREASURY) : _msgSender(),
            to,
            amount,
            part
        );
    }

    /*
     *@dev Helper function to deposit into Midas Treasury
     *@param data the bytes data to be decoded
     *@param value Amount of ETH to be deposited
     *@param value1 Amount to be deposited of shares/amount if the parsed amount is negative based on `_num` helper function
     *@param value2 Amount to be deposited of shares/amount if the parsed amount is negative based on `_num` helper function
     *@returns (uint256, uint256) The first value is the amount of tokens deposited and the second the shares gotten by it
     */
    function _midasDeposit(
        bytes calldata data,
        uint256 value,
        uint256 value1,
        uint256 value2
    ) private returns (uint256, uint256) {
        (IERC20 token, address to, int256 amount, int256 shares) = abi.decode(
            data,
            (IERC20, address, int256, int256)
        );

        amount = int256(_num(amount, value1, value2));
        shares = int256(_num(shares, value1, value2));
        return
            MIDAS_TREASURY.deposit{value: value}(
                token,
                _msgSender(),
                to,
                uint256(amount),
                uint256(shares)
            );
    }

    /*
     *@dev Helper function to withdraw from Midas Treasury
     *@param data the bytes data to be decoded
     *@param value1 Amount to be withdrawn of shares/amount if the parsed amount is negative based on `_num` helper function
     *@param value2 Amount to be withdrawn of shares/amount if the parsed amount is negative based on `_num` helper function
     *@returns (uint256, uint256) Amount of tokens received and the second value is the shares paid for it
     */
    function _midasWithdraw(
        bytes calldata data,
        uint256 value1,
        uint256 value2
    ) private returns (uint256, uint256) {
        (IERC20 token, address to, int256 amount, int256 shares) = abi.decode(
            data,
            (IERC20, address, int256, int256)
        );

        return
            MIDAS_TREASURY.deposit(
                token,
                _msgSender(),
                to,
                _num(amount, value1, value2),
                _num(shares, value1, value2)
            );
    }

    /*
     *@dev Helper function to call other contracts
     *@value The amount of eth to be sent
     *@value1 Value to be added to the callData based on data provided
     *@value2 Value to be added to the callData based on data provided
     *@returns (bytes, uint8) The data returned from the call and returned values
     */
    function _call(
        uint256 value,
        bytes calldata data,
        uint256 value1,
        uint256 value2
    ) private returns (bytes memory, uint8) {
        (
            address callee,
            bytes memory callData,
            bool useValue1,
            bool useValue2,
            uint8 returnValues
        ) = abi.decode(data, (address, bytes, bool, bool, uint8));

        require(
            callee != address(MIDAS_TREASURY) && callee != address(this),
            "MT: callee not allowed"
        );

        if (useValue1 && !useValue2) {
            callData = abi.encodePacked(callData, value1);
        } else if (!useValue1 && useValue2) {
            callData = abi.encodePacked(callData, value2);
        } else if (useValue1 && useValue2) {
            callData = abi.encodePacked(callData, value1, value2);
        }

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory _data) = callee.call{value: value}(
            callData
        );
        require(success, "MT: call failed");
        return (_data, returnValues);
    }

    /*********************************** ONLY OWNER FUNCTIONS ***********************************/

    /*
     *@dev Sets the new beneficiary of the fees accrued by this
     *@notice This function only makes sense to call from the masterContract itself. It will not work on the clones.
     *@param _feeTo The address which will start receiving new fees
     *@event LogFeeTo
     */
    function setFeeTo(address _feeTo) external onlyOwner {
        feeTo = _feeTo;
        emit LogFeeTo(_feeTo);
    }
}
