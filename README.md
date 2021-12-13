# Advanced Hardhat Project

This project is a copy from scratch from [SushiSwap Bentobox](https://github.com/sushiswap/bentobox). The [OpenZeppelin contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) were used as buildings blocks due to their great documentation and security. 

The whole project is fully tested using mock contracts with the help of [Hardhat](https://hardhat.org/). We also used a couple of helpful development tools such as Typescript to make the development process more smooth with the help of types. Check more packages used below.

This project was made only for educational purposes so I could get a greater understanding of the DeFi Ecosystem.

**Prerequisites**: Make sure you have at least the LTS version of [Node](https://nodejs.org/en/) installed.

**Details**:

 - Solidity 8.10.0
 - Typescript 4.3.5
 - ESLint
 - Prettier
 - Commitlint
 - Husky

**Author**: josemvcerqueira | josecerqueira@ilovemochi.com

Try running some of the following tasks:

```shell
npx hardhat accounts
npx hardhat compile
npx hardhat clean
npx hardhat test
npx hardhat node
npx hardhat help
REPORT_GAS=true npx hardhat test
npx hardhat coverage
npx hardhat run scripts/deploy.ts
TS_NODE_FILES=true npx ts-node scripts/deploy.ts
npx eslint '**/*.{js,ts}'
npx eslint '**/*.{js,ts}' --fix
npx prettier '**/*.{json,sol,md}' --check
npx prettier '**/*.{json,sol,md}' --write
npx solhint 'contracts/**/*.sol'
npx solhint 'contracts/**/*.sol' --
yarn test
yarn solhint
yarn pre-commit
yarn type-check
yarn lint
yarn prepare
```