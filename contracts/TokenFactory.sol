// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/proxy/Clones.sol';

import './NFToken.sol';

/**
 * @notice
 */
contract TokenFactory {
  event Deployment(address contractAddress, address tokenAdmin, string tokenName);
  NFToken internal sourceToken;

  constructor(NFToken _sourceToken) {
    sourceToken = _sourceToken;
  }

  function deployToken(
    address _owner,
    string memory _name,
    string memory _symbol,
    string memory _baseUri,
    string memory _contractUri,
    uint256 _maxSupply,
    uint256 _unitPrice,
    uint256 _mintAllowance,
    uint128 _mintPeriodStart,
    uint128 _mintPeriodEnd
  ) external returns (address token) {
    token = Clones.clone(address(sourceToken));
    {
      NFToken(token).initialize(
        _owner,
        _name,
        _symbol,
        _baseUri,
        _contractUri,
        _maxSupply,
        _unitPrice,
        _mintAllowance,
        _mintPeriodStart,
        _mintPeriodEnd
      );
    }
    emit Deployment(token, _owner, _name);
  }
}
