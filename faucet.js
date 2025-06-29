require('dotenv').config();
const { ethers } = require('ethers');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const randomUseragent = require('random-useragent');
const fs = require('fs');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.cyan}[i] ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}[+] ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}[-] ${msg}${colors.reset}`),
};

const loadProxies = () => {
  try {
    const lines = fs.readFileSync('proxies.txt', 'utf8').split('\n').map(p => p.trim()).filter(p => p);
    if (lines.length === 0) log.info('Tidak ada proxy di file proxies.txt');
    return lines;
  } catch {
    log.info('File proxies.txt tidak ditemukan, semua wallet akan pakai koneksi langsung');
    return [];
  }
};

const loadPrivateKeys = () => {
  try {
    const lines = fs.readFileSync('.env', 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('PRIVATE_KEY_'))
      .map(line => line.split('=')[1].trim())
      .filter(Boolean);
    return lines;
  } catch {
    log.error('Gagal membaca private key dari .env');
    return [];
  }
};

const getRandomProxy = (proxies) => {
  return proxies[Math.floor(Math.random() * proxies.length)];
};

const claimFaucet = async (privateKey, proxy = null) => {
  try {
    const provider = new ethers.JsonRpcProvider('https://testnet.dplabs-internal.com');
    const wallet = new ethers.Wallet(privateKey, provider);

    log.info(`Wallet: ${wallet.address}`);
    if (proxy) log.info(`Proxy digunakan: ${proxy}`);

    const signature = await wallet.signMessage("pharos");

    const headers = {
      accept: 'application/json, text/plain, */*',
      'User-Agent': randomUseragent.getRandom(),
      authorization: 'Bearer null',
      Referer: 'https://testnet.pharosnetwork.xyz/'
    };

    const loginURL = `https://api.pharosnetwork.xyz/user/login?address=${wallet.address}&signature=${signature}&invite_code=kJugeMqQpxu8bu6s`;
    const loginResp = await axios.post(loginURL, {}, {
      headers,
      httpsAgent: proxy ? new HttpsProxyAgent(proxy) : null
    });

    const jwt = loginResp.data?.data?.jwt;
    if (!jwt) return log.error('Login gagal');

    headers.authorization = `Bearer ${jwt}`;

    const statusURL = `https://api.pharosnetwork.xyz/faucet/status?address=${wallet.address}`;
    const statusResp = await axios.get(statusURL, {
      headers,
      httpsAgent: proxy ? new HttpsProxyAgent(proxy) : null
    });

    if (!statusResp.data.data.is_able_to_faucet) {
      const nextTime = new Date(statusResp.data.data.avaliable_timestamp * 1000);
      return log.info(`Faucet belum tersedia. Coba lagi pada: ${nextTime.toLocaleString()}`);
    }

    const claimURL = `https://api.pharosnetwork.xyz/faucet/daily?address=${wallet.address}`;
    const claimResp = await axios.post(claimURL, {}, {
      headers,
      httpsAgent: proxy ? new HttpsProxyAgent(proxy) : null
    });

    if (claimResp.data.code === 0) {
      log.success(`Faucet berhasil diklaim untuk ${wallet.address}`);
    } else {
      log.error(`Gagal klaim faucet: ${claimResp.data.msg}`);
    }
  } catch (err) {
    log.error(`Error: ${err.message}`);
  }
};

const main = async () => {
  const privateKeys = loadPrivateKeys();
  if (!privateKeys.length) return log.error('Tidak ada private key di .env');

  const proxies = loadProxies();

  while (true) {
    log.info("\nMemulai loop klaim faucet...");
    for (const pk of privateKeys) {
      const proxy = proxies.length ? getRandomProxy(proxies) : null;
      await claimFaucet(pk, proxy);
    }
    log.info("Selesai satu siklus. Menunggu 3 jam sebelum ulangi...");
    await new Promise(resolve => setTimeout(resolve, 3 * 60 * 60 * 1000)); // 3 jam delay
  }
};

main();
