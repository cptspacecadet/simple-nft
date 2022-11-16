import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import * as helpers from '@nomicfoundation/hardhat-network-helpers';

import * as jbDirectory from '@jbx-protocol/juice-contracts-v3/deployments/mainnet/JBDirectory.json';
import * as jbTerminal from '@jbx-protocol/juice-contracts-v3/deployments/mainnet/JBETHPaymentTerminal.json';

describe('NFToken tests', () => {
    const jbxJbTokensEth = '0x000000000000000000000000000000000000EEEe';

    let deployer: SignerWithAddress;
    let accounts: SignerWithAddress[];

    let directory: any;
    let terminal: any;

    let nfTokenFactory: any;
    let basicToken: any;
    let tokenFactory: any;

    const basicBaseUri = 'ipfs://hidden';
    const basicBaseUriRevealed = 'ipfs://revealed/';
    const basicContractUri = 'ipfs://metadata';
    const basicProjectId = 99;
    const basicUnitPrice = ethers.utils.parseEther('0.001');
    const basicMaxSupply = 20;
    const basicMintAllowance = 2
    let basicMintPeriodStart: number;
    let basicMintPeriodEnd: number;

    before('Initialize accounts', async () => {
        [deployer, ...accounts] = await ethers.getSigners();
    });

    before('Setup JBX components', async () => {
        directory = await deployMockContract(deployer, jbDirectory.abi);
        terminal = await deployMockContract(deployer, jbTerminal.abi);

        await terminal.mock.pay.returns(0);
        await directory.mock.isTerminalOf.withArgs(basicProjectId, terminal.address).returns(true);
        await directory.mock.primaryTerminalOf.withArgs(basicProjectId, jbxJbTokensEth).returns(terminal.address);
    });

    before('Initialize contracts', async () => {
        const basicName = 'Test NFT'
        const basicSymbol = 'NFT';

        const now = await helpers.time.latest();
        basicMintPeriodStart = Math.floor(now + 60 * 60);
        basicMintPeriodEnd = Math.floor(now + 24 * 60 * 60);

        const nfTokenFactory = await ethers.getContractFactory('NFToken');
        basicToken = await nfTokenFactory.connect(deployer).deploy();

        const TokenFactoryFactory = await ethers.getContractFactory('TokenFactory');
        tokenFactory = await TokenFactoryFactory.connect(deployer).deploy(basicToken.address);

        let tx = await tokenFactory.connect(deployer).deployToken(
            deployer.address,
            basicName,
            basicSymbol,
            basicBaseUri,
            basicContractUri,
            basicMaxSupply,
            basicUnitPrice,
            basicMintAllowance,
            basicMintPeriodStart,
            basicMintPeriodEnd
        );

        let receipt = await tx.wait();
        let [contractAddress, ] = receipt.events.filter((e: any) => e.event === 'Deployment')[0].args;
        basicToken = nfTokenFactory.attach(contractAddress);
    });

    it('Fail to init manually-deployed token', async () => {
        const basicName = 'Test NFT'
        const basicSymbol = 'NFT';

        const nfTokenFactory = await ethers.getContractFactory('NFToken');
        const token = await nfTokenFactory.connect(deployer).deploy();

        await expect(token.connect(accounts[0]).initialize(
            accounts[0].address,
            basicName,
            basicSymbol,
            basicBaseUri,
            basicContractUri,
            basicMaxSupply,
            basicUnitPrice,
            basicMintAllowance,
            basicMintPeriodStart,
            basicMintPeriodEnd
        )).to.be.revertedWithCustomError(token, 'INVALID_OPERATION');

        await expect(token.connect(deployer).initialize(
            deployer.address,
            basicName,
            basicSymbol,
            basicBaseUri,
            basicContractUri,
            basicMaxSupply,
            basicUnitPrice,
            basicMintAllowance,
            basicMintPeriodStart,
            basicMintPeriodEnd
        )).not.to.be.reverted;

        await expect(token.connect(deployer).initialize(
            deployer.address,
            basicName,
            basicSymbol,
            basicBaseUri,
            basicContractUri,
            basicMaxSupply,
            basicUnitPrice,
            basicMintAllowance,
            basicMintPeriodStart,
            basicMintPeriodEnd
        )).to.be.revertedWithCustomError(token, 'INVALID_OPERATION');
    });

    it('Get contract metadata uri', async () => {
        expect(await basicToken.contractURI()).to.equal(basicContractUri);
    });

    it('Fail to mint before mint period start', async () => {
        await expect(basicToken.connect(accounts[0])['mint(string,bytes)']('', '0x00', { value: basicUnitPrice }))
            .to.be.revertedWithCustomError(basicToken, 'MINT_NOT_STARTED');
    });

    it('Mint a token', async () => {
        await helpers.time.increaseTo(basicMintPeriodStart + 10);
        await expect(basicToken.connect(accounts[0])['mint(string,bytes)']('', '0x00', { value: basicUnitPrice.sub(1000) }))
            .to.be.revertedWithCustomError(basicToken, 'INCORRECT_PAYMENT');

        expect(await basicToken.getMintPrice(accounts[0].address)).to.equal(basicUnitPrice);

        await basicToken.connect(accounts[0])['mint(string,bytes)']('', '0x00', { value: basicUnitPrice });
        await basicToken.connect(accounts[4])['mint()']({ value: basicUnitPrice });
        expect(await basicToken.balanceOf(accounts[0].address)).to.equal(1);
    });

    it('Get token uri', async () => {
        expect(await basicToken.tokenURI(1)).to.equal(basicBaseUri);

        const currentSupply = (await basicToken.totalSupply() as BigNumber).toNumber();
        expect(await basicToken.tokenURI(currentSupply + 1)).to.equal('');
    });

    it('Reveal token, get actual token uri', async () => {
        await expect(basicToken.connect(accounts[0]).setBaseURI(basicBaseUriRevealed, true)).to.be.reverted;

        await basicToken.connect(deployer).removeRevealer(deployer.address);
        await expect(basicToken.connect(deployer).setBaseURI(basicBaseUriRevealed, true)).to.be.reverted;

        await basicToken.connect(deployer).addRevealer(deployer.address);
        await basicToken.connect(deployer).setBaseURI(basicBaseUriRevealed, true);

        const tokenId = 1;
        expect(await basicToken.tokenURI(tokenId)).to.equal(`${basicBaseUriRevealed}${tokenId}`);

        await expect(basicToken.connect(deployer).setBaseURI(basicBaseUriRevealed, false))
            .to.be.revertedWithCustomError(basicToken, 'ALREADY_REVEALED');
    });

    it('Update mint price', async () => {
        await expect(basicToken.connect(accounts[0]).updateUnitPrice(basicUnitPrice.mul(2))).to.be.reverted;

        await basicToken.connect(deployer).updateUnitPrice(basicUnitPrice.mul(2));

        expect(await basicToken.unitPrice()).to.equal(basicUnitPrice.mul(2));

        await basicToken.connect(deployer).updateUnitPrice(basicUnitPrice);
    });

    it('Set royalty rate', async () => {
        await expect(basicToken.connect(accounts[0]).setRoyalties(accounts[0].address, 5_000)).to.be.reverted;

        await expect(basicToken.connect(deployer).setRoyalties(deployer.address, 15_000))
            .to.be.revertedWithCustomError(basicToken, 'INVALID_RATE');

        await basicToken.connect(deployer).setRoyalties(deployer.address, 5_000);

        let royalties = await basicToken.royaltyInfo(1, basicUnitPrice);
        expect(royalties.receiver).to.equal(ethers.constants.AddressZero);
        expect(royalties.royaltyAmount).to.equal(BigNumber.from(0));

        const currentSupply = (await basicToken.totalSupply() as BigNumber).toNumber();
        royalties = await basicToken.royaltyInfo(currentSupply + 1, basicUnitPrice);
        expect(royalties.receiver).to.equal(deployer.address);
        expect(royalties.royaltyAmount).to.equal(BigNumber.from('500000000000000'));
    });

    it('Update mint period', async () => {
        const currentTime = await helpers.time.latest();
        const start = currentTime - 1000;
        const end = currentTime - 100;

        await expect(basicToken.connect(accounts[0]).updateMintPeriod(start, end)).to.be.reverted;
        await basicToken.connect(deployer).updateMintPeriod(start, end);

        expect(await basicToken.mintPeriodStart()).to.equal(start);
        expect(await basicToken.mintPeriodEnd()).to.equal(end);
    });

    it('Fail mint after expiration', async () => {
        await expect(basicToken.connect(accounts[4])['mint()']({ value: basicUnitPrice }))
            .to.be.revertedWithCustomError(basicToken, 'MINT_CONCLUDED');

        await basicToken.connect(deployer).updateMintPeriod(basicMintPeriodStart + 1000, basicMintPeriodEnd + 1000);
        await helpers.time.increaseTo(basicMintPeriodStart + 1010);
    });

    it('Set provenance hash', async () => {
        const provenanceHash = '0xc0ffee';
        await expect(basicToken.connect(accounts[0]).setProvenanceHash(provenanceHash)).to.be.reverted;
        await basicToken.connect(deployer).setProvenanceHash(provenanceHash);
        await expect(basicToken.connect(deployer).setProvenanceHash('0x0decaf')).to.be.revertedWithCustomError(basicToken, 'PROVENANCE_REASSIGNMENT');

        expect(await basicToken.provenanceHash()).to.equal(provenanceHash);
    });

    it('Admin mints to an address', async () => {
        await expect(basicToken.connect(accounts[0]).mintFor(accounts[0].address)).to.be.reverted;
        await basicToken.connect(deployer).mintFor(accounts[1].address);

        expect(await basicToken.totalSupply()).to.equal(3);
        expect(await basicToken.balanceOf(accounts[1].address)).to.equal(1);
    });

    it('Pause minting', async () => {
        await expect(basicToken.connect(accounts[0]).setPause(true)).to.be.reverted;
        await basicToken.connect(deployer).setPause(true);

        await expect(basicToken.connect(accounts[0])['mint()']({ value: basicUnitPrice }))
            .to.be.revertedWithCustomError(basicToken, 'MINTING_PAUSED');
        await expect(basicToken.connect(accounts[0])['mint(string,bytes)']('', '0x00', { value: basicUnitPrice }))
            .to.be.revertedWithCustomError(basicToken, 'MINTING_PAUSED');

        await basicToken.connect(deployer).setPause(false);
    });

    it('Manage minter role', async () => {
        await expect(basicToken.connect(accounts[0]).mintFor(accounts[0].address)).to.be.reverted;
        await basicToken.connect(deployer).addMinter(accounts[0].address);

        await expect(basicToken.connect(accounts[0]).mintFor(accounts[1].address)).not.to.be.reverted;
        expect(await basicToken.balanceOf(accounts[1].address)).to.equal(2);

        await basicToken.connect(deployer).removeMinter(accounts[0].address);
        await expect(basicToken.connect(accounts[0]).mintFor(accounts[0].address)).to.be.reverted;
    });

    it('Manage minter role', async () => {
        await expect(basicToken.connect(accounts[0]).setContractURI('ipfs://contract_metadata')).to.be.reverted;
        await expect(basicToken.connect(deployer).setContractURI('ipfs://contract_metadata')).not.to.be.reverted
    });

    it('Manage minter role', async () => {
        expect(await basicToken.supportsInterface('0x2a55205a')).to.equal(true);
    });

    it('Account reached mint allowance', async () => {
        await expect(basicToken.connect(accounts[1])['mint()']({ value: basicUnitPrice }))
            .to.be.revertedWithCustomError(basicToken, 'ALLOWANCE_EXHAUSTED');
    });

    it('Payment into a terminal', async () => {
        await expect(basicToken.connect(accounts[0]).registerProject(directory.address, basicProjectId))
            .to.be.reverted;

        await basicToken.connect(deployer).registerProject(directory.address, basicProjectId);

        await expect(basicToken.connect(accounts[0])['mint()']({ value: basicUnitPrice }))
            .not.to.be.reverted;
    });

    it('Payment failure due to missing terminal', async () => {
        await directory.mock.primaryTerminalOf.withArgs(basicProjectId, jbxJbTokensEth).returns(ethers.constants.AddressZero);

        await expect(basicToken.connect(accounts[3])['mint()']({ value: basicUnitPrice }))
            .to.be.revertedWithCustomError(basicToken, 'PAYMENT_FAILURE');

        await directory.mock.primaryTerminalOf.withArgs(basicProjectId, jbxJbTokensEth).returns(terminal.address);

        await basicToken.connect(deployer).registerProject(ethers.constants.AddressZero, basicProjectId);
    });

    it('Set OperatorFilter', async () => {
        const operatorFilterFactory = await ethers.getContractFactory('OperatorFilter');
        const operatorFilter = await operatorFilterFactory.connect(deployer).deploy();

        await expect(basicToken.connect(accounts[0]).updateOperatorFilter(operatorFilter.address)).to.be.reverted;
        await expect(basicToken.connect(deployer).updateOperatorFilter(operatorFilter.address)).not.to.be.reverted;

        await expect(operatorFilter.connect(accounts[0]).registerAddress(accounts[5].address, true)).to.be.reverted;
        await operatorFilter.connect(deployer).registerAddress(accounts[5].address, true);

        await expect(basicToken.connect(accounts[5])['mint()']({ value: basicUnitPrice }))
            .to.be.revertedWithCustomError(basicToken, 'CALLER_BLOCKED');

        await operatorFilter.connect(deployer).registerAddress(accounts[5].address, false);

        await expect(basicToken.connect(accounts[5])['mint()']({ value: basicUnitPrice }))
            .not.to.be.reverted;

        const tokenId = await basicToken.totalSupply();
        await operatorFilter.connect(deployer).registerAddress(accounts[5].address, true);
        await expect(basicToken.connect(accounts[5]).transferFrom(accounts[5].address, accounts[4].address, tokenId))
            .to.be.revertedWithCustomError(basicToken, 'CALLER_BLOCKED');

    });

    it('Mint failure due to exhausted supply', async () => {
        let currentSupply = ((await basicToken.totalSupply()) as BigNumber).toNumber();
        while (currentSupply < basicMaxSupply) {
            await basicToken.connect(deployer).mintFor(accounts[3].address);
            currentSupply++;
        }

        await expect(basicToken.connect(deployer).mintFor(accounts[3].address))
            .to.be.revertedWithCustomError(basicToken, 'SUPPLY_EXHAUSTED');

        await expect(basicToken.connect(accounts[4])['mint()']({ value: basicUnitPrice }))
            .to.be.revertedWithCustomError(basicToken, 'SUPPLY_EXHAUSTED');
        await expect(basicToken.connect(accounts[4])['mint(string,bytes)']('', '0x00', { value: basicUnitPrice }))
            .to.be.revertedWithCustomError(basicToken, 'SUPPLY_EXHAUSTED');
    });

    it('Transfer Ether balance', async () => {
        const balance = await ethers.provider.getBalance(basicToken.address); // NOTE: do not use getDefaultProvider()

        await expect(basicToken.connect(accounts[0]).transferBalance(accounts[0].address, balance)).to.be.reverted;

        await basicToken.connect(deployer).transferBalance(deployer.address, balance);
        expect(await ethers.provider.getBalance(basicToken.address)).to.equal(0);
    });
});
