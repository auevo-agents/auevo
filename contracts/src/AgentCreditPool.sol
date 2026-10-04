// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IAgentIdentity} from "./interfaces/IAgentIdentity.sol";

/// @title AgentCreditPool — EXPERIMENTAL, UNAUDITED
/// @notice Unsecured-from-the-agent, fully-backed-by-third-parties credit
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
///          defaults for MORE than its backing sponsors' own locked stake
///          can cover — i.e. never, by construction: every loan's
///          principal is split pro-rata across an agent's CURRENT
///          sponsors at borrow time, and no sponsor's share of any loan
///          can ever exceed that sponsor's own free capacity at that
///          moment (see `available`/`freeCapacity` below). A default
///          burns exactly the shares of the sponsors who actually backed
///          THAT loan, in proportion to their own share of it — never a
///          lender's, and never a sponsor who backed a different agent or
///          who joined this one only after the defaulted loan was drawn.
///        - A sponsor (`vouch`) can lose up to what it vouched for one
///          specific agent, and only if a loan it actually contributed to
///          (by being one of that agent's sponsors when the loan was
///          drawn) later defaults. It never loses anything for an agent
///          it did not back, or for a loan drawn before it ever vouched.
///        - Auevo itself never backs an agent and never deposits its own
///          capital here: this contract has no owner, no admin function,
///          and no privileged address at all — every credit line exists
///          only because some third-party address called `vouch()` with
///          that agent owner's own signed consent. (Nothing stops Auevo
///          or anyone else from becoming an ordinary sponsor like any
///          other address — that guarantee is a policy choice, not
///          something this contract can enforce for you.)
///
///      Multiple sponsors per agent: an agent may be backed by up to
///      `MAX_SPONSORS_PER_AGENT` distinct sponsors at once (bounded so
///      `borrow()`/`repay()`/`markDefault()` always do bounded, not
///      unbounded, work — an unbounded sponsor list would be a gas-
///      griefing vector). Each loan snapshots, at the moment it's drawn,
///      exactly how much of its principal and fee each THEN-current
///      sponsor is backing (`SponsorShare[]` on the `Loan`) — frozen for
///      that loan's entire life. A sponsor who vouches more, or vouches
///      for the first time, after a loan is already open is not part of
///      that loan's snapshot and carries none of its risk or reward; it
///      only backs loans drawn after it joined.
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
///      Who may act for an agent: `borrow()` accepts either the
///      identity's current `owner` or its `operatorWallet`, if the
///      configured identity registry exposes one (read defensively via a
///      best-effort staticcall — see `_operatorWalletOf` — so this pool
///      still works unmodified against a registry, like Priors' own, that
///      has no such concept at all). `repay()` stays permissionless, same
///      as before, since crediting an agent's record never requires
///      proving who paid.
///
///      Default: anyone may call `markDefault()` once the grace period
///      has passed on an unpaid loan. For each sponsor who backed that
///      specific loan, it burns that sponsor's own shares for its own
///      share of principal + fee (rounding in the pool's favour), then
///      releases every one of the agent's sponsors' REMAINING committed
///      capacity (used or not, on this loan or any other) back to their
///      own free capacity — the agent can never borrow again regardless,
///      so nothing stays committed. The agent's identity is marked
///      permanently unable to borrow or be sponsored again, and the
///      default is recorded against the identity's current owner so a
///      sold/re-registered identity cannot outrun its own history. One
///      sponsor's default never touches another sponsor's stake (even
///      another sponsor of the SAME agent, if that sponsor wasn't part of
///      the defaulted loan's snapshot), and never reduces the pool's
///      share price for a lender — if a sponsor's live stake ever falls
///      short of what its own share of the loss requires (should be
///      unreachable; see `markDefault`'s own comment), the uncollectible
///      remainder becomes visible `totalBadDebt` instead of being pulled
///      from everyone else's shares.
///
///      Scope deliberately narrower than Priors v2 in one remaining way:
///      one open loan per agent at a time (simplifies default accounting
///      — nothing here tracks "this sponsor's OTHER loans on this same
///      agent" because there are none open concurrently). Multiple
///      sponsors per agent and an operator-wallet delegate are both
///      supported as of this version. Addable later without touching the
///      invariants above: multiple concurrent loans per agent, other
///      backer types (treasury/seat/stock-vault).
///
///      What this is NOT: an audited contract. It has been reviewed by
///      hand and tested against a local chain (see test/run-credit.mjs)
///      but that is not a substitute for a real, paid, independent
///      audit — same posture as DcaVault.sol and DcaVaultV4.sol in this
///      same directory. Not deployed anywhere by this change. The
///      multi-sponsor rewrite in this version is new, not yet
///      independently re-reviewed the way the single-sponsor version was
///      — treat its "written and tested" status as provisional until
///      that happens (see contracts/README.md).
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
    /// @dev Bounds every per-agent loop in borrow()/repay()/markDefault() to
    ///      at most this many iterations — without a cap, an attacker could
    ///      vouch from many tiny distinct addresses purely to make every
    ///      future call on that agent revert on gas (a griefing vector that
    ///      does not exist in a single-sponsor design).
    uint256 public constant MAX_SPONSORS_PER_AGENT = 20;

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
    /// @dev Should be unreachable under correct operation — see markDefault's
    ///      own comment. Tracked, not hidden, if it is ever nonzero: it means
    ///      a sponsor's live stake fell short of its committed capacity at
    ///      default time, and that shortfall was deliberately NOT pulled from
    ///      totalAssets, so it never diluted an uninvolved lender or sponsor.
    uint256 public totalBadDebt;
    mapping(address => uint256) public shares;

    mapping(address => bool) public isRoot;
    /// @dev Value (in asset units, at vouch time) a sponsor has committed as
    ///      open credit lines, summed across every agent it backs. Released
    ///      in full for one agent when that agent defaults.
    mapping(address => uint256) public delegatedOut;
    /// @dev Fee locked out of a sponsor's free capacity for its currently
    ///      open loan share(s) — separate from delegatedOut because the fee
    ///      is only known (and only at risk) once a loan is actually drawn.
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

    /// @dev One sponsor's standing commitment behind one agent — not a
    ///      per-loan amount. `amount` only grows (via vouch()) or is wiped
    ///      to zero (on that agent's default); it is the ceiling a given
    ///      loan's pro-rata split is computed against, not "what's left".
    struct SponsorStake {
        uint256 amount;
        uint16 premiumBps;
    }

    /// @dev One sponsor's frozen contribution to one specific loan, recorded
    ///      at borrow() time so later changes to that sponsor's (or any
    ///      other sponsor's) stake can never retroactively change what an
    ///      already-open loan owes, or who is on the hook if it defaults.
    struct SponsorShare {
        address sponsor;
        uint256 principal;
        uint256 fee;
    }

    struct AgentAccount {
        address[] sponsorList;
        mapping(address => SponsorStake) sponsorStakes;
        uint256 delegatedIn;
        uint256 principalOut;
        bool activeLoan;
        bool defaulted;
        uint32 loansRepaid;
        uint256 volumeRepaid;
        uint64 enrolledAt;
    }

    struct Loan {
        uint256 agentId;
        uint256 principal;
        uint256 fee;
        uint64 dueAt;
        uint64 defaultableAt;
        LoanStatus status;
        SponsorShare[] shares;
    }

    mapping(uint256 => AgentAccount) private agentAccounts;
    mapping(uint256 => Loan) private loanRecords;
    uint256 public nextLoanId;

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

    event Deposited(address indexed who, uint256 amount, uint256 sharesMinted);
    event Withdrawn(address indexed who, uint256 amount, uint256 sharesBurned);
    event RootEnrolled(address indexed who);
    event Vouched(uint256 indexed agentId, address indexed sponsor, uint256 amount, uint16 premiumBps);
    event Borrowed(uint256 indexed loanId, uint256 indexed agentId, uint256 amount, uint256 fee, uint64 dueAt);
    event Repaid(uint256 indexed loanId, uint256 indexed agentId, uint256 lenderCut, uint256 sponsorCut, uint256 reserveCut);
    event Defaulted(uint256 indexed loanId, uint256 indexed agentId, uint256 loss);
    event SponsorBurned(uint256 indexed loanId, address indexed sponsor, uint256 sharesBurned, uint256 writeOff);
    event BadDebt(uint256 indexed loanId, address indexed sponsor, uint256 amount);

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
        AgentAccount storage a = agentAccounts[agentId];
        return a.delegatedIn > a.principalOut ? a.delegatedIn - a.principalOut : 0;
    }

    function agentInfo(uint256 agentId)
        external
        view
        returns (
            uint256 delegatedIn,
            uint256 principalOut,
            bool activeLoan,
            bool defaulted,
            uint32 loansRepaid,
            uint256 volumeRepaid,
            uint64 enrolledAt,
            uint256 sponsorCount
        )
    {
        AgentAccount storage a = agentAccounts[agentId];
        return (
            a.delegatedIn,
            a.principalOut,
            a.activeLoan,
            a.defaulted,
            a.loansRepaid,
            a.volumeRepaid,
            a.enrolledAt,
            a.sponsorList.length
        );
    }

    function sponsorsOf(uint256 agentId) external view returns (address[] memory) {
        return agentAccounts[agentId].sponsorList;
    }

    function sponsorStakeOf(uint256 agentId, address sponsor) external view returns (uint256 amount, uint16 premiumBps) {
        SponsorStake storage s = agentAccounts[agentId].sponsorStakes[sponsor];
        return (s.amount, s.premiumBps);
    }

    function loanInfo(uint256 loanId)
        external
        view
        returns (uint256 agentId, uint256 principal, uint256 fee, uint64 dueAt, uint64 defaultableAt, LoanStatus status)
    {
        Loan storage l = loanRecords[loanId];
        return (l.agentId, l.principal, l.fee, l.dueAt, l.defaultableAt, l.status);
    }

    function loanSharesOf(uint256 loanId) external view returns (SponsorShare[] memory) {
        return loanRecords[loanId].shares;
    }

    /// @dev Best-effort read of an operator wallet from whatever identity
    ///      registry is configured, via a raw staticcall rather than adding
    ///      `operatorWalletOf` to `IAgentIdentity` itself — that interface
    ///      is kept deliberately minimal (see its own doc comment) so this
    ///      pool can point at ANY ERC-8004-shaped registry, including one
    ///      that only implements `ownerOf`. A registry that doesn't expose
    ///      `operatorWalletOf(uint256)` simply yields address(0) here, same
    ///      as "no operator set" — borrow() then falls back to owner-only.
    function _operatorWalletOf(uint256 agentId) internal view returns (address) {
        (bool ok, bytes memory data) =
            address(identity).staticcall(abi.encodeWithSignature("operatorWalletOf(uint256)", agentId));
        if (ok && data.length == 32) return abi.decode(data, (address));
        return address(0);
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
        uint256 burned = (amount * totalShares + totalAssets - 1) / totalAssets; // ceil: favours remaining holders
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

        AgentAccount storage a = agentAccounts[agentId];
        require(!a.defaulted, "agent defaulted");
        require(amount <= freeCapacity(msg.sender), "over free capacity");

        SponsorStake storage stake = a.sponsorStakes[msg.sender];
        if (stake.amount == 0) {
            require(a.sponsorList.length < MAX_SPONSORS_PER_AGENT, "too many sponsors");
            a.sponsorList.push(msg.sender);
            a.enrolledAt = a.enrolledAt == 0 ? uint64(block.timestamp) : a.enrolledAt;
        }
        stake.amount += amount;
        stake.premiumBps = premiumBps;
        a.delegatedIn += amount;
        delegatedOut[msg.sender] += amount;

        emit Vouched(agentId, msg.sender, amount, premiumBps);
    }

    // ---------------------------------------------------------------
    // Agent actions
    // ---------------------------------------------------------------

    /// @dev Split out of borrow() purely to keep that function's own stack
    ///      frame small enough for the legacy codegen (this loop's locals
    ///      otherwise push borrow() over Solidity's "stack too deep" limit)
    ///      — no behavior change from having it inline.
    function _distributeLoan(AgentAccount storage a, Loan storage loan, uint256 amount, uint256 termDays)
        internal
        returns (uint256 totalFee)
    {
        uint256 n = a.sponsorList.length;
        uint256 principalAssigned;
        for (uint256 i = 0; i < n; i++) {
            address s = a.sponsorList[i];
            SponsorStake storage stake = a.sponsorStakes[s];
            uint256 sponsorPrincipal = i == n - 1
                ? amount - principalAssigned // last sponsor absorbs rounding dust, so the sum is exact
                : (amount * stake.amount) / a.delegatedIn;
            if (sponsorPrincipal == 0) continue;
            principalAssigned += sponsorPrincipal;

            uint256 sponsorFee = (sponsorPrincipal * (uint256(feeBps) + stake.premiumBps) * termDays) / (30 * BPS_DENOM);
            require(sponsorFee <= freeCapacity(s), "sponsor fee capacity");
            feeLocked[s] += sponsorFee;
            totalFee += sponsorFee;

            loan.shares.push(SponsorShare({sponsor: s, principal: sponsorPrincipal, fee: sponsorFee}));
        }
    }

    function borrow(uint256 agentId, uint256 amount, uint256 termDays, address to) external nonReentrant returns (uint256 loanId) {
        address owner_ = identity.ownerOf(agentId);
        require(msg.sender == owner_ || msg.sender == _operatorWalletOf(agentId), "not owner or operator");
        require(to != address(0), "to=0");
        AgentAccount storage a = agentAccounts[agentId];
        require(!a.defaulted, "agent defaulted");
        require(!a.activeLoan, "loan already open");
        require(a.sponsorList.length > 0, "no sponsor");
        require(amount >= minLoan && amount <= maxLoan, "loan size");
        require(termDays >= MIN_TERM_DAYS && termDays <= MAX_TERM_DAYS, "term");
        require(amount <= available(agentId), "over line");

        uint64 dueAt = uint64(block.timestamp + termDays * 1 days);
        loanId = nextLoanId++;
        Loan storage loan = loanRecords[loanId];
        loan.agentId = agentId;
        loan.principal = amount;
        loan.dueAt = dueAt;
        loan.defaultableAt = dueAt + GRACE_PERIOD;
        loan.status = LoanStatus.Open;
        loan.fee = _distributeLoan(a, loan, amount, termDays);

        a.principalOut += amount;
        a.activeLoan = true;

        asset.safeTransfer(to, amount);
        emit Borrowed(loanId, agentId, amount, loan.fee, dueAt);
    }

    /// @notice Anyone may repay on an agent's behalf; the record credits the agent.
    function repay(uint256 loanId) external nonReentrant {
        Loan storage loan = loanRecords[loanId];
        require(loan.status == LoanStatus.Open, "not open");

        uint256 principal = loan.principal;
        uint256 fee = loan.fee;
        asset.safeTransferFrom(msg.sender, address(this), principal + fee);

        AgentAccount storage a = agentAccounts[loan.agentId];
        a.principalOut -= principal;
        a.activeLoan = false;
        a.loansRepaid += 1;
        a.volumeRepaid += principal;

        uint256 totalLenderCut;
        uint256 totalSponsorCut;
        uint256 totalReserveCut;
        uint256 n = loan.shares.length;
        for (uint256 i = 0; i < n; i++) {
            SponsorShare storage sh = loan.shares[i];
            feeLocked[sh.sponsor] -= sh.fee;

            uint256 lenderCut = (sh.fee * LENDER_FEE_BPS) / BPS_DENOM;
            uint256 sponsorCut = (sh.fee * SPONSOR_FEE_BPS) / BPS_DENOM;
            uint256 reserveCut = sh.fee - lenderCut - sponsorCut; // remainder absorbs rounding dust

            totalAssets += lenderCut; // same ordering as a single-sponsor repay: this sponsor's
            // cut mints at the price AFTER its own lender cut landed, not before.
            if (sponsorCut > 0) _mintShares(sh.sponsor, sponsorCut);

            totalLenderCut += lenderCut;
            totalSponsorCut += sponsorCut;
            totalReserveCut += reserveCut;
        }
        if (totalReserveCut > 0) asset.safeTransfer(reserveAddress, totalReserveCut);

        loan.status = LoanStatus.Repaid;
        emit Repaid(loanId, loan.agentId, totalLenderCut, totalSponsorCut, totalReserveCut);
    }

    /// @notice Permissionless by design — matches Priors: anyone may call this
    ///         once the grace period has passed, same as an off-chain keeper would.
    function markDefault(uint256 loanId) external nonReentrant {
        Loan storage loan = loanRecords[loanId];
        require(loan.status == LoanStatus.Open, "not open");
        require(block.timestamp > loan.defaultableAt, "not yet defaultable");

        AgentAccount storage a = agentAccounts[loan.agentId];

        uint256 n = loan.shares.length;
        for (uint256 i = 0; i < n; i++) {
            SponsorShare storage sh = loan.shares[i];
            uint256 loss = sh.principal + sh.fee;
            feeLocked[sh.sponsor] -= sh.fee;
            if (loss == 0 || totalAssets == 0) continue;

            uint256 toBurn = (loss * totalShares + totalAssets - 1) / totalAssets; // ceil, favours the pool
            uint256 sponsorShares = shares[sh.sponsor];
            uint256 writeOff = loss;
            if (toBurn > sponsorShares) {
                // This sponsor's live stake no longer covers its own share of
                // this loan's loss. Every vouch()/borrow() only checks
                // freeCapacity at that moment, so this should be unreachable
                // in practice — kept as a hard backstop rather than an
                // assumption, same reasoning as the single-sponsor version.
                toBurn = sponsorShares;
                uint256 recovered = totalShares > 0 ? (toBurn * totalAssets) / totalShares : 0; // floor, pre-burn price
                totalBadDebt += loss - recovered;
                writeOff = recovered;
                emit BadDebt(loanId, sh.sponsor, loss - recovered);
            }
            shares[sh.sponsor] -= toBurn;
            totalShares -= toBurn;
            totalAssets -= writeOff;
            emit SponsorBurned(loanId, sh.sponsor, toBurn, writeOff);
        }

        // Release every one of the agent's sponsors' remaining committed
        // capacity — used by this loan or not, this loan or any earlier
        // one — back to their own free capacity. The agent can never
        // borrow again after this, so nothing should stay locked against it.
        uint256 m = a.sponsorList.length;
        for (uint256 i = 0; i < m; i++) {
            SponsorStake storage stake = a.sponsorStakes[a.sponsorList[i]];
            if (stake.amount > 0) {
                delegatedOut[a.sponsorList[i]] -= stake.amount;
                stake.amount = 0;
            }
        }

        a.principalOut -= loan.principal;
        a.activeLoan = false;
        a.defaulted = true;
        a.delegatedIn = 0;

        address owner_ = identity.ownerOf(loan.agentId);
        ownerDefaults[owner_] += 1;

        loan.status = LoanStatus.Defaulted;
        emit Defaulted(loanId, loan.agentId, loan.principal + loan.fee);
    }
}
