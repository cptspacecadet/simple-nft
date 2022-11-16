// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.9;

import '@openzeppelin/contracts/access/AccessControlEnumerable.sol';
import '@openzeppelin/contracts/interfaces/IERC2981.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/Strings.sol';

import '@jbx-protocol/juice-contracts-v3/contracts/interfaces/IJBDirectory.sol';
import '@jbx-protocol/juice-contracts-v3/contracts/interfaces/IJBPaymentTerminal.sol';
import '@jbx-protocol/juice-contracts-v3/contracts/libraries/JBTokens.sol';
import '../interfaces/INFTPriceResolver.sol';
import '../interfaces/IOperatorFilter.sol';
import './ERC721FU.sol';

abstract contract BaseNFT is ERC721FU, AccessControlEnumerable, ReentrancyGuard {
  using Strings for uint256;

  bytes32 public constant MINTER_ROLE = keccak256('MINTER_ROLE');
  bytes32 public constant REVEALER_ROLE = keccak256('REVEALER_ROLE');

  /**
   * @notice NFT provenance hash reassignment prohibited.
   */
  error PROVENANCE_REASSIGNMENT();

  /**
   * @notice Base URI assignment along with the "revealed" flag can only be done once.
   */
  error ALREADY_REVEALED();

  /**
   * @notice User mint allowance exhausted.
   */
  error ALLOWANCE_EXHAUSTED();

  /**
   * @notice mint() function received an incorrect payment, expected payment returned as argument.
   */
  error INCORRECT_PAYMENT(uint256);

  /**
   * @notice Token supply exhausted, all tokens have been minted.
   */
  error SUPPLY_EXHAUSTED();

  /**
   * @notice Various payment failures caused by incorrect contract condiguration.
   */
  error PAYMENT_FAILURE();

  error MINT_NOT_STARTED();
  error MINT_CONCLUDED();

  error INVALID_TOKEN();

  error INVALID_RATE();

  error MINTING_PAUSED();

  error CALLER_BLOCKED();

  /**
   * @notice Prevents minting outside of the mint period if set. Can be set only to have a start or only and end date.
   */
  modifier onlyDuringMintPeriod() {
    if (mintPeriodStart != 0 && mintPeriodStart > block.timestamp) {
      revert MINT_NOT_STARTED();
    }

    if (mintPeriodEnd != 0 && mintPeriodEnd < block.timestamp) {
      revert MINT_CONCLUDED();
    }

    _;
  }
  /**
   * @notice Prevents minting by blocked addresses and contracts hashes.
   */
  modifier callerNotBlocked(address account) {
    if (address(operatorFilter) != address(0) && !operatorFilter.mayTransfer(account)) {
      revert CALLER_BLOCKED();
    }

    _;
  }

  IJBDirectory jbxDirectory;
  uint256 jbxProjectId;
  uint256 public maxSupply;
  uint256 public unitPrice;
  uint256 public mintAllowance;
  uint128 public mintPeriodStart;
  uint128 public mintPeriodEnd;
  uint256 public totalSupply;

  string public baseUri;
  string public contractUri;
  string public provenanceHash;

  /**
   * @notice Revealed flag.
   *
   * @dev changes the way tokenUri(uint256) works.
   */
  bool public isRevealed;

  /**
   * @notice Pause minting flag
   */
  bool public isPaused;

  address payable public royaltyReceiver;

  /**
   * @notice Royalty rate expressed in bps.
   */
  uint16 public royaltyRate;

  INFTPriceResolver public priceResolver;
  IOperatorFilter public operatorFilter;

  //*********************************************************************//
  // ----------------------------- ERC721 ------------------------------ //
  //*********************************************************************//

  /**
   * @dev Override to apply callerNotBlocked modifier in case there is an OperatorFilter set
   */
  function transferFrom(
    address _from,
    address _to,
    uint256 _id
  ) public virtual override callerNotBlocked(msg.sender) {
    super.transferFrom(_from, _to, _id);
  }

  /**
   * @dev Override to apply callerNotBlocked modifier in case there is an OperatorFilter set
   */
  function safeTransferFrom(
    address _from,
    address _to,
    uint256 _id
  ) public virtual override callerNotBlocked(msg.sender) {
    super.safeTransferFrom(_from, _to, _id);
  }

  /**
   * @dev Override to apply callerNotBlocked modifier in case there is an OperatorFilter set
   */
  function safeTransferFrom(
    address _from,
    address _to,
    uint256 _id,
    bytes calldata _data
  ) public virtual override callerNotBlocked(msg.sender) {
    super.safeTransferFrom(_from, _to, _id, _data);
  }

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /**
   * @notice Get contract metadata to make OpenSea happy.
   */
  function contractURI() public view returns (string memory) {
    return contractUri;
  }

  /**
   * @dev If the token has been set as "revealed", returned uri will append the token id
   */
  function tokenURI(uint256 _tokenId) public view virtual override returns (string memory uri) {
    if (ownerOf(_tokenId) == address(0)) {
      uri = '';
    } else {
      uri = !isRevealed ? baseUri : string(abi.encodePacked(baseUri, _tokenId.toString()));
    }
  }

  /**
   * @notice EIP2981 implementation for royalty distribution.
   *
   * @param _tokenId Token id.
   * @param _salePrice NFT sale price to derive royalty amount from.
   */
  function royaltyInfo(uint256 _tokenId, uint256 _salePrice)
    external
    view
    virtual
    returns (address receiver, uint256 royaltyAmount)
  {
    if (_salePrice == 0 || _ownerOf[_tokenId] != address(0)) {
      receiver = address(0);
      royaltyAmount = 0;
    } else {
      receiver = royaltyReceiver == address(0) ? address(this) : royaltyReceiver;
      royaltyAmount = (_salePrice * royaltyRate) / 10_000;
    }
  }

  /**
   * @dev rari-capital version of ERC721 reverts when owner is address(0), usually that means it's not minted, this is problematic for several workflows. This function simply returns an address.
   */
  function ownerOf(uint256 _tokenId) public view override returns (address owner) {
    owner = _ownerOf[_tokenId];
  }

  function getMintPrice(address _minter) external view returns (uint256) {
    if (address(priceResolver) == address(0)) {
      return unitPrice;
    }

    return priceResolver.getPriceWithParams(address(this), _minter, totalSupply + 1, '');
  }

  //*********************************************************************//
  // ---------------------- external transactions ---------------------- //
  //*********************************************************************//

  /**
   * @notice Mints a token to the calling account. Must be paid in Ether if price is non-zero.
   *
   * @dev Proceeds are forwarded to the default Juicebox terminal for the project id set in the constructor. Payment will fail if the terminal is not set in the jbx directory.
   */
  function mint()
    external
    payable
    virtual
    nonReentrant
    onlyDuringMintPeriod
    callerNotBlocked(msg.sender)
    returns (uint256 tokenId)
  {
    if (totalSupply == maxSupply) {
      revert SUPPLY_EXHAUSTED();
    }

    if (isPaused) {
      revert MINTING_PAUSED();
    }

    processPayment('', '');

    unchecked {
      ++totalSupply;
    }
    tokenId = totalSupply;
    _mint(msg.sender, totalSupply);
  }

  /**
   * @notice Mints a token to the calling account. Must be paid in Ether if price is non-zero.
   *
   * @dev Proceeds are forwarded to the default Juicebox terminal for the project id set in the constructor. Payment will fail if the terminal is not set in the jbx directory.
   */
  function mint(string calldata _memo, bytes calldata _metadata)
    external
    payable
    virtual
    nonReentrant
    onlyDuringMintPeriod
    callerNotBlocked(msg.sender)
    returns (uint256 tokenId)
  {
    if (totalSupply == maxSupply) {
      revert SUPPLY_EXHAUSTED();
    }

    if (isPaused) {
      revert MINTING_PAUSED();
    }

    processPayment(_memo, _metadata);

    unchecked {
      ++totalSupply;
    }
    tokenId = totalSupply;
    _mint(msg.sender, totalSupply);
  }

  /**
   * @notice Accepts Ether payment and forwards it to the appropriate jbx terminal during the mint phase.
   *
   * @dev This version of the NFT does not directly accept Ether and will fail to process mint payment if there is a misconfiguration of the JBX terminal.
   *
   * @param _memo Juicebox memo to pass to a IJBPaymentTerminal
   * @param _metadata Juicebox metadata to pass to a IJBPaymentTerminal
   */
  function processPayment(string memory _memo, bytes memory _metadata) internal virtual {
    uint256 accountBalance = balanceOf(msg.sender);
    if (accountBalance == mintAllowance) {
      revert ALLOWANCE_EXHAUSTED();
    }

    uint256 expectedPrice = unitPrice;
    if (address(priceResolver) != address(0)) {
      expectedPrice = priceResolver.getPrice(address(this), msg.sender, 0);
    }

    if (msg.value != expectedPrice) {
      revert INCORRECT_PAYMENT(expectedPrice);
    }

    if (msg.value != 0 && address(jbxDirectory) != address(0)) {
      // NOTE: move funds to jbx project
      IJBPaymentTerminal terminal = jbxDirectory.primaryTerminalOf(jbxProjectId, JBTokens.ETH);
      if (address(terminal) == address(0)) {
        revert PAYMENT_FAILURE();
      }

      terminal.pay{value: msg.value}(
        jbxProjectId,
        msg.value,
        JBTokens.ETH,
        msg.sender,
        0,
        false,
        _memo,
        _metadata
      );
    }
  }

  //*********************************************************************//
  // -------------------- priviledged transactions --------------------- //
  //*********************************************************************//

  /**
   * @notice Privileged operation callable by accounts with MINTER_ROLE permission to mint the next NFT id to the provided address.
   */
  function mintFor(address _account)
    external
    virtual
    onlyRole(MINTER_ROLE)
    returns (uint256 tokenId)
  {
    if (totalSupply == maxSupply) {
      revert SUPPLY_EXHAUSTED();
    }

    unchecked {
      ++totalSupply;
    }
    tokenId = totalSupply;
    _mint(_account, tokenId);
  }

  function setPause(bool pause) external onlyRole(DEFAULT_ADMIN_ROLE) {
    isPaused = pause;
  }

  function addMinter(address _account) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _grantRole(MINTER_ROLE, _account);
  }

  function removeMinter(address _account) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _revokeRole(MINTER_ROLE, _account);
  }

  function addRevealer(address _account) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _grantRole(REVEALER_ROLE, _account);
  }

  function removeRevealer(address _account) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _revokeRole(REVEALER_ROLE, _account);
  }

  /**
   * @notice Set provenance hash.
   *
   * @dev This operation can only be executed once.
   */
  function setProvenanceHash(string memory _provenanceHash) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (bytes(provenanceHash).length != 0) {
      revert PROVENANCE_REASSIGNMENT();
    }
    provenanceHash = _provenanceHash;
  }

  /**
    @notice Metadata URI for token details in OpenSea format.
   */
  function setContractURI(string memory _contractUri) external onlyRole(DEFAULT_ADMIN_ROLE) {
    contractUri = _contractUri;
  }

  /**
   * @notice Allows adjustment of minting period.
   *
   * @param _mintPeriodStart New minting period start.
   * @param _mintPeriodEnd New minting period end.
   */
  function updateMintPeriod(uint128 _mintPeriodStart, uint128 _mintPeriodEnd)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
  {
    mintPeriodStart = _mintPeriodStart;
    mintPeriodEnd = _mintPeriodEnd;
  }

  function updateUnitPrice(uint256 _unitPrice) external onlyRole(DEFAULT_ADMIN_ROLE) {
    unitPrice = _unitPrice;
  }

  function updatePriceResolver(INFTPriceResolver _priceResolver)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
  {
    priceResolver = _priceResolver;
  }

  function updateOperatorFilter(IOperatorFilter _operatorFilter)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
  {
    operatorFilter = _operatorFilter;
  }

  /**
   * @notice Set NFT metadata base URI.
   *
   * @dev URI must include the trailing slash.
   */
  function setBaseURI(string memory _baseUri, bool _reveal) external onlyRole(REVEALER_ROLE) {
    // TODO: revealer role
    if (isRevealed && !_reveal) {
      revert ALREADY_REVEALED();
    }

    baseUri = _baseUri;
    isRevealed = _reveal;
  }

  /**
   * @notice Allows owner to transfer ERC20 balances.
   */
  function transferTokenBalance(
    IERC20 token,
    address to,
    uint256 amount
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    token.transfer(to, amount);
  }

  /**
   * @notice Sets royalty info
   *
   * @param _royaltyReceiver Payable royalties receiver, if set to address(0) royalties will be processed by the contract itself.
   * @param _royaltyRate Rate expressed in bps, can only be set once.
   */
  function setRoyalties(address _royaltyReceiver, uint16 _royaltyRate)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
  {
    royaltyReceiver = payable(_royaltyReceiver);

    if (_royaltyRate > 10_000) {
      revert INVALID_RATE();
    }

    if (royaltyRate == 0) {
      royaltyRate = _royaltyRate;
    }
  }

  /**
   * @dev See {IERC165-supportsInterface}.
   */
  function supportsInterface(bytes4 interfaceId)
    public
    view
    override(AccessControlEnumerable, ERC721FU)
    returns (bool)
  {
    return
      interfaceId == type(IERC2981).interfaceId || // 0x2a55205a
      AccessControlEnumerable.supportsInterface(interfaceId) ||
      ERC721FU.supportsInterface(interfaceId);
  }
}
