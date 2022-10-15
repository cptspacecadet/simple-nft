// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.9;

import './IOperatorFilter.sol';

interface IOperatorFilter {
  function mayTransfer(address operator) external view returns (bool);

  function registerAddress(address _account, bool _blocked) external;

  function registerCodeHash(bytes32 _codeHash, bool _locked) external;
}
