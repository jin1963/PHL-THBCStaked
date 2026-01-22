(() => {
  "use strict";

  const C = window.APP_CONFIG;

  // ---------- DOM helpers ----------
  const $ = (id) => document.getElementById(id);
  const setText = (id, text) => {
    const el = $(id);
    if (el) el.textContent = text;
  };
  const shortAddr = (a) => (a ? a.slice(0, 6) + "..." + a.slice(-4) : "-");

  // ---------- Time / format helpers ----------
  const fmtDate = (sec) => {
    try {
      if (!sec || Number(sec) <= 0) return "-";
      const d = new Date(Number(sec) * 1000);
      return d.toLocaleString();
    } catch {
      return "-";
    }
  };

  const nowSec = () => Math.floor(Date.now() / 1000);

  const secToDHMS = (sec) => {
    sec = Math.max(0, Number(sec || 0));
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);

    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const secToHumanDays = (sec) => {
    sec = Math.max(0, Number(sec || 0));
    const days = sec / 86400;
    // แสดงเป็น days แบบสากล เช่น 365 days
    if (!isFinite(days)) return "-";
    const whole = Math.round(days);
    // ถ้าใกล้จำนวนเต็ม แสดงเป็นจำนวนเต็ม
    if (Math.abs(days - whole) < 0.0001) return `${whole} days`;
    return `${days.toFixed(2)} days`;
  };

  const formatApy = (apyBP) => {
    const bp = Number(apyBP || 0);
    const pct = bp / 100; // 3000 -> 30%
    if (!isFinite(pct)) return `-`;
    return `${pct}% (BPS ${bp})`;
  };

  // ---------- State ----------
  let provider = null;
  let signer = null;
  let user = null;

  let staking = null;
  let thbc = null;
  let phl = null;

  let thbcDecimals = 18;
  let phlDecimals = 18;

  let countdownTimer = null;

  // ---------- Init UI ----------
  function fillStatic() {
    setText("contractText", C.STAKING_CONTRACT);
    setText("footContract", C.STAKING_CONTRACT);
    setText("thbcText", C.THBC_TOKEN);
    setText("phlText", C.PHL_TOKEN);

    const poolIdEl = $("poolId");
    const pkgIdEl = $("packageId");
    if (poolIdEl) poolIdEl.value = String(C.DEFAULT_POOL_ID);
    if (pkgIdEl) pkgIdEl.value = String(C.DEFAULT_PACKAGE_ID);
  }

  function setStatus(msg, ok = null) {
    const el = $("txStatus");
    if (!el) return;
    el.classList.remove("ok", "bad");
    if (ok === true) el.classList.add("ok");
    if (ok === false) el.classList.add("bad");
    el.textContent = msg;
  }

  // ---------- Detect table layout (รองรับทั้ง 8 และ 9 คอลัมน์) ----------
  function hasCountdownColumn() {
    // ถ้าคุณเพิ่ม <th>Countdown</th> จะเป็น 9 คอลัมน์
    const ths = document.querySelectorAll(".tbl thead th");
    return ths && ths.length >= 9;
  }

  function setEmptyStakeRow(tbody, text) {
    const col = hasCountdownColumn() ? 9 : 8;
    tbody.innerHTML = `<tr><td colspan="${col}" class="muted">${text}</td></tr>`;
  }

  // ---------- Countdown tick ----------
  function startCountdownTick() {
    if (countdownTimer) clearInterval(countdownTimer);

    const tick = () => {
      const now = nowSec();

      document.querySelectorAll("[data-unlock-ts]").forEach((el) => {
        const unlock = Number(el.getAttribute("data-unlock-ts") || 0);
        if (!unlock) {
          el.textContent = "-";
          return;
        }
        const left = unlock - now;
        if (left <= 0) el.textContent = "Ready ✅";
        else el.textContent = secToDHMS(left);
      });
    };

    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  // ---------- Network check ----------
  async function ensureBSC() {
    if (!provider) return false;

    const net = await provider.getNetwork().catch(() => null);
    const chainId = net?.chainId;

    setText("netText", chainId ? `${C.CHAIN_NAME} (chainId ${chainId})` : "-");

    if (chainId === C.CHAIN_ID_DEC) return true;

    // request switch (MetaMask / Bitget usually support)
    if (window.ethereum?.request) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: C.CHAIN_ID_HEX }],
        });
        const net2 = await provider.getNetwork();
        setText("netText", `${C.CHAIN_NAME} (chainId ${net2.chainId})`);
        return net2.chainId === C.CHAIN_ID_DEC;
      } catch (e) {
        // if chain not added
        if (e?.code === 4902) {
          try {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: C.CHAIN_ID_HEX,
                  chainName: C.CHAIN_NAME,
                  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
                  rpcUrls: [C.RPC_URL],
                  blockExplorerUrls: [C.BLOCK_EXPLORER],
                },
              ],
            });
            return true;
          } catch (e2) {
            setStatus("กรุณาเปลี่ยนเครือข่ายเป็น BSC Mainnet ในกระเป๋าก่อน", false);
            return false;
          }
        }
        setStatus("กรุณาเปลี่ยนเครือข่ายเป็น BSC Mainnet (chainId 56) ในกระเป๋าก่อน", false);
        return false;
      }
    }

    setStatus("ไม่พบ window.ethereum กรุณาเปิดผ่าน MetaMask/Bitget DApp Browser", false);
    return false;
  }

  // ---------- Connect ----------
  async function connect() {
    try {
      if (!window.ethereum) {
        setStatus("ไม่พบ Wallet Provider (window.ethereum) — เปิดผ่าน MetaMask/Bitget DApp Browser", false);
        return;
      }

      provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      await provider.send("eth_requestAccounts", []);
      signer = provider.getSigner();
      user = await signer.getAddress();

      setText("walletText", `${shortAddr(user)}  (${user})`);

      const ok = await ensureBSC();
      if (!ok) return;

      // contracts
      staking = new ethers.Contract(C.STAKING_CONTRACT, C.STAKING_ABI, signer);
      thbc = new ethers.Contract(C.THBC_TOKEN, C.ERC20_ABI, signer);
      phl = new ethers.Contract(C.PHL_TOKEN, C.ERC20_ABI, signer);

      // decimals
      thbcDecimals = await thbc.decimals().catch(() => 18);
      phlDecimals = await phl.decimals().catch(() => 18);

      setStatus("Connected ✅", true);

      await loadPool();
      await loadPackage();
      await refreshBalances();
      await loadStakes();

      // listeners
      if (window.ethereum?.on) {
        window.ethereum.on("accountsChanged", () => location.reload());
        window.ethereum.on("chainChanged", () => location.reload());
      }
    } catch (e) {
      setStatus(`Connect failed: ${e?.message || e}`, false);
    }
  }

  // ---------- Pool / Package ----------
  function getPoolId() {
    const v = Number($("poolId")?.value ?? C.DEFAULT_POOL_ID);
    return Number.isFinite(v) && v > 0 ? v : C.DEFAULT_POOL_ID;
  }
  function getPackageId() {
    const v = Number($("packageId")?.value ?? C.DEFAULT_PACKAGE_ID);
    return Number.isFinite(v) && v > 0 ? v : C.DEFAULT_PACKAGE_ID;
  }

  async function loadPool() {
    try {
      if (!staking) return;
      const poolId = getPoolId();
      const p = await staking.getPool(poolId);

      setText("poolOutToken", p.outToken);

      // แสดง APY/Lock แบบสากล
      setText("poolApy", formatApy(p.apyBP));
      const lockSecNum = Number(p.lockSec?.toString?.() ?? p.lockSec ?? 0);
      setText("poolLock", `${secToHumanDays(lockSecNum)} (${lockSecNum} sec)`);

      setText("poolEnabled", String(p.enabled));
    } catch (e) {
      setStatus(`Load pool failed: ${e?.message || e}`, false);
    }
  }

  async function loadPackage() {
    try {
      if (!staking) return;
      const poolId = getPoolId();
      const packageId = getPackageId();

      const pkg = await staking.getPackage(poolId, packageId);

      const thbcInHuman = ethers.utils.formatUnits(pkg.thbcIn, thbcDecimals);
      const outHuman = ethers.utils.formatUnits(pkg.principalOut, phlDecimals);

      setText("pkgThbcIn", `${thbcInHuman} THBC`);
      setText("pkgOut", `${outHuman} PHL`);
      setText("pkgActive", String(pkg.active));

      setStatus("Package loaded ✅", true);
    } catch (e) {
      setStatus(`Load package failed: ${e?.message || e}`, false);
    }
  }

  // ---------- Balances / Allowance ----------
  async function refreshBalances() {
    try {
      if (!user || !thbc || !phl) return;

      const [bThbc, bPhl, allowance] = await Promise.all([
        thbc.balanceOf(user),
        phl.balanceOf(user),
        thbc.allowance(user, C.STAKING_CONTRACT),
      ]);

      setText("balThbc", `${ethers.utils.formatUnits(bThbc, thbcDecimals)} THBC`);
      setText("balPhl", `${ethers.utils.formatUnits(bPhl, phlDecimals)} PHL`);
      setText("allowThbc", `${ethers.utils.formatUnits(allowance, thbcDecimals)} THBC`);
    } catch (e) {
      setStatus(`Refresh balances failed: ${e?.message || e}`, false);
    }
  }

  // ---------- Approve / Buy ----------
  async function approveTHBC() {
    try {
      if (!user || !thbc || !staking) return;

      const poolId = getPoolId();
      const packageId = getPackageId();
      const pkg = await staking.getPackage(poolId, packageId);

      setStatus("Waiting for approve...", null);
      const tx = await thbc.approve(C.STAKING_CONTRACT, pkg.thbcIn);
      setStatus(`Approve sent: ${tx.hash}\nWaiting confirm...`, null);
      await tx.wait();

      setStatus("Approve success ✅", true);
      await refreshBalances();
    } catch (e) {
      setStatus(`Approve failed: ${e?.message || e}`, false);
    }
  }

  async function buyPackage() {
    try {
      if (!user || !staking || !thbc) return;

      const poolId = getPoolId();
      const packageId = getPackageId();

      const [p, pkg, allowance] = await Promise.all([
        staking.getPool(poolId),
        staking.getPackage(poolId, packageId),
        thbc.allowance(user, C.STAKING_CONTRACT),
      ]);

      if (!p.enabled) {
        setStatus("Pool ยังไม่เปิดใช้งาน (enabled = false)", false);
        return;
      }
      if (!pkg.active) {
        setStatus("Package นี้ยังไม่ active", false);
        return;
      }
      if (allowance.lt(pkg.thbcIn)) {
        setStatus("Allowance ไม่พอ — กด Approve THBC ก่อน", false);
        return;
      }

      setStatus("Sending buyPackage... กรุณายืนยันในกระเป๋า", null);
      const tx = await staking.buyPackage(poolId, packageId);
      setStatus(`buyPackage sent: ${tx.hash}\nWaiting confirm...`, null);
      await tx.wait();

      setStatus("Buy & Auto-Stake success ✅", true);
      await refreshBalances();
      await loadStakes();
    } catch (e) {
      setStatus(`Buy failed: ${e?.message || e}`, false);
    }
  }

  // ---------- Stakes ----------
  async function loadStakes() {
    try {
      if (!user || !staking) return;

      const poolId = getPoolId();
      const countBN = await staking.getStakeCount(poolId, user);
      const count = Number(countBN.toString());
      setText("stakeCount", String(count));

      const tbody = $("stakeTbody");
      if (!tbody) return;

      if (count === 0) {
        setEmptyStakeRow(tbody, "ยังไม่มี stake");
        return;
      }

      const showCountdown = hasCountdownColumn();

      let rows = "";
      for (let i = 0; i < count; i++) {
        const st = await staking.getStake(poolId, user, i);
        const can = await staking.canClaim(poolId, user, i).catch(() => false);

        const principal = ethers.utils.formatUnits(st.principal, phlDecimals);
        const reward = ethers.utils.formatUnits(st.reward, phlDecimals);

        const start = Number(st.startTime.toString());
        const lockSec = Number(st.lockSec.toString());
        const unlock = start > 0 ? start + lockSec : 0;

        const claimed = Boolean(st.claimed);

        const canText = can ? "yes" : "no";
        const claimedText = claimed ? "yes" : "no";

        const countdownTd = showCountdown
          ? `<td class="mono" data-unlock-ts="${unlock}">-</td>`
          : ""; // ถ้า HTML ยังมี 8 คอลัมน์ จะไม่ใส่

        // ถ้าไม่มีคอลัมน์ countdown ให้ใส่ countdown ไปต่อท้าย Can Claim เพื่อไม่ให้ตารางเพี้ยน
        const canCellExtra = (!showCountdown && unlock)
          ? ` <span class="muted">(${unlock <= nowSec() ? "Ready ✅" : secToDHMS(unlock - nowSec())})</span>`
          : "";

        rows += `
          <tr>
            <td class="mono">${i}</td>
            <td class="mono">${principal}</td>
            <td class="mono">${reward}</td>
            <td>${fmtDate(start)}</td>
            <td>${fmtDate(unlock)}</td>
            ${countdownTd}
            <td class="${claimed ? "ok" : ""}">${claimedText}</td>
            <td class="${can ? "ok" : "muted"}">${canText}${canCellExtra}</td>
            <td>
              <button class="btn ${can && !claimed ? "primary" : ""}" data-claim="${i}" ${(!can || claimed) ? "disabled" : ""}>
                Claim
              </button>
            </td>
          </tr>
        `;
      }

      tbody.innerHTML = rows;

      // bind claim buttons
      [...tbody.querySelectorAll("button[data-claim]")].forEach((btn) => {
        btn.addEventListener("click", async () => {
          const idx = Number(btn.getAttribute("data-claim"));
          await claimStake(idx);
        });
      });

      // เริ่มนับถอยหลัง (เฉพาะเมื่อมีคอลัมน์ countdown)
      if (showCountdown) startCountdownTick();

    } catch (e) {
      setStatus(`Load stakes failed: ${e?.message || e}`, false);
    }
  }

  async function claimStake(index) {
    try {
      if (!user || !staking) return;
      const poolId = getPoolId();

      setStatus(`Claiming index ${index}... กรุณายืนยันในกระเป๋า`, null);
      const tx = await staking.claim(poolId, index);
      setStatus(`Claim sent: ${tx.hash}\nWaiting confirm...`, null);
      await tx.wait();

      setStatus(`Claim success ✅ (index ${index})`, true);
      await refreshBalances();
      await loadStakes();
    } catch (e) {
      setStatus(`Claim failed: ${e?.message || e}`, false);
    }
  }

  // ---------- Bind events ----------
  function bind() {
    $("btnConnect")?.addEventListener("click", connect);
    $("btnRefreshBalances")?.addEventListener("click", refreshBalances);
    $("btnLoadPool")?.addEventListener("click", loadPool);
    $("btnLoadPackage")?.addEventListener("click", loadPackage);
    $("btnApprove")?.addEventListener("click", approveTHBC);
    $("btnBuy")?.addEventListener("click", buyPackage);
    $("btnLoadStakes")?.addEventListener("click", loadStakes);
  }

  // ---------- Start ----------
  document.addEventListener("DOMContentLoaded", () => {
    fillStatic();
    bind();
    setStatus("พร้อมใช้งาน — กด Connect Wallet", null);
  });
})();
