import { useCallback, useEffect, useState } from "react";
import { type Activity, useWallet } from "@crossmint/client-sdk-react-ui";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useFlowSigner } from "@/providers/FlowWalletProvider";

export function SignMessage() {
  const { wallet } = useWallet();
  // new hook
  const { signRaw, derivePublicKey } = useFlowSigner();
  const [message, setMessage] = useState("Hello Flow");
  const [signature, setSignature] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    const fetchPublicKey = async () => {
      const result = await derivePublicKey();
      console.log("Public key:", result);
      setPublicKey(result.publicKey.bytes);
    };
    fetchPublicKey();
  }, [derivePublicKey]);

  const signMessage = useCallback(async () => {
    if (!wallet || !message) return;

    try {
      setLoading(true);

      // Hash the message to 32 bytes (SHA-256) - web compatible
      const encoder = new TextEncoder();
      const data = encoder.encode(message);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const messageHash = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      console.log("=== Crossmint -> Flow Test ===");
      console.log("Original message:", message);
      console.log("SHA-256 hash:", messageHash);

      // Pass the 64-character hex hash to signRaw
      const result = await signRaw(messageHash);
      const sig = result.signature.toString();

      console.log("Signature:", sig);
      console.log("Signer address:", wallet.signer.locator());

      setSignature(sig);
    } catch (error) {
      console.error("Error", `${error}`);
    } finally {
      setLoading(false);
    }
  }, [wallet, message, signRaw]);

  if (!wallet) {
    return (
      <div className="bg-white rounded-2xl border shadow-sm p-6">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-6 flex-1 overflow-y-auto">
      <h2 className="text-xl font-semibold mb-5">Flow Signature Test</h2>

      <div className="bg-blue-50 p-3 rounded-lg mb-5">
        <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">
          • Message is SHA-256 hashed to 32 bytes{"\n"}• Signed with secp256k1
          curve{"\n"}• Raw signing - no prefixes added
        </p>
      </div>

      <input
        type="text"
        className="w-full border border-gray-300 rounded-lg p-3 mb-4 text-sm"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Enter message"
      />

      <button
        type="button"
        className="w-full bg-green-600 text-white p-3.5 rounded-lg text-center text-sm font-medium disabled:opacity-50"
        onClick={signMessage}
        disabled={loading}
      >
        {loading ? (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
          </div>
        ) : (
          "Sign Message"
        )}
      </button>

      {publicKey && (
        <div className="mt-5 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-600 mb-1">Public key:</p>
          <p className="text-xs font-mono mb-3 break-all line-clamp-3">
            {publicKey}
          </p>
        </div>
      )}

      {signature && (
        <div className="mt-5 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-600 mb-1">Signature:</p>
          <p className="text-xs font-mono mb-3 break-all line-clamp-3">
            {signature}
          </p>
        </div>
      )}
    </div>
  );
}
