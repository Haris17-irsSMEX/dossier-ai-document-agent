import "server-only";

import crypto from "node:crypto";

import { getTokenEncryptionEnv } from "@/lib/server-env";

type EncryptedPayload = {
  iv: string;
  tag: string;
  ciphertext: string;
};

function getEncryptionKey() {
  const { TOKEN_ENCRYPTION_KEY } = getTokenEncryptionEnv();

  if (!TOKEN_ENCRYPTION_KEY) {
    throw new Error("Token encryption is not configured.");
  }

  return Buffer.from(TOKEN_ENCRYPTION_KEY, "hex");
}

function encodePayload(payload: EncryptedPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(payload: string): EncryptedPayload {
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as Partial<EncryptedPayload>;

    if (!parsed.iv || !parsed.tag || !parsed.ciphertext) {
      throw new Error("Encrypted payload is incomplete.");
    }

    return {
      iv: parsed.iv,
      tag: parsed.tag,
      ciphertext: parsed.ciphertext
    };
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Encrypted payload is invalid. ${error.message}`
        : "Encrypted payload is invalid."
    );
  }
}

export function encryptSecret(value: string) {
  if (!value) {
    throw new Error("Secret value is required.");
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final()
  ]);

  return encodePayload({
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url")
  });
}

export function decryptSecret(payload: string) {
  if (!payload) {
    throw new Error("Encrypted payload is required.");
  }

  const decoded = decodePayload(payload);
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(decoded.iv, "base64url")
  );

  decipher.setAuthTag(Buffer.from(decoded.tag, "base64url"));

  try {
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(decoded.ciphertext, "base64url")),
      decipher.final()
    ]).toString("utf8");

    if (!plaintext) {
      throw new Error("Decrypted value is empty.");
    }

    return plaintext;
  } catch {
    throw new Error("Encrypted payload could not be decrypted.");
  }
}
