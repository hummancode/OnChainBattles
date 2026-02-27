import { network } from "hardhat";

async function main() {
  console.log("Deploying Escrow to Fuji...");

  const connection = await network.connect("fuji");
  const ethers = connection.ethers;

  console.log("ethers loaded:", !!ethers);

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const escrow = await ethers.deployContract("Escrow");
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log("Escrow deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});