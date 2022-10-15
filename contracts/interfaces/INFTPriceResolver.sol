// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.9;

enum PriceFunction {
  LINEAR,
  EXP,
  CONSTANT
}

interface INFTPriceResolver {
  error UNSUPPORTED_OPERATION();

  function getPrice(
    address _token,
    address _minter,
    uint256 _tokenid
  ) external view returns (uint256);

  function getPriceWithParams(
    address _token,
    address _minter,
    uint256 _tokenid,
    bytes calldata _params
  ) external view returns (uint256);
}
