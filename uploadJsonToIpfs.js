const { PinataSDK } = require("pinata");
require("dotenv").config();

const pinata = new PinataSDK({
	pinataJwt: process.env.PINATA_JWT,
	pinataGateway: process.env.PINATA_GATEWAY,
});

async function uploadJsonToIpfsFcn() {
	console.log(`\n=======================================`);
	console.log(`- Uploading JSON Metadata...`);

	const names = ["LEAF1", "LEAF2", "LEAF3", "LEAF4", "LEAF5"];
	const imageCIDs = [
		"ipfs://Qmb3CMWJzxWZJ34TgJgjASvdTc4x6PEz6LGm2QTWPPpkw5",
		"ipfs://QmXbV2QztazJjAiZn1tv4oEBrSnRSRaXyDtnLLBp13ixNj",
		"ipfs://QmaRPNrGzbj7jpheFPujM72rr2upDS72Ca1gLFBmJKSPij",
		"ipfs://Qmb5yU3bxWT5QFYnQY32P1KouU52rwoTqNjVhFm16uPR3i",
		"ipfs://QmeZ86y884AfpswZW8J13BXt4K2N8LFPBLBBkfQnPNHBb9",
	]; // CID of the images - you must have uploaded the images to IPFS to get the CIDs

	for (let i = 0; i < names.length; i++) {
		const metadata = {
			name: names[i],
			creator: "Mother Nature & Hashgraph",
			description: "Autumn",
			image: imageCIDs[i],
			type: "image/jpg",
			format: "HIP412@2.0.0",
			properties: {
				city: "Boston",
				season: "Fall",
				decade: "20's",
				license: "MIT-0",
				collection: "Fall Collection",
				website: "www.hashgraph.com",
			},
		};

		const upload = await pinata.upload.json(metadata).addMetadata({
			name: `${names[i]}.json`,
		});

		console.log(`Uploaded metadata for ${names[i]}:`, upload);
	}
}
uploadJsonToIpfsFcn();
