import * as fs from 'fs';
import { ethers } from 'hardhat';
import * as hre from 'hardhat';
import * as winston from 'winston';

async function main() {
    const logger = winston.createLogger({
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.printf(info => { return `${info.timestamp}|${info.level}|${info.message}`; })
        ),
        transports: [
            new winston.transports.Console({
                level: 'info'
            }),
            new winston.transports.File({
                level: 'debug',
                filename: 'log/deploy.log',
                handleExceptions: true,
                maxsize: (5 * 1024 * 1024), // 5 mb
                maxFiles: 5
            })
        ]
    });

    logger.info(`deploying NFToken to ${hre.network.name}`);

    const [deployer] = await ethers.getSigners();
    logger.info(`connected as ${deployer.address}`);

    const tokenDefinitionPath = './scripts/deploy.json';
    const tokenDefinition = JSON.parse(fs.readFileSync(tokenDefinitionPath).toString());

    const nfTokenFactoryFactory = await ethers.getContractFactory('NFToken', deployer);
    const nfToken = await nfTokenFactoryFactory.connect(deployer).deploy(
        tokenDefinition['name'],
        tokenDefinition['symbol'],
        tokenDefinition['baseUri'],
        tokenDefinition['contractUri'],
        tokenDefinition['maxSupply'],
        tokenDefinition['unitPrice'],
        tokenDefinition['mintAllowance'],
        tokenDefinition['mintPeriodStart'],
        tokenDefinition['mintPeriodEnd']
    );

    await nfToken.deployed();
    logger.info(`deployed to ${nfToken.address} in ${nfToken.deployTransaction.hash}`);
    logger.info(`deployment params: ${JSON.stringify(tokenDefinition)}`);

    logger.info('verifying contract');
    await hre.run('verify:verify', {
        address: nfToken.address,
        constructorArguments: [
            tokenDefinition['name'],
            tokenDefinition['symbol'],
            tokenDefinition['baseUri'],
            tokenDefinition['contractUri'],
            tokenDefinition['maxSupply'],
            tokenDefinition['unitPrice'],
            tokenDefinition['mintAllowance'],
            tokenDefinition['mintPeriodStart'],
            tokenDefinition['mintPeriodEnd']
        ]
    });

    logger.info('verified contract with etherscan');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

// npx hardhat run scripts/deploy.ts --network goerli
