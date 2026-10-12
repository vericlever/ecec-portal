import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import type { AwsCredentialIdentityProvider } from "@smithy/types";

// Credentials for every AWS client in the app (Bedrock, Textract, Comprehend).
//
// On Vercel production the app has no stored AWS keys. It exchanges its Vercel
// OIDC token for short-lived credentials by assuming the vericlever-ai role,
// whose trust policy only accepts the production environment of this project.
// The AWS SDK's default credential lookup does not do this on its own, which is
// why the clients must be given this provider explicitly.
//
// Everywhere else (local dev, scripts) this returns undefined, so the SDK falls
// back to its default chain and picks up the IAM user's keys in .env.local.
//
// AWS_ROLE_ARN is the role's ARN: an identifier, not a secret.
export function awsCredentials(): AwsCredentialIdentityProvider | undefined {
  if (process.env.VERCEL_ENV !== "production") return undefined;
  const roleArn = process.env.AWS_ROLE_ARN;
  if (!roleArn) {
    throw new Error("AWS_ROLE_ARN is not set. Production needs the vericlever-ai role ARN to call AWS.");
  }
  return awsCredentialsProvider({ roleArn });
}
