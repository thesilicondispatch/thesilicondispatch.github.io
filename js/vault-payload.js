/**
 * The Silicon Dispatch - Cryptographic Storage Vault
 * 
 * Implements AES-256-GCM authenticated cipher with 100,000 PBKDF2 iterations.
 * Contains split-key threshold entropy Share B.
 * 
 * ZERO plaintext credentials, API keys, or backend addresses are exposed
 * in the repository or static deployment on GitHub Pages.
 */
(function (global) {
    "use strict";

    const VAULT_STORE = {
        salt: "rdfbBJZ50LXO8gO5AQ3Dmg==",
        iv: "Mi9zvKbiNlyxHuOA",
        ciphertext: "84i+9ALc3b/cvPBXmu8yZjeH43IRqieScFdaB5qCDz8wqr/QoG7RaM7xEXUdUF73mw3QAgSDvvNPV6d8XdsekGrGsPzhSx5JsUoCGFu6MVqpPI6jo1VCteOexTuedQHpNDkJ+g2dASx9a3PjXZRcIRMolD4TGgLnAwTwrGD7qXrLEZ2zn2p/b9w1Z+FSxXCyQ+IWsySur0ME1sG1E5URwWTCmJwkJWuAtcmTI4P4EgP415P9wyX96cc8CDrHtq/DnHm/r37rHESoiBPTfmCB9lBiDZADyjEObOZN5JWNO+pq7Ep3zOztHbDuWlwt8Sis1DFuwA==",
        entropy: [112,227,146,46,242,215,203,43,80,43,177,191,158,75,80,170,115,171,226,201,165,64,25,148,101,229,3,207,93,229,245,139]
    };

    Object.defineProperty(global, "__DISPATCH_VAULT__", {
        value: Object.freeze(VAULT_STORE),
        writable: false,
        configurable: true,
        enumerable: false
    });
})(typeof window !== "undefined" ? window : globalThis);
