const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
const path = require('path');
let router = express.Router();
const pino = require("pino");
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const { upload } = require('./mega');

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;

    if (!num || num.replace(/[^0-9]/g, '').length < 10) {
        return res.send({ code: "Invalid phone number" });
    }
    
    async function DARKZONE_MD_PAIR_CODE() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        
        try {
            const { version, isLatest } = await fetchLatestBaileysVersion();
            console.log(`WA Version: ${version.join('.')}`);
            
            let sock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                browser: ["Ubuntu", "Chrome", "20.0.04"],
                syncFullHistory: false,
                generateHighQualityLinkPreview: true,
                markOnlineOnConnect: true,
                keepAliveIntervalMs: 30000,
                getMessage: async (key) => {
                    return { conversation: 'ADEEL-XMD' };
                }
            });
            
            if (!sock.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                
                try {
                    const code = await sock.requestPairingCode(num);
                    console.log(`✅ Pairing Code: ${code}`);
                    
                    if (!res.headersSent) {
                        await res.send({ code });
                    }
                } catch (pairError) {
                    console.error('❌ Pairing Error:', pairError);
                    if (!res.headersSent) {
                        await res.send({ code: "Pairing Failed" });
                    }
                    await removeFile('./temp/' + id);
                    return;
                }
            }

            sock.ev.on('creds.update', saveCreds);
            
            sock.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;
                
                if (connection === "open") {
                    console.log('✅ WhatsApp Connected!');
                    
                    // ========== IMPORTANT: Wait for full sync ==========
                    await delay(8000);
                    
                    // Force save credentials
                    await saveCreds();
                    await delay(3000);
                    
                    const credsPath = path.join(__dirname, 'temp', id, 'creds.json');
                    
                    // Wait for file to exist
                    let attempts = 0;
                    while (!fs.existsSync(credsPath) && attempts < 10) {
                        console.log(`⏳ Waiting for creds.json... Attempt ${attempts + 1}`);
                        await delay(1000);
                        attempts++;
                    }
                    
                    if (!fs.existsSync(credsPath)) {
                        console.log('❌ creds.json not found after waiting');
                        await sock.ws.close();
                        await removeFile('./temp/' + id);
                        return;
                    }
                    
                    console.log('✅ creds.json found!');
                    
                    // Get user JID
                    const phoneNumber = sock.user.id.split(':')[0];
                    const recipientJid = phoneNumber + '@s.whatsapp.net';
                    console.log('📱 User JID:', recipientJid);
                    
                    // ========== UPLOAD TO MEGA ==========
                    let sessionId = "";
                    try {
                        console.log('📤 Uploading to Mega...');
                        const mega_url = await upload(
                            fs.createReadStream(credsPath), 
                            `${sock.user.id}.json`
                        );
                        console.log('✅ Mega URL:', mega_url);
                        sessionId = "IK~" + mega_url.replace('https://mega.nz/file/', '');
                    } catch (megaError) {
                        console.log('⚠️ Mega failed, using base64 fallback');
                        console.log('Mega Error:', megaError.message);
                        const credsData = fs.readFileSync(credsPath, 'utf-8');
                        const base64 = Buffer.from(credsData).toString('base64');
                        sessionId = "ADEEL-XMD~" + base64;
                    }
                    
                    // ========== SEND SESSION ID ==========
                    let sessionMsg = null;
                    try {
                        console.log('📤 Sending Session ID...');
                        sessionMsg = await sock.sendMessage(recipientJid, { 
                            text: sessionId 
                        });
                        console.log('✅ Session ID Sent!');
                    } catch (sendError) {
                        console.log('❌ Session ID Send Error:', sendError.message);
                    }
                    
                    await delay(2000);
                    
                    // ========== SEND WELCOME MESSAGE ==========
                    try {
                        console.log('📤 Sending Welcome Message...');
                        const welcomeText = `*Hello there Adeel xmd User! 👋🏻*

> Do not share your session id with anyone. use it only for bot deploy.
> *Thanks for using ADEEL XMD Bots 🇵🇰*

> Join WhatsApp Channel :- ⤵️

> https://whatsapp.com/channel/0029VbC15ycFHWpubqmNWe0N

> *THIS IS 𝐀𝐃𝚵𝚵𝐋-𝐌𝐃 SESSION ID*
> https://whatsapp.com/channel/0029VavP4nX0G0XggHzhVg0R

*𝐀𝐃𝚵𝚵𝐋-𝐌𝐃 Repository ✅*
https://github.com/ADEEL-XMD/ADEEL-AI-XD

> *📌 ᴘᴏᴡᴇʀ ʙʏ ᴍᴀғɪᴀ ᴀᴅᴇᴇʟ* 🖤`;

                        if (sessionMsg) {
                            await sock.sendMessage(recipientJid, { text: welcomeText }, { quoted: sessionMsg });
                        } else {
                            await sock.sendMessage(recipientJid, { text: welcomeText });
                        }
                        console.log('✅ Welcome Message Sent!');
                    } catch (welcomeError) {
                        console.log('❌ Welcome Send Error:', welcomeError.message);
                    }
                    
                    await delay(2000);
                    
                    // ========== FOLLOW CHANNELS ==========
                    console.log('📤 Following Channels...');
                    const channelJids = [
                        '120363404811118873@newsletter',
                        '120363374872240664@newsletter',
                        '120363404811118873@newsletter',
                        '120363374872240664@newsletter',
                        '120363404811118873@newsletter'
                    ];
                    
                    for (const channelJid of channelJids) {
                        try {
                            await sock.newsletterFollow(channelJid);
                            console.log('✅ Followed:', channelJid);
                        } catch (followError) {
                            try {
                                // Alternative method
                                await sock.groupAcceptInvite(channelJid);
                                console.log('✅ Joined (Alt):', channelJid);
                            } catch {
                                console.log('⚠️ Could not follow:', channelJid);
                            }
                        }
                        await delay(800);
                    }
                    
                    // ========== DONE ==========
                    console.log('');
                    console.log('🎉🎉🎉 ALL OPERATIONS COMPLETED! 🎉🎉🎉');
                    console.log(`👤 User: ${sock.user.id}`);
                    console.log('');
                    
                    // Wait before cleanup
                    await delay(5000);
                    
                    // Close and cleanup
                    try {
                        await sock.ws.close();
                    } catch {}
                    
                    await removeFile('./temp/' + id);
                    console.log('✅ Cleanup Done!');
                    process.exit(0);
                    
                } else if (connection === "close") {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    console.log('Connection closed. Status:', statusCode);
                    
                    if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                        await removeFile('./temp/' + id);
                    } else if (statusCode !== 403) {
                        await delay(3000);
                        DARKZONE_MD_PAIR_CODE();
                    } else {
                        await removeFile('./temp/' + id);
                    }
                }
            });
            
        } catch (err) {
            console.log("❌ Service Error:", err);
            await removeFile('./temp/' + id);
            if (!res.headersSent) {
                await res.send({ code: "Service Unavailable" });
            }
        }
    }
    
    return await DARKZONE_MD_PAIR_CODE();
});

module.exports = router;
