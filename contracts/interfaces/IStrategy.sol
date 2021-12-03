// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IStrategy {
    /*
     *@dev Send the assets to the Strategy then call invest
     *@param amount Amount of tokens you wish to invest
     */
    function invest(uint256 amount) external;

    /*
     *@dev Harvest any profit made converted to the asset and pass to the caller
     *@param balance The amount of tokens the caller thinks he has invested
     *@param sender the address of the initiator of this transaction. Can be used for reimbursements,etc.
     *@return delta The delta (+profit or -loss) that occured in contraste to balance
     */
    function harvest(uint256 balance, address sender)
        external
        returns (int256 deltaAmount);

    /*
     *@dev The amount withdrawn can be different than the amount requested due to rounding. However they should be very close
     * This is not meant to report profit/loss. Use harvest instead
     *@param amount The requested amount to withdraw
     *@return actualAmount The real amount that was withdrawn after rounding
     */
    function withdraw(uint256 amount) external returns (uint256 actualAmount);

    /*
     *@dev Withdraw all assets
     *@param The balance the caller thinks he has invested
     *@preturn deltaAmount The difference between what he thinks he invested vs what he received after profit/loss
     */
    function exit(uint256 balance) external returns (int256 deltaAmount);
}
