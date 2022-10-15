import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from 'dotenv';
import { HardhatUserConfig } from "hardhat/config";
import 'hardhat-contract-sizer';
import 'hardhat-deploy';
import 'hardhat-gas-reporter';

dotenv.config();

const COINMARKETCAP_KEY = process.env.COINMARKETCAP_KEY;
const ETHERSCAN_KEY = process.env.ETHERSCAN_KEY;
const INFURA_KEY = process.env.INFURA_KEY;
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const REPORT_GAS = process.env.REPORT_GAS;

const config: HardhatUserConfig = {
    defaultNetwork: 'hardhat',
    networks: {
        hardhat: {
            forking: {
                url: `https://mainnet.infura.io/v3/${INFURA_KEY}`,
                blockNumber: 15416229,
                enabled: false
            },
            allowUnlimitedContractSize: true,
            blockGasLimit: 100_000_000
        },
        goerli: {
            url: `https://goerli.infura.io/v3/${INFURA_KEY}`,
            accounts: [PRIVATE_KEY],
        },
        mainnet: {
            url: `https://mainnet.infura.io/v3/${INFURA_KEY}`,
            accounts: [PRIVATE_KEY],
        },
    },
    solidity: {
        version: '0.8.14',
        settings: {
            optimizer: {
                enabled: true,
                // https://docs.soliditylang.org/en/v0.8.10/internals/optimizer.html#:~:text=Optimizer%20Parameter%20Runs,-The%20number%20of&text=A%20%E2%80%9Cruns%E2%80%9D%20parameter%20of%20%E2%80%9C,is%202**32%2D1%20.
                runs: 400,
            },
        },
    },
    contractSizer: {
        alphaSort: true,
        disambiguatePaths: false,
        runOnCompile: true,
        strict: false
    },
    gasReporter: {
        enabled: REPORT_GAS !== undefined,
        currency: 'USD',
        gasPrice: 30,
        showTimeSpent: true,
        coinmarketcap: COINMARKETCAP_KEY
    },
    etherscan: {
        apiKey: ETHERSCAN_KEY
    }
};

export default config;
