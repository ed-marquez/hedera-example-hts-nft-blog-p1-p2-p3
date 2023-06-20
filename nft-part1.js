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
const operatorKey = PrivateKey.fromString(process.env.OPERATOR_PVKEY);
const network = process.env.NETWORK;

const client = Client.forNetwork(network).setOperator(operatorId, operatorKey);
client.setDefaultMaxTransactionFee(new Hbar(100));
client.setMaxQueryPayment(new Hbar(50));

async function main() {
	// CREATE NEW HEDERA ACCOUNTS TO REPRESENT OTHER USERS
	const initBalance = new Hbar(200);

	const treasuryKey = PrivateKey.generateED25519();
	const [treasurySt, treasuryId] = await accountCreateFcn(treasuryKey, initBalance, client);
	console.log(`- Treasury's account: https://hashscan.io/testnet/account/${treasuryId}`);
	const aliceKey = PrivateKey.generateED25519();
	const [aliceSt, aliceId] = await accountCreateFcn(aliceKey, initBalance, client);
	console.log(`- Alice's account: https://hashscan.io/testnet/account/${aliceId}`);
	const bobKey = PrivateKey.generateED25519();
	const [bobSt, bobId] = await accountCreateFcn(bobKey, initBalance, client);
	console.log(`- Bob's account: https://hashscan.io/testnet/account/${bobId}`);

	// GENERATE KEYS TO MANAGE FUNCTIONAL ASPECTS OF THE TOKEN
	const supplyKey = PrivateKey.generate();
	const adminKey = PrivateKey.generate();
	const pauseKey = PrivateKey.generate();
	const freezeKey = PrivateKey.generate();
	const wipeKey = PrivateKey.generate();

	// DEFINE CUSTOM FEE SCHEDULE
	let nftCustomFee = new CustomRoyaltyFee()
		.setNumerator(5)
		.setDenominator(10)
		.setFeeCollectorAccountId(treasuryId)
		.setFallbackFee(new CustomFixedFee().setHbarAmount(new Hbar(200)));

	// IPFS CONTENT IDENTIFIERS FOR WHICH WE WILL CREATE NFTs
	CID = [
		"QmNPCiNA3Dsu3K5FxDPMG5Q3fZRwVTg14EXA92uqEeSRXn",
		"QmZ4dgAgt8owvnULxnKxNe8YqpavtVCXmc1Lt2XajFpJs9",
		"QmPzY5GxevjyfMUF5vEAjtyRoigzWp47MiKAtLBduLMC1T",
		"Qmd3kGgSrAwwSrhesYcY7K54f3qD7MDo38r7Po2dChtQx5",
		"QmWgkKz3ozgqtnvbCLeh7EaR1H8u5Sshx3ZJzxkcrT3jbw",
	];

	// CREATE NFT WITH CUSTOM FEE
	let nftCreate = await new TokenCreateTransaction()
		.setTokenName("Fall Collection")
		.setTokenSymbol("LEAF")
		.setTokenType(TokenType.NonFungibleUnique)
		.setDecimals(0)
		.setInitialSupply(0)
		.setTreasuryAccountId(treasuryId)
		.setSupplyType(TokenSupplyType.Finite)
		.setMaxSupply(CID.length)
		.setCustomFees([nftCustomFee])
		.setAdminKey(adminKey.publicKey)
		.setSupplyKey(supplyKey.publicKey)
		.setPauseKey(pauseKey.publicKey)
		.setFreezeKey(freezeKey.publicKey)
		.setWipeKey(wipeKey.publicKey)
		.freezeWith(client)
		.sign(treasuryKey);

	let nftCreateTxSign = await nftCreate.sign(adminKey);
	let nftCreateSubmit = await nftCreateTxSign.execute(client);
	let nftCreateRx = await nftCreateSubmit.getReceipt(client);
	let tokenId = nftCreateRx.tokenId;
	console.log(`Created NFT with Token ID: ${tokenId} \n`);

	// TOKEN QUERY TO CHECK THAT THE CUSTOM FEE SCHEDULE IS ASSOCIATED WITH NFT
	var tokenInfo = await new TokenInfoQuery().setTokenId(tokenId).execute(client);
	console.table(tokenInfo.customFees[0]);

	// MINT NEW BATCH OF NFTs
	nftLeaf = [];
	for (var i = 0; i < CID.length; i++) {
		nftLeaf[i] = await tokenMinterFcn(CID[i]);
		console.log(`Created NFT ${tokenId} with serial: ${nftLeaf[i].serials[0].low}`);
	}

	// BURN THE LAST NFT IN THE COLLECTION
	let tokenBurnTx = await new TokenBurnTransaction().setTokenId(tokenId).setSerials([CID.length]).freezeWith(client).sign(supplyKey);
	let tokenBurnSubmit = await tokenBurnTx.execute(client);
	let tokenBurnRx = await tokenBurnSubmit.getReceipt(client);
	console.log(`\nBurn NFT with serial ${CID.length}: ${tokenBurnRx.status} \n`);

	var tokenInfo = await new TokenInfoQuery().setTokenId(tokenId).execute(client);
	console.log(`Current NFT supply: ${tokenInfo.totalSupply} \n`);

	// AUTO-ASSOCIATION FOR ALICE'S ACCOUNT
	let associateTx = await new AccountUpdateTransaction()
		.setAccountId(aliceId)
		.setMaxAutomaticTokenAssociations(100)
		.freezeWith(client)
		.sign(aliceKey);
	let associateTxSubmit = await associateTx.execute(client);
	let associateRx = await associateTxSubmit.getReceipt(client);
	console.log(`Alice NFT Auto-Association: ${associateRx.status} \n`);

	// MANUAL ASSOCIATION FOR BOB'S ACCOUNT
	let associateBobTx = await new TokenAssociateTransaction().setAccountId(bobId).setTokenIds([tokenId]).freezeWith(client).sign(bobKey);
	let associateBobTxSubmit = await associateBobTx.execute(client);
	let associateBobRx = await associateBobTxSubmit.getReceipt(client);
	console.log(`Bob NFT Manual Association: ${associateBobRx.status} \n`);

	// BALANCE CHECK 1
	oB = await bCheckerFcn(treasuryId);
	aB = await bCheckerFcn(aliceId);
	bB = await bCheckerFcn(bobId);
	console.log(`- Treasury balance: ${oB[0]} NFTs of ID:${tokenId} and ${oB[1]}`);
	console.log(`- Alice balance: ${aB[0]} NFTs of ID:${tokenId} and ${aB[1]}`);
	console.log(`- Bob balance: ${bB[0]} NFTs of ID:${tokenId} and ${bB[1]}`);

	// 1st TRANSFER NFT Treasury->Alice
	let tokenTransferTx = await new TransferTransaction().addNftTransfer(tokenId, 2, treasuryId, aliceId).freezeWith(client).sign(treasuryKey);
	let tokenTransferSubmit = await tokenTransferTx.execute(client);
	let tokenTransferRx = await tokenTransferSubmit.getReceipt(client);
	console.log(`\n NFT transfer Treasury->Alice status: ${tokenTransferRx.status} \n`);

	// BALANCE CHECK 2
	oB = await bCheckerFcn(treasuryId);
	aB = await bCheckerFcn(aliceId);
	bB = await bCheckerFcn(bobId);
	console.log(`- Treasury balance: ${oB[0]} NFTs of ID:${tokenId} and ${oB[1]}`);
	console.log(`- Alice balance: ${aB[0]} NFTs of ID:${tokenId} and ${aB[1]}`);
	console.log(`- Bob balance: ${bB[0]} NFTs of ID:${tokenId} and ${bB[1]}`);

	// 2nd NFT TRANSFER NFT Alice->Bob
	let tokenTransferTx2 = await new TransferTransaction()
		.addNftTransfer(tokenId, 2, aliceId, bobId)
		.addHbarTransfer(aliceId, 100)
		.addHbarTransfer(bobId, -100)
		.freezeWith(client)
		.sign(aliceKey);
	tokenTransferTx2Sign = await tokenTransferTx2.sign(bobKey);
	let tokenTransferSubmit2 = await tokenTransferTx2Sign.execute(client);
	let tokenTransferRx2 = await tokenTransferSubmit2.getReceipt(client);
	console.log(`\n NFT transfer Alice->Bob status: ${tokenTransferRx2.status} \n`);

	// BALANCE CHECK 3
	oB = await bCheckerFcn(treasuryId);
	aB = await bCheckerFcn(aliceId);
	bB = await bCheckerFcn(bobId);
	console.log(`- Treasury balance: ${oB[0]} NFTs of ID:${tokenId} and ${oB[1]}`);
	console.log(`- Alice balance: ${aB[0]} NFTs of ID:${tokenId} and ${aB[1]}`);
	console.log(`- Bob balance: ${bB[0]} NFTs of ID:${tokenId} and ${bB[1]}`);

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
	async function tokenMinterFcn(CID) {
		mintTx = await new TokenMintTransaction()
			.setTokenId(tokenId)
			.setMetadata([Buffer.from(CID)])
			.freezeWith(client);
		let mintTxSign = await mintTx.sign(supplyKey);
		let mintTxSubmit = await mintTxSign.execute(client);
		let mintRx = await mintTxSubmit.getReceipt(client);
		return mintRx;
	}

	// BALANCE CHECKER FUNCTION ==========================================
	async function bCheckerFcn(id) {
		balanceCheckTx = await new AccountBalanceQuery().setAccountId(id).execute(client);
		return [balanceCheckTx.tokens._map.get(tokenId.toString()), balanceCheckTx.hbars];
	}
}

main();
