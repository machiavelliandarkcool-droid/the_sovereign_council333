import express from 'express';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import cors from 'cors';
import axios from 'axios';
import { URL } from 'url';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const contractAddress = process.env.CONTRACT_ADDRESS; // นำเครื่องหมาย ! ออก

// ABI ดึงข้อมูลครบ 8 ค่าตาม Smart Contract
const abi = [
    "function getDeedData(uint256 t) external view returns (address owner, bool active, bool sanctified, string memory front, string memory back, string memory video, string memory dna, string memory hidden)"
];

const contract = new ethers.Contract(contractAddress, abi, provider);

// ลบ Type ": string" ออก
const formatURI = (uri) => {
    if (!uri) return "";
    if (uri.startsWith("ar://")) return uri.replace("ar://", "https://arweave.net/");
    if (uri.startsWith("ipfs://")) return uri.replace("ipfs://", "https://ipfs.io/ipfs/");
    return uri;
};

// ⚡️ WORLD-CLASS FIX 1: Whitelist ป้องกัน SSRF
const ALLOWED_HOSTS = ['gateway.irys.xyz', 'arweave.net', 'ipfs.io'];
// ลบ Type ": string" ออก
const isSafeUrl = (targetUrl) => {
    try {
        const parsedUrl = new URL(targetUrl);
        return ALLOWED_HOSTS.some(host => parsedUrl.hostname.includes(host));
    } catch (e) {
        return false;
    }
};

app.get('/metadata/:tokenId', async (req, res) => {
    // ⚡️ WORLD-CLASS FIX 2: ใช้ Cache 60 วินาทีเพื่อลดภาระ RPC แต่ข้อมูลยังสดใหม่
    res.setHeader('Cache-Control', 'public, max-age=60');

    // 🔴 [CRITICAL FIX]: ล็อคเป้าตัดสัญชาตญาณ OpenSea ที่ชอบแถม .json เข้ามา
    const tokenIdRaw = req.params.tokenId;
    const tokenId = tokenIdRaw.replace('.json', ''); 

    try {
        const data = await contract.getDeedData(tokenId);
        
        if (data.owner === ethers.ZeroAddress) {
            return res.status(404).json({ error: "โฉนดใบนี้ยังไม่ถูกสร้างเข้าระบบสิทธิ์ขาด" });
        }

        // ลบ Type ": Record<string, any>" ออก
        const metadata = {
            name: `Imperial Sovereign Deed #${tokenId}`,
            description: "The Absolute Proof of True Ownership & Identity. The Machiavellian Dark Cool.",
            image: formatURI(data.front), 
            attributes: [
                { trait_type: "Sovereign Owner", value: data.owner }
            ]
        };

        if (data.video && data.video.trim() !== "") metadata.animation_url = formatURI(data.video);
        if (data.back && data.back.trim() !== "") {
            metadata.attributes.push({ trait_type: "Deed Back Registry", value: formatURI(data.back) });
        }
        if (data.dna && data.dna.trim() !== "") {
            metadata.attributes.push({ trait_type: "Identity DNA (Forensic Anchor)", value: data.dna });
        }

        if (data.hidden && data.hidden.trim() !== "") {
            const hiddenUrl = formatURI(data.hidden);
            
            if (hiddenUrl.startsWith("http")) {
                // ⚡️ WORLD-CLASS FIX 3: ตรวจสอบ Domain ก่อนทำงาน (SSRF Prevention)
                if (isSafeUrl(hiddenUrl)) {
                    try {
                        const response = await axios.get(hiddenUrl, {
                            timeout: 5000, 
                            maxContentLength: 1000000 
                        });
                        const extraData = response.data;

                        if (extraData && extraData.attributes && Array.isArray(extraData.attributes)) {
                            metadata.attributes.push(...extraData.attributes);
                        }
                    } catch (err) {
                        metadata.attributes.push({ trait_type: "Hidden Property (Chrono-Map)", value: hiddenUrl });
                    }
                } else {
                    metadata.attributes.push({ trait_type: "Hidden Property (Chrono-Map)", value: hiddenUrl });
                }
            } else {
                metadata.attributes.push({ trait_type: "Hidden Property (Chrono-Map)", value: data.hidden });
            }
        }

        res.json(metadata);
        console.log(`[SYSTEM SUCCESS] ดึงข้อมูลสดของโฉนดเบอร์ ${tokenId} สู่แพลตฟอร์มเรียบร้อย`);

    } catch (error) {
        console.error(`[ORACLE ERROR] เบอร์ ${tokenId} การเชื่อมต่อขัดข้อง:`, error);
        res.status(500).json({ error: "Network Connection Error" });
    }
});

app.get('/', (req, res) => {
    res.send("♣️ Sovereign Conditional Pass-Through Pipe is fully active.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[SYSTEM] ♠️ สัญญาณเชื่อมต่อพร้อมรบที่พอร์ต ${PORT}`);
});
