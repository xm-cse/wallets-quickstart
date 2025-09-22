import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useEffect,
} from "react";
import type { ReactNode } from "react";
import { useWallet, useCrossmint } from "@crossmint/client-sdk-react-ui";
import { FlowNonCustodialSigner } from "@/signers/ncs-flow-signer";
import type {
  EmailInternalSignerConfig,
  PhoneInternalSignerConfig,
} from "@/signers/types";

type PublicKeyResponse = {
  publicKey: {
    bytes: string;
    encoding: string;
    keyType: "secp256k1" | "ed25519";
  };
};

type FlowSignerContext = {
  signRaw: (message: string) => Promise<{ signature: string }>;
  derivePublicKey: () => Promise<PublicKeyResponse>;
};

const FlowSignerContext = createContext<FlowSignerContext | null>(null);

interface FlowWalletProviderProps {
  children: ReactNode;
}

export function FlowWalletProvider({ children }: FlowWalletProviderProps) {
  const { crossmint } = useCrossmint();
  const { onAuthRequired, wallet } = useWallet();

  // Store the current signer instance
  const currentSignerRef = useRef<FlowNonCustodialSigner | null>(null);

  useEffect(() => {
    // Create signer if it doesn't exist
    if (!currentSignerRef.current) {
      if (!onAuthRequired || !wallet) {
        return;
      }

      // Get signer info directly from wallet
      const signerLocator = wallet.signer.locator();
      const signerType = signerLocator.startsWith("email:") ? "email" : "phone";
      const signerValue = signerLocator.split(":")[1];

      const config: EmailInternalSignerConfig | PhoneInternalSignerConfig =
        signerType === "email"
          ? {
              type: "email",
              email: signerValue,
              locator: signerLocator,
              address: wallet.address,
              crossmint,
              onAuthRequired,
            }
          : {
              type: "phone",
              phone: signerValue,
              locator: signerLocator,
              address: wallet.address,
              crossmint,
              onAuthRequired,
            };

      currentSignerRef.current = new FlowNonCustodialSigner(config);
    }
  }, [onAuthRequired, wallet, crossmint]);

  const signRaw = async (message: string): Promise<{ signature: string }> => {
    if (!currentSignerRef.current) {
      throw new Error("Signer not initialized");
    }
    return currentSignerRef.current.signRaw(message);
  };

  const derivePublicKey = useCallback(async () => {
    if (!wallet) {
      throw new Error(
        "Wallet not properly initialized. Make sure you are within CrossmintWalletProvider."
      );
    }
    const response = await wallet
      .experimental_apiClient()
      .post("api/v1/signers/derive-public-key", {
        body: JSON.stringify({
          authId: wallet.signer.locator(),
          keyType: "secp256k1",
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }
    return (await response.json()) as PublicKeyResponse;
  }, [wallet]);

  const contextValue = { signRaw, derivePublicKey };

  return (
    <FlowSignerContext.Provider value={contextValue}>
      {children}
    </FlowSignerContext.Provider>
  );
}

// Custom hook to use the Flow wallet signer
export function useFlowSigner() {
  const context = useContext(FlowSignerContext);
  if (!context) {
    throw new Error("useFlowSigner must be used within a FlowWalletProvider");
  }
  return context;
}
