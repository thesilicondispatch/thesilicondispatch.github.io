(function (global) {
    "use strict";

    const VAULT_STORE = {
        salt: "/xC3pssIilFqfuzOSqyMcw==",
        iv: "h5gOspSaEB+a8ZTN",
        ciphertext: "01P3DHkwo26kjoogqmF/++d/e2o6Z8MSFe6QoCi9gFqyMjV21TBS3ydKuzRYvpH2p4kZ9BqfD3bwr8GM50W1FNlbUfyya2Gko7HsFoG9iONLICqcbYAAhv9Yo4nQ/dP+FYn5Kbd4oK3c0Ja9YLFbQ1nuJABLjpRHb+5418OPf2L2BilEaTwi5wVjHdxfJRT+SfvEEtgMP+DvFGo3CX8n/rDlglvydqG9JubtF1cLMM2pVGtnTwQMXxIFTw0AzcCcFlcYZOzkIRMLt1oqmgXbq6Cuei94jzkCE623fvCrlILFSzcy8PGNRzSWz+mWXJxaaNbNffczRjHPhO77LGsi+CSTzUZ8VGFmP+Fu",
        entropy: [63,208,213,89,252,215,205,9,240,240,91,24,74,28,237,26,254,215,127,33,97,209,70,171,124,225,153,233,199,176,176,254]
    };

    Object.defineProperty(global, "__DISPATCH_VAULT__", {
        value: Object.freeze(VAULT_STORE),
        writable: false,
        configurable: true,
        enumerable: false
    });
})(typeof window !== "undefined" ? window : globalThis);
