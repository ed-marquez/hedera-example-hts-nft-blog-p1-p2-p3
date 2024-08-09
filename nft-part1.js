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
	TokenNftInfoQuery,
	NftId,
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
	var tokenInfo = await new TokenInfoQuery().setTokenId(tokenId).execute(client);
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

	var tokenInfo = await new TokenInfoQuery().setTokenId(tokenId).execute(client);
	console.log(`\n- Current NFT supply: ${tokenInfo.totalSupply}`);

	// AUTO-ASSOCIATION FOR ALICE'S ACCOUNT
	let associateTx = await new AccountUpdateTransaction().setAccountId(aliceId).setMaxAutomaticTokenAssociations(10).freezeWith(client).sign(aliceKey);
	let associateTxSubmit = await associateTx.execute(client);
	let associateRx = await associateTxSubmit.getReceipt(client);
	console.log(`\n- Alice NFT Auto-Association: ${associateRx.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${associateTxSubmit.transactionId}`);

	// MANUAL ASSOCIATION FOR BOB'S ACCOUNT
	let associateBobTx = await new TokenAssociateTransaction().setAccountId(bobId).setTokenIds([tokenId]).freezeWith(client).sign(bobKey);
	let associateBobTxSubmit = await associateBobTx.execute(client);
	let associateBobRx = await associateBobTxSubmit.getReceipt(client);
	console.log(`\n- Bob NFT Manual Association: ${associateBobRx.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${associateBobTxSubmit.transactionId}`);

	// BALANCE CHECK 1
	oB = await bCheckerFcn(treasuryId);
	aB = await bCheckerFcn(aliceId);
	bB = await bCheckerFcn(bobId);
	console.log(`\n- Treasury balance: ${oB[0]} NFTs of ID:${tokenId} and ${oB[1]}`);
	console.log(`- Alice balance: ${aB[0]} NFTs of ID:${tokenId} and ${aB[1]}`);
	console.log(`- Bob balance: ${bB[0]} NFTs of ID:${tokenId} and ${bB[1]}`);

	// 1st TRANSFER NFT Treasury->Alice
	let tokenTransferTx = await new TransferTransaction().addNftTransfer(tokenId, 2, treasuryId, aliceId).freezeWith(client).sign(treasuryKey);
	let tokenTransferSubmit = await tokenTransferTx.execute(client);
	let tokenTransferRx = await tokenTransferSubmit.getReceipt(client);
	console.log(`\n NFT transfer Treasury->Alice status: ${tokenTransferRx.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${tokenTransferSubmit.transactionId}`);

	// BALANCE CHECK 2
	oB = await bCheckerFcn(treasuryId);
	aB = await bCheckerFcn(aliceId);
	bB = await bCheckerFcn(bobId);
	console.log(`\n- Treasury balance: ${oB[0]} NFTs of ID:${tokenId} and ${oB[1]}`);
	console.log(`- Alice balance: ${aB[0]} NFTs of ID:${tokenId} and ${aB[1]}`);
	console.log(`- Bob balance: ${bB[0]} NFTs of ID:${tokenId} and ${bB[1]}`);

	// 2nd NFT TRANSFER NFT Alice->Bob
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
	console.log(`\n NFT transfer Alice->Bob status: ${tokenTransferRx2.status}`);
	console.log(`- See: https://hashscan.io/${network}/transaction/${tokenTransferSubmit2.transactionId}`);

	// BALANCE CHECK 3
	oB = await bCheckerFcn(treasuryId);
	aB = await bCheckerFcn(aliceId);
	bB = await bCheckerFcn(bobId);
	console.log(`\n- Treasury balance: ${oB[0]} NFTs of ID:${tokenId} and ${oB[1]}`);
	console.log(`- Alice balance: ${aB[0]} NFTs of ID:${tokenId} and ${aB[1]}`);
	console.log(`- Bob balance: ${bB[0]} NFTs of ID:${tokenId} and ${bB[1]}`);

	console.log(`\n- THE END ============================================================\n`);
	console.log(`- 👇 Go to:`);
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
}

main();
