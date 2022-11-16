// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.9;

import '@jbx-protocol/juice-contracts-v3/contracts/interfaces/IJBDirectory.sol';
import './components/BaseNFT.sol';

contract NFToken is BaseNFT {
  error INVALID_OPERATION();

  //*********************************************************************//
  // ------------------------- initialization -------------------------- //
  //*********************************************************************//

  /**
   * @dev This contract is meant to be deployed via the `Deployer` which makes `Clone`s. The `Deployer` itself has a reference to a known-good copy. When the platform admin is deploying the `Deployer` and the source `NFUToken` the constructor will lock that contract to the platform admin. When the deployer is making copies of it the source storage isn't taken so the Deployer will call `initialize` to set the admin to the correct account.
   */
  constructor() {
    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    _grantRole(MINTER_ROLE, msg.sender);
    _grantRole(REVEALER_ROLE, msg.sender);
  }

  /**
   * @notice Creates the NFT contract.
   *
   * @param _owner Token admin.
   * @param _name Token name.
   * @param _symbol Token symbol.
   * @param _baseUri Base URI, initially expected to point at generic, "unrevealed" metadata json.
   * @param _contractUri OpenSea-style contract metadata URI.
   * @param _maxSupply Max NFT supply.
   * @param _unitPrice Price per token expressed in Ether.
   * @param _mintAllowance Per-user mint cap.
   * @param _mintPeriodStart Start of the minting period in seconds.
   * @param _mintPeriodEnd End of the minting period in seconds.
   */
  function initialize(
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
  ) public {
    if (bytes(name).length != 0) {
      revert INVALID_OPERATION();
    }

    if (getRoleMemberCount(DEFAULT_ADMIN_ROLE) != 0) {
      if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
        revert INVALID_OPERATION();
      }
    } else {
      _grantRole(DEFAULT_ADMIN_ROLE, _owner);
      _grantRole(MINTER_ROLE, _owner);
      _grantRole(REVEALER_ROLE, _owner);
    }

    name = _name;
    symbol = _symbol;

    baseUri = _baseUri;
    contractUri = _contractUri;
    maxSupply = _maxSupply;
    unitPrice = _unitPrice;
    mintAllowance = _mintAllowance;
    mintPeriodStart = _mintPeriodStart;
    mintPeriodEnd = _mintPeriodEnd;

    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    _grantRole(MINTER_ROLE, msg.sender);
    _grantRole(REVEALER_ROLE, msg.sender);
  }

  /**
   *
   */
  function registerProject(IJBDirectory _jbxDirectory, uint256 _jbxProjectId)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
  {
    jbxDirectory = _jbxDirectory;
    jbxProjectId = _jbxProjectId;
  }

  /**
   * @notice Allows owner to transfer Ether balances.
   */
  function transferBalance(address payable _to, uint256 _amount)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
  {
    _to.transfer(_amount);
  }
}
