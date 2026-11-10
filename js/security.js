/**
 * The Silicon Dispatch - Cryptographic Security Vault & Authentication Engine
 * 
 * - Web Crypto API (SubtleCrypto)
 * - 256-bit AES-GCM Authenticated Decryption
 * - PBKDF2 Key Derivation Function (100,000 iterations, SHA-256)
 * - Two-Share Split-Key Threshold Scheme
 * - Salted SHA-256 Admin Authentication with Zero Plaintext Stored
 */
(function (global) {
    "use strict";

    const SESSION_KEY = "dispatch_admin_session";
    const LOCKOUT_KEY = "dispatch_auth_lockout";
    const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
    const MAX_FAILED_ATTEMPTS = 5;
    const LOCKOUT_DURATION_MS = 15000;

    // Key Share A: 32 bytes (256-bit entropy segment)
    function _resolveEntropyShareA() {
        return new Uint8Array([161,215,192,135,157,61,76,217,206,14,210,155,134,171,98,26,66,41,100,50,173,33,83,53,96,151,240,156,120,106,205,21]);
    }

    function _base64ToBytes(base64) {
        const binString = atob(base64);
        const len = binString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binString.charCodeAt(i);
        }
        return bytes;
    }

    function _bytesToHex(buffer) {
        const bytes = new Uint8Array(buffer);
        let hex = "";
        for (let i = 0; i < bytes.length; i++) {
            hex += bytes[i].toString(16).padStart(2, "0");
        }
        return hex;
    }

    let _cachedConfig = null;
    let _unlockPromise = null;

    async function _unlockVault() {
        if (_cachedConfig) {
            return _cachedConfig;
        }

        const subtle = global.crypto && global.crypto.subtle;
        if (!subtle) {
            throw new Error("Web Crypto API is unavailable.");
        }

        const vaultData = global.__DISPATCH_VAULT__;
        if (!vaultData || !vaultData.ciphertext || !vaultData.entropy) {
            throw new Error("Dispatch Vault integrity error: Payload missing.");
        }

        const shareA = _resolveEntropyShareA();
        const shareB = new Uint8Array(vaultData.entropy);
        if (shareA.length !== shareB.length) {
            throw new Error("Key Share Mismatch Error.");
        }

        const masterSeed = new Uint8Array(shareA.length);
        for (let i = 0; i < shareA.length; i++) {
            masterSeed[i] = shareA[i] ^ shareB[i];
        }

        const saltBytes = _base64ToBytes(vaultData.salt);
        const ivBytes = _base64ToBytes(vaultData.iv);
        const ciphertextBytes = _base64ToBytes(vaultData.ciphertext);

        const baseKey = await subtle.importKey(
            "raw",
            masterSeed,
            "PBKDF2",
            false,
            ["deriveKey"]
        );

        const aesKey = await subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: saltBytes,
                iterations: 100000,
                hash: "SHA-256"
            },
            baseKey,
            { name: "AES-GCM", length: 256 },
            false,
            ["decrypt"]
        );

        const decryptedBuffer = await subtle.decrypt(
            { name: "AES-GCM", iv: ivBytes },
            aesKey,
            ciphertextBytes
        );

        const decoder = new TextDecoder("utf-8");
        const jsonText = decoder.decode(decryptedBuffer);
        const payload = JSON.parse(jsonText);

        _cachedConfig = Object.freeze(payload);

        try {
            delete global.__DISPATCH_VAULT__;
        } catch (_) {}

        return _cachedConfig;
    }

    async function sha256(str) {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await global.crypto.subtle.digest("SHA-256", data);
        return _bytesToHex(hashBuffer);
    }

    function _constantTimeEqual(a, b) {
        if (typeof a !== "string" || typeof b !== "string") return false;
        const maxLen = Math.max(a.length, b.length);
        let diff = a.length ^ b.length;
        for (let i = 0; i < maxLen; i++) {
            const ca = i < a.length ? a.charCodeAt(i) : 0;
            const cb = i < b.length ? b.charCodeAt(i) : 0;
            diff |= ca ^ cb;
        }
        return diff === 0;
    }

    function _readLockoutState() {
        try {
            const raw = sessionStorage.getItem(LOCKOUT_KEY);
            if (!raw) return { attempts: 0, until: 0 };
            const parsed = JSON.parse(raw);
            return {
                attempts: Number(parsed.attempts) || 0,
                until: Number(parsed.until) || 0
            };
        } catch (_) {
            return { attempts: 0, until: 0 };
        }
    }

    const SecurityVault = {
        async getConfig() {
            if (!_unlockPromise) {
                _unlockPromise = _unlockVault();
            }
            const config = await _unlockPromise;
            const customRoom = localStorage.getItem("dispatch_custom_room");
            let parsedCustomAuth = null;
            try {
                const rawCustomAuth = localStorage.getItem("dispatch_custom_auth");
                if (rawCustomAuth) {
                    const candidate = JSON.parse(rawCustomAuth);
                    if (candidate && typeof candidate.username === "string" && typeof candidate.salt === "string" && typeof candidate.hash === "string") {
                        parsedCustomAuth = candidate;
                    }
                }
            } catch (_) {}

            return {
                host: config.host,
                room: customRoom || config.room,
                auth: parsedCustomAuth || config.auth
            };
        },

        async isUsingDefaultCredentials() {
            try {
                const active = await this.getConfig();
                if (!_cachedConfig || !_cachedConfig.auth || !active.auth) return false;
                return _constantTimeEqual(active.auth.hash, _cachedConfig.auth.hash);
            } catch (_) {
                return false;
            }
        },

        async verifyAdmin(username, password) {
            try {
                const config = await this.getConfig();
                const expectedAuth = config.auth;
                if (typeof username !== "string" || typeof password !== "string" || !password || !expectedAuth) {
                    return false;
                }

                const trimmedUser = username.trim();
                const candidateHash = await sha256(trimmedUser + ":" + password + ":" + expectedAuth.salt);
                const userOk = _constantTimeEqual(trimmedUser, expectedAuth.username);
                const hashOk = _constantTimeEqual(candidateHash, expectedAuth.hash);
                return userOk && hashOk;
            } catch (err) {
                console.error("Authentication failure:", err);
                return false;
            }
        },

        getLockoutRemainingSeconds() {
            const state = _readLockoutState();
            const remaining = state.until - Date.now();
            return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
        },

        recordFailedAttempt() {
            const state = _readLockoutState();
            const nextAttempts = state.attempts + 1;
            let nextUntil = 0;
            if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
                nextUntil = Date.now() + LOCKOUT_DURATION_MS;
                sessionStorage.setItem(LOCKOUT_KEY, JSON.stringify({ attempts: 0, until: nextUntil }));
                return Math.ceil(LOCKOUT_DURATION_MS / 1000);
            }
            sessionStorage.setItem(LOCKOUT_KEY, JSON.stringify({ attempts: nextAttempts, until: 0 }));
            return 0;
        },

        clearLockout() {
            sessionStorage.removeItem(LOCKOUT_KEY);
        },

        async updateCredentials(newUsername, newPassword) {
            if (!newUsername || !newUsername.trim() || !newPassword) {
                throw new Error("Username and passphrase are required.");
            }
            const saltBytes = new Uint8Array(16);
            global.crypto.getRandomValues(saltBytes);
            const saltHex = _bytesToHex(saltBytes);
            const trimmedUser = newUsername.trim();
            const hashHex = await sha256(trimmedUser + ":" + newPassword + ":" + saltHex);

            const customAuth = {
                username: trimmedUser,
                salt: saltHex,
                hash: hashHex
            };

            localStorage.setItem("dispatch_custom_auth", JSON.stringify(customAuth));
            return true;
        },

        setCustomRoom(roomName) {
            if (roomName && roomName.trim()) {
                localStorage.setItem("dispatch_custom_room", roomName.trim());
            } else {
                localStorage.removeItem("dispatch_custom_room");
            }
        },

        resetCustomSettings() {
            localStorage.removeItem("dispatch_custom_room");
            localStorage.removeItem("dispatch_custom_auth");
        },

        createSession(username) {
            const randBytes = new Uint8Array(16);
            global.crypto.getRandomValues(randBytes);
            const token = "dispatch_session_" + Date.now() + "_" + _bytesToHex(randBytes);
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                user: String(username || "").trim(),
                token: token,
                timestamp: Date.now()
            }));
            return token;
        },

        destroySession() {
            sessionStorage.removeItem(SESSION_KEY);
        },

        isAdminLoggedIn() {
            const sess = sessionStorage.getItem(SESSION_KEY);
            if (!sess) return false;
            try {
                const data = JSON.parse(sess);
                if (!data || typeof data.token !== "string" || !data.token.startsWith("dispatch_session_")) {
                    sessionStorage.removeItem(SESSION_KEY);
                    return false;
                }
                if (typeof data.timestamp !== "number" || (Date.now() - data.timestamp > SESSION_TTL_MS)) {
                    sessionStorage.removeItem(SESSION_KEY);
                    return false;
                }
                return true;
            } catch (_) {
                sessionStorage.removeItem(SESSION_KEY);
                return false;
            }
        }
    };

    Object.freeze(SecurityVault);

    Object.defineProperty(global, "SecurityVault", {
        value: SecurityVault,
        writable: false,
        configurable: false,
        enumerable: false
    });
})(typeof window !== "undefined" ? window : globalThis);
