// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IAgentIdentity} from "./interfaces/IAgentIdentity.sol";

/// @title AgentCreditPool — EXPERIMENTAL, UNAUDITED
/// @notice Unsecured-from-the-agent, fully-backed-by-a-third-party credit
///         pool for AI agents, modeled on Priors' public v2 design
///         (github.com/priors-agents/priors) and independently
///         reimplemented here for Auevo on Robinhood Chain. Reuses
///         whatever `IAgentIdentity` the deployer points at (an existing
///         ERC-8004 identity registry — an open standard, not owned by
///         this contract) instead of minting its own identities.
///
/// @dev SECURITY MODEL — read this before anyone deposits, backs or
///      borrows anything.
///
///      Who can lose money, and how much:
///        - A lender (deposit()) can lose money only if a backed loan
///          defaults for MORE than its backer's own locked stake can
///          cover — i.e. never, by construction: every loan is sized so
///          its principal + fee never exceeds its one sponsor's free
///          capacity at borrow time (see `available`/`freeCapacity`
///          below), and a default burns exactly that sponsor's own
///          shares, never anyone else's. No path from an agent's default
///          to a lender's principal has been built into this contract.
///        - A sponsor/backer (`vouch`) can lose up to what it vouched,
///          and only if the specific agent it backed defaults. It never
///          loses anything for an agent it did not back.
///        - Auevo itself never backs an agent and never deposits its own
///          capital here: this contract has no owner, no admin function,
///          and no privileged address at all — every credit line exists
///          only because some third-party address called `vouch()` with
///          that agent owner's own signed consent.
///
///      Consent: `vouch()` requires an EIP-712 signature from the agent's
///      CURRENT identity owner (read live from `identity`, never cached)
///      naming the sponsor and the most premium it will ever accept.
///      Nobody can be "backed" — and so nobody can be made to carry a
///      sponsor's chosen premium — without having signed for exactly
///      that sponsor. A signature that already redeemed one nonce can
///      never redeem another; selling the identity NFT does not transfer
///      a stale signature's validity, because `identity.ownerOf` is
///      re-read at `vouch()` time, not cached from signing time.
///
///      Default: anyone may call `markDefault()` once the grace period
///      has passed on an unpaid loan. It burns the sponsor's shares for
///      principal + fee (rounding in the pool's favour), marks the
///      agent's identity permanently unable to borrow or sponsor again,
///      and records the default against the identity's current owner so
///      a sold/re-registered identity cannot outrun its own history. One
///      sponsor's default never touches another sponsor's stake, and
///      never reduces the pool's share price for anyone who did not back
///      that specific agent.
///
///      Scope deliberately narrower than Priors v2: one open loan per
///      agent at a time (simplifies default accounting — nothing here
///      tracks "this sponsor's OTHER loans" because there are none), one
///      sponsor per agent (no treasury/seat/stock-vault backer types —
///      every line comes from a plain third-party stake), and no
///      delegate address (only the identity's current owner may borrow
///      or repay). All of that is addable later without touching the
///      invariants above.
///
///      What this is NOT: an audited contract. It has been reviewed by
///      hand and tested against a local chain (see test/run-credit.mjs)
///      but that is not a substitute for a real, paid, independent
///      audit — same posture as DcaVault.sol and DcaVaultV4.sol in this
///      same directory. Not deployed anywhere by this change.
contract AgentCreditPool is ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------
    // Immutable configuration
    // ---------------------------------------------------------------

    IERC20 public immutable asset;
    IAgentIdentity public immutable identity;
    uint256 public immutable minLoan;
    uint256 public immutable maxLoan;
    /// @dev Base fee in bps per 30-day term, e.g. 100 = 1%/30d (Priors' own number).
    uint16 public immutable feeBps;
    uint256 public immutable minRootStake;
    /// @dev Where the protocol's 15% fee share goes. Not this contract itself —
    ///      it is paid out immediately on every repay(), never accrues here.
    address public immutable reserveAddress;

    uint256 public constant BPS_DENOM = 10_000;
    uint256 public constant LENDER_FEE_BPS = 6_000; // 60%
    uint256 public constant SPONSOR_FEE_BPS = 2_500; // 25%
    // Reserve's cut is the remainder (1_500 / 15%), computed as fee - lender - sponsor
    // so rounding dust favours the reserve rather than disappearing or double-counting.
    uint16 public constant MAX_PREMIUM_BPS = 200; // 2%/30d ceiling, mirrors Priors
    uint64 public constant GRACE_PERIOD = 3 days;
    uint64 public constant MIN_TERM_DAYS = 1;
    uint64 public constant MAX_TERM_DAYS = 30;

    bytes32 private constant CONSENT_TYPEHASH = keccak256(
        "Consent(uint256 agentId,address sponsor,uint16 maxPremiumBps,uint256 nonce,uint256 deadline)"
    );

    // ---------------------------------------------------------------
    // Pool share accounting (lenders AND sponsors hold the same
    // fungible share; a sponsor's shares are additionally what a
    // default on an agent it backs can burn).
    // ---------------------------------------------------------------

    uint256 public totalShares;
    uint256 public totalAssets;
    mapping(address => uint256) public shares;

    mapping(address => bool) public isRoot;
    /// @dev Value (in asset units, at vouch time) a sponsor has committed as
    ///      open credit lines. Released in full when that agent defaults.
    mapping(address => uint256) public delegatedOut;
    /// @dev Fee locked out of a sponsor's free capacity for its currently
    ///      open loan(s) — separate from delegatedOut because the fee is
    ///      only known (and only at risk) once a loan is actually drawn.
    mapping(address => uint256) public feeLocked;
    /// @dev Keyed by an agent identity's owner address AT THE TIME OF
    ///      DEFAULT — survives the identity being sold or re-registered.
    mapping(address => uint256) public ownerDefaults;
    mapping(address => mapping(uint256 => bool)) public consentNonceUsed;

    enum LoanStatus {
        None,
        Open,
        Repaid,
        Defaulted
    }

    struct Loan {
        uint256 agentId;
        address sponsor;
        uint256 principal;
        uint256 fee;
        uint64 dueAt;
        uint64 defaultableAt;
        LoanStatus status;
    }

    struct AgentAccount {
        address sponsor;
        uint256 delegatedIn;
        uint256 principalOut;
        bool activeLoan;
        bool defaulted;
        uint32 loansRepaid;
        uint256 volumeRepaid;
        uint64 enrolledAt;
        uint16 premiumBps;
    }

    mapping(uint256 => AgentAccount) public agents;
    mapping(uint256 => Loan) public loans;
    uint256 public nextLoanId;

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

    event Deposited(address indexed who, uint256 amount, uint256 sharesMinted);
    event Withdrawn(address indexed who, uint256 amount, uint256 sharesBurned);
    event RootEnrolled(address indexed who);
    event Vouched(uint256 indexed agentId, address indexed sponsor, uint256 amount, uint16 premiumBps);
    event Borrowed(uint256 indexed loanId, uint256 indexed agentId, address sponsor, uint256 amount, uint256 fee, uint64 dueAt);
    event Repaid(uint256 indexed loanId, uint256 indexed agentId, uint256 lenderCut, uint256 sponsorCut, uint256 reserveCut);
    event Defaulted(uint256 indexed loanId, uint256 indexed agentId, address sponsor, uint256 loss, uint256 sharesBurned);

    constructor(
        IERC20 asset_,
        IAgentIdentity identity_,
        uint256 minLoan_,
        uint256 maxLoan_,
        uint16 feeBps_,
        uint256 minRootStake_,
        address reserveAddress_
    ) EIP712("AgentCreditPool", "1") {
        require(address(asset_) != address(0), "asset=0");
        require(address(identity_) != address(0), "identity=0");
        require(minLoan_ > 0 && minLoan_ <= maxLoan_, "bad loan bounds");
        require(reserveAddress_ != address(0), "reserve=0");
        asset = asset_;
        identity = identity_;
        minLoan = minLoan_;
        maxLoan = maxLoan_;
        feeBps = feeBps_;
        minRootStake = minRootStake_;
        reserveAddress = reserveAddress_;
    }

    // ---------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------

    function sharesValue(address who) public view returns (uint256) {
        if (totalShares == 0) return 0;
        return (shares[who] * totalAssets) / totalShares;
    }

    /// @notice What `who` could still vouch or withdraw right now.
    function freeCapacity(address who) public view returns (uint256) {
        uint256 value = sharesValue(who);
        uint256 locked = delegatedOut[who] + feeLocked[who];
        return value > locked ? value - locked : 0;
    }

    /// @notice How much more an agent's own sponsor-vouched line can still lend it.
    function available(uint256 agentId) public view returns (uint256) {
        AgentAccount storage a = agents[agentId];
        return a.delegatedIn > a.principalOut ? a.delegatedIn - a.principalOut : 0;
    }

    // ---------------------------------------------------------------
    // Lender actions
    // ---------------------------------------------------------------

    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "amount=0");
        asset.safeTransferFrom(msg.sender, address(this), amount);
        uint256 minted = _mintShares(msg.sender, amount);
        emit Deposited(msg.sender, amount, minted);
    }

    /// @param amount Asset units to withdraw. Reverts if it exceeds what is
    ///        not currently backing an open line or a locked fee.
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "amount=0");
        require(amount <= freeCapacity(msg.sender), "not free");
        require(totalAssets > 0, "empty pool");
        uint256 burned = (amount * totalShares) / totalAssets; // floor: favours remaining holders
        require(burned <= shares[msg.sender], "insufficient shares");
        shares[msg.sender] -= burned;
        totalShares -= burned;
        totalAssets -= amount;
        asset.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount, burned);
    }

    function _mintShares(address to, uint256 amount) internal returns (uint256 minted) {
        minted = totalShares == 0 ? amount : (amount * totalShares) / totalAssets; // floor: favours existing holders
        totalShares += minted;
        totalAssets += amount;
        shares[to] += minted;
    }

    // ---------------------------------------------------------------
    // Backer (root) actions
    // ---------------------------------------------------------------

    function enrollRoot() external {
        require(sharesValue(msg.sender) >= minRootStake, "below min stake");
        isRoot[msg.sender] = true;
        emit RootEnrolled(msg.sender);
    }

    /// @param premiumBps What the sponsor will actually charge this agent on
    ///        top of the base fee, bounded by the owner's own signed ceiling.
    /// @param maxPremiumBps The ceiling the agent's owner signed for — part
    ///        of the signed message, so the owner is bound by this number,
    ///        not by whatever `premiumBps` the sponsor later happens to pick.
    function vouch(
        uint256 agentId,
        uint256 amount,
        uint16 premiumBps,
        uint16 maxPremiumBps,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        require(isRoot[msg.sender], "not a root");
        require(amount > 0, "amount=0");
        require(premiumBps <= maxPremiumBps, "premium>ceiling");
        require(maxPremiumBps <= MAX_PREMIUM_BPS, "ceiling too high");
        require(block.timestamp <= deadline, "consent expired");

        address owner_ = identity.ownerOf(agentId);
        require(!consentNonceUsed[owner_][nonce], "nonce used");
        consentNonceUsed[owner_][nonce] = true;

        bytes32 structHash = keccak256(
            abi.encode(CONSENT_TYPEHASH, agentId, msg.sender, maxPremiumBps, nonce, deadline)
        );
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), signature);
        require(signer == owner_, "bad consent");

        AgentAccount storage a = agents[agentId];
        require(!a.defaulted, "agent defaulted");
        require(a.sponsor == address(0) || a.sponsor == msg.sender, "already sponsored");
        require(amount <= freeCapacity(msg.sender), "over free capacity");

        if (a.sponsor == address(0)) {
            a.sponsor = msg.sender;
            a.enrolledAt = uint64(block.timestamp);
        }
        a.delegatedIn += amount;
        a.premiumBps = premiumBps;
        delegatedOut[msg.sender] += amount;

        emit Vouched(agentId, msg.sender, amount, premiumBps);
    }

    // ---------------------------------------------------------------
    // Agent actions
    // ---------------------------------------------------------------

    function borrow(uint256 agentId, uint256 amount, uint256 termDays, address to) external nonReentrant returns (uint256 loanId) {
        require(msg.sender == identity.ownerOf(agentId), "not identity owner");
        require(to != address(0), "to=0");
        AgentAccount storage a = agents[agentId];
        require(!a.defaulted, "agent defaulted");
        require(!a.activeLoan, "loan already open");
        require(a.sponsor != address(0), "no sponsor");
        require(amount >= minLoan && amount <= maxLoan, "loan size");
        require(termDays >= MIN_TERM_DAYS && termDays <= MAX_TERM_DAYS, "term");
        require(amount <= available(agentId), "over line");

        uint256 fee = (amount * (uint256(feeBps) + a.premiumBps) * termDays) / (30 * BPS_DENOM);
        address sponsor = a.sponsor;
        require(fee <= freeCapacity(sponsor), "sponsor fee capacity");
        feeLocked[sponsor] += fee;

        a.principalOut += amount;
        a.activeLoan = true;

        uint64 dueAt = uint64(block.timestamp + termDays * 1 days);
        loanId = nextLoanId++;
        loans[loanId] = Loan({
            agentId: agentId,
            sponsor: sponsor,
            principal: amount,
            fee: fee,
            dueAt: dueAt,
            defaultableAt: dueAt + GRACE_PERIOD,
            status: LoanStatus.Open
        });

        asset.safeTransfer(to, amount);
        emit Borrowed(loanId, agentId, sponsor, amount, fee, dueAt);
    }

    /// @notice Anyone may repay on an agent's behalf; the record credits the agent.
    function repay(uint256 loanId) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.Open, "not open");

        uint256 principal = loan.principal;
        uint256 fee = loan.fee;
        asset.safeTransferFrom(msg.sender, address(this), principal + fee);

        AgentAccount storage a = agents[loan.agentId];
        a.principalOut -= principal;
        a.activeLoan = false;
        a.loansRepaid += 1;
        a.volumeRepaid += principal;
        feeLocked[loan.sponsor] -= fee;

        uint256 lenderCut = (fee * LENDER_FEE_BPS) / BPS_DENOM;
        uint256 sponsorCut = (fee * SPONSOR_FEE_BPS) / BPS_DENOM;
        uint256 reserveCut = fee - lenderCut - sponsorCut; // remainder absorbs rounding dust

        totalAssets += lenderCut; // principal itself is accounting-neutral: it was
        // already counted in totalAssets as an outstanding receivable while the
        // loan was open, so only the fee split changes totalAssets here.
        _mintShares(loan.sponsor, sponsorCut);
        if (reserveCut > 0) asset.safeTransfer(reserveAddress, reserveCut);

        loan.status = LoanStatus.Repaid;
        emit Repaid(loanId, loan.agentId, lenderCut, sponsorCut, reserveCut);
    }

    /// @notice Permissionless by design — matches Priors: anyone may call this
    ///         once the grace period has passed, same as an off-chain keeper would.
    function markDefault(uint256 loanId) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.Open, "not open");
        require(block.timestamp > loan.defaultableAt, "not yet defaultable");

        uint256 loss = loan.principal + loan.fee;
        uint256 toBurn = (loss * totalShares + totalAssets - 1) / totalAssets; // ceil, favours the pool
        uint256 sponsorShares = shares[loan.sponsor];
        if (toBurn > sponsorShares) toBurn = sponsorShares;
        shares[loan.sponsor] -= toBurn;
        totalShares -= toBurn;
        totalAssets -= loss;

        AgentAccount storage a = agents[loan.agentId];
        a.principalOut -= loan.principal;
        a.activeLoan = false;
        a.defaulted = true;
        delegatedOut[loan.sponsor] -= a.delegatedIn;
        a.delegatedIn = 0;
        feeLocked[loan.sponsor] -= loan.fee;

        address owner_ = identity.ownerOf(loan.agentId);
        ownerDefaults[owner_] += 1;

        loan.status = LoanStatus.Defaulted;
        emit Defaulted(loanId, loan.agentId, loan.sponsor, loss, toBurn);
    }
}
