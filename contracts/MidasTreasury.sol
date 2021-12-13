// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "./interfaces/IFlashLoan.sol";
import "./interfaces/IMasterContractManager.sol";
import "./interfaces/IStrategy.sol";
import "./interfaces/IWETH.sol";

import "./lib/RebaseLibrary.sol";

import "./MasterContractManager.sol";

/*
 *@dev Midas Kingdom is a vault for tokens. The stored tokens can be flash loaned and invested in strategies.
 * Profit/Losses will be incurred by the token depositors
 * Tokens have to be sent via the deposit function; otherwise, they will be forever lost
 *@import Rebasing tokens are not supported and WILL cause loss of funds.
 */
contract MidasTreasury is Ownable {
    /*********************************** LIBRARY ***********************************/

    using SafeERC20 for IERC20;
    using RebaseLibrary for Rebase;
    using SafeCast for uint256;

    /*********************************** EVENTS ***********************************/

    event LogDeposit(
        IERC20 indexed token,
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 share
    );

    event LogWithdraw(
        IERC20 indexed token,
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 share
    );

    event LogTransfer(
        IERC20 indexed token,
        address indexed from,
        address indexed to,
        uint256 share
    );

    event LogFlashLoan(
        address indexed borrower,
        IERC20 indexed token,
        uint256 amount,
        uint256 fee,
        address indexed receiver
    );

    event LogStrategyTargetPercentage(
        IERC20 indexed token,
        uint256 targetPercentage
    );

    event LogStrategyQueued(IERC20 indexed token, IStrategy indexed strategy);

    event LogStrategySet(IERC20 indexed token, IStrategy indexed strategy);

    event LogStrategyInvest(IERC20 indexed token, uint256 amount);

    event LogStrategyDivest(IERC20 indexed token, uint256 amount);

    event LogStrategyProfit(IERC20 indexed token, uint256 amount);

    event LogStrategyLoss(IERC20 indexed token, uint256 amount);

    /*********************************** STRUCTS ***********************************/

    struct StrategyData {
        uint64 strategyStartDate;
        uint64 targetPercentage;
        uint128 balance; // the balance of the strategy Midas Kingdom estimates
    }

    /*********************************** CONSTANTS ***********************************/

    // solhint-disable-next-line var-name-mixedcase
    IMasterContractManager public immutable MASTER_CONTRACT_MANAGER;

    //@notice this address depends on the blockchain
    // solhint-disable-next-line var-name-mixedcase
    IERC20 private immutable WETH;

    IERC20 private constant USE_ETHEREUM = IERC20(address(0));

    uint256 private constant FLASH_LOAN_FEE = 50; // 0.05%

    uint256 private constant FLASH_LOAN_FEE_PRECISION = 1e5; // 100_000 50 ==> 0.05%

    uint256 private constant STRATEGY_DELAY = 2 weeks;

    uint256 private constant MAX_TARGET_PERCENTAGE = 95; // 95% profit

    uint256 private constant MINIMUM_SHARE_BALANCE = 1000; // prevent 0 division

    /*********************************** STATE ***********************************/

    //@notice balance of a token per address
    mapping(IERC20 => mapping(address => uint256)) public balanceOf;

    mapping(IERC20 => Rebase) public totals;

    mapping(IERC20 => IStrategy) public strategy;

    mapping(IERC20 => IStrategy) public pendingStrategy;

    mapping(IERC20 => StrategyData) public strategyData;

    /*********************************** CONSTRUCTOR ***********************************/

    /*
     *@param weth The address of the WETH to be used. Use the one adopted by the biggest DEX
     *@param masterContract The address of the masterContractManager of this contract. Contains EIP712 logic
     */
    constructor(IERC20 weth, IMasterContractManager masterContract) {
        WETH = weth;
        MASTER_CONTRACT_MANAGER = masterContract;
    }

    /*********************************** MODIFIERS ***********************************/

    /*
     *@dev Check if the masterContract has approval to manage this account funds
     *@param account The account to be managed
     */
    modifier allowed(address account) {
        // If the account is not the sender, it means it is a contract accessing in behalf of a user, so we need to check for permission
        if (account != _msgSender()) {
            address masterContract = MASTER_CONTRACT_MANAGER.masterContractOf(
                _msgSender()
            );
            require(
                masterContract != address(0),
                "MK: No Master Contract found"
            );
            require(
                MASTER_CONTRACT_MANAGER.masterContractApprovals(
                    masterContract,
                    account
                ),
                "MK: Transfer not approved"
            );
        }
        _;
    }

    modifier noBurn(address to) {
        require(to != address(0), "MK: no burn funds");
        _;
    }

    /*********************************** PRIVATE FUNCTIONS ***********************************/

    /*
     *@dev Returns the total balance of an ERC20 this contract and master contract holds (estimate)
     *@param token The ERC20 token in question
     *@return The total balance
     */
    function _tokenBalanceOf(IERC20 token) private view returns (uint256) {
        return token.balanceOf(address(this)) + strategyData[token].balance;
    }

    /*********************************** EXTERNAL FUNCTIONS ***********************************/

    // Contract should be able to receive ETH deposits to support deposit & skim
    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    /*
     *@dev Helper function to represent an amount of token in shares
     *@param token ERC20 token in question
     *@param amount The ERC20 token amount
     *@param roundUp Boolean to know if the shares should be rounded up or down
     *@return The token amount in shares
     */
    function toShare(
        IERC20 token,
        uint256 amount,
        bool roundUp
    ) external view returns (uint256) {
        return totals[token].toBase(amount, roundUp);
    }

    /*
     *@dev Helper function to represent an amount of shares in token amount
     *@param token ERC20 token in question
     *@param shares The ERC20 token shares
     *@param roundUp Boolean to know if the shares should be rounded up or down
     *@return The token amount from shares
     */
    function toAmount(
        IERC20 token,
        uint256 shares,
        bool roundUp
    ) external view returns (uint256) {
        return totals[token].toElastic(shares, roundUp);
    }

    /*
     *@dev Allows someone to deposit tokens in the contract and assigns shares based on the total amount
     *@param from Contract/User which is depositing the tokens
     *@param to Contract/User to receive the shares
     *@param amount The amount of tokens to deposit
     *@param shares The amount of shares he wishes to deposit
     *@return A tuple with first value being amount of tokens deposited and second the amount of shares obtained
     *@event LogDeposit
     */
    function deposit(
        IERC20 _token,
        address from,
        address to,
        uint256 amount,
        uint256 shares
    )
        external
        payable
        allowed(from)
        noBurn(to)
        returns (uint256 amountDeposited, uint256 sharesObtained)
    {
        // Checks if the token is WETH or another ERC20
        IERC20 token = _token == USE_ETHEREUM ? WETH : _token;
        // Get the token amount/shares pair in this vault
        Rebase memory total = totals[token];

        // Check that if the token is being added for the first time, it is a deployed contract by checking it's total supply
        require(
            total.elastic != 0 || token.totalSupply() > 0,
            "MK: ERC20 not deployed"
        );

        // This is a new deposit since he has no shares
        if (shares == 0) {
            // Converts the amount of tokens to share
            shares = total.toBase(amount, false);

            // If total shares is lower the minimum we dont accept the deposit and do not take the tokens
            if (total.base + shares.toUint128() < MINIMUM_SHARE_BALANCE) {
                return (0, 0);
            }
        } else {
            // Converts the shares to amounts. Since the amount must be > shares. We always round up
            amount = total.toElastic(shares, true);
        }

        // We add the new shares to the recipient
        balanceOf[token][to] += shares;
        // We increase the total amount of shares of this ERC20 in the vault
        total.base += shares.toUint128();
        // We increase the total amount of tokens in the vault
        total.elastic += amount.toUint128();
        // Update the total data for the token
        totals[token] = total;

        if (_token == USE_ETHEREUM) {
            if (msg.value < amount) revert("MK: not enough ETH");
            // Get WETH from the msg.value
            IWETH(address(token)).deposit{value: amount}();
        } else {
            // If it is an ERC20 use the transferFrom
            token.safeTransferFrom(from, address(this), amount);
        }

        emit LogDeposit(token, from, to, amount, shares);

        amountDeposited = amount;
        sharesObtained = shares;
    }

    /*
     *@dev Allows someone to withdraw their tokens in exchange for shares
     *@param from Contract/User that own the shares to be exchanged for tokens
     *@param to Contract/User that will receive the tokens
     *@param amount The amount of tokens the `from` address wishes to withdraw
     *@param shares The amount of shares he wishes to exchange for tokens
     *@return A tuple with first value being amount of tokens received and second the amount of shares exchanged for
     *@event LogWithdraw
     */
    function withdraw(
        IERC20 _token,
        address from,
        address to,
        uint256 amount,
        uint256 shares
    )
        external
        allowed(from)
        noBurn(to)
        returns (uint256 amountRedeemed, uint256 sharesBurned)
    {
        IERC20 token = _token == USE_ETHEREUM ? WETH : _token;

        Rebase memory total = totals[token];

        if (shares == 0) {
            shares = total.toBase(amount, true);
        } else {
            amount = total.toElastic(shares, false);
        }

        uint128 newBase = total.base - shares.toUint128();

        require(
            newBase >= MINIMUM_SHARE_BALANCE || newBase == 0,
            "MK: cannot be empty"
        );

        balanceOf[token][from] -= shares;
        total.elastic -= amount.toUint128();
        total.base = newBase;

        totals[token] = total;

        if (_token == USE_ETHEREUM) {
            IWETH(address(WETH)).withdraw(amount);

            // solhint-disable-next-line avoid-low-level-calls
            (bool sent, ) = to.call{value: amount}("");
            require(sent, "MK: Failed to send ETH");
        } else {
            token.safeTransfer(to, amount);
        }

        emit LogWithdraw(token, from, to, amount, shares);

        amountRedeemed = amount;
        sharesBurned = shares;
    }

    /*
     *@dev Transfer shares from one account to the other
     *@param token Shares of this associated token
     *@param from Entity transfering its shares
     *@param to The recipient of the shares
     *@param shares Amount of shares to be transferred
     *@event LogTransfer
     */
    function transfer(
        IERC20 token,
        address from,
        address to,
        uint256 shares
    ) external allowed(from) noBurn(to) {
        balanceOf[token][from] -= shares;
        balanceOf[token][to] += shares;

        emit LogTransfer(token, from, to, shares);
    }

    /*
     *@dev Allows an account to transfer it's shares to other accounts in 1 TX
     *@param token The shares of the token to be sent
     *@param from The owner of the shares to be sent
     *@param toArray A list of the recipients (should have same length as the sharesArray)
     *@param sharesArray A list of the shares to be sent
     *@event LogTransfer
     */
    function transferMultiple(
        IERC20 token,
        address from,
        address[] calldata toArray,
        uint256[] calldata sharesArray
    ) external allowed(from) {
        uint256 totalAmount;
        uint256 length = toArray.length;

        for (uint256 i = 0; i < length; i++) {
            address to = toArray[i];
            if (to == address(0)) revert("MK: cannot burn funds");

            totalAmount += sharesArray[i];
            balanceOf[token][to] += sharesArray[i];
            emit LogTransfer(token, from, to, sharesArray[i]);
        }
        balanceOf[token][from] -= totalAmount;
    }

    /*
     *@notice Allows anyone to borrow tokens and must give back all within 1 TX. The flash loan initiator, borrower and receiver do not need to be the same address
     *@param borrower Contract which will run arbitrary logic with the loan data. Must implement `onFlashLoan`
     *@param receiver Address that will receive the tokens
     *@param token The token to be sent to the receiver
     *@param amount The amount of tokens to be loaned
     *@param data Arbitrary data to call the borrower with
     *@event LogFlashLoan
     */
    function flashLoan(
        IFlashLoanBorrower borrower,
        address receiver,
        IERC20 token,
        uint256 amount,
        bytes calldata data
    ) external {
        // Calculates the fee
        uint256 fee = (amount * FLASH_LOAN_FEE) / FLASH_LOAN_FEE_PRECISION;

        // Sends tokens to the borrower
        token.safeTransfer(receiver, amount);

        // Run arbitrary logic with loan data. This is where arbitrage happens
        borrower.onFlashLoan(_msgSender(), token, amount, fee, data);

        // Check that the tokens were sent back to Midas Kingdom + fee.
        require(
            _tokenBalanceOf(token) >= totals[token].addElastic(fee.toUint128()),
            "MK: Wrong amount"
        );
        emit LogFlashLoan(address(borrower), token, amount, fee, receiver);
    }

    /*
     *@dev It forces the strategy to harvest profits and update it's balance. Also can replenish or collect tokens from/to the strategy.
     *@param token The token to which to harvest
     *@param rebalance If true it checks with the strategy if the balance is within the target level and rebalances
     *@param maxChangeAmount Maximum amount of tokens Midas Treasury can send or retrieve from the strategy to rebalance the contracts
     *@event LogStrategyProfit If a profit was incurred after the harvest
     *@event LogStrategyLoss If a loss was incurred after the harvest
     *@event LogStrategyInvest If the balance of the strategy contract is below the target amount and `rebalance` is true
     *@event LogStartegyDivest If the balance of the strategy contract is above the target amount and `rebalance` is true
     */
    function harvest(
        IERC20 token,
        bool rebalance,
        uint256 maxChangeAmount
    ) external {
        StrategyData memory data = strategyData[token];
        IStrategy _strategy = strategy[token];
        int256 balanceDelta = _strategy.harvest(data.balance, _msgSender());

        // Nothing since there was no profit/loss and we do not wish to rebalance the vault and strategy balances
        if (balanceDelta == 0 && !rebalance) return;

        uint256 totalAmount = totals[token].elastic;

        // If there was a profit
        if (balanceDelta > 0) {
            uint256 profit = uint256(balanceDelta);
            // Update the total amount of tokens
            totals[token].elastic = (totalAmount + profit).toUint128();
            data.balance += profit.toUint128();
            emit LogStrategyProfit(token, profit);

            // If there was a loss
        } else if (balanceDelta < 0) {
            // Make sure Treasury does not support large supply tokens
            uint256 loss = uint256(-balanceDelta);
            totals[token].elastic = (totalAmount - loss).toUint128();
            data.balance -= loss.toUint128();
            emit LogStrategyLoss(token, loss);
        }

        if (rebalance) {
            uint256 targetBalance = (totalAmount * data.targetPercentage) / 100;

            if (data.balance < targetBalance) {
                uint256 amountOut = targetBalance - data.balance;
                if (maxChangeAmount != 0 && amountOut > maxChangeAmount) {
                    amountOut = maxChangeAmount;
                }

                token.safeTransfer(address(_strategy), amountOut);
                data.balance += amountOut.toUint128();
                _strategy.invest(amountOut);
                emit LogStrategyInvest(token, amountOut);
            } else if (data.balance > targetBalance) {
                uint256 amountIn = data.balance - targetBalance.toUint128();
                if (maxChangeAmount != 0 && amountIn > maxChangeAmount) {
                    amountIn = maxChangeAmount;
                }

                uint256 actualAmountIn = _strategy.withdraw(amountIn);

                data.balance -= actualAmountIn.toUint128();
                emit LogStrategyDivest(token, actualAmountIn);
            }
        }

        strategyData[token] = data;
    }

    /*********************************** ONLY OWNER FUNCTIONS ***********************************/

    /*
     *@param token The token to which the target percentage will be updated
     *@param targetPercentage The new strategy target percentage. Must be less than the maximum target percentage `95`
     *@event emits LogStrategyTargetPercentage
     */
    function setStrategyTargetPercentage(IERC20 token, uint64 targetPercentage)
        external
        onlyOwner
    {
        require(
            MAX_TARGET_PERCENTAGE >= targetPercentage,
            "MK: target too high"
        );

        strategyData[token].targetPercentage = targetPercentage;
        emit LogStrategyTargetPercentage(token, targetPercentage);
    }

    /*
     *@dev Allows a new strategy to be set with a delay of `2 weeks`
     * If the conditions are met it will `exit` out of the current strategy and set the new one
     *@param token The token strategy to be updated
     *@param newStrategy The strategy to which we need to update
     */
    function setStrategy(IERC20 token, IStrategy newStrategy)
        external
        onlyOwner
    {
        StrategyData memory data = strategyData[token];
        IStrategy pending = pendingStrategy[token];

        // if the token has no strategy and pending is different than the new. Update the pending strategy
        if (data.strategyStartDate == 0 || pending != newStrategy) {
            pendingStrategy[token] = newStrategy;
            // solhint-disable-next-line not-rely-on-time
            data.strategyStartDate = (block.timestamp + STRATEGY_DELAY)
                .toUint64();
            emit LogStrategyQueued(token, newStrategy);
        } else {
            require(
                data.strategyStartDate != 0 &&
                    // solhint-disable-next-line not-rely-on-time
                    block.timestamp >= data.strategyStartDate,
                "MK: too early"
            );
            // If there is currently a strategy contract for this token. Need to get tokens back;
            if (address(strategy[token]) != address(0)) {
                int256 delta = strategy[token].exit(data.balance);

                // Exit the tokens from current strategy and update state with profit/loss
                // If there was a profit
                if (delta > 0) {
                    uint256 profit = uint256(delta);
                    totals[token].addElastic(profit);
                    emit LogStrategyProfit(token, profit);
                    // If there was a loss
                } else if (delta < 0) {
                    uint256 loss = uint256(-delta);
                    totals[token].subElastic(loss);
                    emit LogStrategyLoss(token, loss);
                }
            }

            // Update token strategy
            strategy[token] = pending;
            // Reset the strategy data
            data.strategyStartDate = 0;
            data.balance = 0;
            pendingStrategy[token] = IStrategy(address(0));
            emit LogStrategySet(token, pending);
        }
        strategyData[token] = data;
    }
}
