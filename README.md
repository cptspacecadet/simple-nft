# Simple NFT

This is a collection of contracts built around an ERC721 NFT. The code is based on [DAOLABS Juicebox extensions](https://github.com/DAOLABS-WTF/juice-contracts-v3) with modifications to make [Juicebox](https://juicebox.money) integration optional.

## Development

This is a hardhat project, use `npx hardhat compile`, `npx hardhat test`, `npx hardhat coverage`, `npx hardhat run scripts/deploy.ts` and so on.

## Environment

This project was developed on macOS 12.6 with node 16.17.1. The scripts expect to have a `.env` file in project root. The schema is as follows:

```text
INFURA_KEY=
COINMARKETCAP_KEY=
ETHERSCAN_KEY=
PRIVATE_KEY=
REPORT_GAS='yes'
```

## Deployment

A sample deployment script is provided in `scripts/deploy.ts` it relies on a config file `deploy.json` in the same directory, a sample is provided and it looks as follows:

```json
{
    "name": "NFToken",
    "symbol": "NFT",
    "baseUri": "ipfs://token_metadata_root_cid",
    "contractUri": "ipfs://contract_metadata_cid",
    "maxSupply": 10000,
    "unitPrice": "1000000000000000",
    "mintAllowance": 10,
    "mintPeriodStart": 0,
    "mintPeriodEnd": 0
}
```

Note that after deployment `mintAllowance` and `maxSupply` cannot be changed. Pick these values carefully. `unitPrice` is in wei.

Run the script as `npx hardhat run scripts/deploy.ts --network goerli`.

A sample deployment can be seen here [on Goerli](https://goerli.etherscan.io/address/0x4a906517797B103F65848ee6D15AF8678510Ce82).
