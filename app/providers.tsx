"use client";

import {
  CrossmintProvider,
  CrossmintAuthProvider,
  CrossmintWalletProvider,
  useAuth,
} from "@crossmint/client-sdk-react-ui";

if (!process.env.NEXT_PUBLIC_CROSSMINT_API_KEY) {
  throw new Error("NEXT_PUBLIC_CROSSMINT_API_KEY is not set");
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CrossmintProvider apiKey={process.env.NEXT_PUBLIC_CROSSMINT_API_KEY || ""}>
      <CrossmintAuthProvider
        authModalTitle="Wallets Quickstart"
        loginMethods={["google", "email"]}
      >
        <WalletProvider>
          {children}
        </WalletProvider>
      </CrossmintAuthProvider>
    </CrossmintProvider>
  );
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  return (
    <CrossmintWalletProvider
      createOnLogin={{
        chain: "solana",
        signer: {
          type: "email",
          email: user?.email,
        },
      }}
    >
      {children}
    </CrossmintWalletProvider>
  );
}
