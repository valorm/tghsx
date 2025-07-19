
const { run, ethers } = require("hardhat");

// TGHSXToken: 0xc20FF6488d7D797b6397fae460d1c47941462cc1
// CollateralVault: 0xeA7b72F13b8e3B4c3dc482171A7AA0c1578eB997
const addresses = {
    TGHSXToken: "0xb04093d34F5feC6DE685B8684F3e2086dd866a50",
    CollateralVault: "0xF681Ba510d3C93A49a7AB2d02d9697BB2B0091FE",
};
// -------------------------------------------------

async function verify(address, args) {
    console.log(`\nVerifying contract at ${address}...`);
    try {
        await run("verify:verify", {
            address: address,
            constructorArguments: args,
        });
        console.log("✅ Successfully verified!");
    } catch (e) {
        if (e.message.toLowerCase().includes("already verified")) {
            console.log("✅ Already verified!");
        } else {
            console.error("❌ Verification failed:", e.message);
        }
    }
}

async function main() {
    console.log("🚀 Starting contract verification on Polygon Amoy...");
    
    // Define constructor arguments for each contract
    const constructorArgs = {
        TGHSXToken: [],
        CollateralVault: [addresses.TGHSXToken],
    };

    await verify(addresses.TGHSXToken, constructorArgs.TGHSXToken);
    await verify(addresses.CollateralVault, constructorArgs.CollateralVault);

    console.log("\n🎉 Verification process complete.");
    console.log("You can view your verified contracts on Polygonscan:");
    console.log(`- TGHSXToken: https://amoy.polygonscan.com/address/${addresses.TGHSXToken}#code`);
    console.log(`- CollateralVault: https://amoy.polygonscan.com/address/${addresses.CollateralVault}#code`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
