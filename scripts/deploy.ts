import * as fs from 'fs';
import path from 'path';
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

    logger.info(`deploying Nouns-land NFTs to ${hre.network.name}`);

    const [deployer] = await ethers.getSigners();
    logger.info(`connected as ${deployer.address}`);

    const tokenDefinitionPath = './scripts/deploy.json';
    const deployLog = JSON.parse(fs.readFileSync(tokenDefinitionPath).toString());

    const nfTokenFactory = await ethers.getContractFactory('NFToken');
    let sourceTokenAddress = '';
    if (deployLog['system']['sourceToken']) {
        sourceTokenAddress = deployLog['system']['sourceToken'];
        logger.info(`found source token at ${sourceTokenAddress}`);
    } else {
        let sourceToken = await nfTokenFactory.connect(deployer).deploy();
        logger.info(`deploying source token in ${sourceToken.deployTransaction.hash}`);
        await sourceToken.deployed();
        deployLog['system']['sourceToken'] = sourceToken.address;
        sourceTokenAddress = sourceToken.address;
        logger.info(`deployed source token to ${sourceTokenAddress}`);

        try {
            logger.info('verifying contract');
            await hre.run('verify:verify', {
                address: sourceTokenAddress,
                constructorArguments: []
            });
        } catch { }
    }

    const TokenFactoryFactory = await ethers.getContractFactory('TokenFactory');
    let tokenFactory: any;
    if (deployLog['system']['tokenFactory']) {
        tokenFactory = TokenFactoryFactory.attach(deployLog['system']['tokenFactory']);
        logger.info(`found token factory at ${deployLog['system']['tokenFactory']}`);
    } else {
        tokenFactory = await TokenFactoryFactory.connect(deployer).deploy(sourceTokenAddress);
        logger.info(`deploying token factory in ${tokenFactory.deployTransaction.hash}`);
        await tokenFactory.deployed();
        deployLog['system']['tokenFactory'] = tokenFactory.address;
        logger.info(`deployed token factory to ${tokenFactory.address}`);

        try {
            logger.info('verifying contract');
            await hre.run('verify:verify', {
                address: tokenFactory.address,
                constructorArguments: [sourceTokenAddress]
            });
        } catch { }
    }

    for (let i = 0; i < deployLog['tokens'].length; i++) {
        const tokenDefinition = deployLog['tokens'][i];
        if (tokenDefinition['address']) {
            const tokenMetadata = JSON.parse(fs.readFileSync(tokenDefinition.contractMetadataPath).toString());
            logger.info(`found ${tokenMetadata['name']} token at ${tokenDefinition['address']}`);

            continue;
        }

        const tokenMetadata = JSON.parse(fs.readFileSync(tokenDefinition.contractMetadataPath).toString());

        let tx = await tokenFactory.connect(deployer).deployToken(
            deployer.address,
            tokenMetadata['name'],
            'NFT',
            tokenDefinition['tokenMetadataIPFS'],
            tokenDefinition['contractMetadataIPFS'],
            tokenMetadata['edition'],
            tokenDefinition['unitPrice'],
            tokenDefinition['mintAllowance'],
            tokenDefinition['mintPeriodStart'],
            tokenDefinition['mintPeriodEnd']
        );

        logger.info(`deploying ${tokenMetadata['name']} token in ${tx.hash}`);

        let receipt = await tx.wait();
        let [contractAddress,] = receipt.events.filter((e: any) => e.event === 'Deployment')[0].args;
        logger.info(`deployed ${tokenMetadata['name']} to ${contractAddress}`);
        deployLog['tokens'][i]['address'] = contractAddress;

        tx = await nfTokenFactory.attach(contractAddress).connect(deployer).mintFor(deployer.address);
        logger.info(`minting sample token in ${tx.hash}`);
        await tx.wait();

        tx = await nfTokenFactory.attach(contractAddress).connect(deployer)['mint()']({ value: '100000000000000' });
        logger.info(`minting paid token in ${tx.hash}`);
        await tx.wait();
    }

    fs.writeFileSync(tokenDefinitionPath, JSON.stringify(deployLog, undefined, 4));

    logger.info('done');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

// npx hardhat run scripts/deploy.ts --network goerli
