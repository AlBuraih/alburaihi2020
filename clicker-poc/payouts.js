const { ethers } = require('ethers');

function createProvider(rpcUrl){
  if(!rpcUrl) throw new Error('RPC_URL not provided');
  return new ethers.JsonRpcProvider(rpcUrl);
}

function createWallet(privateKey, provider){
  if(!privateKey) throw new Error('PRIVATE_KEY not provided');
  return new ethers.Wallet(privateKey, provider);
}

async function sendERC20(provider, wallet, tokenAddress, to, amountUnits){
  const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
  ];
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  // estimate gas
  let txResponse;
  try{
    txResponse = await token.transfer(to, amountUnits);
  }catch(e){
    // some nodes require gasLimit override; try with estimateGas
    const unsigned = await token.populateTransaction.transfer(to, amountUnits);
    const gasLimit = await provider.estimateGas(unsigned);
    txResponse = await wallet.sendTransaction({ to: tokenAddress, data: unsigned.data, gasLimit });
  }
  const receipt = await txResponse.wait(1);
  return { txHash: txResponse.hash, receipt };
}

module.exports = { createProvider, createWallet, sendERC20 };
