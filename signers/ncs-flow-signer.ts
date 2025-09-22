import { NcsIframeManager } from "@/signers/ncs-iframe-manager";
import {
  AuthRejectedError,
  type EmailInternalSignerConfig,
  type PhoneInternalSignerConfig,
} from "@/signers/types";
import { validateAPIKey } from "@crossmint/common-sdk-base";

const DEFAULT_EVENT_OPTIONS = {
  timeoutMs: 10_000,
  intervalMs: 5_000,
};

export class FlowNonCustodialSigner {
  public readonly type: "email" | "phone";
  private _needsAuth = true;
  private _authPromise: {
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: Error) => void;
  } | null = null;

  constructor(
    private config: EmailInternalSignerConfig | PhoneInternalSignerConfig
  ) {
    this.initialize();
    this.type = config.type;
  }

  private async initialize() {
    // Initialize iframe if no custom handshake parent is provided
    if (this.config.clientTEEConnection == null) {
      const parsedAPIKey = validateAPIKey(this.config.crossmint.apiKey);
      if (!parsedAPIKey.isValid) {
        throw new Error("Invalid API key");
      }
      const iframeManager = new NcsIframeManager({
        environment: parsedAPIKey.environment,
      });
      this.config.clientTEEConnection = await iframeManager.initialize();
    }
  }

  async signRaw(hexMessage: string) {
    await this.handleAuthRequired();
    const jwt = this.getJwtOrThrow();

    // Expect the caller to pass a 32-byte hex string (64 characters)
    // No "0x" prefix processing - truly raw
    if (hexMessage.length !== 64) {
      throw new Error(
        `signRaw expects exactly 64 hex characters (32 bytes).
  Got ${hexMessage.length} characters. Please hash your message to 32 bytes before calling signRaw.`
      );
    }

    const res = await this.config.clientTEEConnection?.sendAction({
      event: "request:sign",
      responseEvent: "response:sign",
      data: {
        authData: {
          jwt,
          apiKey: this.config.crossmint.apiKey,
        },
        data: {
          keyType: "secp256k1",
          bytes: hexMessage,
          encoding: "hex",
        },
      },
      options: DEFAULT_EVENT_OPTIONS,
    });

    if (res?.status === "error") {
      throw new Error(res.error);
    }

    if (res?.signature == null) {
      throw new Error("Failed to sign message");
    }
    return { signature: res.signature.bytes };
  }

  protected async handleAuthRequired() {
    if (this.config.clientTEEConnection == null) {
      if (this.config.onAuthRequired == null) {
        throw new Error(
          `${this.type} signer requires the onAuthRequired callback to handle OTP verification.
  This callback manages the authentication flow (sending OTP and verifying user input).
  If using our React/React Native SDK, this is handled automatically by the provider.
  For other environments, implement: onAuthRequired: (needsAuth, sendEmailWithOtp, verifyOtp, reject) => { /* your UI logic */ }`
        );
      }
      throw new Error("Handshake parent not initialized");
    }

    // Determine if we need to authenticate the user via OTP or not
    const signerResponse = await this.config.clientTEEConnection?.sendAction({
      event: "request:get-status",
      responseEvent: "response:get-status",
      data: {
        authData: {
          jwt: this.config.crossmint.experimental_customAuth?.jwt ?? "",
          apiKey: this.config.crossmint.apiKey,
        },
      },
      options: DEFAULT_EVENT_OPTIONS,
    });

    if (signerResponse?.status !== "success") {
      throw new Error(signerResponse?.error);
    }

    if (signerResponse.signerStatus === "ready") {
      this._needsAuth = false;
      return;
    }
    this._needsAuth = true;

    const { promise, resolve, reject } = this.createAuthPromise();
    this._authPromise = { promise, resolve, reject };

    if (this.config.onAuthRequired) {
      try {
        await this.config.onAuthRequired(
          this._needsAuth,
          () => this.sendMessageWithOtp(),
          (otp) => this.verifyOtp(otp),
          async () => {
            this._needsAuth = false;
            // We call onAuthRequired again so the needsAuth state is updated for the dev
            if (this.config.onAuthRequired != null) {
              await this.config.onAuthRequired(
                this._needsAuth,
                () => this.sendMessageWithOtp(),
                (otp) => this.verifyOtp(otp),
                () => this._authPromise?.reject(new AuthRejectedError())
              );
            }
            reject(new AuthRejectedError());
          }
        );
      } catch (error) {
        reject(error as Error);
      }
    }

    await promise;
  }

  protected getJwtOrThrow() {
    const jwt = this.config.crossmint.experimental_customAuth?.jwt;
    if (jwt == null) {
      throw new Error("JWT is required");
    }
    return jwt;
  }
  private createAuthPromise(): {
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: Error) => void;
  } {
    let resolvePromise!: () => void;
    let rejectPromise!: (error: Error) => void;

    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    return { promise, resolve: resolvePromise, reject: rejectPromise };
  }

  private async sendMessageWithOtp() {
    if (this.config.clientTEEConnection == null) {
      throw new Error("Handshake parent not initialized");
    }

    const handshakeParent = this.config.clientTEEConnection;
    const authId = this.getAuthId();
    const response = await handshakeParent.sendAction({
      event: "request:start-onboarding",
      responseEvent: "response:start-onboarding",
      data: {
        authData: {
          jwt: this.config.crossmint.experimental_customAuth?.jwt ?? "",
          apiKey: this.config.crossmint.apiKey,
        },
        data: { authId },
      },
      options: DEFAULT_EVENT_OPTIONS,
    });

    if (response?.status === "success" && response.signerStatus === "ready") {
      this._needsAuth = false;
      return;
    }

    if (response?.status === "error") {
      // Failed to send OTP
      // eslint-disable-next-line no-console
      console.error("[sendMessageWithOtp] Failed to send OTP:", response);
      this._authPromise?.reject(
        new Error(response.error || "Failed to initiate OTP process.")
      );
    }
  }

  private getAuthId() {
    if (this.config.type === "email") {
      return `email:${this.config.email}`;
    }
    return `phone:${this.config.phone}`;
  }

  private async verifyOtp(encryptedOtp: string) {
    if (this.config.clientTEEConnection == null) {
      throw new Error("Handshake parent not initialized");
    }

    const handshakeParent = this.config.clientTEEConnection;
    try {
      const response = await handshakeParent.sendAction({
        event: "request:complete-onboarding",
        responseEvent: "response:complete-onboarding",
        data: {
          authData: {
            jwt: this.config.crossmint.experimental_customAuth?.jwt ?? "",
            apiKey: this.config.crossmint.apiKey,
          },
          data: {
            onboardingAuthentication: { encryptedOtp },
          },
        },
        options: DEFAULT_EVENT_OPTIONS,
      });

      if (response?.status === "success") {
        this._needsAuth = false;
        // We call onAuthRequired again so the needsAuth state is updated for the dev
        if (this.config.onAuthRequired != null) {
          await this.config.onAuthRequired(
            this._needsAuth,
            () => this.sendMessageWithOtp(),
            (otp) => this.verifyOtp(otp),
            () => this._authPromise?.reject(new AuthRejectedError())
          );
        }
        this._authPromise?.resolve();
        return;
      }

      // Failed to validate OTP
      // eslint-disable-next-line no-console
      console.error("[verifyOtp] Failed to validate OTP:", response);
      this._needsAuth = true;
      const errorMessage =
        response?.status === "error"
          ? response.error
          : "Failed to validate encrypted OTP";
      this._authPromise?.reject(new Error(errorMessage));
    } catch (err) {
      // Error sending OTP validation request
      // eslint-disable-next-line no-console
      console.error("[verifyOtp] Error sending OTP validation request:", err);
      this._needsAuth = true;
      this._authPromise?.reject(err as Error);
      throw err;
    }
  }
}
