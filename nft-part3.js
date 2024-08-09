console.clear();
require("dotenv").config();

const {
	AccountId,
	PrivateKey,
	Client,
	TokenCreateTransaction,
	TokenInfoQuery,
	TokenType,
	CustomRoyaltyFee,
	CustomFixedFee,
	Hbar,
	HbarUnit,
	TokenSupplyType,
	TokenMintTransaction,
	TokenBurnTransaction,
	TransferTransaction,
	AccountBalanceQuery,
	AccountUpdateTransaction,
	TokenAssociateTransaction,
	TokenUpdateTransaction,
	TokenGrantKycTransaction,
	TokenRevokeKycTransaction,
	ScheduleCreateTransaction,
	ScheduleSignTransaction,
	ScheduleInfoQuery,
	TokenPauseTransaction,
	TokenUnpauseTransaction,
	TokenWipeTransaction,
	TokenFreezeTransaction,
	TokenUnfreezeTransaction,
	TokenDeleteTransaction,
	AccountCreateTransaction,
} = require("@hashgraph/sdk");

// CONFIGURE ACCOUNTS AND CLIENT, AND GENERATE  accounts and client, and generate needed keys
const operatorId = AccountId.fromString(process.env.OPERATOR_ID);
const operatorKey = PrivateKey.fromStringECDSA(process.env.OPERATOR_KEY_HEX);
const network = process.env.NETWORK;

const client = Client.forNetwork(network).setOperator(operatorId, operatorKey);
client.setDefaultMaxTransactionFee(new Hbar(50));
client.setDefaultMaxQueryPayment(new Hbar(1));

async function main() {
	// CREATE NEW HEDERA ACCOUNTS TO REPRESENT OTHER USERS
	const initBalance = new Hbar(1);

	const treasuryKey = PrivateKey.generateECDSA();
	const [treasurySt, treasuryId] = await accountCreateFcn(treasuryKey, initBalance, client);
	console.log(`- Treasury's account: https://hashscan.io/testnet/account/${treasuryId}`);
	const aliceKey = PrivateKey.generateECDSA();
	const [aliceSt, aliceId] = await accountCreateFcn(aliceKey, initBalance, client);
	console.log(`- Alice's account: https://hashscan.io/testnet/account/${aliceId}`);
	const bobKey = PrivateKey.generateECDSA();
	const [bobSt, bobId] = await accountCreateFcn(bobKey, initBalance, client);
	console.log(`- Bob's account: https://hashscan.io/testnet/account/${bobId}`);

	// GENERATE KEYS TO MANAGE FUNCTIONAL ASPECTS OF THE TOKEN
	const supplyKey = PrivateKey.generateECDSA();
	const adminKey = PrivateKey.generateECDSA();
	const pauseKey = PrivateKey.generateECDSA();
	const freezeKey = PrivateKey.generateECDSA();
	const wipeKey = PrivateKey.generateECDSA();
	const kycKey = PrivateKey.generate();
	const newKycKey = PrivateKey.generate();

	// DEFINE CUSTOM FEE SCHEDULE
	let nftCustomFee = new CustomRoyaltyFee()
		.setNumerator(1)
		.setDenominator(10)
		.setFeeCollectorAccountId(treasuryId)
		.setFallbackFee(new CustomFixedFee().setHbarAmount(new Hbar(1, HbarUnit.Tinybar))); // 1 HBAR = 100,000,000 Tinybar

	// IPFS CONTENT IDENTIFIERS FOR WHICH WE WILL CREATE NFTs - SEE uploadJsonToIpfs.js
	let CIDs = [
		Buffer.from("ipfs://bafkreibr7cyxmy4iyckmlyzige4ywccyygomwrcn4ldcldacw3nxe3ikgq"),
		Buffer.from("ipfs://bafkreig73xgqp7wy7qvjwz33rp3nkxaxqlsb7v3id24poe2dath7pj5dhe"),
		Buffer.from("ipfs://bafkreigltq4oaoifxll3o2cc3e3q3ofqzu6puennmambpulxexo5sryc6e"),
		Buffer.from("ipfs://bafkreiaoswszev3uoukkepctzpnzw56ey6w3xscokvsvmfrqdzmyhas6fu"),
		Buffer.from("ipfs://bafkreih6cajqynaqwbrmiabk2jxpy56rpf25zvg5lbien73p5ysnpehyjm"),
	];

	// CREATE NFT WITH CUSTOM FEE
	let nftCreateTx = await new TokenCreateTransaction()
		.setTokenName("Fall Collection")
		.setTokenSymbol("LEAF")
		.setTokenType(TokenType.NonFungibleUnique)
		.setDecimals(0)
		.setInitialSupply(0)
		.setTreasuryAccountId(treasuryId)
		.setSupplyType(TokenSupplyType.Finite)
		.setMaxSupply(CIDs.length)
		.setCustomFees([nftCustomFee])
		.setAdminKey(adminKey.publicKey)
		.setSupplyKey(supplyKey.publicKey)
		.setKycKey(kycKey.publicKey)
		.setPauseKey(pauseKey.publicKey)
		.setFreezeKey(freezeKey.publicKey)
		.setWipeKey(wipeKey.publicKey)
		.freezeWith(client)
		.sign(treasuryKey);

	let nftCreateTxSign = await nftCreateTx.sign(adminKey);
	let nftCreateSubmit = await nftCreateTxSign.execute(client);
	let nftCreateRx = await nftCreateSubmit.getReceipt(client);
	let tokenId = nftCreateRx.tokenId;
	console.log(`\n- Created NFT with Token ID: ${tokenId}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${nftCreateSubmit.transactionId}`);

	// TOKEN QUERY TO CHECK THAT THE CUSTOM FEE SCHEDULE IS ASSOCIATED WITH NFT
	var tokenInfo = await tQueryFcn();
	console.log(` `);
	console.table(tokenInfo.customFees[0]);

	// MINT NEW BATCH OF NFTs - CAN MINT UP TO 10 NFT SERIALS IN A SINGLE TRANSACTION
	let [nftMintRx, mintTxId] = await tokenMinterFcn(CIDs);
	console.log(`\n- Mint ${CIDs.length} serials for NFT collection ${tokenId}: ${nftMintRx.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${mintTxId}`);

	// BURN THE LAST NFT IN THE COLLECTION
	let tokenBurnTx = await new TokenBurnTransaction().setTokenId(tokenId).setSerials([CIDs.length]).freezeWith(client).sign(supplyKey);
	let tokenBurnSubmit = await tokenBurnTx.execute(client);
	let tokenBurnRx = await tokenBurnSubmit.getReceipt(client);
	console.log(`\n- Burn NFT with serial ${CIDs.length}: ${tokenBurnRx.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${tokenBurnSubmit.transactionId}`);

	var tokenInfo = await tQueryFcn();
	console.log(`- Current NFT supply: ${tokenInfo.totalSupply}`);

	// MANUAL ASSOCIATION FOR ALICE'S ACCOUNT
	let associateAliceTx = await new TokenAssociateTransaction().setAccountId(aliceId).setTokenIds([tokenId]).freezeWith(client).sign(aliceKey);
	let associateAliceTxSubmit = await associateAliceTx.execute(client);
	let associateAliceRx = await associateAliceTxSubmit.getReceipt(client);
	console.log(`\n- Alice NFT manual association: ${associateAliceRx.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${associateAliceTxSubmit.transactionId}`);

	// MANUAL ASSOCIATION FOR BOB'S ACCOUNT
	let associateBobTx = await new TokenAssociateTransaction().setAccountId(bobId).setTokenIds([tokenId]).freezeWith(client).sign(bobKey);
	let associateBobTxSubmit = await associateBobTx.execute(client);
	let associateBobRx = await associateBobTxSubmit.getReceipt(client);
	console.log(`\n- Bob NFT manual association: ${associateBobRx.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${associateBobTxSubmit.transactionId}`);

	// PART 2.1 STARTS ============================================================
	console.log(`\nPART 2.1 STARTS ============================================================`);
	// ENABLE TOKEN KYC FOR ALICE AND BOB
	let [aliceKycRx, aliceKycTxId] = await kycEnableFcn(aliceId);
	let [bobKyc, bobKycTxId] = await kycEnableFcn(bobId);
	console.log(`\n- Enabling token KYC for Alice's account: ${aliceKycRx.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${aliceKycTxId}`);
	console.log(`\n- Enabling token KYC for Bob's account: ${bobKyc.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${bobKycTxId}`);
	67898;

	// DISABLE TOKEN KYC FOR ALICE
	let kycDisableTx = await new TokenRevokeKycTransaction().setAccountId(aliceId).setTokenId(tokenId).freezeWith(client).sign(kycKey);
	// let kycDisableSubmitTx = await kycDisableTx.execute(client);
	// let kycDisableRx = await kycDisableSubmitTx.getReceipt(client);
	// console.log(`\n- Disabling token KYC for Alice's account: ${kycDisableRx.status}`);
	// console.log(`- See: https://hashscan.io/${network}/transaction/${kycDisableSubmitTx.transactionId}`);

	// QUERY TO CHECK INTIAL KYC KEY
	var tokenInfo = await tQueryFcn();
	console.log(`\n- KYC key for the NFT is: \n${tokenInfo.kycKey.toString()}`);

	// UPDATE TOKEN PROPERTIES: NEW KYC KEY
	let tokenUpdateTx = await new TokenUpdateTransaction().setTokenId(tokenId).setKycKey(newKycKey.publicKey).freezeWith(client).sign(adminKey);
	let tokenUpdateSubmitTx = await tokenUpdateTx.execute(client);
	let tokenUpdateRx = await tokenUpdateSubmitTx.getReceipt(client);
	console.log(`\n- Token update transaction (new KYC key): ${tokenUpdateRx.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${tokenUpdateSubmitTx.transactionId}`);

	// QUERY TO CHECK CHANGE IN KYC KEY
	var tokenInfo = await tQueryFcn();
	console.log(`\n- KYC key for the NFT is: \n${tokenInfo.kycKey.toString()}`);

	// PART 2.1 ENDS ============================================================
	console.log(`\nPART 2.1 ENDS ============================================================`);

	// BALANCE CHECK 1
	oB = await bCheckerFcn(treasuryId);
	aB = await bCheckerFcn(aliceId);
	bB = await bCheckerFcn(bobId);
	console.log(`\n- Treasury balance: ${oB[0]} NFTs of ID: ${tokenId} and ${oB[1]}`);
	console.log(`- Alice balance: ${aB[0]} NFTs of ID: ${tokenId} and ${aB[1]}`);
	console.log(`- Bob balance: ${bB[0]} NFTs of ID: ${tokenId} and ${bB[1]}`);

	// 1st TRANSFER NFT Treasury -> Alice
	let tokenTransferTx = await new TransferTransaction().addNftTransfer(tokenId, 2, treasuryId, aliceId).freezeWith(client).sign(treasuryKey);
	let tokenTransferSubmit = await tokenTransferTx.execute(client);
	let tokenTransferRx = await tokenTransferSubmit.getReceipt(client);
	console.log(`\n- NFT transfer Treasury -> Alice status: ${tokenTransferRx.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${tokenTransferSubmit.transactionId}`);

	// BALANCE CHECK 2
	oB = await bCheckerFcn(treasuryId);
	aB = await bCheckerFcn(aliceId);
	bB = await bCheckerFcn(bobId);
	console.log(`\n- Treasury balance: ${oB[0]} NFTs of ID:${tokenId} and ${oB[1]}`);
	console.log(`- Alice balance: ${aB[0]} NFTs of ID:${tokenId} and ${aB[1]}`);
	console.log(`- Bob balance: ${bB[0]} NFTs of ID:${tokenId} and ${bB[1]}`);

	// 2nd NFT TRANSFER NFT Alice - >Bob
	let nftPrice = new Hbar(10000000, HbarUnit.Tinybar); // 1 HBAR = 10,000,000 Tinybar

	let tokenTransferTx2 = await new TransferTransaction()
		.addNftTransfer(tokenId, 2, aliceId, bobId)
		.addHbarTransfer(aliceId, nftPrice)
		.addHbarTransfer(bobId, nftPrice.negated())
		.freezeWith(client)
		.sign(aliceKey);
	let tokenTransferTx2Sign = await tokenTransferTx2.sign(bobKey);
	let tokenTransferSubmit2 = await tokenTransferTx2Sign.execute(client);
	let tokenTransferRx2 = await tokenTransferSubmit2.getReceipt(client);
	console.log(`\n- NFT transfer Alice -> Bob status: ${tokenTransferRx2.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${tokenTransferSubmit2.transactionId}`);

	// BALANCE CHECK 3
	oB = await bCheckerFcn(treasuryId);
	aB = await bCheckerFcn(aliceId);
	bB = await bCheckerFcn(bobId);
	console.log(`\n- Treasury balance: ${oB[0]} NFTs of ID:${tokenId} and ${oB[1]}`);
	console.log(`- Alice balance: ${aB[0]} NFTs of ID:${tokenId} and ${aB[1]}`);
	console.log(`- Bob balance: ${bB[0]} NFTs of ID:${tokenId} and ${bB[1]}`);

	// PART 2.2 STARTS ============================================================
	console.log(`\nPART 2.2 STARTS ============================================================`);

	// CREATE THE NFT TRANSFER FROM BOB -> ALICE TO BE SCHEDULED
	// REQUIRES ALICE'S AND BOB'S SIGNATURES
	let txToSchedule = new TransferTransaction()
		.addNftTransfer(tokenId, 2, bobId, aliceId)
		.addHbarTransfer(aliceId, nftPrice.negated())
		.addHbarTransfer(bobId, nftPrice);

	// SCHEDULE THE NFT TRANSFER TRANSACTION CREATED IN THE LAST STEP
	let scheduleTx = await new ScheduleCreateTransaction().setScheduledTransaction(txToSchedule).execute(client);
	let scheduleRx = await scheduleTx.getReceipt(client);
	let scheduleId = scheduleRx.scheduleId;
	let scheduledTxId = scheduleRx.scheduledTransactionId;
	console.log(`\n- The schedule ID is: ${scheduleId}`);
	console.log(`- The scheduled transaction ID is: ${scheduledTxId}`);

	// SUBMIT ALICE'S SIGNATURE FOR THE TRANSFER TRANSACTION
	let aliceSignTx = await new ScheduleSignTransaction().setScheduleId(scheduleId).freezeWith(client).sign(aliceKey);
	let aliceSignSubmit = await aliceSignTx.execute(client);
	let aliceSignRx = await aliceSignSubmit.getReceipt(client);
	console.log(`\n- Status of Alice's signature submission: ${aliceSignRx.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${aliceSignSubmit.transactionId}`);

	// QUERY TO CONFIRM IF THE SCHEDULE WAS TRIGGERED (SIGNATURES HAVE BEEN ADDED)
	scheduleQuery = await new ScheduleInfoQuery().setScheduleId(scheduleId).execute(client);
	console.log(`\n- Schedule triggered (all required signatures received): ${scheduleQuery.executed !== null}`);

	// SUBMIT BOB'S SIGNATURE FOR THE TRANSFER TRANSACTION
	let bobSignTx = await new ScheduleSignTransaction().setScheduleId(scheduleId).freezeWith(client).sign(bobKey);
	let bobSignSubmit = await bobSignTx.execute(client);
	let bobSignRx = await bobSignSubmit.getReceipt(client);
	console.log(`\n- Status of Bob's signature submission: ${bobSignRx.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${bobSignSubmit.transactionId}`);

	// QUERY TO CONFIRM IF THE SCHEDULE WAS TRIGGERED (SIGNATURES HAVE BEEN ADDED)
	scheduleQuery = await new ScheduleInfoQuery().setScheduleId(scheduleId).execute(client);
	console.log(`\n- Schedule triggered (all required signatures received): ${scheduleQuery.executed !== null}`);

	// VERIFY THAT THE SCHEDULED TRANSACTION (TOKEN TRANSFER) EXECUTED
	oB = await bCheckerFcn(treasuryId);
	aB = await bCheckerFcn(aliceId);
	bB = await bCheckerFcn(bobId);
	console.log(`\n- Treasury balance: ${oB[0]} NFTs of ID: ${tokenId} and ${oB[1]}`);
	console.log(`- Alice balance: ${aB[0]} NFTs of ID: ${tokenId} and ${aB[1]}`);
	console.log(`- Bob balance: ${bB[0]} NFTs of ID: ${tokenId} and ${bB[1]}`);

	// PART 3 ============================================================
	console.log(`\nPART 3 STARTS ============================================================`);

	// PAUSE ALL TOKEN OEPRATIONS
	let tokenPauseTx = await new TokenPauseTransaction().setTokenId(tokenId).freezeWith(client).sign(pauseKey);
	let tokenPauseSubmitTx = await tokenPauseTx.execute(client);
	let tokenPauseRx = await tokenPauseSubmitTx.getReceipt(client);
	console.log(`\n- Token pause: ${tokenPauseRx.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${tokenPauseSubmitTx.transactionId}`);

	// TEST THE TOKEN PAUSE BY TRYING AN NFT TRANSFER (TREASURY -> ALICE)
	let tokenTransferTx3 = await new TransferTransaction().addNftTransfer(tokenId, 3, treasuryId, aliceId).freezeWith(client).sign(treasuryKey);
	let tokenTransferSubmit3 = await tokenTransferTx3.execute(client);
	try {
		let tokenTransferRx3 = await tokenTransferSubmit3.getReceipt(client);
		console.log(`\n- NFT transfer Treasury -> Alice status: ${tokenTransferRx3.status}`);
	} catch {
		// TOKEN QUERY TO CHECK PAUSE
		var tokenInfo = await tQueryFcn();
		console.log(`\n- NFT transfer unsuccessful: Token ${tokenId} is paused (${tokenInfo.pauseStatus})`);
		console.log(`- See: https://hashscan.io/${network}/transaction/${tokenTransferSubmit3.transactionId}`);
	}

	// UNPAUSE ALL TOKEN OEPRATIONS
	let tokenUnpauseTx = await new TokenUnpauseTransaction().setTokenId(tokenId).freezeWith(client).sign(pauseKey);
	let tokenUnpauseSubmitTx = await tokenUnpauseTx.execute(client);
	let tokenUnpauseRx = await tokenUnpauseSubmitTx.getReceipt(client);
	console.log(`\n- Token unpause: ${tokenUnpauseRx.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${tokenUnpauseSubmitTx.transactionId}`);

	// FREEZE ALICE'S ACCOUNT FOR THIS TOKEN
	let tokenFreezeTx = await new TokenFreezeTransaction().setTokenId(tokenId).setAccountId(aliceId).freezeWith(client).sign(freezeKey);
	let tokenFreezeSubmitTx = await tokenFreezeTx.execute(client);
	let tokenFreezeRx = await tokenFreezeSubmitTx.getReceipt(client);
	console.log(`\n- Freeze Alice's account for token ${tokenId}: ${tokenFreezeRx.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${tokenFreezeSubmitTx.transactionId}`);

	// TEST THE TOKEN FREEZE FOR THE ACCOUNT BY TRYING A TRANSFER (ALICE -> BOB)
	let tokenTransferTx4 = await new TransferTransaction()
		.addNftTransfer(tokenId, 2, aliceId, bobId)
		.addHbarTransfer(aliceId, nftPrice)
		.addHbarTransfer(bobId, nftPrice.negated())
		.freezeWith(client)
		.sign(aliceKey);
	let tokenTransferTx4Sign = await tokenTransferTx4.sign(bobKey);
	let tokenTransferSubmit4 = await tokenTransferTx4Sign.execute(client);
	try {
		let tokenTransferRx4 = await tokenTransferSubmit4.getReceipt(client);
		console.log(`\n- NFT transfer Alice -> Bob status: ${tokenTransferRx4.status}`);
	} catch {
		console.log(`\n- NFT transfer Alice -> Bob unsuccessful: Alice's account is frozen for this token`);
		console.log(`- See: https://hashscan.io/${network}/transaction/${tokenTransferSubmit4.transactionId}`);
	}
	// UNFREEZE ALICE'S ACCOUNT FOR THIS TOKEN
	let tokenUnfreezeTx = await new TokenUnfreezeTransaction().setTokenId(tokenId).setAccountId(aliceId).freezeWith(client).sign(freezeKey);
	let tokenUnfreezeSubmitTx = await tokenUnfreezeTx.execute(client);
	let tokenUnfreezeRx = await tokenUnfreezeSubmitTx.getReceipt(client);
	console.log(`\n- Unfreeze Alice's account for token ${tokenId}: ${tokenUnfreezeRx.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${tokenUnfreezeSubmitTx.transactionId}`);

	// WIPE THE TOKEN FROM ALICE'S ACCOUNT
	let tokenWipeTx = await new TokenWipeTransaction().setAccountId(aliceId).setTokenId(tokenId).setSerials([2]).freezeWith(client).sign(wipeKey);
	let tokenWipeSubmitTx = await tokenWipeTx.execute(client);
	let tokenWipeRx = await tokenWipeSubmitTx.getReceipt(client);
	console.log(`\n- Wipe token ${tokenId} from Alice's account: ${tokenWipeRx.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${tokenWipeSubmitTx.transactionId}`);

	// CHECK ALICE'S BALANCE
	aB = await bCheckerFcn(aliceId);
	console.log(`\n- Alice balance: ${aB[0]} NFTs of ID:${tokenId} and ${aB[1]}`);

	// TOKEN QUERY TO CHECK TOTAL TOKEN SUPPLY
	var tokenInfo = await tQueryFcn();
	console.log(`- Current NFT supply: ${tokenInfo.totalSupply}`);

	// DELETE THE TOKEN
	let tokenDeleteTx = new TokenDeleteTransaction().setTokenId(tokenId).freezeWith(client);
	let tokenDeleteSign = await tokenDeleteTx.sign(adminKey);
	let tokenDeleteSubmitTx = await tokenDeleteSign.execute(client);
	let tokenDeleteRx = await tokenDeleteSubmitTx.getReceipt(client);
	console.log(`\n- Delete token ${tokenId}: ${tokenDeleteRx.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${tokenDeleteSubmitTx.transactionId}`);

	// TOKEN QUERY TO CHECK DELETION
	var tokenInfo = await tQueryFcn();
	console.log(`\n- Token ${tokenId} is deleted: ${tokenInfo.isDeleted}`);

	console.log(`\n- THE END ============================================================`);
	console.log(`\n- 👇 Go to:`);
	console.log(`- 🔗 www.hedera.com/discord\n`);

	client.close();

	// ACCOUNT CREATOR FUNCTION ==========================================
	async function accountCreateFcn(pvKey, iBal, client) {
		const response = await new AccountCreateTransaction()
			.setInitialBalance(iBal)
			.setKey(pvKey.publicKey)
			.setMaxAutomaticTokenAssociations(10)
			.execute(client);
		const receipt = await response.getReceipt(client);
		return [receipt.status, receipt.accountId];
	}

	// TOKEN MINTER FUNCTION ==========================================
	async function tokenMinterFcn(CIDs) {
		let mintTx = new TokenMintTransaction().setTokenId(tokenId).setMetadata(CIDs).freezeWith(client);
		let mintTxSign = await mintTx.sign(supplyKey);
		let mintTxSubmit = await mintTxSign.execute(client);
		let mintRx = await mintTxSubmit.getReceipt(client);
		return [mintRx, mintTxSubmit.transactionId];
	}

	// BALANCE CHECKER FUNCTION ==========================================
	async function bCheckerFcn(id) {
		balanceCheckTx = await new AccountBalanceQuery().setAccountId(id).execute(client);
		return [balanceCheckTx.tokens._map.get(tokenId.toString()), balanceCheckTx.hbars];
	}

	// KYC ENABLE FUNCTION ==========================================
	async function kycEnableFcn(id) {
		let kycEnableTx = await new TokenGrantKycTransaction().setAccountId(id).setTokenId(tokenId).freezeWith(client).sign(kycKey);
		let kycSubmitTx = await kycEnableTx.execute(client);
		let kycRx = await kycSubmitTx.getReceipt(client);
		return [kycRx, kycSubmitTx.transactionId];
	}

	// TOKEN QUERY FUNCTION ==========================================
	async function tQueryFcn() {
		var tokenInfo = await new TokenInfoQuery().setTokenId(tokenId).execute(client);
		return tokenInfo;
	}
}
main();
