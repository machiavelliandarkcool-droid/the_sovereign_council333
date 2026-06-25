import express from 'express';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import cors from 'cors';
import axios from 'axios';
import { URL } from 'url';
import helmet from 'helmet';

dotenv.config();

const app = express();
app.use(helmet()); 
app.use(express.json());
app.use(cors());

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const contractAddress = process.env.CONTRACT_ADDRESS!;

// ABI ดึงข้อมูลครบ 8 ค่าตาม Smart Contract สิทธิ์ขาด
const abi = [
    "function getDeedData(uint256 t) external view returns (address owner, bool active, bool sanctified, string memory front, string memory back, string memory video, string memory dna, string memory hidden)"
];

const contract = new ethers.Contract(contractAddress, abi, provider);

// ฟังก์ชันแปลงรูปแบบ URI รองรับ Decentralized Storage
const formatURI = (uri: string) => {
    if (!uri) return "";
    if (uri.startsWith("ar://")) return uri.replace("ar://", "https://arweave.net/");
    if (uri.startsWith("ipfs://")) return uri.replace("ipfs://", "https://ipfs.io/ipfs/");
    return uri;
};

// 🔒 SECURITY FIXED: เปลี่ยนจาก .includes() กลับเป็น Exact/EndsWith Match 
// เพื่อป้องกันผู้ไม่หวังดีใช้โดเมนโกง เช่น ipfs.io.malicious-domain.com
const ALLOWED_HOSTS = ['gateway.irys.xyz', 'arweave.net', 'ipfs.io'];
const isSafeUrl = (targetUrl: string) => {
    try {
        const parsedUrl = new URL(targetUrl);
        return ALLOWED_HOSTS.some(host => 
            parsedUrl.hostname === host || parsedUrl.hostname.endsWith('.' + host)
        );
    } catch (e) {
        return false;
    }
};

// Endpoint รองรับฐาน baseURI: https://the-sovereign-council333.onrender.com/metadata/
app.get('/metadata/:tokenId', async (req, res) => {
    // ⚡️ PERFORMANCE: ตั้งค่า Cache 60 วินาทีตามแผนเพื่อลด Load ของ RPC Node
    res.setHeader('Cache-Control', 'public, max-age=60');

    // 🔴 MANIFEST .JSON PROCESS: สกัดคำต่อท้าย .json ที่ OpenSea มักจะส่งพ่วงมาด้วย
    const tokenIdRaw = req.params.tokenId;
    const tokenId = tokenIdRaw.replace('.json', ''); 

    // 🔒 SECURITY RESTORED: ตรวจสอบ Input ป้องกันแฮกเกอร์ยิง String แปลกปลอมเข้าไปพัง RPC
    if (!/^\d+$/.test(tokenId)) {
        return res.status(400).json({ error: "รูปแบบ Token ID ไม่ถูกต้อง ต้องเป็นตัวเลขเท่านั้น" });
    }

    try {
        const data = await contract.getDeedData(tokenId);
        
        // ตรวจสอบความมีอยู่ของโฉนดจาก Address เริ่มต้น
        if (data.owner === ethers.ZeroAddress) {
            return res.status(404).json({ error: "โฉนดใบนี้ยังไม่ถูกสร้างเข้าระบบสิทธิ์ขาด" });
        }
        
        // ประกอบโครงสร้างมาตรฐาน ERC-721 Metadata Manifest ให้ OpenSea อ่าน
        const metadata: Record<string, any> = {
            name: `Imperial Sovereign Deed #${tokenId}`,
            description: "The Absolute Proof of True Ownership & Identity. The Machiavellian Dark Cool.",
            image: formatURI(data.front), 
            attributes: [
                { trait_type: "Sovereign Owner", value: data.owner },
                { trait_type: "Active Status", value: data.active ? "Active" : "Inactive" },
                // ✅ SANTIFY NOVA IMPLEMENTATION: นำค่าสิทธิ์ศักดิ์สิทธิ์มาแสดงใน Attributes จริง
                { trait_type: "Sanctified Status", value: data.sanctified ? "Sanctified Nova" : "Standard" }
            ]
        };

        // ตรวจสอบและผูกไฟล์สื่อ (upโหลดสือ/Media Formatting)
        if (data.video && data.video.trim() !== "") metadata.animation_url = formatURI(data.video);
        if (data.back && data.back.trim() !== "") {
            metadata.attributes.push({ trait_type: "Deed Back Registry", value: formatURI(data.back) });
        }
        
        // แสดงผลข้อมูลอัตลักษณ์เดิม (Identity DNA)
        if (data.dna && data.dna.trim() !== "") {
            metadata.attributes.push({ trait_type: "Identity DNA (Forensic Anchor)", value: data.dna });
        }

        // ประมวลผลข้อมูลลับ / ข้อมูลเสริมส่วนขยาย (Hidden Property)
        if (data.hidden && data.hidden.trim() !== "") {
            const hiddenUrl = formatURI(data.hidden);
            
            if (hiddenUrl.startsWith("http")) {
                if (isSafeUrl(hiddenUrl)) {
                    try {
                        // ดึงข้อมูลเสริมอย่างปลอดภัย จำกัดขนาดยกเลิกสตรีมขยะหนี่ยวรั้งแรม
                        const response = await axios.get(hiddenUrl, {
                            timeout: 5000, 
                            maxContentLength: 1000000,
                            maxBodyLength: 1000000
                        });
                        const extraData = response.data;

                        // ตรวจสอบโครงสร้าง Attributes ก่อนทำการ Spread ป้องกันการพ่นข้อมูลพังใส่ OpenSea
                        if (extraData && extraData.attributes && Array.isArray(extraData.attributes)) {
                            // กรองเฉพาะ Object ที่มี trait_type และ value เพื่อความปลอดภัยสูงสุด
                            const validAttributes = extraData.attributes.filter(
                                (attr: any) => attr && typeof attr === 'object' && 'trait_type' in attr && 'value' in attr
                            );
                            metadata.attributes.push(...validAttributes);
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
        console.log(`[SYSTEM SUCCESS] ส่งข้อมูลสิทธิ์ขาดโฉนดเบอร์ ${tokenId} สู่แพลตฟอร์มปลายทางสำเร็จ`);

    } catch (error: any) {
        if (error.message && (error.message.includes("NonexistentToken") || error.message.includes("revert"))) {
            return res.status(404).json({ error: "โฉนดใบนี้ยังไม่ถูกสร้างเข้าระบบสิทธิ์ขาด หรือถูกยุบไปแล้ว" });
        }
        console.error(`[ORACLE ERROR] เบอร์ ${tokenId} การเชื่อมต่อขัดข้อง:`, error.message || error);
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
