// ====== CONFIG ======
window.APP_CONFIG = {
  CHAIN_ID_DEC: 56,
  CHAIN_ID_HEX: "0x38",
  CHAIN_NAME: "BSC Mainnet",
  RPC_URL: "https://bsc-dataseed.binance.org/",
  BLOCK_EXPLORER: "https://bscscan.com",

  // Addresses (ที่คุณให้มา)
  THBC_TOKEN: "0xe8d4687b77B5611eF1828FDa7428034FA12a1Beb",
  PHL_TOKEN:  "0xffeb0234a85a46F8Fdf6b8dEEFd2b4C7cB503df5",
  STAKING_CONTRACT: "0x15444214d8224874d5ED341a12D596073c32F0ed",

  // default
  DEFAULT_POOL_ID: 1,
  DEFAULT_PACKAGE_ID: 1,

  // Minimal ERC20 ABI
  ERC20_ABI: [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner,address spender) view returns (uint256)",
    "function approve(address spender,uint256 amount) returns (bool)"
  ],

  // THBC_MultiPool_AutoStake ABI (minimal used)
  STAKING_ABI: [
    "function owner() view returns (address)",
    "function thbc() view returns (address)",
    "function poolCount() view returns (uint256)",
    "function getPool(uint256 poolId) view returns (address outToken,uint256 apyBP,uint256 lockSec,bool enabled,uint256 packageCount_)",
    "function getPackage(uint256 poolId,uint256 packageId) view returns (uint256 thbcIn,uint256 principalOut,bool active)",
    "function buyPackage(uint256 poolId,uint256 packageId)",
    "function getStakeCount(uint256 poolId,address user) view returns (uint256)",
    "function getStake(uint256 poolId,address user,uint256 index) view returns (uint256 principal,uint256 reward,uint256 startTime,uint256 lockSec,bool claimed)",
    "function canClaim(uint256 poolId,address user,uint256 index) view returns (bool)",
    "function claim(uint256 poolId,uint256 index)"
  ]
};
