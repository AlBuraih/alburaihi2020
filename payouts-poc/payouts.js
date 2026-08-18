const { ethers } = require('ethers');

function createProvider(rpcUrl) {
  return new ethers.JsonRpcProvider(rpcUrl);
}

function createWallet(privateKey, provider) {
  return new ethers.Wallet(privateKey, provider);
}

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

async function estimateNativeNetworkFee(provider, to, amountHuman) {
  const value = ethers.parseEther(amountHuman);
  const txReq = { to, value };
  const gasEstimate = await provider.estimateGas(txReq);
  const feeData = await provider.getFeeData();
  const gasPriceUsed = feeData.maxFeePerGas ?? (await provider.getGasPrice());
  const fee = gasEstimate * gasPriceUsed;
  return { gasEstimate: gasEstimate.toString(), networkFeeWei: fee.toString() };
}

async function estimateERC20NetworkFee(provider, tokenAddress, to, amountUnits, wallet) {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  const gasEstimate = await token.estimateGas.transfer(to, amountUnits);
  const feeData = await provider.getFeeData();
  const gasPriceUsed = feeData.maxFeePerGas ?? (await provider.getGasPrice());
  const fee = gasEstimate * gasPriceUsed;
  return { gasEstimate: gasEstimate.toString(), networkFeeWei: fee.toString() };
}

async function sendNative(provider, wallet, to, amountHuman, gasLimitOverride = null) {
  const value = ethers.parseEther(amountHuman);
  const txReq = { to, value };
  if (gasLimitOverride) txReq.gasLimit = gasLimitOverride;
  const tx = await wallet.sendTransaction(txReq);
  const receipt = await tx.wait(1);
  return { txHash: tx.hash, receipt };
}

async function sendERC20(provider, wallet, tokenAddress, to, amountUnits, gasLimitOverride = null) {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  const txResp = await token.transfer(to, amountUnits, gasLimitOverride ? { gasLimit: gasLimitOverride } : {});
  const receipt = await txResp.wait(1);
  return { txHash: txResp.hash, receipt };
}

module.exports = {
  createProvider,
  createWallet,
  estimateNativeNetworkFee,
  estimateERC20NetworkFee,
  sendNative,
  sendERC20
};
