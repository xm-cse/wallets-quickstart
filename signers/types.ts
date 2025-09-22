import type { Crossmint } from "@crossmint/common-sdk-base";

import type {
  signerInboundEvents,
  signerOutboundEvents,
} from "@crossmint/client-signers";

import type {
  EmailSignerConfig,
  PhoneSignerConfig,
} from "@crossmint/wallets-sdk";

import type { HandshakeParent } from "@crossmint/client-sdk-window";

type BaseInternalSignerConfig = {
  locator: string;
  address: string;
  crossmint: Crossmint;
  clientTEEConnection?: HandshakeParent<
    typeof signerOutboundEvents,
    typeof signerInboundEvents
  >;
};

export type EmailInternalSignerConfig = EmailSignerConfig &
  BaseInternalSignerConfig;

export type PhoneInternalSignerConfig = PhoneSignerConfig &
  BaseInternalSignerConfig;

export class AuthRejectedError extends Error {
  constructor() {
    super("Authentication was rejected by the user");
    this.name = "AuthRejectedError";
  }
}
